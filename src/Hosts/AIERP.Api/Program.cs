using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using Microsoft.IdentityModel.Tokens;
using System.Text.Json.Serialization;

var builder = WebApplication.CreateBuilder(args);
var jwtKey = builder.Configuration["Authentication:SigningKey"];
if (string.IsNullOrWhiteSpace(jwtKey) || Encoding.UTF8.GetByteCount(jwtKey) < 32)
    throw new InvalidOperationException("Authentication:SigningKey must be configured with at least 32 bytes.");
var connectionString = builder.Configuration.GetConnectionString("Platform") ?? throw new InvalidOperationException("ConnectionStrings:Platform is required.");
builder.Services.AddDbContext<PlatformDbContext>(o => o.UseSqlServer(connectionString));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
    ValidateIssuer = true, ValidIssuer = builder.Configuration["Authentication:Issuer"] ?? "AIERP",
    ValidateAudience = true, ValidAudience = builder.Configuration["Authentication:Audience"] ?? "AIERP",
    ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
    ValidateLifetime = true, ClockSkew = TimeSpan.FromSeconds(30), NameClaimType = "name", RoleClaimType = "role"
    };
});
builder.Services.AddAuthorization();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddRateLimiter(o => o.AddFixedWindowLimiter("login", x => { x.PermitLimit = 10; x.Window = TimeSpan.FromMinutes(1); x.QueueLimit = 0; }));
var frontendOrigins = builder.Configuration.GetSection("Frontend:Origins").Get<string[]>() ?? [builder.Configuration["Frontend:Origin"] ?? "http://localhost:5173"];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(frontendOrigins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddOpenApi();
var app = builder.Build();
if (args.Contains("--migrate-only", StringComparer.Ordinal))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
    await BaselineEnsureCreatedDatabaseAsync(db);
    await db.Database.MigrateAsync();
    await SeedBootstrapUserAsync(db, builder.Configuration);
    return;
}
if (app.Environment.IsDevelopment()) app.MapOpenApi();
app.UseCors(); app.UseRateLimiter(); app.UseAuthentication(); app.UseAuthorization();

if (app.Environment.IsDevelopment() && builder.Configuration.GetValue("Database:ApplyMigrationsOnStartup", true))
{
    await using var scope = app.Services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
    await BaselineEnsureCreatedDatabaseAsync(db);
    await db.Database.MigrateAsync();
    await SeedBootstrapUserAsync(db, builder.Configuration);
}

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "platform-api" }));
var auth = app.MapGroup("/api/auth").WithTags("Authentication");
auth.MapPost("/login", async (LoginRequest request, PlatformDbContext db, IConfiguration config) =>
{
    if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrWhiteSpace(request.Password)) return Results.BadRequest(new { error = "Email and password are required." });
    var email = request.Email.Trim().ToLowerInvariant();
    var user = await db.Users.Include(x => x.Memberships).ThenInclude(x => x.Tenant).SingleOrDefaultAsync(x => x.Email == email && x.IsActive);
    if (user is null || !PasswordHashing.Verify(request.Password, user.PasswordHash)) return Results.Unauthorized();
    var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()), new Claim("name", user.DisplayName),
        new Claim("email", user.Email), new Claim("session", "tenant-selection") };
    var token = TokenIssuer.Issue(claims, config);
    db.AuditEvents.Add(new AuditEvent { UserId = user.Id, Action = "auth.login", Resource = "session" });
    await db.SaveChangesAsync();
    return Results.Ok(new { accessToken = token, displayName = user.DisplayName,
        tenants = user.Memberships.Where(m => m.Tenant.IsActive).Select(m => new TenantSummary(m.TenantId, m.Tenant.Name, m.Tenant.Slug, m.Role)) });
}).RequireRateLimiting("login");

auth.MapPost("/select-tenant", async (SelectTenantRequest request, ClaimsPrincipal principal, PlatformDbContext db, IConfiguration config) =>
{
    if (!Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var userId)) return Results.Unauthorized();
    var membership = await db.TenantMemberships.Include(m => m.Tenant).SingleOrDefaultAsync(m => m.UserId == userId && m.TenantId == request.TenantId && m.Tenant.IsActive);
    if (membership is null) return Results.Forbid();
    var claims = new[] { new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()), new Claim("name", principal.Identity?.Name ?? ""),
        new Claim("email", principal.FindFirstValue("email") ?? ""), new Claim("tenant_id", membership.TenantId.ToString()), new Claim("role", membership.Role) };
    var token = TokenIssuer.Issue(claims, config);
    db.AuditEvents.Add(new AuditEvent { UserId = userId, TenantId = membership.TenantId, Action = "tenant.selected", Resource = membership.Tenant.Slug });
    await db.SaveChangesAsync();
    return Results.Ok(new { accessToken = token, tenant = new TenantSummary(membership.TenantId, membership.Tenant.Name, membership.Tenant.Slug, membership.Role) });
}).RequireAuthorization();
auth.MapGet("/me", (ClaimsPrincipal user) => Results.Ok(new { user = user.Identity?.Name, tenantId = user.FindFirstValue("tenant_id"), roles = user.FindAll("role").Select(x => x.Value) })).RequireAuthorization();
app.MapGet("/api/dashboard", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!Guid.TryParse(principal.FindFirstValue("tenant_id"), out var tenantId)) return Results.Forbid();
    var tenant = await db.Tenants.Where(t => t.Id == tenantId && t.IsActive).Select(t => t.Name).SingleOrDefaultAsync();
    if (tenant is null) return Results.Forbid();
    var openRequests = await db.DevelopmentRequests.CountAsync(r => r.TenantId == tenantId && r.Status != "Completed");
    return Results.Ok(new DashboardSummary(tenant, openRequests, "Platform API ready"));
}).RequireAuthorization();
app.MapGet("/api/audit-events", async (ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 50, DateOnly? from = null, DateOnly? to = null, string? q = null) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (from is { } fromDate && to is { } toDate && fromDate > toDate)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["to"] = ["Bitiş tarihi başlangıç tarihinden önce olamaz."] });
    if (to == DateOnly.MaxValue) return Results.ValidationProblem(new Dictionary<string, string[]> { ["to"] = ["Bitiş tarihi desteklenen son günden önce olmalıdır."] });
    page = Math.Clamp(page, 1, 1_000_000); pageSize = Math.Clamp(pageSize, 1, 100);
    q = string.IsNullOrWhiteSpace(q) ? null : q.Trim();
    if (q?.Length > 120) return Results.ValidationProblem(new Dictionary<string, string[]> { ["q"] = ["Arama en fazla 120 karakter olabilir."] });
    var query = db.AuditEvents.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (from is { } start) query = query.Where(x => x.OccurredAt >= new DateTimeOffset(start.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)));
    if (to is { } end) query = query.Where(x => x.OccurredAt <= new DateTimeOffset(end.ToDateTime(TimeOnly.MaxValue, DateTimeKind.Utc)));
    if (q is not null) query = query.Where(x => x.Action.Contains(q) || x.Resource.Contains(q));
    var total = await query.CountAsync();
    var items = await query.OrderByDescending(x => x.OccurredAt).ThenByDescending(x => x.Id)
        .Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new AuditEventView(x.Id, x.Action, x.Resource, x.UserId,
            db.Users.Where(user => user.Id == x.UserId).Select(user => user.DisplayName).FirstOrDefault(),
            db.Users.Where(user => user.Id == x.UserId).Select(user => user.Email).FirstOrDefault(), x.OccurredAt)).ToListAsync();
    return Results.Ok(new AuditEventPage(items, page, pageSize, total));
}).RequireAuthorization();

var customers = app.MapGroup("/api/customers").WithTags("Cari Yönetimi").RequireAuthorization();
var customerGroups = app.MapGroup("/api/customer-groups").WithTags("Cari Grupları").RequireAuthorization();
customers.MapGet("/custom-fields", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var fields = await db.CustomerCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        .OrderBy(x => x.Label).Select(x => new CustomerCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync();
    return Results.Ok(fields);
});
customers.MapPost("/custom-fields", async (CustomerCustomFieldCreateRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") ||
        string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu, etiketi, veri türü ve metin uzunluğu geçerli olmalıdır."] });
    if (await db.CustomerCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code))
        return Results.Conflict(new { error = "Bu cari özel alan kodu bu firmada zaten kullanılıyor." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    if (body.IsRequired && await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId))
        return Results.Conflict(new { error = "Mevcut cari kartları için değerler tamamlanmadan yeni bir alan zorunlu açılamaz. Önce isteğe bağlı oluşturup kartları doldurun." });
    var definition = new CustomerCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.CustomerCustomFieldDefinitions.Add(definition);
    db.CustomerCustomFieldDefinitionRevisions.Add(ToCustomerCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu cari özel alan kodu bu firmada zaten kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/customers/custom-fields/{definition.Id}", new CustomerCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
customers.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, CustomerCustomFieldUpdateRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(label) || label.Length > 120) return Results.ValidationProblem(new Dictionary<string, string[]> { ["label"] = ["Alan etiketi zorunludur ve en fazla 120 karakter olabilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Devre dışı cari alan düzenlenemez." });
    if (definition.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 arasında olmalıdır."] });
    var isRequired = body.IsRequired ?? definition.IsRequired;
    if (isRequired && await db.CustomerAccounts.AnyAsync(customer => customer.TenantId == tenantId && !db.CustomerCustomFieldValues.Any(value => value.TenantId == tenantId && value.CustomerId == customer.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Alanı zorunlu yapmak için mevcut tüm cari kartlarında değer bulunmalıdır." });
    var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0;
    if (definition.DataType == CustomFieldDataType.Text && await db.CustomerCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength))
        return Results.Conflict(new { error = "Mevcut değerler yeni metin sınırını aşıyor." });
    if (definition.Label == label && definition.MaxLength == maxLength && definition.IsRequired == isRequired)
        return Results.Ok(new CustomerCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
    definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = isRequired; definition.Version++;
    db.CustomerCustomFieldDefinitionRevisions.Add(ToCustomerCustomFieldRevision(definition, GetUserId(principal), "Updated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.updated", Resource = definition.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new CustomerCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
customers.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerCustomFieldDefinitions.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await db.CustomerCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId)
        .OrderByDescending(x => x.Version).Take(50)
        .Select(x => new CustomerCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(history);
});
customers.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, CustomerCustomFieldRestoreRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (!body.Confirmation || body.Version < 1) return Results.BadRequest(new { error = "Geçerli sürüm ve açık geri yükleme onayı gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var revision = await db.CustomerCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound();
    if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Veri türü geri yüklemeyle değiştirilemez." });
    if (revision.IsActive && revision.DataType == CustomFieldDataType.Text && await db.CustomerCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength))
        return Results.Conflict(new { error = "Geçmiş sürümün metin sınırı mevcut değerlerle uyumsuz." });
    if (revision.IsActive && revision.IsRequired && await db.CustomerAccounts.AnyAsync(customer => customer.TenantId == tenantId && !db.CustomerCustomFieldValues.Any(value => value.TenantId == tenantId && value.CustomerId == customer.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Bu tanımı zorunlu yapmak için tüm mevcut carilerde değer gerekir." });
    if (definition.Label == revision.Label && definition.MaxLength == revision.MaxLength && definition.IsRequired == revision.IsRequired && definition.IsActive == revision.IsActive)
        return Results.Conflict(new { error = "Cari özel alan tanımı zaten bu sürümle aynı." });
    definition.Label = revision.Label; definition.MaxLength = revision.MaxLength; definition.IsRequired = revision.IsRequired; definition.IsActive = revision.IsActive; definition.Version++;
    db.CustomerCustomFieldDefinitionRevisions.Add(ToCustomerCustomFieldRevision(definition, GetUserId(principal), "Restored"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.restored", Resource = $"{definition.Code}:v{body.Version}" });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new CustomerCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
customers.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Cari özel alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++;
    db.CustomerCustomFieldDefinitionRevisions.Add(ToCustomerCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.deactivated", Resource = definition.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.NoContent();
});
customers.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var definitions = await db.CustomerCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var values = await db.CustomerCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id).ToDictionaryAsync(x => x.DefinitionId);
    return Results.Ok(definitions.Select(x => new CustomerCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength,
        values.TryGetValue(x.Id, out var value) && value.DefinitionVersion > 0 ? value.DefinitionVersion : x.Version, x.IsRequired,
        values.GetValueOrDefault(x.Id)?.Value ?? "")).ToArray());
});
customers.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var definition = await db.CustomerCustomFieldDefinitions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == definitionId);
    if (definition is null) return Results.NotFound();
    var history = await db.CustomerCustomFieldValueRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id && x.DefinitionId == definitionId)
        .OrderByDescending(x => x.CreatedAt).Take(50)
        .Select(x => new CustomerCustomFieldValueRevisionView(x.Id, x.DefinitionId, definition.Code, definition.Label, x.PreviousValue, x.NewValue, x.DefinitionVersion, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(history);
});
customers.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, CustomerCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Değer geri yükleme için açık onay gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId} AND [IsActive] = 1").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var revision = await db.CustomerCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CustomerId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (revision is null) return Results.NotFound();
    var rawTargetValue = revision.PreviousValue ?? "";
    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, rawTargetValue, out var targetValue))
        return Results.Conflict(new { error = "Geçmiş değer güncel alan tanımıyla uyumlu değil." });
    if (definition.IsRequired && targetValue.Length == 0) return Results.Conflict(new { error = "Zorunlu alanın boş değeri geri yüklenemez." });
    var current = await db.CustomerCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CustomerId == id && x.DefinitionId == definitionId);
    var previousValue = current?.Value;
    if (string.Equals(previousValue ?? "", targetValue, StringComparison.Ordinal)) return Results.Conflict(new { error = "Cari özel alan değeri zaten bu durumda." });
    if (targetValue.Length == 0)
    {
        if (current is not null) db.CustomerCustomFieldValues.Remove(current);
    }
    else if (current is null)
        db.CustomerCustomFieldValues.Add(new CustomerCustomFieldValue { TenantId = tenantId, CustomerId = id, DefinitionId = definitionId, Value = targetValue, DefinitionVersion = definition.Version });
    else { current.Value = targetValue; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
    db.CustomerCustomFieldValueRevisions.Add(new CustomerCustomFieldValueRevision { TenantId = tenantId, CustomerId = id, DefinitionId = definitionId, PreviousValue = previousValue, NewValue = targetValue.Length == 0 ? null : targetValue, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.value-restored", Resource = $"{customer.Code}:{definition.Code}" });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new CustomerCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, targetValue));
});
customers.MapPut("/{id:guid}/custom-fields", async (Guid id, CustomerCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (body.Values is null || body.Values.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definitions = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var byCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    if (body.Values.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !byCode.ContainsKey(x))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["Bilinmeyen veya etkin olmayan bir cari özel alan kodu gönderildi."] });
    var normalized = new Dictionary<Guid, (CustomerCustomFieldDefinition Definition, string Value)>();
    foreach (var (fieldCode, rawValue) in body.Values)
    {
        var definition = byCode[fieldCode];
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, rawValue, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{fieldCode}"] = [$"'{definition.Label}' alanı değer türü veya uzunluk sınırına uymuyor."] });
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    var missingRequired = definitions.FirstOrDefault(definition => definition.IsRequired && !normalized.ContainsKey(definition.Id));
    if (missingRequired is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{missingRequired.Code}"] = [$"'{missingRequired.Label}' alanı zorunludur."] });
    var definitionIds = definitions.Select(x => x.Id).ToHashSet();
    var existing = await db.CustomerCustomFieldValues.Where(x => x.TenantId == tenantId && x.CustomerId == id && definitionIds.Contains(x.DefinitionId)).ToListAsync();
    var previousByDefinition = existing.ToDictionary(x => x.DefinitionId, x => x.Value);
    foreach (var definition in definitions)
    {
        var previous = previousByDefinition.GetValueOrDefault(definition.Id);
        var next = normalized.GetValueOrDefault(definition.Id).Value;
        if (string.Equals(previous ?? "", next ?? "", StringComparison.Ordinal)) continue;
        db.CustomerCustomFieldValueRevisions.Add(new CustomerCustomFieldValueRevision { TenantId = tenantId, CustomerId = id, DefinitionId = definition.Id,
            PreviousValue = string.IsNullOrEmpty(previous) ? null : previous, NewValue = string.IsNullOrEmpty(next) ? null : next,
            DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.CustomerCustomFieldValues.RemoveRange(existing);
    foreach (var (definitionId, entry) in normalized)
        db.CustomerCustomFieldValues.Add(new CustomerCustomFieldValue { TenantId = tenantId, CustomerId = id, DefinitionId = definitionId, Value = entry.Value, DefinitionVersion = entry.Definition.Version });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-custom-field.values-updated", Resource = customer.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(definitions.Select(x => new CustomerCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, normalized.GetValueOrDefault(x.Id).Value ?? "")).ToArray());
});
customerGroups.MapGet("/", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var items = await db.CustomerGroups.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderBy(x => x.Name).Select(x => new CustomerGroupView(x.Id, x.Code, x.Name, x.IsActive)).ToListAsync();
    return Results.Ok(items);
});
customerGroups.MapPost("/", async (CustomerGroupWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var code = request.Code?.Trim().ToUpperInvariant() ?? ""; var name = request.Name?.Trim() ?? "";
    var errors = new Dictionary<string, string[]>();
    if (code.Length is 0 or > 40) errors["code"] = ["Grup kodu zorunludur ve en fazla 40 karakter olabilir."];
    if (name.Length is 0 or > 120) errors["name"] = ["Grup adı zorunludur ve en fazla 120 karakter olabilir."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    if (await db.CustomerGroups.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu grup kodu bu firmada zaten kullanılıyor." });
    var group = new CustomerGroup { TenantId = tenantId, Code = code, Name = name };
    db.CustomerGroups.Add(group);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-group.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu grup kodu bu firmada zaten kullanılıyor." }); }
    return Results.Created($"/api/customer-groups/{group.Id}", new CustomerGroupView(group.Id, group.Code, group.Name, group.IsActive));
});
customers.MapGet("/", async (string? q, ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (!string.IsNullOrWhiteSpace(q))
    {
        var term = q.Trim();
        query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term) || (x.TaxNumber != null && x.TaxNumber.Contains(term)));
    }
    var total = await query.CountAsync();
    var items = await query.OrderBy(x => x.Name).ThenBy(x => x.Code).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new CustomerView(x.Id, x.Code, x.Name, x.Type, x.TaxNumber, x.IsActive, x.CreatedAt, x.RowVersion,
            x.GroupId, x.Group == null ? null : x.Group.Name, x.CurrencyCode, x.RiskLimit, x.PaymentTermDays)).ToListAsync();
    return Results.Ok(new CustomerPage(items, page, pageSize, total));
});
customers.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var customer = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new CustomerView(x.Id, x.Code, x.Name, x.Type, x.TaxNumber, x.IsActive, x.CreatedAt, x.RowVersion,
            x.GroupId, x.Group == null ? null : x.Group.Name, x.CurrencyCode, x.RiskLimit, x.PaymentTermDays)).SingleOrDefaultAsync();
    return customer is null ? Results.NotFound() : Results.Ok(customer);
});
customers.MapPost("/", async (CustomerWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var validation = CustomerValidation.Validate(request);
    if (validation is not null) return Results.ValidationProblem(validation);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu cari kodu bu firmada zaten kullanılıyor." });
    if (request.GroupId is { } groupId && !await db.CustomerGroups.AnyAsync(x => x.TenantId == tenantId && x.Id == groupId && x.IsActive))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["groupId"] = ["Seçilen cari grubu bulunamadı veya pasif."] });
    if (request.CustomFields?.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["customFields"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definitions = await db.CustomerCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var definitionsByCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    var requestedValues = request.CustomFields ?? new Dictionary<string, string?>();
    if (requestedValues.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !definitionsByCode.ContainsKey(x)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["customFields"] = ["Bilinmeyen veya etkin olmayan bir cari özel alan kodu gönderildi."] });
    var normalizedValues = new Dictionary<Guid, (CustomerCustomFieldDefinition Definition, string Value)>();
    foreach (var (fieldCode, rawValue) in requestedValues)
    {
        var definition = definitionsByCode[fieldCode];
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, rawValue, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"customFields.{fieldCode}"] = [$"'{definition.Label}' alanı değer türü veya uzunluk sınırına uymuyor."] });
        if (value.Length > 0) normalizedValues[definition.Id] = (definition, value);
    }
    var missingRequired = definitions.FirstOrDefault(x => x.IsRequired && !normalizedValues.ContainsKey(x.Id));
    if (missingRequired is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"customFields.{missingRequired.Code}"] = [$"'{missingRequired.Label}' alanı zorunludur."] });
    var customer = new CustomerAccount { TenantId = tenantId, Code = code, Name = request.Name.Trim(), Type = request.Type,
        TaxNumber = NormalizeTaxNumber(request.TaxNumber), IsActive = request.IsActive, GroupId = request.GroupId,
        CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant(), RiskLimit = request.RiskLimit, PaymentTermDays = request.PaymentTermDays };
    db.CustomerAccounts.Add(customer);
    foreach (var (definitionId, entry) in normalizedValues)
    {
        db.CustomerCustomFieldValues.Add(new CustomerCustomFieldValue { TenantId = tenantId, CustomerId = customer.Id, DefinitionId = definitionId, Value = entry.Value, DefinitionVersion = entry.Definition.Version });
        db.CustomerCustomFieldValueRevisions.Add(new CustomerCustomFieldValueRevision { TenantId = tenantId, CustomerId = customer.Id, DefinitionId = definitionId, NewValue = entry.Value, DefinitionVersion = entry.Definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu cari kodu bu firmada zaten kullanılıyor." }); }
    await transaction.CommitAsync();
    var view = new CustomerView(customer.Id, customer.Code, customer.Name, customer.Type, customer.TaxNumber, customer.IsActive, customer.CreatedAt,
        customer.RowVersion, customer.GroupId, null, customer.CurrencyCode, customer.RiskLimit, customer.PaymentTermDays);
    return Results.Created($"/api/customers/{customer.Id}", view);
});
customers.MapPut("/{id:guid}", async (Guid id, CustomerWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var validation = CustomerValidation.Validate(request);
    if (validation is not null) return Results.ValidationProblem(validation);
    if (request.RowVersion is null || request.RowVersion.Length == 0)
        return Results.BadRequest(new { error = "RowVersion is required to prevent overwriting a concurrent edit." });
    if (request.GroupId is { } groupId && !await db.CustomerGroups.AnyAsync(x => x.TenantId == tenantId && x.Id == groupId && x.IsActive))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["groupId"] = ["Seçilen cari grubu bulunamadı veya pasif."] });
    var customer = await db.CustomerAccounts.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (customer is null) return Results.NotFound();
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code))
        return Results.Conflict(new { error = "Bu cari kodu bu firmada zaten kullanılıyor." });
    customer.Code = code; customer.Name = request.Name.Trim(); customer.Type = request.Type;
    customer.TaxNumber = NormalizeTaxNumber(request.TaxNumber); customer.IsActive = request.IsActive; customer.GroupId = request.GroupId;
    customer.CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant(); customer.RiskLimit = request.RiskLimit; customer.PaymentTermDays = request.PaymentTermDays;
    db.Entry(customer).Property(x => x.RowVersion).OriginalValue = request.RowVersion;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer.updated", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Cari kart başka bir oturumda değiştirildi. Kaydı yenileyip tekrar deneyin." }); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu cari kodu bu firmada zaten kullanılıyor." }); }
    return Results.Ok(new CustomerView(customer.Id, customer.Code, customer.Name, customer.Type, customer.TaxNumber, customer.IsActive, customer.CreatedAt,
        customer.RowVersion, customer.GroupId, null, customer.CurrencyCode, customer.RiskLimit, customer.PaymentTermDays));
});
customers.MapGet("/{id:guid}/addresses", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var addresses = await db.CustomerAddresses.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id)
        .OrderByDescending(x => x.IsDefault).ThenBy(x => x.Label)
        .Select(x => new CustomerAddressView(x.Id, x.Kind, x.Label, x.AddressLine, x.City, x.District, x.PostalCode, x.CountryCode, x.IsDefault, x.IsActive)).ToListAsync();
    return Results.Ok(addresses);
});
customers.MapPost("/{id:guid}/addresses", async (Guid id, CustomerAddressWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var errors = CustomerAddressValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var makeDefault = request.IsDefault && request.IsActive;
    if (makeDefault)
    {
        var previousDefaults = await db.CustomerAddresses.Where(x => x.TenantId == tenantId && x.CustomerId == id && x.Kind == request.Kind && x.IsDefault).ToListAsync();
        foreach (var previous in previousDefaults) previous.IsDefault = false;
    }
    var address = new CustomerAddress { TenantId = tenantId, CustomerId = id, Kind = request.Kind, Label = request.Label.Trim(),
        AddressLine = request.AddressLine.Trim(), City = request.City.Trim(), District = NormalizeTaxNumber(request.District),
        PostalCode = NormalizeTaxNumber(request.PostalCode), CountryCode = request.CountryCode.Trim().ToUpperInvariant(), IsDefault = makeDefault, IsActive = request.IsActive };
    db.CustomerAddresses.Add(address);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-address.created", Resource = id.ToString() });
    await db.SaveChangesAsync();
    return Results.Created($"/api/customers/{id}/addresses/{address.Id}", ToAddressView(address));
});
customers.MapPut("/{id:guid}/addresses/{addressId:guid}", async (Guid id, Guid addressId, CustomerAddressWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var address = await db.CustomerAddresses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CustomerId == id && x.Id == addressId);
    if (address is null) return Results.NotFound();
    var errors = CustomerAddressValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var makeDefault = request.IsDefault && request.IsActive;
    if (makeDefault)
    {
        var previousDefaults = await db.CustomerAddresses.Where(x => x.TenantId == tenantId && x.CustomerId == id && x.Kind == request.Kind && x.Id != addressId && x.IsDefault).ToListAsync();
        foreach (var previous in previousDefaults) previous.IsDefault = false;
    }
    address.Kind = request.Kind; address.Label = request.Label.Trim(); address.AddressLine = request.AddressLine.Trim(); address.City = request.City.Trim();
    address.District = NormalizeTaxNumber(request.District); address.PostalCode = NormalizeTaxNumber(request.PostalCode);
    address.CountryCode = request.CountryCode.Trim().ToUpperInvariant(); address.IsDefault = makeDefault; address.IsActive = request.IsActive;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-address.updated", Resource = id.ToString() });
    await db.SaveChangesAsync();
    return Results.Ok(ToAddressView(address));
});
customers.MapGet("/{id:guid}/balance", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (customer is null) return Results.NotFound();
    var entries = db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == id);
    var debit = await entries.Where(x => x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var credit = await entries.Where(x => x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    return Results.Ok(CustomerLedgerBalanceCalculator.Calculate(customer.CurrencyCode, debit, credit, customer.RiskLimit));
});
customers.MapGet("/{id:guid}/statement", async (Guid id, DateOnly from, DateOnly to, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (to < from) return Results.ValidationProblem(new Dictionary<string, string[]> { ["to"] = ["Bitiş tarihi başlangıç tarihinden önce olamaz."] });
    var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (customer is null) return Results.NotFound();
    var ledger = db.CustomerLedgerEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id);
    var openingDebit = await ledger.Where(x => x.EntryDate < from && x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var openingCredit = await ledger.Where(x => x.EntryDate < from && x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var openingBalance = openingDebit - openingCredit;
    var entries = await ledger.Where(x => x.EntryDate >= from && x.EntryDate <= to)
        .OrderBy(x => x.EntryDate).ThenBy(x => x.CreatedAt).ThenBy(x => x.Id)
        .Select(x => new { x.Id, x.EntryDate, x.Direction, x.Amount, x.CurrencyCode, x.Description, x.ReversalOfId,
            HasReversal = db.CustomerLedgerEntries.Any(y => y.TenantId == x.TenantId && y.ReversalOfId == x.Id) })
        .ToListAsync();
    var runningBalance = openingBalance;
    var items = entries.Select(x =>
    {
        runningBalance += x.Direction == CustomerLedgerDirection.Debit ? x.Amount : -x.Amount;
        return new CustomerStatementLine(x.Id, x.EntryDate, x.Direction, x.Amount, x.CurrencyCode, x.Description,
            x.ReversalOfId, x.HasReversal, runningBalance);
    }).ToList();
    var debitTotal = entries.Where(x => x.Direction == CustomerLedgerDirection.Debit).Sum(x => x.Amount);
    var creditTotal = entries.Where(x => x.Direction == CustomerLedgerDirection.Credit).Sum(x => x.Amount);
    return Results.Ok(new CustomerStatementView(customer.Id, customer.Code, customer.Name, customer.CurrencyCode,
        from, to, openingBalance, debitTotal, creditTotal, runningBalance, items));
});
customers.MapGet("/{id:guid}/ledger", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db, DateOnly? from, DateOnly? to, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.CustomerLedgerEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == id);
    if (from is not null) query = query.Where(x => x.EntryDate >= from);
    if (to is not null) query = query.Where(x => x.EntryDate <= to);
    var total = await query.CountAsync();
    var items = await query.OrderByDescending(x => x.EntryDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new CustomerLedgerView(x.Id, x.EntryDate, x.Direction, x.Amount, x.CurrencyCode, x.Description,
            x.ReversalOfId, x.ReversalOfId != null, db.CustomerLedgerEntries.Any(y => y.TenantId == x.TenantId && y.ReversalOfId == x.Id))).ToListAsync();
    return Results.Ok(new CustomerLedgerPage(items, page, pageSize, total));
});
customers.MapPost("/{id:guid}/ledger", async (Guid id, CustomerLedgerWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = CustomerLedgerValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    if (!customer.IsActive) return Results.Conflict(new { error = "Pasif cari hesaba yeni hareket eklenemez." });
    var currencyCode = request.CurrencyCode.Trim().ToUpperInvariant();
    if (currencyCode != customer.CurrencyCode) return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Hareket dövizi cari döviziyle ({customer.CurrencyCode}) aynı olmalıdır."] });
    if (request.Direction == CustomerLedgerDirection.Debit && customer.RiskLimit is { } limit && customer.Type is CounterpartyType.Customer or CounterpartyType.Both)
    {
        var currentDebit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == id && x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var currentCredit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == id && x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var projectedBalance = currentDebit - currentCredit + request.Amount;
        if (projectedBalance > limit) return Results.Conflict(new { error = "Hareket risk limitini aşacağı için kaydedilmedi.", currentBalance = currentDebit - currentCredit, projectedBalance, riskLimit = limit });
    }
    var entry = new CustomerLedgerEntry { TenantId = tenantId, CustomerId = id, EntryDate = request.EntryDate, Direction = request.Direction,
        Amount = request.Amount, CurrencyCode = currencyCode, Description = request.Description.Trim() };
    db.CustomerLedgerEntries.Add(entry);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-ledger.created", Resource = id.ToString() });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/customers/{id}/ledger/{entry.Id}", new CustomerLedgerView(entry.Id, entry.EntryDate, entry.Direction, entry.Amount, entry.CurrencyCode, entry.Description, null, false, false));
});
customers.MapPost("/{id:guid}/ledger/{entryId:guid}/reverse", async (Guid id, Guid entryId, CustomerLedgerReverseRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = CustomerLedgerValidation.ValidateReversal(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {id} AND [Id] = {entryId}").SingleOrDefaultAsync();
    if (original is null) return Results.NotFound();
    if (original.ReversalOfId is not null) return Results.Conflict(new { error = "Bir ters kayıt yeniden ters çevrilemez." });
    if (original.SalesInvoiceId is not null) return Results.Conflict(new { error = "Fatura kaynaklı cari hareket, fatura iptal işlemiyle geri alınmalıdır." });
    if (original.CustomerCollectionId is not null) return Results.Conflict(new { error = "Tahsilat kaynaklı cari hareket, tahsilat iptal işlemiyle geri alınmalıdır." });
    if (original.SalesReturnId is not null) return Results.Conflict(new { error = "Satış iadesi kaynaklı cari hareket, iade iptal işlemiyle geri alınmalıdır." });
    if (original.PurchaseInvoiceId is not null) return Results.Conflict(new { error = "Alış faturası kaynaklı cari hareket, alış faturası iptal işlemiyle geri alınmalıdır." });
    if (original.SupplierPaymentId is not null) return Results.Conflict(new { error = "Tedarikçi ödemesi kaynaklı cari hareket, ödeme iptal işlemiyle geri alınmalıdır." });
    if (original.SupplierReturnId is not null) return Results.Conflict(new { error = "Alış iadesi kaynaklı cari hareket, alış iadesi iptal işlemiyle geri alınmalıdır." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id))
        return Results.Conflict(new { error = "Bu hareket daha önce ters kayıtla iptal edildi." });
    var reversal = new CustomerLedgerEntry { TenantId = tenantId, CustomerId = id, EntryDate = DateOnly.FromDateTime(DateTime.UtcNow),
        Direction = original.Direction == CustomerLedgerDirection.Debit ? CustomerLedgerDirection.Credit : CustomerLedgerDirection.Debit,
        Amount = original.Amount, CurrencyCode = original.CurrencyCode, Description = $"Ters kayıt: {request.Reason.Trim()}", ReversalOfId = original.Id };
    db.CustomerLedgerEntries.Add(reversal);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-ledger.reversed", Resource = original.Id.ToString() });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu hareket daha önce ters kayıtla iptal edildi." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/customers/{id}/ledger/{reversal.Id}", new CustomerLedgerView(reversal.Id, reversal.EntryDate, reversal.Direction,
        reversal.Amount, reversal.CurrencyCode, reversal.Description, reversal.ReversalOfId, true, false));
});

var stockItems = app.MapGroup("/api/stock/items").RequireAuthorization();
stockItems.MapGet("/", async (string? q, ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term) || (x.Barcode != null && x.Barcode.Contains(term))); }
    var total = await query.CountAsync();
    var items = await query.OrderBy(x => x.Name).ThenBy(x => x.Code).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new StockItemView(x.Id, x.Code, x.Name, x.Barcode, x.UnitCode, x.Category, x.MinimumStock, x.IsActive, x.CreatedAt, x.RowVersion)).ToListAsync();
    return Results.Ok(new StockItemPage(items, page, pageSize, total));
});
stockItems.MapPost("/", async (StockItemWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu stok kodu bu firmada zaten kullanılıyor." });
    var barcode = string.IsNullOrWhiteSpace(request.Barcode) ? null : request.Barcode.Trim();
    if (barcode is not null && await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Barcode == barcode)) return Results.Conflict(new { error = "Bu barkod bu firmada zaten kullanılıyor." });
    if (request.CustomFields?.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["customFields"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definitions = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var definitionsByCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    var requestedValues = request.CustomFields ?? new Dictionary<string, string?>();
    if (requestedValues.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !definitionsByCode.ContainsKey(x)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["customFields"] = ["Bilinmeyen veya bu tenant için etkin olmayan bir özel alan kodu gönderildi."] });
    var normalizedValues = new Dictionary<Guid, (StockItemCustomFieldDefinition Definition, string Value)>();
    foreach (var (fieldCode, rawValue) in requestedValues)
    {
        var definition = definitionsByCode[fieldCode];
        if (!StockCustomFieldValidation.TryNormalize(definition, rawValue, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"customFields.{fieldCode}"] = [$"'{definition.Label}' alanı tanımlı veri türü veya sınıra uymuyor."] });
        if (value.Length > 0) normalizedValues[definition.Id] = (definition, value);
    }
    var missingRequired = definitions.FirstOrDefault(x => x.IsRequired && !normalizedValues.ContainsKey(x.Id));
    if (missingRequired is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"customFields.{missingRequired.Code}"] = [$"'{missingRequired.Label}' alanı zorunludur."] });
    var item = new StockItem { TenantId = tenantId, Code = code, Name = request.Name.Trim(), Barcode = barcode,
        UnitCode = request.UnitCode.Trim().ToUpperInvariant(), Category = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim(),
        MinimumStock = request.MinimumStock, IsActive = request.IsActive };
    db.StockItems.Add(item);
    foreach (var (definitionId, entry) in normalizedValues)
    {
        db.StockItemCustomFieldValues.Add(new StockItemCustomFieldValue { TenantId = tenantId, StockItemId = item.Id, DefinitionId = definitionId, Value = entry.Value, DefinitionVersion = entry.Definition.Version });
        db.StockItemCustomFieldValueRevisions.Add(new StockItemCustomFieldValueRevision { TenantId = tenantId, StockItemId = item.Id, DefinitionId = definitionId, NewValue = entry.Value, DefinitionVersion = entry.Definition.Version, ChangedByUserId = GetUserId(principal) });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-item.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Stok kodu veya barkod başka bir kayıtta kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/stock/items/{item.Id}", new StockItemView(item.Id, item.Code, item.Name, item.Barcode, item.UnitCode, item.Category, item.MinimumStock, item.IsActive, item.CreatedAt, item.RowVersion));
});
stockItems.MapPut("/{id:guid}", async (Guid id, StockItemUpdateRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(new StockItemWriteRequest(request.Code, request.Name, request.Barcode, request.UnitCode, request.Category, request.MinimumStock));
    if (errors is not null) return Results.ValidationProblem(errors);
    if (request.RowVersion is null || request.RowVersion.Length == 0) return Results.BadRequest(new { error = "RowVersion alanı zorunludur; güncel olmayan düzenlemeler reddedilir." });
    var code = request.Code.Trim().ToUpperInvariant();
    var barcode = string.IsNullOrWhiteSpace(request.Barcode) ? null : request.Barcode.Trim();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(item.RowVersion, request.RowVersion))
        return Results.Conflict(new { error = "Stok kartı başka bir kullanıcı tarafından güncellendi. Güncel kaydı yeniden açın." });
    if (await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code)) return Results.Conflict(new { error = "Bu stok kodu bu firmada zaten kullanılıyor." });
    if (barcode is not null && await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Barcode == barcode)) return Results.Conflict(new { error = "Bu barkod bu firmada zaten kullanılıyor." });
    item.Code = code; item.Name = request.Name.Trim(); item.Barcode = barcode; item.UnitCode = request.UnitCode.Trim().ToUpperInvariant();
    item.Category = string.IsNullOrWhiteSpace(request.Category) ? null : request.Category.Trim(); item.MinimumStock = request.MinimumStock;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-item.updated", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Stok kodu veya barkod başka bir kayıtta kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Ok(new StockItemView(item.Id, item.Code, item.Name, item.Barcode, item.UnitCode, item.Category, item.MinimumStock, item.IsActive, item.CreatedAt, item.RowVersion));
});
stockItems.MapPost("/{id:guid}/deactivate", async (Guid id, StockItemStateChangeRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!request.Confirmation) return Results.BadRequest(new { error = "Stok kartını devre dışı bırakmak için açık onay gerekir." });
    if (request.RowVersion is null || request.RowVersion.Length == 0) return Results.BadRequest(new { error = "RowVersion alanı zorunludur." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(item.RowVersion, request.RowVersion)) return Results.Conflict(new { error = "Stok kartı güncel değil. Yeniden açıp tekrar deneyin." });
    if (!item.IsActive) return Results.Conflict(new { error = "Stok kartı zaten devre dışı." });
    var balances = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == id)
        .GroupBy(x => x.WarehouseId).Select(group => group.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)).ToListAsync();
    if (balances.Any(quantity => quantity != 0)) return Results.Conflict(new { error = "Depolarda bakiyesi olan stok kartı devre dışı bırakılamaz; önce stok bakiyesini sıfırlayın." });
    if (await db.SalesOrderLines.AnyAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.Order.Status == SalesOrderStatus.Open))
        return Results.Conflict(new { error = "Bekleyen satış siparişi satırları bulunan stok kartı devre dışı bırakılamaz." });
    if (await db.PurchaseOrderLines.AnyAsync(x => x.TenantId == tenantId && x.StockItemId == id && (x.PurchaseOrder.Status == PurchaseOrderStatus.Open || x.PurchaseOrder.Status == PurchaseOrderStatus.PartiallyReceived)))
        return Results.Conflict(new { error = "Bekleyen satın alma siparişi satırları bulunan stok kartı devre dışı bırakılamaz." });
    item.IsActive = false;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-item.deactivated", Resource = item.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockItemView(item.Id, item.Code, item.Name, item.Barcode, item.UnitCode, item.Category, item.MinimumStock, item.IsActive, item.CreatedAt, item.RowVersion));
});
stockItems.MapPost("/{id:guid}/activate", async (Guid id, StockItemStateChangeRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!request.Confirmation) return Results.BadRequest(new { error = "Stok kartını etkinleştirmek için açık onay gerekir." });
    if (request.RowVersion is null || request.RowVersion.Length == 0) return Results.BadRequest(new { error = "RowVersion alanı zorunludur." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (!System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(item.RowVersion, request.RowVersion)) return Results.Conflict(new { error = "Stok kartı güncel değil. Yeniden açıp tekrar deneyin." });
    if (item.IsActive) return Results.Conflict(new { error = "Stok kartı zaten etkin." });
    item.IsActive = true;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-item.activated", Resource = item.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockItemView(item.Id, item.Code, item.Name, item.Barcode, item.UnitCode, item.Category, item.MinimumStock, item.IsActive, item.CreatedAt, item.RowVersion));
});
stockItems.MapGet("/custom-fields", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var fields = await db.StockItemCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        .OrderBy(x => x.Label).Select(x => new StockCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync();
    return Results.Ok(fields);
});
stockItems.MapPost("/custom-fields", async (StockCustomFieldCreateRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant();
    var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(code) || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$") ||
        string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType) ||
        (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["field"] = ["Alan kodu A-Z ile başlamalı; etiket ve veri türü geçerli olmalı. Metin alanı uzunluğu 1–500 karakter arasında olmalıdır."] });
    if (await db.StockItemCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code))
        return Results.Conflict(new { error = "Bu tenant için özel alan kodu daha önce kullanılmış." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var definition = new StockItemCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label,
        DataType = body.DataType, MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    if (definition.IsRequired && await db.StockItems.AnyAsync(x => x.TenantId == tenantId))
        return Results.Conflict(new { error = "Mevcut stok kartları için değerler tamamlanmadan yeni bir alan zorunlu olarak açılamaz. Önce alanı isteğe bağlı oluşturup tüm kartları doldurun." });
    db.StockItemCustomFieldDefinitions.Add(definition);
    db.StockItemCustomFieldDefinitionRevisions.Add(ToStockCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu tenant için özel alan kodu daha önce kullanılmış." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/stock/items/custom-fields/{definition.Id}", new StockCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
stockItems.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Özel alan zaten devre dışı." });
    definition.IsActive = false;
    definition.Version++;
    db.StockItemCustomFieldDefinitionRevisions.Add(ToStockCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.deactivated", Resource = definition.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.NoContent();
});
stockItems.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, StockCustomFieldUpdateRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(label) || label.Length > 120)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Alan etiketi zorunlu ve en fazla 120 karakter olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Devre dışı alan düzenlenemez; önceki sürüme geri yükleyin." });
    if (definition.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 arasında olmalıdır."] });
    var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0;
    var isRequired = body.IsRequired ?? definition.IsRequired;
    if (definition.DataType == CustomFieldDataType.Text && await db.StockItemCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength))
        return Results.Conflict(new { error = "Bazı mevcut değerler yeni metin uzunluğu sınırını aşıyor." });
    if (isRequired && await db.StockItems.AnyAsync(item => item.TenantId == tenantId && !db.StockItemCustomFieldValues.Any(value => value.TenantId == tenantId && value.StockItemId == item.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Zorunlu yapmak için mevcut tüm stok kartlarında bu alana değer girilmiş olmalıdır." });
    if (definition.Label == label && definition.MaxLength == maxLength && definition.IsRequired == isRequired)
        return Results.Ok(new StockCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
    definition.Label = label;
    definition.MaxLength = maxLength;
    definition.IsRequired = isRequired;
    definition.Version++;
    db.StockItemCustomFieldDefinitionRevisions.Add(ToStockCustomFieldRevision(definition, GetUserId(principal), "Updated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.updated", Resource = definition.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
stockItems.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.StockItemCustomFieldDefinitions.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await db.StockItemCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId)
        .OrderByDescending(x => x.Version).Take(50)
        .Select(x => new StockCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(history);
});
stockItems.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, StockCustomFieldRestoreRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (!body.Confirmation || body.Version < 1) return Results.BadRequest(new { error = "Geçerli sürüm ve açık geri yükleme onayı gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var revision = await db.StockItemCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound();
    if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Veri türü değişiklikleri geri yüklemeyle değiştirilemez." });
    if (revision.IsActive && revision.DataType == CustomFieldDataType.Text && await db.StockItemCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength))
        return Results.Conflict(new { error = "Geçmiş sürümün uzunluk sınırı mevcut değerlerle uyumsuz." });
    if (revision.IsActive && revision.IsRequired && await db.StockItems.AnyAsync(item => item.TenantId == tenantId && !db.StockItemCustomFieldValues.Any(value => value.TenantId == tenantId && value.StockItemId == item.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Bu tanımı zorunlu yapmak için mevcut tüm stok kartlarında alan değeri gerekir." });
    if (definition.Label == revision.Label && definition.MaxLength == revision.MaxLength && definition.IsRequired == revision.IsRequired && definition.IsActive == revision.IsActive)
        return Results.Conflict(new { error = "Alan tanımı zaten bu sürümle aynı." });
    definition.Label = revision.Label;
    definition.MaxLength = revision.MaxLength;
    definition.IsRequired = revision.IsRequired;
    definition.IsActive = revision.IsActive;
    definition.Version++;
    db.StockItemCustomFieldDefinitionRevisions.Add(ToStockCustomFieldRevision(definition, GetUserId(principal), "Restored"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.restored", Resource = $"{definition.Code}:v{body.Version}" });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
stockItems.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var item = await db.StockItems.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id);
    if (!item) return Results.NotFound();
    var definitions = await db.StockItemCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var values = await db.StockItemCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == id).ToDictionaryAsync(x => x.DefinitionId, x => x.Value);
    return Results.Ok(definitions.Select(x => new StockCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, values.GetValueOrDefault(x.Id) ?? "")).ToArray());
});
stockItems.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.StockItems.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    if (!await db.StockItemCustomFieldDefinitions.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await (from revision in db.StockItemCustomFieldValueRevisions.AsNoTracking()
                         join definition in db.StockItemCustomFieldDefinitions.AsNoTracking()
                             on new { revision.TenantId, revision.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
                         where revision.TenantId == tenantId && revision.StockItemId == id && revision.DefinitionId == definitionId
                         orderby revision.CreatedAt descending
                         select new StockCustomFieldValueRevisionView(revision.Id, revision.DefinitionId, definition.Code, definition.Label,
                             revision.PreviousValue, revision.NewValue, revision.DefinitionVersion, revision.ChangedByUserId, revision.CreatedAt))
        .Take(50).ToListAsync();
    return Results.Ok(history);
});
stockItems.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, StockCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Özel alan değerini geri yüklemek için açık onay gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Devre dışı özel alanın değeri geri yüklenemez." });
    var revision = await db.StockItemCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (revision is null) return Results.NotFound();
    var targetRaw = revision.PreviousValue;
    if (!StockCustomFieldValidation.TryNormalize(definition, targetRaw, out var targetValue))
        return Results.Conflict(new { error = "Geçmiş değer güncel alan tanımıyla uyumlu değil; önce alan tanımını uyumlu bir sürüme geri yükleyin." });
    if (definition.IsRequired && targetValue.Length == 0)
        return Results.Conflict(new { error = "Zorunlu alan boş bir geçmiş değerine geri yüklenemez." });
    var current = await db.StockItemCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StockItemId == id && x.DefinitionId == definitionId);
    var currentValue = current?.Value;
    if (string.Equals(currentValue, targetValue, StringComparison.Ordinal)) return Results.Conflict(new { error = "Stok kartı değeri zaten seçilen geçmiş durumunda." });
    if (targetValue.Length == 0)
    {
        if (current is not null) db.StockItemCustomFieldValues.Remove(current);
    }
    else if (current is null)
    {
        db.StockItemCustomFieldValues.Add(new StockItemCustomFieldValue { TenantId = tenantId, StockItemId = id, DefinitionId = definitionId, Value = targetValue, DefinitionVersion = definition.Version });
    }
    else
    {
        current.Value = targetValue;
        current.DefinitionVersion = definition.Version;
        current.UpdatedAt = DateTimeOffset.UtcNow;
    }
    db.StockItemCustomFieldValueRevisions.Add(new StockItemCustomFieldValueRevision
    {
        TenantId = tenantId, StockItemId = id, DefinitionId = definitionId, PreviousValue = currentValue,
        NewValue = targetValue.Length == 0 ? null : targetValue, DefinitionVersion = definition.Version, ChangedByUserId = GetUserId(principal)
    });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.value-restored", Resource = $"{item.Code}:{definition.Code}:{revision.Id:D}" });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new StockCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, targetValue));
});
stockItems.MapPut("/{id:guid}/custom-fields", async (Guid id, StockCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (body.Values is null || body.Values.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definitions = await db.StockItemCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItemCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    var byCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    if (body.Values.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !byCode.ContainsKey(x))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["İstek tenant içindeki etkin özel alanlardan bilinmeyen bir kod içeriyor."] });
    var normalized = new Dictionary<Guid, (StockItemCustomFieldDefinition Definition, string Value)>();
    foreach (var (code, rawValue) in body.Values)
    {
        if (!byCode.TryGetValue(code, out var definition)) continue;
        if (!StockCustomFieldValidation.TryNormalize(definition, rawValue, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{code}"] = [$"'{definition.Label}' alanı için değer {definition.DataType} türüne veya tanımlı sınıra uymuyor."] });
        if (value.Length == 0) continue;
        normalized[definition.Id] = (definition, value);
    }
    var missingRequired = definitions.FirstOrDefault(definition => definition.IsRequired && !normalized.ContainsKey(definition.Id));
    if (missingRequired is not null)
        return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{missingRequired.Code}"] = [$"'{missingRequired.Label}' alanı zorunludur."] });
    var activeIds = definitions.Select(x => x.Id).ToHashSet();
    var existing = await db.StockItemCustomFieldValues.Where(x => x.TenantId == tenantId && x.StockItemId == id && activeIds.Contains(x.DefinitionId)).ToListAsync();
    var existingById = existing.ToDictionary(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        var oldValue = existingById.GetValueOrDefault(definition.Id)?.Value;
        var newValue = normalized.GetValueOrDefault(definition.Id).Value ?? "";
        if (string.Equals(oldValue, newValue, StringComparison.Ordinal)) continue;
        db.StockItemCustomFieldValueRevisions.Add(new StockItemCustomFieldValueRevision
        {
            TenantId = tenantId,
            StockItemId = id,
            DefinitionId = definition.Id,
            PreviousValue = oldValue,
            NewValue = newValue.Length == 0 ? null : newValue,
            DefinitionVersion = definition.Version,
            ChangedByUserId = GetUserId(principal)
        });
    }
    db.StockItemCustomFieldValues.RemoveRange(existing);
    foreach (var (definitionId, value) in normalized)
        db.StockItemCustomFieldValues.Add(new StockItemCustomFieldValue { TenantId = tenantId, StockItemId = id, DefinitionId = definitionId, Value = value.Value, DefinitionVersion = value.Definition.Version });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "stock-custom-field.values-updated", Resource = id.ToString("D") });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    var result = definitions.Select(x => new StockCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, normalized.GetValueOrDefault(x.Id).Value ?? "")).ToArray();
    return Results.Ok(result);
});

var warehouses = app.MapGroup("/api/warehouses").RequireAuthorization();
warehouses.MapGet("/", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var items = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId).OrderBy(x => x.Name)
        .Select(x => new WarehouseView(x.Id, x.Code, x.Name, x.IsActive, x.RowVersion)).ToListAsync();
    return Results.Ok(items);
});
warehouses.MapPost("/", async (WarehouseWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu depo kodu bu firmada zaten kullanılıyor." });
    var warehouse = new Warehouse { TenantId = tenantId, Code = code, Name = request.Name.Trim() };
    db.Warehouses.Add(warehouse);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu depo kodu bu firmada zaten kullanılıyor." }); }
    return Results.Created($"/api/warehouses/{warehouse.Id}", new WarehouseView(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.IsActive, warehouse.RowVersion));
});
warehouses.MapPut("/{warehouseId:guid}", async (Guid warehouseId, WarehouseUpdateRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.RowVersion.SequenceEqual(request.RowVersion!)) return Results.Conflict(new { error = "Depo başka bir işlemde değiştirildi. Güncel kaydı yükleyip yeniden deneyin." });
    if (await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Code == code && x.Id != warehouseId)) return Results.Conflict(new { error = "Bu depo kodu bu firmada zaten kullanılıyor." });
    var name = request.Name.Trim();
    if (warehouse.Code == code && warehouse.Name == name) return Results.Ok(new WarehouseView(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.IsActive, warehouse.RowVersion));
    warehouse.Code = code; warehouse.Name = name;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "warehouse.updated", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu depo kodu bu firmada zaten kullanılıyor." }); }
    catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Depo eşzamanlı olarak değiştirildi. Güncel kaydı yükleyip yeniden deneyin." }); }
    await transaction.CommitAsync();
    return Results.Ok(new WarehouseView(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.IsActive, warehouse.RowVersion));
});
warehouses.MapPost("/{warehouseId:guid}/status", async (Guid warehouseId, WarehouseStateChangeRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (warehouse.IsActive == request.IsActive) return Results.Conflict(new { error = request.IsActive ? "Depo zaten etkin." : "Depo zaten devre dışı." });
    if (!request.IsActive)
    {
        var nonzeroBalance = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId)
            .GroupBy(x => x.StockItemId)
            .Select(group => new { StockItemId = group.Key, Balance = group.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
            .FirstOrDefaultAsync(x => x.Balance != 0m);
        if (nonzeroBalance is not null)
        {
            var stockCode = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == nonzeroBalance.StockItemId).Select(x => x.Code).SingleAsync();
            return Results.Conflict(new { error = $"{stockCode} için stok bakiyesi sıfır olmadan depo devre dışı bırakılamaz.", stockItemId = nonzeroBalance.StockItemId, currentBalance = nonzeroBalance.Balance });
        }
    }
    warehouse.IsActive = request.IsActive;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = request.IsActive ? "warehouse.activated" : "warehouse.deactivated", Resource = warehouse.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new WarehouseView(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.IsActive, warehouse.RowVersion));
});
warehouses.MapGet("/transfers", async (ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.InventoryTransfers.AsNoTracking().Where(x => x.TenantId == tenantId);
    var totalCount = await query.CountAsync();
    var transfers = await query.OrderByDescending(x => x.TransferDate).ThenByDescending(x => x.CreatedAt)
        .Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new InventoryTransferSummary(x.Id, x.Code, x.FromWarehouseId,
            db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.FromWarehouseId).Select(w => w.Name).FirstOrDefault() ?? "",
            x.ToWarehouseId, db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.ToWarehouseId).Select(w => w.Name).FirstOrDefault() ?? "",
            x.TransferDate, x.Status,
            db.InventoryTransactions.Count(t => t.TenantId == tenantId && t.InventoryTransferId == x.Id && t.WarehouseId == x.FromWarehouseId), x.CreatedAt))
        .ToListAsync();
    return Results.Ok(new { items = transfers, page, pageSize, totalCount });
});
warehouses.MapGet("/transfers/{transferId:guid}", async (Guid transferId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var transferRecord = await db.InventoryTransfers.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == transferId);
    if (transferRecord is null) return Results.NotFound();
    var fromName = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == transferRecord.FromWarehouseId).Select(x => x.Name).SingleAsync();
    var toName = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == transferRecord.ToWarehouseId).Select(x => x.Name).SingleAsync();
    var lineCount = await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id && x.WarehouseId == transferRecord.FromWarehouseId);
    var summary = new InventoryTransferSummary(transferRecord.Id, transferRecord.Code, transferRecord.FromWarehouseId, fromName,
        transferRecord.ToWarehouseId, toName, transferRecord.TransferDate, transferRecord.Status, lineCount, transferRecord.CreatedAt);
    var lines = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id && x.WarehouseId == transferRecord.FromWarehouseId)
        .OrderBy(x => x.StockItem.Code).Select(x => new InventoryTransferLineView(x.StockItemId, x.StockItem.Code, x.StockItem.Name, x.StockItem.UnitCode, x.Quantity)).ToListAsync();
    return Results.Ok(new InventoryTransferDetailView(summary, lines));
});
warehouses.MapPost("/transfers", async (InventoryTransferWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var existingTransfer = await db.InventoryTransfers.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (existingTransfer is not null)
    {
        var existingFrom = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == existingTransfer.FromWarehouseId).Select(x => x.Name).SingleAsync();
        var existingTo = await db.Warehouses.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == existingTransfer.ToWarehouseId).Select(x => x.Name).SingleAsync();
        var existingCount = await db.InventoryTransactions.CountAsync(x => x.TenantId == tenantId && x.InventoryTransferId == existingTransfer.Id && x.WarehouseId == existingTransfer.FromWarehouseId);
        var existingLines = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.InventoryTransferId == existingTransfer.Id && x.WarehouseId == existingTransfer.FromWarehouseId)
            .Select(x => new { x.StockItemId, x.Quantity }).OrderBy(x => x.StockItemId).ToListAsync();
        var requestedLines = request.Lines.Select(x => new { x.StockItemId, x.Quantity }).OrderBy(x => x.StockItemId).ToArray();
        if (existingTransfer.FromWarehouseId != request.FromWarehouseId || existingTransfer.ToWarehouseId != request.ToWarehouseId ||
            existingTransfer.TransferDate != request.TransferDate || existingLines.Count != requestedLines.Length ||
            existingLines.Where((line, index) => line.StockItemId != requestedLines[index].StockItemId || line.Quantity != requestedLines[index].Quantity).Any())
            return Results.Conflict(new { error = "requestId daha önce farklı içerikli bir depo transferinde kullanılmış." });
        return Results.Ok(new InventoryTransferSummary(existingTransfer.Id, existingTransfer.Code, existingTransfer.FromWarehouseId, existingFrom,
            existingTransfer.ToWarehouseId, existingTo, existingTransfer.TransferDate, existingTransfer.Status, existingCount, existingTransfer.CreatedAt));
    }

    await using var transaction = await db.Database.BeginTransactionAsync();
    var stockItems = new Dictionary<Guid, StockItem>();
    foreach (var stockItemId in request.Lines.Select(x => x.StockItemId).Order())
    {
        var stockItem = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {stockItemId}").SingleOrDefaultAsync();
        if (stockItem is null || !stockItem.IsActive) return Results.Conflict(new { error = "Transfer satırlarından en az birinin stok kartı bulunamadı veya pasif." });
        stockItems.Add(stockItemId, stockItem);
    }
    var warehouseIds = new[] { request.FromWarehouseId, request.ToWarehouseId }.Order().ToArray();
    var lockedWarehouses = new Dictionary<Guid, Warehouse>();
    foreach (var warehouseId in warehouseIds)
    {
        var locked = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
        if (locked is null) return Results.NotFound();
        lockedWarehouses.Add(warehouseId, locked);
    }
    var fromWarehouse = lockedWarehouses[request.FromWarehouseId];
    var toWarehouse = lockedWarehouses[request.ToWarehouseId];
    if (!fromWarehouse.IsActive || !toWarehouse.IsActive) return Results.Conflict(new { error = "Depo transferinde kaynak ve hedef depolar etkin olmalıdır." });
    foreach (var line in request.Lines)
    {
        var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == fromWarehouse.Id && x.StockItemId == line.StockItemId)
            .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
        var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == fromWarehouse.Id
                && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == line.StockItemId)
            .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity)) ?? 0m;
        if (line.Quantity > current - reserved)
            return Results.Conflict(new { error = $"{stockItems[line.StockItemId].Code} için kaynak depoda rezervasyonlar düşüldükten sonra yeterli stok yok.", stockItemId = line.StockItemId, currentBalance = current, reservedQuantity = reserved, requestedQuantity = line.Quantity });
    }

    var code = $"TR-{Guid.NewGuid():N}".ToUpperInvariant();
    var transferRecord = new InventoryTransfer { TenantId = tenantId, RequestId = request.RequestId, FromWarehouseId = fromWarehouse.Id,
        ToWarehouseId = toWarehouse.Id, Code = code, TransferDate = request.TransferDate };
    db.InventoryTransfers.Add(transferRecord);
    foreach (var line in request.Lines.OrderBy(x => stockItems[x.StockItemId].Code, StringComparer.Ordinal))
    {
        var item = stockItems[line.StockItemId];
        var unitCostBase = await GetWeightedAverageUnitCostBaseAsync(db, tenantId, item.Id, request.TransferDate);
        db.InventoryTransactions.AddRange(
            new InventoryTransaction { TenantId = tenantId, WarehouseId = fromWarehouse.Id, StockItemId = item.Id, InventoryTransfer = transferRecord,
                EntryDate = request.TransferDate, Direction = InventoryDirection.Issue, Quantity = line.Quantity, UnitCostBase = unitCostBase, Description = $"Depo transferi {code} · kaynak" },
            new InventoryTransaction { TenantId = tenantId, WarehouseId = toWarehouse.Id, StockItemId = item.Id, InventoryTransfer = transferRecord,
                EntryDate = request.TransferDate, Direction = InventoryDirection.Receipt, Quantity = line.Quantity, UnitCostBase = unitCostBase, Description = $"Depo transferi {code} · hedef" });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-transfer.posted", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu requestId ile bir transfer zaten kaydedilmiş; listeyi yenileyin." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/transfers/{transferRecord.Id}", new InventoryTransferSummary(transferRecord.Id, code, fromWarehouse.Id,
        fromWarehouse.Name, toWarehouse.Id, toWarehouse.Name, transferRecord.TransferDate, transferRecord.Status, request.Lines.Count, transferRecord.CreatedAt));
});
warehouses.MapPost("/transfers/{transferId:guid}/void", async (Guid transferId, InventoryTransferVoidRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var transferRecord = await db.InventoryTransfers.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransfers] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {transferId}").SingleOrDefaultAsync();
    if (transferRecord is null) return Results.NotFound();
    if (transferRecord.Status != InventoryTransferStatus.Posted) return Results.Conflict(new { error = "Depo transferi daha önce iptal edilmiş." });
    var lockedWarehouses = new Dictionary<Guid, Warehouse>();
    foreach (var warehouseId in new[] { transferRecord.FromWarehouseId, transferRecord.ToWarehouseId }.Order())
    {
        var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
        if (warehouse is null) return Results.Conflict(new { error = "Transfer deposu artık bulunamadı." });
        lockedWarehouses.Add(warehouseId, warehouse);
    }
    var originals = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.InventoryTransferId == transferRecord.Id)
        .OrderBy(x => x.StockItemId).ThenBy(x => x.WarehouseId).ToListAsync();
    if (originals.Count == 0 || originals.Any(x => db.InventoryTransactions.Any(y => y.TenantId == tenantId && y.ReversalOfId == x.Id)))
        return Results.Conflict(new { error = "Transfer hareketleri eksik veya daha önce ters kayıt oluşturulmuş." });
    foreach (var original in originals.Where(x => x.Direction == InventoryDirection.Receipt))
    {
        var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == original.WarehouseId && x.StockItemId == original.StockItemId)
            .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
        var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == original.WarehouseId
                && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == original.StockItemId)
            .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity)) ?? 0m;
        if (original.Quantity > current - reserved)
            return Results.Conflict(new { error = "Transfer iptali hedef depodaki rezervasyonları karşılayamaz; önce stok kullanımını veya rezervasyonları düzenleyin.", stockItemId = original.StockItemId, currentBalance = current, reservedQuantity = reserved, transferQuantity = original.Quantity });
    }
    foreach (var original in originals)
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = original.WarehouseId, StockItemId = original.StockItemId,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = original.Direction == InventoryDirection.Receipt ? InventoryDirection.Issue : InventoryDirection.Receipt,
            Quantity = original.Quantity, UnitCostBase = original.UnitCostBase, Description = $"Transfer iptali {transferRecord.Code} · {request.Reason.Trim()}", ReversalOfId = original.Id });
    transferRecord.Status = InventoryTransferStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-transfer.voided", Resource = transferRecord.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { transferRecord.Id, transferRecord.Code, transferRecord.Status });
});
warehouses.MapGet("/{warehouseId:guid}/balances", async (Guid warehouseId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == warehouseId)) return Results.NotFound();
    var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        .OrderBy(x => x.Name).Select(x => new { x.Id, x.Code, x.Name, x.UnitCode, x.MinimumStock }).ToListAsync();
    var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync();
    var totals = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId)
        .GroupBy(x => x.StockItemId).Select(g => new { StockItemId = g.Key,
            Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
            Valuation = g.Sum(x => (decimal?)(x.UnitCostBase == null ? 0m : (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) * x.UnitCostBase.Value)) ?? 0m,
            Unvalued = g.Sum(x => (decimal?)(x.UnitCostBase == null ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m)) ?? 0m })
        .ToDictionaryAsync(x => x.StockItemId);
    var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.Status == SalesOrderReservationStatus.Active)
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) }).ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    return Results.Ok(items.Select(x =>
    {
        var total = totals.GetValueOrDefault(x.Id); var quantity = total?.Quantity ?? 0m; var reservedQuantity = reserved.GetValueOrDefault(x.Id);
        return new InventoryBalanceView(x.Id, x.Code, x.Name, x.UnitCode, x.MinimumStock, quantity, quantity < x.MinimumStock,
            reservedQuantity, Math.Max(0m, quantity - reservedQuantity), total?.Valuation ?? 0m, Math.Max(0m, total?.Unvalued ?? 0m), baseCurrency);
    }));
});
warehouses.MapGet("/{warehouseId:guid}/stock/{stockItemId:guid}/transactions", async (Guid warehouseId, Guid stockItemId, ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 50) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == warehouseId) || !await db.StockItems.AnyAsync(x => x.TenantId == tenantId && x.Id == stockItemId)) return Results.NotFound();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId);
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.EntryDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new InventoryTransactionView(x.Id, x.EntryDate, x.Direction, x.Quantity, x.Description, x.ReversalOfId, x.ReversalOfId != null,
            db.InventoryTransactions.Any(y => y.TenantId == x.TenantId && y.ReversalOfId == x.Id), x.UnitCostBase)).ToListAsync();
    return Results.Ok(new InventoryTransactionPage(rows, page, pageSize, total));
});
warehouses.MapPost("/{warehouseId:guid}/stock/{stockItemId:guid}/transactions", async (Guid warehouseId, Guid stockItemId, InventoryTransactionWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var item = await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {stockItemId}").SingleOrDefaultAsync();
    if (item is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive || !item.IsActive) return Results.Conflict(new { error = "Pasif depo veya stok kartına hareket eklenemez." });
    var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId)
        .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
    var reservedQuantity = request.Direction == InventoryDirection.Issue
        ? await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId
                && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == stockItemId)
            .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity)) ?? 0m
        : 0m;
    if (request.Direction == InventoryDirection.Issue && request.Quantity > current - reservedQuantity)
        return Results.Conflict(new { error = "Çıkış miktarı rezervasyonlar düşüldükten sonra kullanılabilir stoktan fazla olamaz.", currentBalance = current, reservedQuantity, availableQuantity = current - reservedQuantity, requestedQuantity = request.Quantity });
    var unitCostBase = request.Direction == InventoryDirection.Receipt ? request.UnitCostBase
        : await GetWeightedAverageUnitCostBaseAsync(db, tenantId, stockItemId, request.EntryDate);
    var movement = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouseId, StockItemId = stockItemId,
        EntryDate = request.EntryDate, Direction = request.Direction, Quantity = request.Quantity, UnitCostBase = unitCostBase, Description = request.Description.Trim() };
    db.InventoryTransactions.Add(movement);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-transaction.created", Resource = movement.Id.ToString() });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions/{movement.Id}",
        new InventoryTransactionView(movement.Id, movement.EntryDate, movement.Direction, movement.Quantity, movement.Description, null, false, false, movement.UnitCostBase));
});
warehouses.MapPost("/{warehouseId:guid}/stock/{stockItemId:guid}/transactions/{entryId:guid}/reverse", async (Guid warehouseId, Guid stockItemId, Guid entryId, InventoryReverseRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = InventoryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {warehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var original = await db.InventoryTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [WarehouseId] = {warehouseId} AND [StockItemId] = {stockItemId} AND [Id] = {entryId}").SingleOrDefaultAsync();
    if (original is null) return Results.NotFound();
    if (original.InventoryTransferId is not null) return Results.Conflict(new { error = "Depo transferi yalnızca transferin tamamı olarak iptal edilebilir." });
    if (original.SalesDeliveryLineId is not null) return Results.Conflict(new { error = "Satış irsaliyesi hareketi, irsaliye iptal işlemiyle geri alınmalıdır." });
    if (original.SalesReturnLineId is not null) return Results.Conflict(new { error = "Satış iadesi hareketi, iade iptal işlemiyle geri alınmalıdır." });
    if (original.PurchaseReceiptLineId is not null) return Results.Conflict(new { error = "Satın alma mal kabul hareketi, mal kabul iptal işlemiyle geri alınmalıdır." });
    if (original.SupplierReturnLineId is not null) return Results.Conflict(new { error = "Alış iadesi hareketi, iade iptal işlemiyle geri alınmalıdır." });
    if (original.ReversalOfId is not null) return Results.Conflict(new { error = "Bir ters kayıt yeniden ters çevrilemez." });
    if (await db.InventoryTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Bu hareket daha önce ters kayıtla iptal edildi." });
    var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId && x.StockItemId == stockItemId)
        .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
    var reverseDirection = original.Direction == InventoryDirection.Receipt ? InventoryDirection.Issue : InventoryDirection.Receipt;
    var reservedQuantity = reverseDirection == InventoryDirection.Issue
        ? await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouseId
                && x.Status == SalesOrderReservationStatus.Active && x.OrderLine.StockItemId == stockItemId)
            .SumAsync(x => (decimal?)(x.Quantity - x.FulfilledQuantity)) ?? 0m
        : 0m;
    if (reverseDirection == InventoryDirection.Issue && original.Quantity > current - reservedQuantity)
        return Results.Conflict(new { error = "Ters kayıt kullanılabilir bakiyeyi negatife düşüreceği için uygulanamadı.", currentBalance = current, reservedQuantity, reversalQuantity = original.Quantity });
    var reversal = new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouseId, StockItemId = stockItemId,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = reverseDirection, Quantity = original.Quantity,
        UnitCostBase = original.UnitCostBase, Description = $"Ters kayıt: {request.Reason.Trim()}", ReversalOfId = original.Id };
    db.InventoryTransactions.Add(reversal);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "inventory-transaction.reversed", Resource = original.Id.ToString() });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu hareket daha önce ters kayıtla iptal edildi." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions/{reversal.Id}",
        new InventoryTransactionView(reversal.Id, reversal.EntryDate, reversal.Direction, reversal.Quantity, reversal.Description, reversal.ReversalOfId, true, false, reversal.UnitCostBase));
});

var salesQuotes = app.MapGroup("/api/sales/quotes").RequireAuthorization();
salesQuotes.MapGet("/", async (string? q, ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.SalesQuotes.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Customer.Name.Contains(term) || x.Customer.Code.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.QuoteDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new SalesQuoteSummary(x.Id, x.Code, x.CustomerId, x.Customer.Name, x.QuoteDate, x.ValidUntil,
            x.CurrencyCode, x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt,
            db.SalesOrders.Any(y => y.TenantId == x.TenantId && y.QuoteId == x.Id))).ToListAsync();
    return Results.Ok(new SalesQuotePage(rows, page, pageSize, total));
});
salesQuotes.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var quote = await db.SalesQuotes.AsNoTracking().Include(x => x.Customer).Include(x => x.Lines).Include(x => x.Order)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (quote is null) return Results.NotFound();
    var lines = quote.Lines.OrderBy(x => x.LineNumber).Select(x => new SalesQuoteLineView(x.LineNumber, x.StockItemId,
        x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
    return Results.Ok(new SalesQuoteView(quote.Id, quote.Code, quote.CustomerId, quote.Customer.Name, quote.QuoteDate,
        quote.ValidUntil, quote.CurrencyCode, quote.Status, quote.Notes, quote.Subtotal, quote.DiscountTotal,
        quote.TaxTotal, quote.GrandTotal, quote.CreatedAt, lines, quote.Order is not null));
});
salesQuotes.MapPost("/", async (SalesQuoteWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = SalesQuoteValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.SalesQuotes.AnyAsync(x => x.TenantId == tenantId && x.Code == code)) return Results.Conflict(new { error = "Bu teklif numarası bu firmada zaten kullanılıyor." });
    var customer = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.CustomerId && x.IsActive);
    if (customer is null || customer.Type is not (CounterpartyType.Customer or CounterpartyType.Both))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerId"] = ["Aktif müşteri türünde bir cari seçilmelidir."] });
    var currencyCode = request.CurrencyCode.Trim().ToUpperInvariant();
    if (currencyCode != customer.CurrencyCode)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Teklif dövizi seçilen carinin döviziyle ({customer.CurrencyCode}) aynı olmalıdır."] });
    var requestedItemIds = request.Lines.Select(x => x.StockItemId).Distinct().ToArray();
    var stockItemsById = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && requestedItemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (stockItemsById.Count != requestedItemIds.Length)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Satırlardaki stok kartlarından biri bulunamadı veya pasif."] });
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(request.Lines.Select(SalesQuoteValidation.Calculate)); }
    catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Teklif toplamı desteklenen decimal(18,2) sınırını aşıyor."] }); }
    var quote = new SalesQuote { TenantId = tenantId, CustomerId = customer.Id, Code = code, QuoteDate = request.QuoteDate,
        ValidUntil = request.ValidUntil, CurrencyCode = currencyCode, Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = request.Lines[i]; var item = stockItemsById[input.StockItemId]; var amounts = SalesQuoteValidation.Calculate(input);
        quote.Lines.Add(new SalesQuoteLine { TenantId = tenantId, Quote = quote, LineNumber = i + 1, StockItemId = item.Id,
            StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = input.Quantity, UnitPrice = input.UnitPrice,
            DiscountPercent = input.DiscountPercent, VatPercent = input.VatPercent, LineSubtotal = amounts.LineSubtotal,
            DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    db.SalesQuotes.Add(quote);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-quote.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu teklif numarası bu firmada zaten kullanılıyor." }); }
    var summary = new SalesQuoteSummary(quote.Id, quote.Code, customer.Id, customer.Name, quote.QuoteDate, quote.ValidUntil,
        quote.CurrencyCode, quote.Status, quote.GrandTotal, quote.Lines.Count, quote.CreatedAt);
    return Results.Created($"/api/sales/quotes/{quote.Id}", summary);
});
salesQuotes.MapPost("/{id:guid}/send", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var quote = await db.SalesQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (quote is null) return Results.NotFound();
    if (quote.Status != SalesQuoteStatus.Draft) return Results.Conflict(new { error = "Yalnızca taslak teklif iletildi durumuna alınabilir." });
    if (quote.ValidUntil < DateOnly.FromDateTime(DateTime.UtcNow)) return Results.Conflict(new { error = "Geçerlilik tarihi geçmiş teklif iletilemez." });
    quote.Status = SalesQuoteStatus.Sent;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-quote.sent", Resource = quote.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    var customerName = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == quote.CustomerId).Select(x => x.Name).SingleAsync();
    var lineCount = await db.SalesQuoteLines.CountAsync(x => x.TenantId == tenantId && x.QuoteId == quote.Id);
    return Results.Ok(new SalesQuoteSummary(quote.Id, quote.Code, quote.CustomerId, customerName, quote.QuoteDate, quote.ValidUntil,
        quote.CurrencyCode, quote.Status, quote.GrandTotal, lineCount, quote.CreatedAt));
});
salesQuotes.MapPost("/{id:guid}/accept", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
    await UpdateSalesQuoteStatusAsync(id, SalesQuoteStatus.Accepted, principal, db));
salesQuotes.MapPost("/{id:guid}/reject", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
    await UpdateSalesQuoteStatusAsync(id, SalesQuoteStatus.Rejected, principal, db));
salesQuotes.MapPost("/{id:guid}/convert-to-order", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var quote = await db.SalesQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (quote is null) return Results.NotFound();
    var alreadyConverted = await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.QuoteId == id);
    if (!SalesQuoteWorkflow.CanConvertToOrder(quote.Status, alreadyConverted))
        return alreadyConverted ? Results.Conflict(new { error = "Bu teklif daha önce satış siparişine dönüştürüldü." }) : Results.Conflict(new { error = "Yalnızca kabul edilmiş teklif siparişe dönüştürülebilir." });
    var sourceLines = await db.SalesQuoteLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == id).OrderBy(x => x.LineNumber).ToListAsync();
    if (sourceLines.Count == 0) return Results.Conflict(new { error = "Satır içermeyen teklif siparişe dönüştürülemez." });
    var orderCode = $"SO-{quote.Id:N}".ToUpperInvariant();
    var order = new SalesOrder { TenantId = tenantId, QuoteId = quote.Id, CustomerId = quote.CustomerId, Code = orderCode,
        OrderDate = DateOnly.FromDateTime(DateTime.UtcNow), CurrencyCode = quote.CurrencyCode, Status = SalesOrderStatus.Open,
        Subtotal = quote.Subtotal, DiscountTotal = quote.DiscountTotal, TaxTotal = quote.TaxTotal, GrandTotal = quote.GrandTotal };
    foreach (var source in sourceLines)
        order.Lines.Add(new SalesOrderLine { TenantId = tenantId, Order = order, LineNumber = source.LineNumber,
            StockItemId = source.StockItemId, StockCode = source.StockCode, StockName = source.StockName, UnitCode = source.UnitCode,
            Quantity = source.Quantity, UnitPrice = source.UnitPrice, DiscountPercent = source.DiscountPercent, VatPercent = source.VatPercent,
            LineSubtotal = source.LineSubtotal, DiscountAmount = source.DiscountAmount, TaxAmount = source.TaxAmount, LineTotal = source.LineTotal });
    db.SalesOrders.Add(order);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-order.created-from-quote", Resource = orderCode });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu teklif daha önce satış siparişine dönüştürüldü." }); }
    await transaction.CommitAsync();
    var customerName = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == order.CustomerId).Select(x => x.Name).SingleAsync();
    return Results.Created($"/api/sales/orders/{order.Id}", new SalesOrderSummary(order.Id, order.Code, quote.Id, quote.Code,
        order.CustomerId, customerName, order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count, order.CreatedAt));
});
var salesOrders = app.MapGroup("/api/sales/orders").RequireAuthorization();
salesOrders.MapPost("/{id:guid}/reservations", async (Guid id, SalesOrderReservationWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = SalesOrderReservationValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var priorRequest = await db.SalesOrderReservations.AsNoTracking().Include(x => x.Warehouse).Include(x => x.OrderLine)
        .Where(x => x.TenantId == tenantId && x.RequestId == request.RequestId).ToListAsync();
    if (priorRequest.Count > 0)
    {
        if (priorRequest.Any(x => x.OrderId != id || x.WarehouseId != request.WarehouseId))
            return Results.Conflict(new { error = "Bu rezervasyon istek anahtarı başka sipariş veya depoda kullanılmış." });
        return Results.Ok(priorRequest.Select(x => new SalesOrderReservationSummary(x.Id, x.OrderId, x.OrderLineNumber,
            x.WarehouseId, x.Warehouse.Name, x.OrderLine.StockItemId, x.OrderLine.StockCode, x.Quantity, x.FulfilledQuantity,
            x.Status == SalesOrderReservationStatus.Active ? x.Quantity - x.FulfilledQuantity : 0m, x.Status, x.CreatedAt, x.ReleasedAt)));
    }
    if (order.Status != SalesOrderStatus.Open) return Results.Conflict(new { error = "Yalnızca açık satış siparişi için stok ayrılabilir." });
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depodan stok ayrılamaz." });
    if (await db.SalesOrderReservations.AnyAsync(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesOrderReservationStatus.Active))
        return Results.Conflict(new { error = "Sipariş satırlarında zaten aktif rezervasyon var. Önce mevcut rezervasyonu bırakın." });
    var orderLines = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id).OrderBy(x => x.LineNumber).ToListAsync();
    var delivered = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id && x.Delivery.Status == SalesDeliveryStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    var toReserve = orderLines.Select(x => new { Line = x, Quantity = x.Quantity - delivered.GetValueOrDefault(x.LineNumber) }).Where(x => x.Quantity > 0).ToList();
    if (toReserve.Count == 0) return Results.Conflict(new { error = "Siparişte ayrılabilecek açık miktar kalmadı." });
    var stockIds = toReserve.Select(x => x.Line.StockItemId).Distinct().ToArray();
    var stockItems = await db.StockItems.Where(x => x.TenantId == tenantId && stockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (stockItems.Count != stockIds.Length || stockItems.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Sipariş satırlarından en az bir stok kartı bulunamadı veya pasif." });
    var requiredByStock = toReserve.GroupBy(x => x.Line.StockItemId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
    var activeReserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && stockIds.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    var balances = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && stockIds.Contains(x.StockItemId))
        .GroupBy(x => x.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    foreach (var required in requiredByStock)
    {
        var available = balances.GetValueOrDefault(required.Key) - activeReserved.GetValueOrDefault(required.Key);
        if (required.Value > available)
            return Results.Conflict(new { error = $"{stockItems[required.Key].Code} için depoda rezervasyona uygun stok yok.", stockItemId = required.Key,
                quantityOnHand = balances.GetValueOrDefault(required.Key), alreadyReservedQuantity = activeReserved.GetValueOrDefault(required.Key),
                availableQuantity = Math.Max(0m, available), requestedQuantity = required.Value });
    }
    var reservations = toReserve.Select(x => new SalesOrderReservation { TenantId = tenantId, RequestId = request.RequestId,
        OrderId = id, OrderLineNumber = x.Line.LineNumber, WarehouseId = warehouse.Id, Quantity = x.Quantity }).ToList();
    db.SalesOrderReservations.AddRange(reservations);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.stock-reserved", Resource = order.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/sales/orders/{id}", reservations.Select(x => new SalesOrderReservationSummary(x.Id, x.OrderId,
        x.OrderLineNumber, warehouse.Id, warehouse.Name, toReserve.Single(y => y.Line.LineNumber == x.OrderLineNumber).Line.StockItemId,
        toReserve.Single(y => y.Line.LineNumber == x.OrderLineNumber).Line.StockCode, x.Quantity, 0m, x.Quantity, x.Status, x.CreatedAt, null)));
});
salesOrders.MapPost("/{id:guid}/reservations/release", async (Guid id, SalesOrderReservationReleaseRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = SalesOrderReservationValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var reservations = await db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesOrderReservationStatus.Active).ToListAsync();
    if (reservations.Count == 0) return Results.Conflict(new { error = "Bu sipariş için aktif stok rezervasyonu yok." });
    foreach (var reservation in reservations) { reservation.Status = SalesOrderReservationStatus.Released; reservation.ReleasedAt = DateTimeOffset.UtcNow; }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "sales-order.stock-reservation-released", Resource = $"{order.Code}:{request.Reason.Trim()}" });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { order.Id, order.Code, releasedCount = reservations.Count });
});
salesOrders.MapPost("/{id:guid}/deliveries", async (Guid id, SalesDeliveryWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = SalesDeliveryValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    if (order.Status != SalesOrderStatus.Open) return Results.Conflict(new { error = "Yalnızca açık satış siparişi sevk edilebilir." });
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depodan sevkiyat yapılamaz." });
    var orderLines = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id).OrderBy(x => x.LineNumber).ToListAsync();
    var orderLinesByNumber = orderLines.ToDictionary(x => x.LineNumber);
    if (request.Lines.Any(x => !orderLinesByNumber.ContainsKey(x.OrderLineNumber)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["İrsaliye satırlarından biri siparişte bulunamadı."] });
    var delivered = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id && x.Delivery.Status == SalesDeliveryStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    var activeReservations = await db.SalesOrderReservations.Where(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesOrderReservationStatus.Active)
        .ToDictionaryAsync(x => x.OrderLineNumber);
    foreach (var input in request.Lines)
    {
        var orderLine = orderLinesByNumber[input.OrderLineNumber];
        var remaining = orderLine.Quantity - delivered.GetValueOrDefault(input.OrderLineNumber);
        if (input.Quantity > remaining)
            return Results.Conflict(new { error = $"Sipariş satırı {input.OrderLineNumber} için kalan miktar {remaining}.", orderLineNumber = input.OrderLineNumber, remainingQuantity = remaining });
        if (activeReservations.TryGetValue(input.OrderLineNumber, out var reservation))
        {
            var reservedRemaining = reservation.Quantity - reservation.FulfilledQuantity;
            if (reservation.WarehouseId != warehouse.Id)
                return Results.Conflict(new { error = $"Sipariş satırı {input.OrderLineNumber} {reservation.WarehouseId} deposunda rezerve edildi.", orderLineNumber = input.OrderLineNumber, reservationWarehouseId = reservation.WarehouseId });
            if (input.Quantity > reservedRemaining)
                return Results.Conflict(new { error = $"Sipariş satırı {input.OrderLineNumber} için rezervasyonda kalan miktar {reservedRemaining}.", orderLineNumber = input.OrderLineNumber, reservedRemainingQuantity = reservedRemaining });
        }
    }
    var requestedStockIds = request.Lines.Select(x => orderLinesByNumber[x.OrderLineNumber].StockItemId).Distinct().ToArray();
    var stockItems = await db.StockItems.Where(x => x.TenantId == tenantId && requestedStockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (stockItems.Count != requestedStockIds.Length || stockItems.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Sevkiyat satırlarından en az birinin stok kartı bulunamadı veya pasif." });
    var requiredByStock = request.Lines.GroupBy(x => orderLinesByNumber[x.OrderLineNumber].StockItemId)
        .ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
    var reservedElsewhereByStock = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && requestedStockIds.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    var consumedReservationByStock = request.Lines.Where(x => activeReservations.ContainsKey(x.OrderLineNumber))
        .GroupBy(x => orderLinesByNumber[x.OrderLineNumber].StockItemId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
    foreach (var required in requiredByStock)
    {
        var current = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && x.StockItemId == required.Key)
            .SumAsync(x => (decimal?)(x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity)) ?? 0m;
        var available = current - reservedElsewhereByStock.GetValueOrDefault(required.Key) + consumedReservationByStock.GetValueOrDefault(required.Key);
        if (required.Value > available)
            return Results.Conflict(new { error = $"{stockItems[required.Key].Code} için depoda rezervasyonlar düşüldükten sonra yeterli stok yok.", stockItemId = required.Key,
                currentBalance = current, reservedQuantity = reservedElsewhereByStock.GetValueOrDefault(required.Key), availableQuantity = available, requestedQuantity = required.Value });
    }
    var code = $"DN-{Guid.NewGuid():N}".ToUpperInvariant();
    var delivery = new SalesDelivery { TenantId = tenantId, OrderId = order.Id, WarehouseId = warehouse.Id, Code = code, DeliveryDate = request.DeliveryDate };
    foreach (var input in request.Lines.OrderBy(x => x.OrderLineNumber))
    {
        var orderLine = orderLinesByNumber[input.OrderLineNumber];
        activeReservations.TryGetValue(input.OrderLineNumber, out var reservation);
        var line = new SalesDeliveryLine { TenantId = tenantId, Delivery = delivery, OrderId = id, OrderLineNumber = orderLine.LineNumber,
            ReservationId = reservation?.Id, StockItemId = orderLine.StockItemId, StockCode = orderLine.StockCode, StockName = orderLine.StockName, UnitCode = orderLine.UnitCode, Quantity = input.Quantity };
        if (reservation is not null) reservation.FulfilledQuantity += input.Quantity;
        delivery.Lines.Add(line);
        var unitCostBase = await GetWeightedAverageUnitCostBaseAsync(db, tenantId, orderLine.StockItemId, request.DeliveryDate);
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = orderLine.StockItemId,
            EntryDate = request.DeliveryDate, Direction = InventoryDirection.Issue, Quantity = input.Quantity,
            UnitCostBase = unitCostBase, Description = $"Satış irsaliyesi {code}", SalesDeliveryLine = line });
    }
    db.SalesDeliveries.Add(delivery);
    var deliveredAfter = new Dictionary<int, decimal>(delivered);
    foreach (var input in request.Lines) deliveredAfter[input.OrderLineNumber] = deliveredAfter.GetValueOrDefault(input.OrderLineNumber) + input.Quantity;
    order.Status = orderLines.All(x => deliveredAfter.GetValueOrDefault(x.LineNumber) >= x.Quantity) ? SalesOrderStatus.Fulfilled : SalesOrderStatus.Open;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-delivery.posted", Resource = code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/sales/deliveries/{delivery.Id}", new SalesDeliverySummary(delivery.Id, delivery.Code, order.Id, order.Code,
        warehouse.Id, warehouse.Name, delivery.DeliveryDate, delivery.Status, delivery.Lines.Count, delivery.CreatedAt));
});
salesOrders.MapGet("/", async (string? q, ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Quote.Code.Contains(term) || x.Customer.Name.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.OrderDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new SalesOrderSummary(x.Id, x.Code, x.QuoteId, x.Quote.Code, x.CustomerId, x.Customer.Name,
            x.OrderDate, x.CurrencyCode, x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt)).ToListAsync();
    return Results.Ok(new SalesOrderPage(rows, page, pageSize, total));
});
salesOrders.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var order = await db.SalesOrders.AsNoTracking().Include(x => x.Quote).Include(x => x.Customer).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (order is null) return Results.NotFound();
    var delivered = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == id && x.Delivery.Status == SalesDeliveryStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    var reservations = await db.SalesOrderReservations.AsNoTracking().Include(x => x.Warehouse)
        .Where(x => x.TenantId == tenantId && x.OrderId == id && x.Status == SalesOrderReservationStatus.Active)
        .ToDictionaryAsync(x => x.OrderLineNumber);
    var lines = order.Lines.OrderBy(x => x.LineNumber).Select(x =>
    {
        reservations.TryGetValue(x.LineNumber, out var reservation);
        var deliveredQuantity = delivered.GetValueOrDefault(x.LineNumber);
        return new SalesOrderLineView(x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity,
            x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal,
            deliveredQuantity, Math.Max(0m, x.Quantity - deliveredQuantity), reservation?.Id, reservation?.WarehouseId,
            reservation?.Warehouse.Name, reservation is null ? 0m : reservation.Quantity - reservation.FulfilledQuantity);
    }).ToList();
    return Results.Ok(new SalesOrderView(order.Id, order.Code, order.QuoteId, order.Quote.Code, order.CustomerId, order.Customer.Name,
        order.OrderDate, order.CurrencyCode, order.Status, order.Subtotal, order.DiscountTotal, order.TaxTotal, order.GrandTotal, order.CreatedAt, lines));
});
var salesDeliveries = app.MapGroup("/api/sales/deliveries").RequireAuthorization();
salesDeliveries.MapGet("/", async (Guid? orderId, ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (orderId is { } requestedOrderId) query = query.Where(x => x.OrderId == requestedOrderId);
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.DeliveryDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new SalesDeliverySummary(x.Id, x.Code, x.OrderId, x.Order.Code, x.WarehouseId, x.Warehouse.Name,
            x.DeliveryDate, x.Status, x.Lines.Count, x.CreatedAt, db.SalesInvoices.Any(y => y.TenantId == x.TenantId && y.DeliveryId == x.Id),
            db.SalesInvoices.Where(y => y.TenantId == x.TenantId && y.DeliveryId == x.Id).Select(y => (SalesInvoiceStatus?)y.Status).FirstOrDefault(),
            db.SalesInvoices.Where(y => y.TenantId == x.TenantId && y.DeliveryId == x.Id).Select(y => (Guid?)y.Id).FirstOrDefault())).ToListAsync();
    return Results.Ok(new SalesDeliveryPage(rows, page, pageSize, total));
});
salesDeliveries.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var delivery = await db.SalesDeliveries.AsNoTracking().Include(x => x.Order).Include(x => x.Warehouse).Include(x => x.Lines).Include(x => x.Invoice)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (delivery is null) return Results.NotFound();
    var lines = delivery.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SalesDeliveryLineView(x.OrderLineNumber,
        x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity)).ToList();
    return Results.Ok(new SalesDeliveryView(delivery.Id, delivery.Code, delivery.OrderId, delivery.Order.Code, delivery.WarehouseId,
        delivery.Warehouse.Name, delivery.DeliveryDate, delivery.Status, delivery.CreatedAt, lines, delivery.Invoice is not null, delivery.Invoice?.Status, delivery.Invoice?.Id));
});
salesDeliveries.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.SalesDeliveries.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.OrderId, x.WarehouseId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.SalesOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.OrderId}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var delivery = await db.SalesDeliveries.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesDeliveries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (delivery is null) return Results.NotFound();
    if (delivery.Status != SalesDeliveryStatus.Posted) return Results.Conflict(new { error = "İrsaliye daha önce iptal edildi." });
    if (await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId && x.DeliveryId == id && x.Status == SalesInvoiceStatus.Posted))
        return Results.Conflict(new { error = "İrsaliye önce bağlı satış faturası iptal edilerek kapatılmalıdır." });
    var lines = await db.SalesDeliveryLines.Where(x => x.TenantId == tenantId && x.DeliveryId == id).OrderBy(x => x.Id).ToListAsync();
    foreach (var line in lines)
    {
        if (line.ReservationId is { } reservationId)
        {
            var reservation = await db.SalesOrderReservations.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesOrderReservations] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {reservationId}").SingleOrDefaultAsync();
            if (reservation is null || reservation.FulfilledQuantity < line.Quantity)
                return Results.Conflict(new { error = "İrsaliye satırının stok rezervasyonu bulunamadı veya miktarı tutarsız." });
            reservation.FulfilledQuantity -= line.Quantity;
        }
        var movements = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.SalesDeliveryLineId == line.Id && x.ReversalOfId == null).ToListAsync();
        foreach (var movement in movements)
        {
            if (await db.InventoryTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == movement.Id))
                return Results.Conflict(new { error = "İrsaliye hareketlerinden biri zaten ters kayıtla geri alınmış." });
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = movement.StockItemId,
                EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = InventoryDirection.Receipt, Quantity = movement.Quantity,
                UnitCostBase = movement.UnitCostBase, Description = $"İrsaliye iptali {delivery.Code}", ReversalOfId = movement.Id, SalesDeliveryLineId = line.Id });
        }
    }
    delivery.Status = SalesDeliveryStatus.Voided;
    if (order.Status != SalesOrderStatus.Cancelled)
    {
        var orderLines = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == order.Id).ToListAsync();
        var remainingDeliveries = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.OrderId == order.Id && x.Delivery.Status == SalesDeliveryStatus.Posted && x.DeliveryId != id)
            .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
        order.Status = orderLines.All(x => remainingDeliveries.GetValueOrDefault(x.LineNumber) >= x.Quantity) ? SalesOrderStatus.Fulfilled : SalesOrderStatus.Open;
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-delivery.voided", Resource = delivery.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { delivery.Id, delivery.Code, deliveryStatus = delivery.Status, orderStatus = order.Status });
});
salesDeliveries.MapPost("/{id:guid}/invoice", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var delivery = await db.SalesDeliveries.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesDeliveries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (delivery is null) return Results.NotFound();
    var existing = await db.SalesInvoices.AsNoTracking().Include(x => x.Delivery).Include(x => x.Order).Include(x => x.Customer)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DeliveryId == id);
    if (existing is not null)
        return Results.Ok(new SalesInvoiceSummary(existing.Id, existing.Code, existing.DeliveryId, existing.Delivery.Code, existing.OrderId,
            existing.Order.Code, existing.CustomerId, existing.Customer.Name, existing.InvoiceDate, existing.CurrencyCode,
            existing.Status, existing.GrandTotal, await db.SalesInvoiceLines.CountAsync(x => x.TenantId == tenantId && x.InvoiceId == existing.Id), existing.CreatedAt));
    if (delivery.Status != SalesDeliveryStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş irsaliyeden fatura oluşturulamaz." });
    var order = await db.SalesOrders.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == delivery.OrderId);
    if (order is null) return Results.NotFound();
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {order.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    if (customer.CurrencyCode != order.CurrencyCode) return Results.Conflict(new { error = "Müşteri dövizi sipariş dövizinden farklı; fatura oluşturulamadı." });
    var deliveryLines = await db.SalesDeliveryLines.AsNoTracking().Include(x => x.OrderLine)
        .Where(x => x.TenantId == tenantId && x.DeliveryId == id).OrderBy(x => x.OrderLineNumber).ToListAsync();
    if (deliveryLines.Count == 0) return Results.Conflict(new { error = "Satır içermeyen irsaliyeden fatura oluşturulamaz." });
    var invoiceLines = deliveryLines.Select(x =>
    {
        var pricing = x.OrderLine;
        var amounts = SalesQuoteValidation.Calculate(new SalesQuoteLineWriteRequest(pricing.StockItemId, x.Quantity,
            pricing.UnitPrice, pricing.DiscountPercent, pricing.VatPercent));
        return (DeliveryLine: x, Pricing: pricing, Amounts: amounts);
    }).ToArray();
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(invoiceLines.Select(x => x.Amounts)); }
    catch (OverflowException) { return Results.Conflict(new { error = "Fatura toplamı desteklenen decimal(18,2) sınırını aşıyor." }); }
    if (totals.GrandTotal <= 0) return Results.Conflict(new { error = "Cari borç kaydı oluşturulabilmesi için fatura toplamı sıfırdan büyük olmalıdır." });
    if (customer.RiskLimit is { } limit && customer.Type is CounterpartyType.Customer or CounterpartyType.Both)
    {
        var currentDebit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == customer.Id && x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var currentCredit = await db.CustomerLedgerEntries.Where(x => x.TenantId == tenantId && x.CustomerId == customer.Id && x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount) ?? 0m;
        var projectedBalance = currentDebit - currentCredit + totals.GrandTotal;
        if (projectedBalance > limit) return Results.Conflict(new { error = "Fatura tutarı müşteri risk limitini aşacağı için kaydedilmedi.", currentBalance = currentDebit - currentCredit, projectedBalance, riskLimit = limit });
    }
    var code = $"INV-{Guid.NewGuid():N}".ToUpperInvariant();
    var invoice = new SalesInvoice { TenantId = tenantId, DeliveryId = id, OrderId = order.Id, CustomerId = customer.Id,
        Code = code, InvoiceDate = DateOnly.FromDateTime(DateTime.UtcNow), CurrencyCode = order.CurrencyCode,
        Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    foreach (var row in invoiceLines)
        invoice.Lines.Add(new SalesInvoiceLine { TenantId = tenantId, Invoice = invoice, DeliveryLineId = row.DeliveryLine.Id,
            OrderLineNumber = row.Pricing.LineNumber, StockItemId = row.Pricing.StockItemId, StockCode = row.DeliveryLine.StockCode,
            StockName = row.DeliveryLine.StockName, UnitCode = row.DeliveryLine.UnitCode, Quantity = row.DeliveryLine.Quantity,
            UnitPrice = row.Pricing.UnitPrice, DiscountPercent = row.Pricing.DiscountPercent, VatPercent = row.Pricing.VatPercent,
            LineSubtotal = row.Amounts.LineSubtotal, DiscountAmount = row.Amounts.DiscountAmount, TaxAmount = row.Amounts.TaxAmount, LineTotal = row.Amounts.LineTotal });
    db.SalesInvoices.Add(invoice);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, SalesInvoice = invoice,
        EntryDate = invoice.InvoiceDate, Direction = CustomerLedgerDirection.Debit, Amount = totals.GrandTotal,
        CurrencyCode = invoice.CurrencyCode, Description = $"Satış faturası {code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-invoice.posted", Resource = code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/sales/invoices/{invoice.Id}", new SalesInvoiceSummary(invoice.Id, invoice.Code, invoice.DeliveryId,
        delivery.Code, invoice.OrderId, order.Code, invoice.CustomerId, customer.Name, invoice.InvoiceDate, invoice.CurrencyCode,
        invoice.Status, invoice.GrandTotal, invoice.Lines.Count, invoice.CreatedAt));
});
var salesInvoices = app.MapGroup("/api/sales/invoices").RequireAuthorization();
salesInvoices.MapGet("/", async (string? q, ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Delivery.Code.Contains(term) || x.Order.Code.Contains(term) || x.Customer.Name.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.InvoiceDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new SalesInvoiceSummary(x.Id, x.Code, x.DeliveryId, x.Delivery.Code, x.OrderId, x.Order.Code, x.CustomerId,
            x.Customer.Name, x.InvoiceDate, x.CurrencyCode, x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt)).ToListAsync();
    return Results.Ok(new SalesInvoicePage(rows, page, pageSize, total));
});
salesInvoices.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var invoice = await db.SalesInvoices.AsNoTracking().Include(x => x.Delivery).Include(x => x.Order).Include(x => x.Customer)
        .Include(x => x.Lines).Include(x => x.LedgerEntries).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (invoice is null) return Results.NotFound();
    var lines = invoice.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SalesInvoiceLineView(x.Id, x.OrderLineNumber,
        x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
    var ledgerEntryId = invoice.LedgerEntries.Where(x => x.ReversalOfId == null).Select(x => (Guid?)x.Id).FirstOrDefault();
    var collections = await db.CustomerCollectionAllocations.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id)
        .OrderBy(x => x.CustomerCollection.CollectionDate).ThenBy(x => x.CustomerCollection.CreatedAt)
        .Select(x => new CustomerCollectionSummary(x.CustomerCollection.Id, x.CustomerCollection.Code,
            x.CustomerCollection.CustomerId, x.CustomerCollection.Customer.Name, invoice.Id, invoice.Code,
            x.CustomerCollection.CollectionDate, x.Amount, x.CustomerCollection.CurrencyCode,
            x.CustomerCollection.PaymentMethod, x.CustomerCollection.Reference, x.CustomerCollection.Status,
            x.CustomerCollection.CreatedAt)).ToListAsync();
    var paidAmount = collections.Where(x => x.Status == CustomerCollectionStatus.Posted).Sum(x => x.Amount);
    var returnEntities = await db.SalesReturns.AsNoTracking().Include(x => x.Warehouse).Include(x => x.Lines)
        .Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id)
        .OrderBy(x => x.ReturnDate).ThenBy(x => x.CreatedAt).ToListAsync();
    var returns = returnEntities.Select(x => new SalesReturnSummary(x.Id, x.Code, x.SalesInvoiceId, invoice.Code, x.WarehouseId, x.Warehouse.Name,
        x.ReturnDate, x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt,
        x.Lines.OrderBy(line => line.OrderLineNumber).Select(line => new SalesReturnLineView(line.SalesInvoiceLineId,
            line.OrderLineNumber, line.StockCode, line.StockName, line.UnitCode, line.Quantity, line.UnitPrice,
            line.DiscountPercent, line.VatPercent, line.LineSubtotal, line.DiscountAmount, line.TaxAmount, line.LineTotal)).ToList())).ToList();
    var returnedAmount = returns.Where(x => x.Status == SalesReturnStatus.Posted).Sum(x => x.GrandTotal);
    return Results.Ok(new SalesInvoiceView(invoice.Id, invoice.Code, invoice.DeliveryId, invoice.Delivery.Code, invoice.OrderId,
        invoice.Order.Code, invoice.CustomerId, invoice.Customer.Name, invoice.InvoiceDate, invoice.CurrencyCode, invoice.Status,
        invoice.Subtotal, invoice.DiscountTotal, invoice.TaxTotal, invoice.GrandTotal, ledgerEntryId, invoice.CreatedAt, lines,
        paidAmount, returnedAmount, Math.Max(0, invoice.GrandTotal - paidAmount - returnedAmount), collections, returns));
});
salesInvoices.MapPost("/{id:guid}/collections", async (Guid id, CustomerCollectionWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = new Dictionary<string, string[]>();
    if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar deneme güvenliği için requestId zorunludur."];
    if (request.Amount <= 0 || request.Amount > 9999999999999999.99m || request.Amount != decimal.Round(request.Amount, 2)) errors["amount"] = ["Tahsilat tutarı pozitif olmalı ve en fazla iki ondalık basamak içermelidir."];
    var method = request.PaymentMethod?.Trim();
    if (method is not ("Cash" or "Bank transfer" or "Card" or "Check")) errors["paymentMethod"] = ["Ödeme yöntemi Cash, Bank transfer, Card veya Check olmalıdır."];
    if ((method is "Cash" or "Bank transfer") && request.FinancialAccountId is null) errors["financialAccountId"] = ["Nakit veya havale tahsilatı için finans hesabı seçilmelidir."];
    if (method is not ("Cash" or "Bank transfer") && request.FinancialAccountId is not null) errors["financialAccountId"] = ["Finans hesabı yalnızca nakit veya havale tahsilatında kullanılabilir."];
    var reference = request.Reference?.Trim();
    if (reference?.Length > 100) errors["reference"] = ["Referans en fazla 100 karakter olabilir."];
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var existingCollection = await db.CustomerCollections.AsNoTracking().Include(x => x.Customer).Include(x => x.FinancialAccount).Include(x => x.Allocations)
        .ThenInclude(x => x.SalesInvoice).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (existingCollection is not null)
    {
        var allocation = existingCollection.Allocations.SingleOrDefault(x => x.SalesInvoiceId == invoice.Id);
        if (allocation is null) return Results.Conflict(new { error = "requestId başka bir tahsilat işleminde kullanılmış." });
        return Results.Ok(new CustomerCollectionSummary(existingCollection.Id, existingCollection.Code, existingCollection.CustomerId,
            existingCollection.Customer.Name, invoice.Id, invoice.Code, existingCollection.CollectionDate, allocation.Amount,
            existingCollection.CurrencyCode, existingCollection.PaymentMethod, existingCollection.Reference,
            existingCollection.Status, existingCollection.CreatedAt, existingCollection.FinancialAccountId, existingCollection.FinancialAccount?.Name));
    }
    if (invoice.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş faturaya tahsilat alınamaz." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    FinancialAccount? financialAccount = null;
    if (request.FinancialAccountId is { } accountId)
    {
        financialAccount = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (financialAccount is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["financialAccountId"] = ["Finans hesabı bulunamadı."] });
        var expectedType = method == "Cash" ? FinancialAccountType.Cash : FinancialAccountType.Bank;
        if (!financialAccount.IsActive || financialAccount.Type != expectedType || financialAccount.CurrencyCode != invoice.CurrencyCode)
            return Results.Conflict(new { error = "Seçilen finans hesabı tahsilat yöntemi, para birimi veya aktiflik durumu ile uyumlu değil." });
    }
    var paid = await db.CustomerCollectionAllocations.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == id && x.CustomerCollection.Status == CustomerCollectionStatus.Posted).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var returned = await db.SalesReturns.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == id && x.Status == SalesReturnStatus.Posted).SumAsync(x => (decimal?)x.GrandTotal) ?? 0m;
    var outstanding = Math.Max(0m, invoice.GrandTotal - paid - returned);
    if (outstanding <= 0) return Results.Conflict(new { error = "Fatura tamamen tahsil edilmiş.", outstandingAmount = 0m });
    if (request.Amount > outstanding) return Results.Conflict(new { error = "Tahsilat tutarı kalan fatura bakiyesini aşamaz.", outstandingAmount = outstanding });
    var code = $"RCPT-{Guid.NewGuid():N}".ToUpperInvariant();
    var collection = new CustomerCollection { TenantId = tenantId, CustomerId = customer.Id, RequestId = request.RequestId, Code = code,
        CollectionDate = request.CollectionDate, CurrencyCode = invoice.CurrencyCode, Amount = request.Amount,
        PaymentMethod = method!, Reference = string.IsNullOrWhiteSpace(reference) ? null : reference,
        FinancialAccountId = financialAccount?.Id };
    collection.Allocations.Add(new CustomerCollectionAllocation { TenantId = tenantId, CustomerCollection = collection,
        SalesInvoiceId = invoice.Id, Amount = request.Amount });
    db.CustomerCollections.Add(collection);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id,
        CustomerCollection = collection, EntryDate = request.CollectionDate, Direction = CustomerLedgerDirection.Credit,
        Amount = request.Amount, CurrencyCode = invoice.CurrencyCode, Description = $"Tahsilat {code} · Fatura {invoice.Code}" });
    if (financialAccount is not null) db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId,
        FinancialAccount = financialAccount, CurrencyCode = invoice.CurrencyCode, TransactionDate = request.CollectionDate,
        Direction = FinancialDirection.Inflow, Amount = request.Amount, Description = $"Müşteri tahsilatı {code}",
        Reference = string.IsNullOrWhiteSpace(reference) ? null : reference, CustomerCollection = collection });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-collection.posted", Resource = code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/customer-collections/{collection.Id}", new CustomerCollectionSummary(collection.Id,
        collection.Code, customer.Id, customer.Name, invoice.Id, invoice.Code, collection.CollectionDate, collection.Amount,
        collection.CurrencyCode, collection.PaymentMethod, collection.Reference, collection.Status, collection.CreatedAt,
        financialAccount?.Id, financialAccount?.Name));
});
salesInvoices.MapPost("/{id:guid}/returns", async (Guid id, SalesReturnWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = new Dictionary<string, string[]>();
    if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar deneme güvenliği için requestId zorunludur."];
    if (request.WarehouseId == Guid.Empty) errors["warehouseId"] = ["İade ürünlerinin alınacağı depo seçilmelidir."];
    if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["İade 1 ile 100 arasında fatura satırı içermelidir."];
    if (request.Lines is not null)
    {
        if (request.Lines.GroupBy(x => x.SalesInvoiceLineId).Any(g => g.Count() > 1)) errors["lines"] = ["Aynı fatura satırı iade talebinde yalnızca bir kez bulunabilir."];
        for (var i = 0; i < request.Lines.Count; i++)
            if (request.Lines[i].SalesInvoiceLineId == Guid.Empty || request.Lines[i].Quantity <= 0 || request.Lines[i].Quantity > 99999999999999.9999m || request.Lines[i].Quantity != decimal.Round(request.Lines[i].Quantity, 4))
                errors[$"lines[{i}].quantity"] = ["İade miktarı pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
    }
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var returnRequests = request.Lines ?? Array.Empty<SalesReturnLineWriteRequest>();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var existing = await db.SalesReturns.AsNoTracking().Include(x => x.Warehouse).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (existing is not null)
    {
        if (existing.SalesInvoiceId != invoice.Id) return Results.Conflict(new { error = "requestId başka bir satış iadesinde kullanılmış." });
        var existingLines = existing.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SalesReturnLineView(x.SalesInvoiceLineId,
            x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
            x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
        return Results.Ok(new SalesReturnSummary(existing.Id, existing.Code, existing.SalesInvoiceId, invoice.Code,
            existing.WarehouseId, existing.Warehouse.Name, existing.ReturnDate, existing.Status, existing.GrandTotal,
            existing.Lines.Count, existing.CreatedAt, existingLines));
    }
    if (invoice.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş faturadan iade oluşturulamaz." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depoya satış iadesi alınamaz." });
    var invoiceLines = await db.SalesInvoiceLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.InvoiceId == invoice.Id).ToDictionaryAsync(x => x.Id);
    if (returnRequests.Any(x => !invoiceLines.ContainsKey(x.SalesInvoiceLineId))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["İade satırlarından biri bu faturaya ait değil."] });
    var requestedLineIds = returnRequests.Select(x => x.SalesInvoiceLineId).ToArray();
    var previousTotalsRows = await db.SalesReturnLines.Where(x => x.TenantId == tenantId && requestedLineIds.Contains(x.SalesInvoiceLineId) && x.SalesReturn.Status == SalesReturnStatus.Posted)
        .GroupBy(x => x.SalesInvoiceLineId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity), Subtotal = g.Sum(x => x.LineSubtotal), Discount = g.Sum(x => x.DiscountAmount), Tax = g.Sum(x => x.TaxAmount), Total = g.Sum(x => x.LineTotal) }).ToListAsync();
    var previouslyReturned = previousTotalsRows.ToDictionary(x => x.Id, x => (x.Quantity, x.Subtotal, x.Discount, x.Tax, x.Total));
    var returnAmounts = new List<(SalesInvoiceLine InvoiceLine, decimal Quantity, SalesQuoteLineAmounts Amounts)>();
    foreach (var line in returnRequests)
    {
        var invoiceLine = invoiceLines[line.SalesInvoiceLineId];
        var prior = previouslyReturned.GetValueOrDefault(invoiceLine.Id);
        if (line.Quantity > invoiceLine.Quantity - prior.Quantity)
            return Results.Conflict(new { error = $"{invoiceLine.StockCode} için iade miktarı faturada kalan miktarı aşamaz.", remainingQuantity = invoiceLine.Quantity - prior.Quantity });
        var amounts = SalesReturnValidation.CalculateIncrementalAmounts(invoiceLine.StockItemId, invoiceLine.UnitPrice,
            invoiceLine.DiscountPercent, invoiceLine.VatPercent, prior.Quantity,
            new SalesQuoteLineAmounts(prior.Subtotal, prior.Discount, prior.Tax, prior.Total), line.Quantity);
        returnAmounts.Add((invoiceLine, line.Quantity, amounts));
    }
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(returnAmounts.Select(x => x.Amounts)); }
    catch (OverflowException) { return Results.Conflict(new { error = "İade toplamı desteklenen decimal(18,2) sınırını aşıyor." }); }
    if (totals.GrandTotal <= 0) return Results.Conflict(new { error = "İade cari alacak kaydı oluşturabilmek için sıfırdan büyük olmalıdır." });
    var returnCode = $"RET-{Guid.NewGuid():N}".ToUpperInvariant();
    var salesReturn = new SalesReturn { TenantId = tenantId, RequestId = request.RequestId, SalesInvoiceId = invoice.Id,
        CustomerId = customer.Id, WarehouseId = warehouse.Id, Code = returnCode, ReturnDate = request.ReturnDate,
        Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    foreach (var row in returnAmounts)
    {
        var invoiceLine = row.InvoiceLine;
        var line = new SalesReturnLine { TenantId = tenantId, SalesReturn = salesReturn, SalesInvoiceLineId = invoiceLine.Id,
            OrderLineNumber = invoiceLine.OrderLineNumber, StockItemId = invoiceLine.StockItemId, StockCode = invoiceLine.StockCode,
            StockName = invoiceLine.StockName, UnitCode = invoiceLine.UnitCode, Quantity = row.Quantity, UnitPrice = invoiceLine.UnitPrice,
            DiscountPercent = invoiceLine.DiscountPercent, VatPercent = invoiceLine.VatPercent, LineSubtotal = row.Amounts.LineSubtotal,
            DiscountAmount = row.Amounts.DiscountAmount, TaxAmount = row.Amounts.TaxAmount, LineTotal = row.Amounts.LineTotal };
        salesReturn.Lines.Add(line);
        var unitCostBase = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId
            && x.SalesDeliveryLineId == invoiceLine.DeliveryLineId && x.ReversalOfId == null).Select(x => x.UnitCostBase).SingleOrDefaultAsync();
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id,
            StockItemId = invoiceLine.StockItemId, EntryDate = request.ReturnDate, Direction = InventoryDirection.Receipt,
            Quantity = row.Quantity, UnitCostBase = unitCostBase, Description = $"Satış iadesi {returnCode}", SalesReturnLine = line });
    }
    db.SalesReturns.Add(salesReturn);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, SalesReturn = salesReturn,
        EntryDate = request.ReturnDate, Direction = CustomerLedgerDirection.Credit, Amount = totals.GrandTotal,
        CurrencyCode = invoice.CurrencyCode, Description = $"Satış iadesi {returnCode} · Fatura {invoice.Code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-return.posted", Resource = returnCode });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    var returnLines = salesReturn.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SalesReturnLineView(x.SalesInvoiceLineId,
        x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
    return Results.Created($"/api/sales/returns/{salesReturn.Id}", new SalesReturnSummary(salesReturn.Id, salesReturn.Code,
        invoice.Id, invoice.Code, warehouse.Id, warehouse.Name, salesReturn.ReturnDate, salesReturn.Status, salesReturn.GrandTotal,
        salesReturn.Lines.Count, salesReturn.CreatedAt, returnLines));
});
salesInvoices.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    if (invoice.Status != SalesInvoiceStatus.Posted) return Results.Conflict(new { error = "Fatura daha önce iptal edildi." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var activePaid = await db.CustomerCollectionAllocations.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id && x.CustomerCollection.Status == CustomerCollectionStatus.Posted).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var activeReturns = await db.SalesReturns.Where(x => x.TenantId == tenantId && x.SalesInvoiceId == invoice.Id && x.Status == SalesReturnStatus.Posted).SumAsync(x => (decimal?)x.GrandTotal) ?? 0m;
    if (activePaid > 0 || activeReturns > 0) return Results.Conflict(new { error = "Bu faturada aktif tahsilat veya iade bulunuyor. Önce bağlı kayıtları iptal edin.", paidAmount = activePaid, returnedAmount = activeReturns });
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {invoice.CustomerId} AND [SalesInvoiceId] = {invoice.Id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (invoice.GrandTotal > 0 && original is null) return Results.Conflict(new { error = "Faturanın cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (original is not null)
    {
        if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id))
            return Results.Conflict(new { error = "Fatura cari hareketi daha önce ters kayıtla kapatılmış." });
        db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, SalesInvoiceId = invoice.Id,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Credit, Amount = original.Amount,
            CurrencyCode = original.CurrencyCode, Description = $"Fatura iptali {invoice.Code}", ReversalOfId = original.Id });
    }
    invoice.Status = SalesInvoiceStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-invoice.voided", Resource = invoice.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { invoice.Id, invoice.Code, invoice.Status });
});
var customerCollections = app.MapGroup("/api/customer-collections").RequireAuthorization();
customerCollections.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var context = await db.CustomerCollections.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.CustomerId, x.FinancialAccountId, x.CurrencyCode, x.Amount, x.PaymentMethod,
            InvoiceId = x.Allocations.Select(a => (Guid?)a.SalesInvoiceId).FirstOrDefault() }).SingleOrDefaultAsync();
    if (context is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    if (context.InvoiceId is { } linkedInvoiceId && await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {linkedInvoiceId}").SingleOrDefaultAsync() is null)
        return Results.Conflict(new { error = "Tahsilatın bağlı faturası bulunamadı." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {context.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var collection = await db.CustomerCollections.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerCollections] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (collection is null) return Results.NotFound();
    if (collection.Status != CustomerCollectionStatus.Posted) return Results.Conflict(new { error = "Tahsilat daha önce iptal edildi." });
    FinancialAccount? financialAccount = null;
    FinancialAccountTransaction? financialMovement = null;
    if (context.FinancialAccountId is { } accountId)
    {
        financialAccount = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (financialAccount is null) return Results.Conflict(new { error = "Tahsilata bağlı finans hesabı bulunamadı." });
        financialMovement = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerCollectionId] = {collection.Id}").SingleOrDefaultAsync();
        if (financialMovement is null || financialMovement.Direction != FinancialDirection.Inflow || financialMovement.Amount != collection.Amount)
            return Results.Conflict(new { error = "Tahsilatın finans hareketi kaynak belgeyle eşleşmediği için güvenli iptal yapılamadı." });
        if (financialAccount.Type == FinancialAccountType.Cash)
        {
            var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == accountId)
                .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
            if (balance < financialMovement.Amount) return Results.Conflict(new { error = "Tahsilat iptali mevcut kasa bakiyesini negatife düşüreceği için uygulanamadı.", currentBalance = balance });
        }
        if (await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == financialMovement.Id))
            return Results.Conflict(new { error = "Tahsilatın finans hareketi daha önce ters kayıtla kapatılmış." });
        db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccountId = financialAccount.Id,
            CurrencyCode = financialMovement.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Direction = FinancialDirection.Outflow, Amount = financialMovement.Amount, Description = $"Tahsilat iptali {collection.Code}",
            Reference = financialMovement.Reference, ReversalOfId = financialMovement.Id });
    }
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {customer.Id} AND [CustomerCollectionId] = {collection.Id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (original is null) return Results.Conflict(new { error = "Tahsilatın cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Tahsilat hareketi daha önce ters kayıtla kapatılmış." });
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, CustomerCollectionId = collection.Id,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Debit, Amount = original.Amount,
        CurrencyCode = original.CurrencyCode, Description = $"Tahsilat iptali {collection.Code}", ReversalOfId = original.Id });
    collection.Status = CustomerCollectionStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "customer-collection.voided", Resource = collection.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { collection.Id, collection.Code, collection.Status });
});
var salesReturns = app.MapGroup("/api/sales/returns").RequireAuthorization();
salesReturns.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var invoiceId = await db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id).Select(x => (Guid?)x.SalesInvoiceId).SingleOrDefaultAsync();
    if (invoiceId is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.SalesInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoiceId.Value}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var salesReturn = await db.SalesReturns.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesReturns] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (salesReturn is null) return Results.NotFound();
    if (salesReturn.Status != SalesReturnStatus.Posted) return Results.Conflict(new { error = "Satış iadesi daha önce iptal edildi." });
    var customer = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {salesReturn.CustomerId}").SingleOrDefaultAsync();
    if (customer is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {salesReturn.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var lines = await db.SalesReturnLines.Where(x => x.TenantId == tenantId && x.SalesReturnId == id).ToListAsync();
    var movements = new List<InventoryTransaction>();
    foreach (var line in lines)
    {
        var lineMovements = await db.InventoryTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [SalesReturnLineId] = {line.Id} AND [ReversalOfId] IS NULL").ToListAsync();
        movements.AddRange(lineMovements);
    }
    var sourceMovementIds = movements.Select(x => x.Id).ToArray();
    if (await db.InventoryTransactions.AnyAsync(y => y.TenantId == tenantId && y.ReversalOfId != null && sourceMovementIds.Contains(y.ReversalOfId.Value)))
        return Results.Conflict(new { error = "İade stok hareketlerinden biri zaten ters kayıtla geri alınmış." });
    var requiredByItem = movements.GroupBy(x => x.StockItemId).ToDictionary(x => x.Key, x => x.Sum(y => y.Quantity));
    var currentByItem = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && requiredByItem.Keys.Contains(x.StockItemId))
        .GroupBy(x => x.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    var reservedByItem = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && requiredByItem.Keys.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { StockItemId = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
        .ToDictionaryAsync(x => x.StockItemId, x => x.Quantity);
    var unavailable = requiredByItem.FirstOrDefault(x => currentByItem.GetValueOrDefault(x.Key) - reservedByItem.GetValueOrDefault(x.Key) < x.Value);
    if (unavailable.Value > 0) return Results.Conflict(new { error = "İade iptali stok rezervasyonlarını karşılayamaz; önce ilgili rezervasyonları bırakın.", stockItemId = unavailable.Key,
        currentBalance = currentByItem.GetValueOrDefault(unavailable.Key), reservedQuantity = reservedByItem.GetValueOrDefault(unavailable.Key), requiredQuantity = unavailable.Value });
    var originalLedger = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {customer.Id} AND [SalesReturnId] = {salesReturn.Id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (originalLedger is null) return Results.Conflict(new { error = "İadenin cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == originalLedger.Id)) return Results.Conflict(new { error = "İade cari hareketi daha önce ters kayıtla kapatılmış." });
    foreach (var movement in movements)
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = movement.StockItemId,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = InventoryDirection.Issue, Quantity = movement.Quantity,
            UnitCostBase = movement.UnitCostBase, Description = $"Satış iadesi iptali {salesReturn.Code}", ReversalOfId = movement.Id, SalesReturnLineId = movement.SalesReturnLineId });
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = customer.Id, SalesReturnId = salesReturn.Id,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Debit, Amount = originalLedger.Amount,
        CurrencyCode = originalLedger.CurrencyCode, Description = $"Satış iadesi iptali {salesReturn.Code}", ReversalOfId = originalLedger.Id });
    salesReturn.Status = SalesReturnStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "sales-return.voided", Resource = salesReturn.Code });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Ok(new { salesReturn.Id, salesReturn.Code, salesReturn.Status });
});
var purchaseRequests = app.MapGroup("/api/purchasing/requests").RequireAuthorization();
purchaseRequests.MapGet("/custom-fields", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var definitions = await db.PurchaseRequestCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive)
        .OrderBy(x => x.Label).Select(x => new PurchaseRequestCustomFieldDefinitionView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, x.IsActive)).ToListAsync();
    return Results.Ok(definitions);
});
purchaseRequests.MapPost("/custom-fields", async (PurchaseRequestCustomFieldCreateRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.Code?.Trim().ToUpperInvariant(); var label = body.Label?.Trim();
    if (code is null || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z][A-Z0-9_]{0,39}$")
        || string.IsNullOrWhiteSpace(label) || label.Length > 120 || !Enum.IsDefined(body.DataType)
        || (body.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["definition"] = ["Kod, etiket, veri türü ve metin uzunluğu geçerli olmalıdır."] });
    if (await db.PurchaseRequestCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Code == code))
        return Results.Conflict(new { error = "Bu özel alan kodu tenant kapsamında daha önce kullanıldı." });
    if (body.IsRequired && await db.PurchaseRequests.AnyAsync(x => x.TenantId == tenantId))
        return Results.Conflict(new { error = "Zorunlu alan oluşturmadan önce mevcut satın alma taleplerini tamamlayın veya alanı isteğe bağlı oluşturun." });
    var definition = new PurchaseRequestCustomFieldDefinition { TenantId = tenantId, Code = code, Label = label, DataType = body.DataType,
        MaxLength = body.DataType == CustomFieldDataType.Text ? body.MaxLength : 0, IsRequired = body.IsRequired };
    db.PurchaseRequestCustomFieldDefinitions.Add(definition);
    db.PurchaseRequestCustomFieldDefinitionRevisions.Add(ToPurchaseRequestCustomFieldRevision(definition, GetUserId(principal), "Created"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-request-custom-field.created", Resource = code });
    await db.SaveChangesAsync();
    return Results.Created($"/api/purchasing/requests/custom-fields/{definition.Id}", new PurchaseRequestCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseRequests.MapPut("/custom-fields/{definitionId:guid}", async (Guid definitionId, PurchaseRequestCustomFieldUpdateRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var label = body.Label?.Trim();
    if (string.IsNullOrWhiteSpace(label) || label.Length > 120) return Results.ValidationProblem(new Dictionary<string, string[]> { ["label"] = ["Etiket zorunludur ve en fazla 120 karakter olabilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (definition.DataType == CustomFieldDataType.Text && body.MaxLength is < 1 or > 500) return Results.ValidationProblem(new Dictionary<string, string[]> { ["maxLength"] = ["Metin uzunluğu 1–500 arasında olmalıdır."] });
    var maxLength = definition.DataType == CustomFieldDataType.Text ? body.MaxLength : 0;
    var required = body.IsRequired ?? definition.IsRequired;
    if (definition.DataType == CustomFieldDataType.Text && await db.PurchaseRequestCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > maxLength))
        return Results.Conflict(new { error = "Mevcut talep değerleri yeni metin uzunluğu sınırını aşıyor." });
    if (required && await db.PurchaseRequests.AnyAsync(request => request.TenantId == tenantId && !db.PurchaseRequestCustomFieldValues.Any(value => value.TenantId == tenantId && value.PurchaseRequestId == request.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Zorunlu yapmak için mevcut tüm satın alma taleplerinde bu alan doldurulmuş olmalıdır." });
    if (definition.Label == label && definition.MaxLength == maxLength && definition.IsRequired == required)
        return Results.Ok(new PurchaseRequestCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
    definition.Label = label; definition.MaxLength = maxLength; definition.IsRequired = required; definition.Version++;
    db.PurchaseRequestCustomFieldDefinitionRevisions.Add(ToPurchaseRequestCustomFieldRevision(definition, GetUserId(principal), "Updated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-request-custom-field.updated", Resource = definition.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new PurchaseRequestCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseRequests.MapDelete("/custom-fields/{definitionId:guid}", async (Guid definitionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var definition = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    if (!definition.IsActive) return Results.Conflict(new { error = "Özel alan zaten devre dışı." });
    definition.IsActive = false; definition.Version++;
    db.PurchaseRequestCustomFieldDefinitionRevisions.Add(ToPurchaseRequestCustomFieldRevision(definition, GetUserId(principal), "Deactivated"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-request-custom-field.deactivated", Resource = definition.Code });
    await db.SaveChangesAsync(); return Results.NoContent();
});
purchaseRequests.MapGet("/custom-fields/{definitionId:guid}/history", async (Guid definitionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.PurchaseRequestCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await db.PurchaseRequestCustomFieldDefinitionRevisions.AsNoTracking().Where(x => x.TenantId == tenantId && x.DefinitionId == definitionId)
        .OrderByDescending(x => x.Version).Take(50).Select(x => new PurchaseRequestCustomFieldDefinitionRevisionView(x.Id, x.DefinitionId, x.Version, x.Code, x.Label, x.DataType, x.MaxLength, x.IsRequired, x.IsActive, x.ChangeKind, x.ChangedByUserId, x.CreatedAt)).ToListAsync();
    return Results.Ok(history);
});
purchaseRequests.MapPost("/custom-fields/{definitionId:guid}/restore", async (Guid definitionId, PurchaseRequestCustomFieldRestoreRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    if (!body.Confirmation || body.Version < 1) return Results.BadRequest(new { error = "Geçerli sürüm ve açık geri yükleme onayı gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var definition = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {definitionId}").SingleOrDefaultAsync();
    if (definition is null) return Results.NotFound();
    var revision = await db.PurchaseRequestCustomFieldDefinitionRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Version == body.Version);
    if (revision is null) return Results.NotFound();
    if (revision.DataType != definition.DataType) return Results.Conflict(new { error = "Veri türü geçmiş sürümden geri yüklenemez." });
    if (revision.IsActive && revision.DataType == CustomFieldDataType.Text && await db.PurchaseRequestCustomFieldValues.AnyAsync(x => x.TenantId == tenantId && x.DefinitionId == definitionId && x.Value.Length > revision.MaxLength))
        return Results.Conflict(new { error = "Geçmiş sürümün uzunluk sınırı mevcut talep değerleriyle uyumsuz." });
    if (revision.IsActive && revision.IsRequired && await db.PurchaseRequests.AnyAsync(request => request.TenantId == tenantId && !db.PurchaseRequestCustomFieldValues.Any(value => value.TenantId == tenantId && value.PurchaseRequestId == request.Id && value.DefinitionId == definitionId && value.Value != "")))
        return Results.Conflict(new { error = "Bu tanımı zorunlu yapmak için tüm satın alma taleplerinde değer olmalıdır." });
    if (definition.Label == revision.Label && definition.MaxLength == revision.MaxLength && definition.IsRequired == revision.IsRequired && definition.IsActive == revision.IsActive)
        return Results.Conflict(new { error = "Alan tanımı zaten bu sürümle aynı." });
    definition.Label = revision.Label; definition.MaxLength = revision.MaxLength; definition.IsRequired = revision.IsRequired; definition.IsActive = revision.IsActive; definition.Version++;
    db.PurchaseRequestCustomFieldDefinitionRevisions.Add(ToPurchaseRequestCustomFieldRevision(definition, GetUserId(principal), "Restored"));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-request-custom-field.restored", Resource = $"{definition.Code}:v{body.Version}" });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new PurchaseRequestCustomFieldDefinitionView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, definition.IsActive));
});
purchaseRequests.MapGet("/{id:guid}/custom-fields", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.PurchaseRequests.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == id)) return Results.NotFound();
    var definitions = await db.PurchaseRequestCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var values = await db.PurchaseRequestCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id).ToDictionaryAsync(x => x.DefinitionId, x => x.Value);
    return Results.Ok(definitions.Select(x => new PurchaseRequestCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, values.GetValueOrDefault(x.Id) ?? "")).ToArray());
});
purchaseRequests.MapPut("/{id:guid}/custom-fields", async (Guid id, PurchaseRequestCustomFieldValuesWriteRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (body.Values is null || body.Values.Count > 40) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["En fazla 40 özel alan değeri gönderilebilir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Submitted) return Results.Conflict(new { error = "Özel alanlar yalnız onay bekleyen talepte değiştirilebilir." });
    var actor = GetUserId(principal);
    if (actor != request.RequestedByUserId && principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var definitions = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    var byCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    if (body.Values.Keys.Any(x => string.IsNullOrWhiteSpace(x) || !byCode.ContainsKey(x))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["values"] = ["İstek etkin olmayan veya tenant dışı alan kodu içeriyor."] });
    var normalized = new Dictionary<Guid, (PurchaseRequestCustomFieldDefinition Definition, string Value)>();
    foreach (var (code, raw) in body.Values)
    {
        var definition = byCode[code];
        if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, raw, out var value))
            return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{code}"] = [$"'{definition.Label}' alanının değeri veri türüne veya sınıra uymuyor."] });
        if (value.Length > 0) normalized[definition.Id] = (definition, value);
    }
    PurchaseRequestCustomFieldDefinition? missing = null;
    foreach (var definition in definitions)
        if (definition.IsRequired && !normalized.ContainsKey(definition.Id)) { missing = definition; break; }
    if (missing is not null) return Results.ValidationProblem(new Dictionary<string, string[]> { [$"values.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."] });
    var existing = await db.PurchaseRequestCustomFieldValues.Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id && definitions.Select(d => d.Id).Contains(x.DefinitionId)).ToListAsync();
    var existingById = existing.ToDictionary(x => x.DefinitionId);
    foreach (var definition in definitions)
    {
        var previous = existingById.GetValueOrDefault(definition.Id)?.Value;
        var next = normalized.GetValueOrDefault(definition.Id).Value ?? "";
        if (string.Equals(previous, next, StringComparison.Ordinal)) continue;
        db.PurchaseRequestCustomFieldValueRevisions.Add(new PurchaseRequestCustomFieldValueRevision { TenantId = tenantId,
            PurchaseRequestId = id, DefinitionId = definition.Id, PreviousValue = previous, NewValue = next.Length == 0 ? null : next,
            DefinitionVersion = definition.Version, ChangedByUserId = actor });
    }
    db.PurchaseRequestCustomFieldValues.RemoveRange(existing);
    foreach (var (definitionId, value) in normalized) db.PurchaseRequestCustomFieldValues.Add(new PurchaseRequestCustomFieldValue { TenantId = tenantId,
        PurchaseRequestId = id, DefinitionId = definitionId, Value = value.Value, DefinitionVersion = value.Definition.Version });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actor, Action = "purchase-request-custom-field.values-updated", Resource = request.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(definitions.Select(x => new PurchaseRequestCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version, x.IsRequired, normalized.GetValueOrDefault(x.Id).Value ?? "")).ToArray());
});
purchaseRequests.MapGet("/{id:guid}/custom-fields/{definitionId:guid}/history", async (Guid id, Guid definitionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!await db.PurchaseRequests.AnyAsync(x => x.TenantId == tenantId && x.Id == id) || !await db.PurchaseRequestCustomFieldDefinitions.AnyAsync(x => x.TenantId == tenantId && x.Id == definitionId)) return Results.NotFound();
    var history = await (from value in db.PurchaseRequestCustomFieldValueRevisions.AsNoTracking()
                         join definition in db.PurchaseRequestCustomFieldDefinitions.AsNoTracking() on new { value.TenantId, value.DefinitionId } equals new { definition.TenantId, DefinitionId = definition.Id }
                         where value.TenantId == tenantId && value.PurchaseRequestId == id && value.DefinitionId == definitionId
                         orderby value.CreatedAt descending
                         select new PurchaseRequestCustomFieldValueRevisionView(value.Id, value.DefinitionId, definition.Code, definition.Label, value.PreviousValue, value.NewValue, value.DefinitionVersion, value.ChangedByUserId, value.CreatedAt)).Take(50).ToListAsync();
    return Results.Ok(history);
});
purchaseRequests.MapPost("/{id:guid}/custom-fields/{definitionId:guid}/history/{revisionId:guid}/restore", async (Guid id, Guid definitionId, Guid revisionId, PurchaseRequestCustomFieldValueRestoreRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (!body.Confirmation) return Results.BadRequest(new { error = "Geçmiş değeri geri yüklemek için açık onay gerekir." });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Submitted) return Results.Conflict(new { error = "Yalnız onay bekleyen taleplerin alan değerleri geri yüklenebilir." });
    var actor = GetUserId(principal);
    if (actor != request.RequestedByUserId && principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var definition = await db.PurchaseRequestCustomFieldDefinitions.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == definitionId && x.IsActive);
    if (definition is null) return Results.NotFound();
    var revision = await db.PurchaseRequestCustomFieldValueRevisions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PurchaseRequestId == id && x.DefinitionId == definitionId && x.Id == revisionId);
    if (revision is null) return Results.NotFound();
    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, revision.PreviousValue, out var target) || (definition.IsRequired && target.Length == 0))
        return Results.Conflict(new { error = "Geçmiş değer güncel alan tanımına uymuyor veya zorunlu alanı boş bırakıyor." });
    var current = await db.PurchaseRequestCustomFieldValues.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PurchaseRequestId == id && x.DefinitionId == definitionId);
    var previous = current?.Value;
    if (string.Equals(previous ?? "", target, StringComparison.Ordinal)) return Results.Conflict(new { error = "Alan değeri zaten seçilen geçmiş durumunda." });
    if (target.Length == 0) { if (current is not null) db.PurchaseRequestCustomFieldValues.Remove(current); }
    else if (current is null) db.PurchaseRequestCustomFieldValues.Add(new PurchaseRequestCustomFieldValue { TenantId = tenantId, PurchaseRequestId = id, DefinitionId = definitionId, Value = target, DefinitionVersion = definition.Version });
    else { current.Value = target; current.DefinitionVersion = definition.Version; current.UpdatedAt = DateTimeOffset.UtcNow; }
    db.PurchaseRequestCustomFieldValueRevisions.Add(new PurchaseRequestCustomFieldValueRevision { TenantId = tenantId, PurchaseRequestId = id, DefinitionId = definitionId, PreviousValue = previous, NewValue = target.Length == 0 ? null : target, DefinitionVersion = definition.Version, ChangedByUserId = actor });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = actor, Action = "purchase-request-custom-field.value-restored", Resource = $"{request.Code}:{definition.Code}:{revision.Id:D}" });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new PurchaseRequestCustomFieldValueView(definition.Id, definition.Code, definition.Label, definition.DataType, definition.MaxLength, definition.Version, definition.IsRequired, target));
});
purchaseRequests.MapGet("/", async (ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.PurchaseRequests.AsNoTracking().Where(x => x.TenantId == tenantId);
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new PurchaseRequestSummary(x.Id, x.Code, x.RequestDate, x.NeededByDate, x.Description,
            x.RequestedByUserId, x.RequestedBy.User.DisplayName, x.Status, x.ReviewedByUserId,
            x.ReviewedBy == null ? null : x.ReviewedBy.User.DisplayName, x.ReviewNote, x.CreatedAt, x.ReviewedAt, x.Lines.Count,
            x.PurchaseOrder == null ? null : x.PurchaseOrder.Id, x.PurchaseOrder == null ? null : x.PurchaseOrder.Code))
        .ToListAsync();
    return Results.Ok(new PurchaseRequestPage(rows, page, pageSize, total));
});
purchaseRequests.MapPost("/", async (PurchaseRequestWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = PurchaseRequestValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var customDefinitions = await db.PurchaseRequestCustomFieldDefinitions.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequestCustomFieldDefinitions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [IsActive] = 1").ToListAsync();
    if (!TryNormalizePurchaseRequestFields(request.CustomFields, customDefinitions, out var customValues, out var customErrors))
        return Results.ValidationProblem(customErrors);
    var itemIds = request.Lines.Select(x => x.StockItemId).Distinct().ToArray();
    var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (items.Count != itemIds.Length || items.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Talep satırlarından en az bir stok kartı bulunamadı veya pasif." });
    var requesterName = await db.Users.Where(x => x.Id == userId).Select(x => x.DisplayName).SingleAsync();
    var purchaseRequest = new PurchaseRequest { TenantId = tenantId, RequestedByUserId = userId.Value,
        Code = request.Code.Trim(), RequestDate = request.RequestDate, NeededByDate = request.NeededByDate,
        Description = request.Description.Trim(), Status = PurchaseRequestStatus.Submitted };
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = request.Lines[i]; var item = items[input.StockItemId];
        purchaseRequest.Lines.Add(new PurchaseRequestLine { TenantId = tenantId, PurchaseRequest = purchaseRequest,
            LineNumber = i + 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
            UnitCode = item.UnitCode, Quantity = input.Quantity });
    }
    db.PurchaseRequests.Add(purchaseRequest);
    foreach (var (definitionId, value) in customValues)
    {
        purchaseRequest.CustomFieldValues.Add(new PurchaseRequestCustomFieldValue { TenantId = tenantId, DefinitionId = definitionId,
            Value = value.Value, DefinitionVersion = value.Definition.Version });
        db.PurchaseRequestCustomFieldValueRevisions.Add(new PurchaseRequestCustomFieldValueRevision { TenantId = tenantId,
            PurchaseRequestId = purchaseRequest.Id, DefinitionId = definitionId, NewValue = value.Value,
            DefinitionVersion = value.Definition.Version, ChangedByUserId = userId });
    }
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-request.submitted", Resource = purchaseRequest.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu talep numarası bu firmada zaten kullanılıyor." }); }
    await transaction.CommitAsync();
    var summary = new PurchaseRequestSummary(purchaseRequest.Id, purchaseRequest.Code, purchaseRequest.RequestDate,
        purchaseRequest.NeededByDate, purchaseRequest.Description, userId.Value, requesterName, purchaseRequest.Status,
        null, null, null, purchaseRequest.CreatedAt, null, purchaseRequest.Lines.Count, null, null);
    return Results.Created($"/api/purchasing/requests/{purchaseRequest.Id}", summary);
});
purchaseRequests.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var request = await db.PurchaseRequests.AsNoTracking().Include(x => x.PurchaseOrder).Include(x => x.RequestedBy).ThenInclude(x => x.User)
        .Include(x => x.ReviewedBy).ThenInclude(x => x!.User).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (request is null) return Results.NotFound();
    var lines = request.Lines.OrderBy(x => x.LineNumber)
        .Select(x => new PurchaseRequestLineView(x.LineNumber, x.StockItemId, x.StockCode, x.StockName, x.UnitCode, x.Quantity)).ToList();
    var definitions = await db.PurchaseRequestCustomFieldDefinitions.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Label).ToListAsync();
    var savedValues = await db.PurchaseRequestCustomFieldValues.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id).ToDictionaryAsync(x => x.DefinitionId, x => x.Value);
    var customFields = definitions.Select(x => new PurchaseRequestCustomFieldValueView(x.Id, x.Code, x.Label, x.DataType, x.MaxLength, x.Version,
        x.IsRequired, savedValues.GetValueOrDefault(x.Id) ?? "")).ToList();
    return Results.Ok(new PurchaseRequestView(request.Id, request.Code, request.RequestDate, request.NeededByDate,
        request.Description, request.RequestedByUserId, request.RequestedBy.User.DisplayName, request.Status,
        request.ReviewedByUserId, request.ReviewedBy?.User.DisplayName, request.ReviewNote, request.CreatedAt,
        request.ReviewedAt, lines, request.PurchaseOrder?.Id, request.PurchaseOrder?.Code, customFields));
});
purchaseRequests.MapGet("/{id:guid}/supplier-quotes", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var request = await db.PurchaseRequests.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.Id, x.Code }).SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    var tenant = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => new { x.BaseCurrencyCode }).SingleAsync();
    var quotes = await db.PurchaseSupplierQuotes.AsNoTracking().Include(x => x.Supplier).Include(x => x.Lines)
        .Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id)
        .OrderBy(x => x.CreatedAt).ToListAsync();
    var currencies = quotes.Select(x => x.CurrencyCode).Where(x => x != tenant.BaseCurrencyCode).Distinct().ToArray();
    var rates = await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && currencies.Contains(x.CurrencyCode))
        .OrderBy(x => x.RateDate).ThenBy(x => x.Revision).ToListAsync();
    var quoteViews = quotes.Select(x =>
    {
        var applied = x.CurrencyCode == tenant.BaseCurrencyCode ? null : rates.Where(r => r.CurrencyCode == x.CurrencyCode && r.RateDate <= x.QuoteDate)
            .GroupBy(r => r.RateDate).Select(g => g.OrderByDescending(r => r.Revision).First()).OrderByDescending(r => r.RateDate).FirstOrDefault();
        var conversion = x.CurrencyCode == tenant.BaseCurrencyCode ? 1m : applied?.Rate;
        decimal? comparable = null;
        if (conversion is not null) { try { comparable = decimal.Round(x.GrandTotal * conversion.Value, 2, MidpointRounding.AwayFromZero); } catch (OverflowException) { } }
        return new PurchaseSupplierQuoteView(x.Id, x.PurchaseRequestId, request.Code, x.Code, x.SupplierId,
            x.Supplier.Name, x.QuoteDate, x.ValidUntil, x.CurrencyCode, x.Status, x.Subtotal, x.DiscountTotal,
            x.TaxTotal, x.GrandTotal, x.Notes, x.CreatedAt, x.Lines.OrderBy(l => l.RequestLineNumber)
                .Select(l => new PurchaseSupplierQuoteLineView(l.RequestLineNumber, l.StockCode, l.StockName, l.UnitCode,
                    l.Quantity, l.UnitPrice, l.DiscountPercent, l.VatPercent, l.LineSubtotal, l.DiscountAmount, l.TaxAmount, l.LineTotal)).ToList(),
            tenant.BaseCurrencyCode, comparable, conversion, applied?.RateDate);
    }).ToList();
    quoteViews = quoteViews.OrderBy(x => x.ComparableGrandTotal is null ? 1 : 0).ThenBy(x => x.ComparableGrandTotal ?? x.GrandTotal).ThenBy(x => x.CreatedAt).ToList();
    return Results.Ok(quoteViews);
});
purchaseRequests.MapPost("/{id:guid}/supplier-quotes", async (Guid id, PurchaseSupplierQuoteWriteRequest input, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = PurchaseSupplierQuoteValidation.Validate(input);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Approved)
        return Results.Conflict(new { error = "Tedarikçi teklifi yalnızca onaylanmış ve henüz siparişe dönüşmemiş talebe kaydedilebilir." });
    var supplier = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == input.SupplierId);
    if (supplier is null) return Results.NotFound();
    if (!supplier.IsActive || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
        return Results.Conflict(new { error = "Aktif bir tedarikçi seçilmelidir." });
    var requestLines = await db.PurchaseRequestLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id)
        .OrderBy(x => x.LineNumber).ToListAsync();
    var quoteLinesByNumber = input.Lines.ToDictionary(x => x.RequestLineNumber);
    if (requestLines.Count != quoteLinesByNumber.Count || requestLines.Any(x => !quoteLinesByNumber.ContainsKey(x.LineNumber)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Her talep satırı için tam olarak bir tedarikçi fiyatı girilmelidir."] });
    var pricedLines = requestLines.Select(line =>
    {
        var price = quoteLinesByNumber[line.LineNumber];
        return new SalesQuoteLineWriteRequest(line.StockItemId, line.Quantity, price.UnitPrice, price.DiscountPercent, price.VatPercent);
    }).ToArray();
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(pricedLines.Select(SalesQuoteValidation.Calculate)); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    var quote = new PurchaseSupplierQuote { TenantId = tenantId, PurchaseRequestId = id, SupplierId = supplier.Id,
        Code = input.Code.Trim(), QuoteDate = input.QuoteDate, ValidUntil = input.ValidUntil, CurrencyCode = supplier.CurrencyCode,
        Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(), Subtotal = totals.Subtotal,
        DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    for (var i = 0; i < requestLines.Count; i++)
    {
        var line = requestLines[i]; var price = quoteLinesByNumber[line.LineNumber]; var amounts = SalesQuoteValidation.Calculate(pricedLines[i]);
        quote.Lines.Add(new PurchaseSupplierQuoteLine { TenantId = tenantId, Quote = quote, PurchaseRequestId = id,
            RequestLineNumber = line.LineNumber, StockCode = line.StockCode, StockName = line.StockName,
            UnitCode = line.UnitCode, Quantity = line.Quantity, UnitPrice = price.UnitPrice, DiscountPercent = price.DiscountPercent,
            VatPercent = price.VatPercent, LineSubtotal = amounts.LineSubtotal, DiscountAmount = amounts.DiscountAmount,
            TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    db.PurchaseSupplierQuotes.Add(quote);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-supplier-quote.created", Resource = $"{quote.Code}:{request.Code}:{supplier.Name}" });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex))
    { return Results.Conflict(new { error = "Bu tedarikçi teklif numarası bu tedarikçi için daha önce kullanılmış." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/requests/{id}/supplier-quotes", new PurchaseSupplierQuoteView(quote.Id,
        id, request.Code, quote.Code, supplier.Id, supplier.Name, quote.QuoteDate, quote.ValidUntil, quote.CurrencyCode,
        quote.Status, quote.Subtotal, quote.DiscountTotal, quote.TaxTotal, quote.GrandTotal, quote.Notes, quote.CreatedAt,
        quote.Lines.OrderBy(x => x.RequestLineNumber).Select(x => new PurchaseSupplierQuoteLineView(x.RequestLineNumber,
            x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
            x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList()));
});
purchaseRequests.MapPost("/{id:guid}/decision", async (Guid id, PurchaseRequestDecisionRequest decision, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = PurchaseRequestValidation.Validate(decision);
    if (errors is not null) return Results.ValidationProblem(errors);
    var reviewerId = GetUserId(principal);
    if (reviewerId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Submitted) return Results.Conflict(new { error = "Yalnızca inceleme bekleyen talepler karara bağlanabilir." });
    if (request.RequestedByUserId == reviewerId) return Results.Conflict(new { error = "Talep sahibi kendi talebini onaylayamaz veya reddedemez." });
    request.Status = decision.Approved ? PurchaseRequestStatus.Approved : PurchaseRequestStatus.Rejected;
    request.ReviewedByUserId = reviewerId; request.ReviewedAt = DateTimeOffset.UtcNow;
    request.ReviewNote = string.IsNullOrWhiteSpace(decision.Note) ? null : decision.Note.Trim();
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = reviewerId,
        Action = decision.Approved ? "purchase-request.approved" : "purchase-request.rejected", Resource = request.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { request.Id, request.Code, request.Status, request.ReviewNote, request.ReviewedAt });
});
purchaseRequests.MapPost("/{id:guid}/order", async (Guid id, PurchaseRequestOrderWriteRequest input, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var errors = PurchaseRequestOrderValidation.Validate(input);
    if (errors is not null) return Results.ValidationProblem(errors);
    var userId = GetUserId(principal);
    if (userId is null) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var request = await db.PurchaseRequests.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseRequests] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (request is null) return Results.NotFound();
    if (request.Status != PurchaseRequestStatus.Approved)
        return Results.Conflict(new { error = "Yalnızca onaylanmış ve henüz siparişe dönüşmemiş talepler siparişe çevrilebilir." });
    PurchaseSupplierQuote? sourceQuote = null;
    if (input.SupplierQuoteId is not null)
    {
        sourceQuote = await db.PurchaseSupplierQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseSupplierQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [PurchaseRequestId] = {id} AND [Id] = {input.SupplierQuoteId}").SingleOrDefaultAsync();
        if (sourceQuote is null) return Results.NotFound();
        if (sourceQuote.Status != PurchaseSupplierQuoteStatus.Submitted || sourceQuote.SupplierId != input.SupplierId)
            return Results.Conflict(new { error = "Seçilen tedarikçi teklifi bu talep için siparişe uygun değil." });
        if (sourceQuote.ValidUntil is not null && sourceQuote.ValidUntil < DateOnly.FromDateTime(DateTime.UtcNow))
            return Results.Conflict(new { error = "Seçilen tedarikçi teklifinin geçerlilik süresi dolmuş." });
    }
    var supplier = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == input.SupplierId);
    if (supplier is null) return Results.NotFound();
    if (!supplier.IsActive || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
        return Results.Conflict(new { error = "Aktif bir tedarikçi seçilmelidir." });
    if (sourceQuote is not null && sourceQuote.CurrencyCode != supplier.CurrencyCode)
        return Results.Conflict(new { error = "Tedarikçinin para birimi teklif kaydından sonra değişmiş. Güncel para birimiyle yeni teklif kaydedin." });
    var requestLines = await db.PurchaseRequestLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id)
        .OrderBy(x => x.LineNumber).ToListAsync();
    var pricesByLine = input.Lines.ToDictionary(x => x.LineNumber);
    if (pricesByLine.Count != requestLines.Count || requestLines.Any(x => !pricesByLine.ContainsKey(x.LineNumber)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Her talep satırı için tam olarak bir fiyat girilmelidir."] });
    if (sourceQuote is not null)
    {
        var quotePrices = await db.PurchaseSupplierQuoteLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.QuoteId == sourceQuote.Id)
            .ToDictionaryAsync(x => x.RequestLineNumber);
        if (quotePrices.Count != requestLines.Count || requestLines.Any(line => !quotePrices.TryGetValue(line.LineNumber, out var quoteLine)
            || pricesByLine[line.LineNumber].UnitPrice != quoteLine.UnitPrice
            || pricesByLine[line.LineNumber].DiscountPercent != quoteLine.DiscountPercent
            || pricesByLine[line.LineNumber].VatPercent != quoteLine.VatPercent))
            return Results.Conflict(new { error = "Sipariş fiyatları seçilen tedarikçi teklifindeki fiyatlarla aynı olmalıdır." });
    }
    var stockIds = requestLines.Select(x => x.StockItemId).Distinct().ToArray();
    var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && stockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (items.Count != stockIds.Length || items.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Talep satırlarından en az birinin stok kartı bulunamadı veya pasif." });
    var pricedLines = requestLines.Select(line =>
    {
        var price = pricesByLine[line.LineNumber];
        return new SalesQuoteLineWriteRequest(line.StockItemId, line.Quantity, price.UnitPrice, price.DiscountPercent, price.VatPercent);
    }).ToArray();
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(pricedLines.Select(SalesQuoteValidation.Calculate)); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    var order = new PurchaseOrder { TenantId = tenantId, SupplierId = supplier.Id, SourcePurchaseRequestId = request.Id,
        SourceSupplierQuoteId = sourceQuote?.Id,
        Code = input.Code.Trim(), OrderDate = input.OrderDate, CurrencyCode = supplier.CurrencyCode,
        Notes = string.IsNullOrWhiteSpace(input.Notes) ? null : input.Notes.Trim(), Subtotal = totals.Subtotal,
        DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    for (var i = 0; i < requestLines.Count; i++)
    {
        var line = requestLines[i]; var item = items[line.StockItemId]; var price = pricesByLine[line.LineNumber];
        var amounts = SalesQuoteValidation.Calculate(pricedLines[i]);
        order.Lines.Add(new PurchaseOrderLine { TenantId = tenantId, PurchaseOrder = order, LineNumber = line.LineNumber,
            StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = line.Quantity,
            UnitPrice = price.UnitPrice, DiscountPercent = price.DiscountPercent, VatPercent = price.VatPercent,
            LineSubtotal = amounts.LineSubtotal, DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    request.Status = PurchaseRequestStatus.Ordered;
    if (sourceQuote is not null)
    {
        sourceQuote.Status = PurchaseSupplierQuoteStatus.Selected;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-supplier-quote.selected", Resource = sourceQuote.Code });
        var otherQuotes = await db.PurchaseSupplierQuotes.Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id && x.Id != sourceQuote.Id
            && x.Status == PurchaseSupplierQuoteStatus.Submitted).ToListAsync();
        foreach (var quote in otherQuotes)
        {
            quote.Status = PurchaseSupplierQuoteStatus.NotSelected;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-supplier-quote.not-selected", Resource = quote.Code });
        }
    }
    else
    {
        var unselectedQuotes = await db.PurchaseSupplierQuotes.Where(x => x.TenantId == tenantId && x.PurchaseRequestId == id
            && x.Status == PurchaseSupplierQuoteStatus.Submitted).ToListAsync();
        foreach (var quote in unselectedQuotes)
        {
            quote.Status = PurchaseSupplierQuoteStatus.NotSelected;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-supplier-quote.not-selected", Resource = quote.Code });
        }
    }
    db.PurchaseOrders.Add(order);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-order.created-from-request", Resource = $"{order.Code}:{request.Code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-request.ordered", Resource = request.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex))
    { return Results.Conflict(new { error = "Talep zaten siparişe dönüştürülmüş veya sipariş numarası bu firmada kullanılıyor." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/orders/{order.Id}", new PurchaseOrderSummary(order.Id, order.Code, supplier.Id,
        supplier.Name, order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count, order.CreatedAt));
});

var purchaseOrders = app.MapGroup("/api/purchasing/orders").RequireAuthorization();
purchaseOrders.MapPost("/", async (PurchaseOrderWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = PurchaseOrderValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var supplier = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.SupplierId);
    if (supplier is null) return Results.NotFound();
    if (!supplier.IsActive || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both))
        return Results.Conflict(new { error = "Aktif bir tedarikçi seçilmelidir." });
    var currency = request.CurrencyCode.Trim().ToUpperInvariant();
    if (currency != supplier.CurrencyCode) return Results.ValidationProblem(new Dictionary<string, string[]> { ["currencyCode"] = [$"Tedarikçi para birimi {supplier.CurrencyCode} olmalıdır."] });
    var stockIds = request.Lines.Select(x => x.StockItemId).Distinct().ToArray();
    var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && stockIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (items.Count != stockIds.Length || items.Values.Any(x => !x.IsActive))
        return Results.Conflict(new { error = "Sipariş satırlarından en az birinin stok kartı bulunamadı veya pasif." });
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(request.Lines.Select(SalesQuoteValidation.Calculate)); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    var order = new PurchaseOrder { TenantId = tenantId, SupplierId = supplier.Id, Code = request.Code.Trim(), OrderDate = request.OrderDate,
        CurrencyCode = currency, Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        Subtotal = totals.Subtotal, DiscountTotal = totals.DiscountTotal, TaxTotal = totals.TaxTotal, GrandTotal = totals.GrandTotal };
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = request.Lines[i]; var item = items[input.StockItemId]; var amounts = SalesQuoteValidation.Calculate(input);
        order.Lines.Add(new PurchaseOrderLine { TenantId = tenantId, PurchaseOrder = order, LineNumber = i + 1,
            StockItemId = item.Id, StockCode = item.Code, StockName = item.Name, UnitCode = item.UnitCode, Quantity = input.Quantity,
            UnitPrice = input.UnitPrice, DiscountPercent = input.DiscountPercent, VatPercent = input.VatPercent,
            LineSubtotal = amounts.LineSubtotal, DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    db.PurchaseOrders.Add(order);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-order.created", Resource = order.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu satın alma sipariş numarası bu firmada zaten kullanılıyor." }); }
    return Results.Created($"/api/purchasing/orders/{order.Id}", new PurchaseOrderSummary(order.Id, order.Code, supplier.Id, supplier.Name,
        order.OrderDate, order.CurrencyCode, order.Status, order.GrandTotal, order.Lines.Count, order.CreatedAt));
});
purchaseOrders.MapGet("/", async (string? q, ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Supplier.Name.Contains(term) || x.Supplier.Code.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.OrderDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new PurchaseOrderSummary(x.Id, x.Code, x.SupplierId, x.Supplier.Name, x.OrderDate, x.CurrencyCode,
            x.Status, x.GrandTotal, x.Lines.Count, x.CreatedAt)).ToListAsync();
    return Results.Ok(new PurchaseOrderPage(rows, page, pageSize, total));
});
purchaseOrders.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var order = await db.PurchaseOrders.AsNoTracking().Include(x => x.Supplier).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (order is null) return Results.NotFound();
    var received = await db.PurchaseReceiptLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id && x.Receipt.Status == PurchaseReceiptStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    var lines = order.Lines.OrderBy(x => x.LineNumber).Select(x => new PurchaseOrderLineView(x.LineNumber, x.StockItemId, x.StockCode,
        x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent, x.LineSubtotal, x.DiscountAmount,
        x.TaxAmount, x.LineTotal, received.GetValueOrDefault(x.LineNumber), Math.Max(0m, x.Quantity - received.GetValueOrDefault(x.LineNumber)))).ToList();
    var activeInvoices = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id && x.Status == PurchaseInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, x.PurchaseReceiptId, ReceiptCode = x.PurchaseReceipt.Code, x.PurchaseOrderId, OrderCode = x.PurchaseReceipt.PurchaseOrder.Code,
            x.SupplierId, SupplierName = x.Supplier.Name, x.InvoiceDate, x.DueDate, x.CurrencyCode, x.Status, x.GrandTotal,
            Paid = x.Payments.Where(p => p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m,
            Returned = x.Returns.Where(r => r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m,
            LineCount = x.Lines.Count, x.CreatedAt }).ToListAsync();
    var receipts = await db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id)
        .OrderByDescending(x => x.ReceiptDate).ThenByDescending(x => x.CreatedAt)
        .Select(x => new PurchaseReceiptSummary(x.Id, x.Code, x.PurchaseOrderId, x.PurchaseOrder.Code, x.WarehouseId, x.Warehouse.Name,
            x.ReceiptDate, x.Status, x.Lines.Count, x.CreatedAt,
            x.Lines.OrderBy(l => l.OrderLineNumber).Select(l => new PurchaseReceiptLineView(l.OrderLineNumber, l.StockItemId, l.StockCode, l.StockName, l.UnitCode, l.Quantity)).ToList())).ToListAsync();
    receipts = receipts.Select(r =>
    {
        var invoice = activeInvoices.SingleOrDefault(x => x.PurchaseReceiptId == r.Id);
        var summary = invoice is null ? null : new PurchaseInvoiceSummary(invoice.Id, invoice.Code, invoice.PurchaseReceiptId,
            invoice.ReceiptCode, invoice.PurchaseOrderId, invoice.OrderCode, invoice.SupplierId, invoice.SupplierName,
            invoice.InvoiceDate, invoice.DueDate, invoice.CurrencyCode, invoice.Status, invoice.GrandTotal, invoice.Paid,
            PurchaseInvoiceWorkflow.Outstanding(invoice.GrandTotal, invoice.Paid, invoice.Returned), invoice.LineCount, invoice.CreatedAt);
        return r with { Invoice = summary };
    }).ToList();
    return Results.Ok(new PurchaseOrderView(order.Id, order.Code, order.SupplierId, order.Supplier.Name, order.OrderDate,
        order.CurrencyCode, order.Status, order.Subtotal, order.DiscountTotal, order.TaxTotal, order.GrandTotal, order.Notes,
        order.CreatedAt, lines, receipts));
});
purchaseOrders.MapPost("/{id:guid}/receipts", async (Guid id, PurchaseReceiptWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = PurchaseReceiptValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var prior = await db.PurchaseReceipts.AsNoTracking().Include(x => x.Warehouse).Where(x => x.TenantId == tenantId && x.RequestId == request.RequestId).SingleOrDefaultAsync();
    if (prior is not null)
    {
        if (prior.PurchaseOrderId != order.Id) return Results.Conflict(new { error = "Bu istek anahtarı başka bir satın alma siparişinde kullanılmış." });
        return Results.Ok(new PurchaseReceiptSummary(prior.Id, prior.Code, prior.PurchaseOrderId, order.Code, prior.WarehouseId,
            prior.Warehouse.Name, prior.ReceiptDate, prior.Status, await db.PurchaseReceiptLines.CountAsync(x => x.TenantId == tenantId && x.ReceiptId == prior.Id), prior.CreatedAt));
    }
    if (order.Status is PurchaseOrderStatus.Received or PurchaseOrderStatus.Cancelled) return Results.Conflict(new { error = "Bu sipariş için yeni mal kabul yapılamaz." });
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depoya mal kabul yapılamaz." });
    var orderLines = await db.PurchaseOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id).OrderBy(x => x.LineNumber).ToListAsync();
    var linesByNumber = orderLines.ToDictionary(x => x.LineNumber);
    if (request.Lines.Any(x => !linesByNumber.ContainsKey(x.OrderLineNumber)))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Mal kabul satırlarından biri siparişte bulunamadı."] });
    var received = await db.PurchaseReceiptLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == id && x.Receipt.Status == PurchaseReceiptStatus.Posted)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { LineNumber = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.LineNumber, x => x.Quantity);
    foreach (var input in request.Lines)
    {
        var remaining = linesByNumber[input.OrderLineNumber].Quantity - received.GetValueOrDefault(input.OrderLineNumber);
        if (input.Quantity > remaining) return Results.Conflict(new { error = $"Sipariş satırı {input.OrderLineNumber} için kalan miktar {remaining}.", orderLineNumber = input.OrderLineNumber, remainingQuantity = remaining });
    }
    var itemIds = request.Lines.Select(x => linesByNumber[x.OrderLineNumber].StockItemId).Distinct().ToArray();
    var stockItems = await db.StockItems.Where(x => x.TenantId == tenantId && itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
    if (stockItems.Count != itemIds.Length || stockItems.Values.Any(x => !x.IsActive)) return Results.Conflict(new { error = "Sipariş stok kartı bulunamadı veya pasif." });
    var purchaseRate = await GetTenantRateAsync(db, tenantId, order.CurrencyCode, request.ReceiptDate);
    if (purchaseRate is null) return Results.Conflict(new { error = $"{order.CurrencyCode} için {request.ReceiptDate:yyyy-MM-dd} tarihinde veya öncesinde tenant baz para birimine çevrilebilen kur yok. Önce Finans ekranından kuru kaydedin." });
    var code = $"GR-{Guid.NewGuid():N}".ToUpperInvariant();
    var receipt = new PurchaseReceipt { TenantId = tenantId, RequestId = request.RequestId, PurchaseOrderId = id, WarehouseId = warehouse.Id, Code = code, ReceiptDate = request.ReceiptDate };
    foreach (var input in request.Lines.OrderBy(x => x.OrderLineNumber))
    {
        var line = linesByNumber[input.OrderLineNumber];
        var receiptLine = new PurchaseReceiptLine { TenantId = tenantId, Receipt = receipt, PurchaseOrderId = id, OrderLineNumber = line.LineNumber,
            StockItemId = line.StockItemId, StockCode = line.StockCode, StockName = line.StockName, UnitCode = line.UnitCode, Quantity = input.Quantity };
        receipt.Lines.Add(receiptLine);
        decimal? unitCostBase = purchaseRate is null ? null : decimal.Round(line.UnitPrice * (1m - line.DiscountPercent / 100m) * purchaseRate.Value, 8, MidpointRounding.AwayFromZero);
        if (unitCostBase > 9999999999.99999999m) return Results.Conflict(new { error = $"Sipariş satırı {line.LineNumber} maliyeti decimal(18,8) sınırını aşıyor." });
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = line.StockItemId,
            EntryDate = request.ReceiptDate, Direction = InventoryDirection.Receipt, Quantity = input.Quantity,
            UnitCostBase = unitCostBase, Description = $"Satın alma mal kabul {code}", PurchaseReceiptLine = receiptLine });
    }
    db.PurchaseReceipts.Add(receipt);
    var receivedAfter = new Dictionary<int, decimal>(received);
    foreach (var input in request.Lines) receivedAfter[input.OrderLineNumber] = receivedAfter.GetValueOrDefault(input.OrderLineNumber) + input.Quantity;
    order.Status = PurchaseOrderWorkflow.GetStatus(orderLines.Select(x => (x.Quantity, receivedAfter.GetValueOrDefault(x.LineNumber))));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-receipt.posted", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Mal kabul istek anahtarı veya belge numarası daha önce kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/receipts/{receipt.Id}", new PurchaseReceiptSummary(receipt.Id, receipt.Code, order.Id, order.Code,
        warehouse.Id, warehouse.Name, receipt.ReceiptDate, receipt.Status, receipt.Lines.Count, receipt.CreatedAt));
});
var purchaseReceipts = app.MapGroup("/api/purchasing/receipts").RequireAuthorization();
purchaseReceipts.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseOrderId, x.WarehouseId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseOrderId}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var receipt = await db.PurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (receipt is null) return Results.NotFound();
    if (receipt.Status != PurchaseReceiptStatus.Posted) return Results.Conflict(new { error = "Mal kabul daha önce iptal edildi." });
    if (await db.PurchaseInvoices.AnyAsync(x => x.TenantId == tenantId && x.PurchaseReceiptId == receipt.Id && x.Status == PurchaseInvoiceStatus.Posted))
        return Results.Conflict(new { error = "Mal kabul önce bağlı alış faturası iptal edilerek kapatılmalıdır." });
    var lines = await db.PurchaseReceiptLines.Where(x => x.TenantId == tenantId && x.ReceiptId == id).OrderBy(x => x.Id).ToListAsync();
    var movements = new List<InventoryTransaction>();
    foreach (var line in lines)
    {
        var linked = await db.InventoryTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [PurchaseReceiptLineId] = {line.Id} AND [ReversalOfId] IS NULL").ToListAsync();
        movements.AddRange(linked);
    }
    var movementIds = movements.Select(x => x.Id).ToArray();
    if (await db.InventoryTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId != null && movementIds.Contains(x.ReversalOfId.Value)))
        return Results.Conflict(new { error = "Mal kabul stok hareketlerinden biri daha önce ters kayıtla geri alınmış." });
    var required = movements.GroupBy(x => x.StockItemId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));
    var balances = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && required.Keys.Contains(x.StockItemId))
        .GroupBy(x => x.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) }).ToDictionaryAsync(x => x.Id, x => x.Quantity);
    var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && required.Keys.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) }).ToDictionaryAsync(x => x.Id, x => x.Quantity);
    var shortage = required.FirstOrDefault(x => balances.GetValueOrDefault(x.Key) - reserved.GetValueOrDefault(x.Key) < x.Value);
    if (shortage.Value > 0) return Results.Conflict(new { error = "Mal kabul iptali stok rezervasyonlarını karşılayamaz; önce ilgili rezervasyonları bırakın.", stockItemId = shortage.Key,
        currentBalance = balances.GetValueOrDefault(shortage.Key), reservedQuantity = reserved.GetValueOrDefault(shortage.Key), requiredQuantity = shortage.Value });
    foreach (var movement in movements)
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = movement.StockItemId,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = InventoryDirection.Issue, Quantity = movement.Quantity,
            UnitCostBase = movement.UnitCostBase, Description = $"Mal kabul iptali {receipt.Code}", ReversalOfId = movement.Id, PurchaseReceiptLineId = movement.PurchaseReceiptLineId });
    receipt.Status = PurchaseReceiptStatus.Voided;
    var orderLines = await db.PurchaseOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == order.Id).ToListAsync();
    var received = await db.PurchaseReceiptLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseOrderId == order.Id && x.Receipt.Status == PurchaseReceiptStatus.Posted && x.ReceiptId != receipt.Id)
        .GroupBy(x => x.OrderLineNumber).Select(g => new { Number = g.Key, Quantity = g.Sum(x => x.Quantity) }).ToDictionaryAsync(x => x.Number, x => x.Quantity);
    order.Status = PurchaseOrderWorkflow.GetStatus(orderLines.Select(x => (x.Quantity, received.GetValueOrDefault(x.LineNumber))));
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-receipt.voided", Resource = receipt.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { receipt.Id, receipt.Code, receipt.Status, orderStatus = order.Status });
});

purchaseReceipts.MapPost("/{id:guid}/invoice", async (Guid id, PurchaseInvoiceCreateRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = PurchaseInvoiceValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var receiptIdentity = await db.PurchaseReceipts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseOrderId, SupplierId = x.PurchaseOrder.SupplierId }).SingleOrDefaultAsync();
    if (receiptIdentity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {receiptIdentity.PurchaseOrderId}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var receipt = await db.PurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (receipt is null) return Results.NotFound();
    if (receipt.Status != PurchaseReceiptStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş mal kabul için alış faturası oluşturulamaz." });
    var activeInvoice = await db.PurchaseInvoices.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.PurchaseReceiptId == id && x.Status == PurchaseInvoiceStatus.Posted);
    if (activeInvoice is not null) return Results.Conflict(new { error = "Bu mal kabul için aktif alış faturası zaten var.", invoiceId = activeInvoice.Id });
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {order.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null || supplier.Type is not (CounterpartyType.Supplier or CounterpartyType.Both)) return Results.Conflict(new { error = "Sipariş tedarikçi hesabı kullanılamıyor." });
    if (supplier.CurrencyCode != order.CurrencyCode) return Results.Conflict(new { error = "Tedarikçinin döviz kodu sipariş para birimiyle eşleşmiyor." });
    if (request.InvoiceDate.DayNumber > DateOnly.MaxValue.DayNumber - supplier.PaymentTermDays)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["invoiceDate"] = ["Tedarikçi vadesiyle hesaplanan son ödeme tarihi desteklenen tarih aralığını aşıyor."] });
    var receiptLines = await db.PurchaseReceiptLines.AsNoTracking().Include(x => x.OrderLine)
        .Where(x => x.TenantId == tenantId && x.ReceiptId == id).OrderBy(x => x.OrderLineNumber).ToListAsync();
    if (receiptLines.Count == 0) return Results.Conflict(new { error = "Satır içermeyen mal kabul faturalanamaz." });
    var historicalLines = await db.PurchaseInvoiceLines.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.PurchaseReceiptLine.PurchaseOrderId == order.Id && x.PurchaseInvoice.Status == PurchaseInvoiceStatus.Posted)
        .GroupBy(x => x.OrderLineNumber)
        .Select(g => new { Number = g.Key, Quantity = g.Sum(x => x.Quantity), Subtotal = g.Sum(x => x.LineSubtotal), Discount = g.Sum(x => x.DiscountAmount), Tax = g.Sum(x => x.TaxAmount), Total = g.Sum(x => x.LineTotal) })
        .ToDictionaryAsync(x => x.Number, x => (Quantity: x.Quantity, Amounts: new SalesQuoteLineAmounts(x.Subtotal, x.Discount, x.Tax, x.Total)));
    var invoice = new PurchaseInvoice { TenantId = tenantId, PurchaseReceiptId = receipt.Id, PurchaseOrderId = order.Id,
        SupplierId = supplier.Id, Code = request.Code.Trim(), InvoiceDate = request.InvoiceDate,
        DueDate = request.InvoiceDate.AddDays(supplier.PaymentTermDays), CurrencyCode = order.CurrencyCode };
    var invoiceAmounts = new List<SalesQuoteLineAmounts>();
    foreach (var source in receiptLines)
    {
        var previous = historicalLines.GetValueOrDefault(source.OrderLineNumber);
        var orderLine = source.OrderLine;
        var amounts = PurchaseInvoiceWorkflow.CalculateIncrementalAmounts(orderLine.StockItemId, orderLine.UnitPrice,
            orderLine.DiscountPercent, orderLine.VatPercent, previous.Quantity, previous.Amounts ?? new SalesQuoteLineAmounts(0, 0, 0, 0), source.Quantity);
        invoiceAmounts.Add(amounts);
        invoice.Lines.Add(new PurchaseInvoiceLine { TenantId = tenantId, PurchaseInvoice = invoice, PurchaseReceiptLineId = source.Id,
            PurchaseReceiptId = receipt.Id,
            OrderLineNumber = source.OrderLineNumber, StockItemId = source.StockItemId, StockCode = source.StockCode,
            StockName = source.StockName, UnitCode = source.UnitCode, Quantity = source.Quantity, UnitPrice = orderLine.UnitPrice,
            DiscountPercent = orderLine.DiscountPercent, VatPercent = orderLine.VatPercent, LineSubtotal = amounts.LineSubtotal,
            DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal });
    }
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(invoiceAmounts); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    if (totals.GrandTotal <= 0) return Results.Conflict(new { error = "Toplamı sıfır veya negatif olan mal kabulden alış faturası oluşturulamaz." });
    invoice.Subtotal = totals.Subtotal; invoice.DiscountTotal = totals.DiscountTotal; invoice.TaxTotal = totals.TaxTotal; invoice.GrandTotal = totals.GrandTotal;
    db.PurchaseInvoices.Add(invoice);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id, PurchaseInvoice = invoice,
        EntryDate = invoice.InvoiceDate, Direction = CustomerLedgerDirection.Credit, Amount = invoice.GrandTotal,
        CurrencyCode = invoice.CurrencyCode, Description = $"Alış faturası {invoice.Code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-invoice.posted", Resource = invoice.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Fatura numarası zaten kullanılıyor veya bu mal kabul faturalanmış." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/invoices/{invoice.Id}", new PurchaseInvoiceSummary(invoice.Id, invoice.Code,
        receipt.Id, receipt.Code, order.Id, order.Code, supplier.Id, supplier.Name, invoice.InvoiceDate, invoice.DueDate,
        invoice.CurrencyCode, invoice.Status, invoice.GrandTotal, 0m, invoice.GrandTotal, invoice.Lines.Count, invoice.CreatedAt));
});

var purchaseInvoices = app.MapGroup("/api/purchasing/invoices").RequireAuthorization();
purchaseInvoices.MapGet("/", async (string? q, ClaimsPrincipal principal, PlatformDbContext db, int page = 1, int pageSize = 25) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
    var query = db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId);
    if (!string.IsNullOrWhiteSpace(q)) { var term = q.Trim(); query = query.Where(x => x.Code.Contains(term) || x.Supplier.Name.Contains(term) || x.PurchaseReceipt.Code.Contains(term)); }
    var total = await query.CountAsync();
    var rows = await query.OrderByDescending(x => x.InvoiceDate).ThenByDescending(x => x.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize)
        .Select(x => new PurchaseInvoiceSummary(x.Id, x.Code, x.PurchaseReceiptId, x.PurchaseReceipt.Code, x.PurchaseOrderId,
            x.PurchaseReceipt.PurchaseOrder.Code, x.SupplierId, x.Supplier.Name, x.InvoiceDate, x.DueDate, x.CurrencyCode, x.Status,
            x.GrandTotal, x.Payments.Where(p => p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m,
            Math.Max(0m, x.GrandTotal - (x.Payments.Where(p => p.Status == SupplierPaymentStatus.Posted).Sum(p => (decimal?)p.Amount) ?? 0m)
                - (x.Returns.Where(r => r.Status == SupplierReturnStatus.Posted).Sum(r => (decimal?)r.GrandTotal) ?? 0m)),
            x.Lines.Count, x.CreatedAt)).ToListAsync();
    return Results.Ok(new PurchaseInvoicePage(rows, page, pageSize, total));
});
purchaseInvoices.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var invoice = await db.PurchaseInvoices.AsNoTracking().Include(x => x.PurchaseReceipt).ThenInclude(x => x.PurchaseOrder)
        .Include(x => x.Supplier).Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (invoice is null) return Results.NotFound();
    var payments = await db.SupplierPayments.AsNoTracking().Include(x => x.FinancialAccount).Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id)
        .OrderByDescending(x => x.PaymentDate).ThenByDescending(x => x.CreatedAt)
        .Select(x => new SupplierPaymentSummary(x.Id, x.Code, x.PurchaseInvoiceId, invoice.Code, x.PaymentDate, x.Amount,
            x.CurrencyCode, x.PaymentMethod, x.Reference, x.Status, x.CreatedAt, x.FinancialAccountId, x.FinancialAccount == null ? null : x.FinancialAccount.Name)).ToListAsync();
    var paid = payments.Where(x => x.Status == SupplierPaymentStatus.Posted).Sum(x => x.Amount);
    var returns = await db.SupplierReturns.AsNoTracking().Include(x => x.Warehouse).Include(x => x.Lines)
        .Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id).OrderByDescending(x => x.ReturnDate).ThenByDescending(x => x.CreatedAt).ToListAsync();
    var returnSummaries = returns.Select(r => new SupplierReturnSummary(r.Id, r.Code, r.PurchaseInvoiceId, invoice.Code,
        r.WarehouseId, r.Warehouse.Name, r.ReturnDate, r.Status, r.GrandTotal, r.Lines.Count, r.CreatedAt,
        r.Lines.OrderBy(l => l.OrderLineNumber).Select(l => new SupplierReturnLineView(l.PurchaseInvoiceLineId, l.OrderLineNumber,
            l.StockCode, l.StockName, l.UnitCode, l.Quantity, l.UnitPrice, l.DiscountPercent, l.VatPercent,
            l.LineSubtotal, l.DiscountAmount, l.TaxAmount, l.LineTotal)).ToList())).ToList();
    var returned = returns.Where(x => x.Status == SupplierReturnStatus.Posted).Sum(x => x.GrandTotal);
    var lines = invoice.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new PurchaseInvoiceLineView(x.Id, x.PurchaseReceiptLineId,
        x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
    return Results.Ok(new PurchaseInvoiceView(invoice.Id, invoice.Code, invoice.PurchaseReceiptId, invoice.PurchaseReceipt.Code,
        invoice.PurchaseOrderId, invoice.PurchaseReceipt.PurchaseOrder.Code, invoice.SupplierId, invoice.Supplier.Name,
        invoice.InvoiceDate, invoice.DueDate, invoice.CurrencyCode, invoice.Status, invoice.Subtotal, invoice.DiscountTotal, invoice.TaxTotal,
        invoice.GrandTotal, paid, PurchaseInvoiceWorkflow.Outstanding(invoice.GrandTotal, paid, returned), invoice.CreatedAt, lines, payments, returnSummaries));
});
purchaseInvoices.MapPost("/{id:guid}/payments", async (Guid id, SupplierPaymentWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = SupplierPaymentValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var prior = await db.SupplierPayments.AsNoTracking().Include(x => x.FinancialAccount).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (prior is not null)
    {
        if (prior.PurchaseInvoiceId != invoice.Id) return Results.Conflict(new { error = "Bu istek anahtarı başka bir tedarikçi ödemesinde kullanılmış." });
        return Results.Ok(new SupplierPaymentSummary(prior.Id, prior.Code, invoice.Id, invoice.Code, prior.PaymentDate, prior.Amount,
            prior.CurrencyCode, prior.PaymentMethod, prior.Reference, prior.Status, prior.CreatedAt, prior.FinancialAccountId, prior.FinancialAccount?.Name));
    }
    if (invoice.Status != PurchaseInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş alış faturası ödenemez." });
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    FinancialAccount? financialAccount = null;
    if (request.FinancialAccountId is { } accountId)
    {
        financialAccount = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        var expectedType = request.PaymentMethod == "Cash" ? FinancialAccountType.Cash : FinancialAccountType.Bank;
        if (financialAccount is null || !financialAccount.IsActive || financialAccount.Type != expectedType || financialAccount.CurrencyCode != invoice.CurrencyCode)
            return Results.Conflict(new { error = "Seçilen finans hesabı ödeme yöntemi, para birimi veya aktiflik durumu ile uyumlu değil." });
        if (financialAccount.Type == FinancialAccountType.Cash)
        {
            var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == accountId)
                .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
            if (request.Amount > balance) return Results.Conflict(new { error = "Kasa bakiyesi ödemeyi karşılamıyor.", currentBalance = balance });
        }
    }
    var paid = await db.SupplierPayments.Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id && x.Status == SupplierPaymentStatus.Posted).SumAsync(x => (decimal?)x.Amount) ?? 0m;
    var returned = await db.SupplierReturns.Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id && x.Status == SupplierReturnStatus.Posted).SumAsync(x => (decimal?)x.GrandTotal) ?? 0m;
    var outstanding = PurchaseInvoiceWorkflow.Outstanding(invoice.GrandTotal, paid, returned);
    if (outstanding <= 0) return Results.Conflict(new { error = "Alış faturası tamamen ödendi.", outstandingAmount = 0m });
    if (request.Amount > outstanding) return Results.Conflict(new { error = "Ödeme tutarı kalan tedarikçi bakiyesini aşamaz.", outstandingAmount = outstanding });
    var method = request.PaymentMethod.Trim(); var reference = request.Reference?.Trim();
    var code = $"PAY-{Guid.NewGuid():N}".ToUpperInvariant();
    var payment = new SupplierPayment { TenantId = tenantId, RequestId = request.RequestId, PurchaseInvoiceId = invoice.Id,
        SupplierId = supplier.Id, Code = code, PaymentDate = request.PaymentDate, CurrencyCode = invoice.CurrencyCode,
        Amount = request.Amount, PaymentMethod = method, Reference = string.IsNullOrWhiteSpace(reference) ? null : reference,
        FinancialAccountId = financialAccount?.Id };
    db.SupplierPayments.Add(payment);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id, SupplierPayment = payment,
        EntryDate = payment.PaymentDate, Direction = CustomerLedgerDirection.Debit, Amount = payment.Amount,
        CurrencyCode = payment.CurrencyCode, Description = $"Tedarikçi ödemesi {code} · Fatura {invoice.Code}" });
    if (financialAccount is not null) db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId,
        FinancialAccount = financialAccount, CurrencyCode = invoice.CurrencyCode, TransactionDate = payment.PaymentDate,
        Direction = FinancialDirection.Outflow, Amount = payment.Amount, Description = $"Tedarikçi ödemesi {code}",
        Reference = string.IsNullOrWhiteSpace(reference) ? null : reference, SupplierPayment = payment });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "supplier-payment.posted", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Ödeme istek anahtarı daha önce kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/purchasing/payments/{payment.Id}", new SupplierPaymentSummary(payment.Id, payment.Code,
        invoice.Id, invoice.Code, payment.PaymentDate, payment.Amount, payment.CurrencyCode, payment.PaymentMethod,
        payment.Reference, payment.Status, payment.CreatedAt, financialAccount?.Id, financialAccount?.Name));
});
purchaseInvoices.MapPost("/{id:guid}/returns", async (Guid id, SupplierReturnWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = new Dictionary<string, string[]>();
    if (request.RequestId == Guid.Empty) errors["requestId"] = ["Tekrar deneme güvenliği için requestId zorunludur."];
    if (request.WarehouseId == Guid.Empty) errors["warehouseId"] = ["İade ürünlerinin çıkacağı depo seçilmelidir."];
    if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["İade 1 ile 100 arasında fatura satırı içermelidir."];
    if (request.Lines is not null)
    {
        if (request.Lines.GroupBy(x => x.PurchaseInvoiceLineId).Any(g => g.Count() > 1)) errors["lines"] = ["Aynı fatura satırı iade talebinde yalnızca bir kez bulunabilir."];
        for (var i = 0; i < request.Lines.Count; i++)
            if (request.Lines[i].PurchaseInvoiceLineId == Guid.Empty || request.Lines[i].Quantity <= 0 || request.Lines[i].Quantity > 99999999999999.9999m || request.Lines[i].Quantity != decimal.Round(request.Lines[i].Quantity, 4))
                errors[$"lines[{i}].quantity"] = ["İade miktarı pozitif olmalı ve en fazla 4 ondalık basamak içermelidir."];
    }
    if (errors.Count > 0) return Results.ValidationProblem(errors);
    var returnRequests = request.Lines ?? Array.Empty<SupplierReturnLineWriteRequest>();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var existing = await db.SupplierReturns.AsNoTracking().Include(x => x.Warehouse).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (existing is not null)
    {
        if (existing.PurchaseInvoiceId != invoice.Id) return Results.Conflict(new { error = "requestId başka bir alış iadesinde kullanılmış." });
        var oldLines = existing.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SupplierReturnLineView(x.PurchaseInvoiceLineId,
            x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent,
            x.VatPercent, x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
        return Results.Ok(new SupplierReturnSummary(existing.Id, existing.Code, existing.PurchaseInvoiceId, invoice.Code,
            existing.WarehouseId, existing.Warehouse.Name, existing.ReturnDate, existing.Status, existing.GrandTotal,
            existing.Lines.Count, existing.CreatedAt, oldLines));
    }
    if (invoice.Status != PurchaseInvoiceStatus.Posted) return Results.Conflict(new { error = "İptal edilmiş alış faturasından iade oluşturulamaz." });
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {invoice.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    if (!warehouse.IsActive) return Results.Conflict(new { error = "Pasif depodan alış iadesi yapılamaz." });
    var invoiceLines = await db.PurchaseInvoiceLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseInvoiceId == invoice.Id).ToDictionaryAsync(x => x.Id);
    if (returnRequests.Any(x => !invoiceLines.ContainsKey(x.PurchaseInvoiceLineId))) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["İade satırlarından biri bu alış faturasına ait değil."] });
    var requestedIds = returnRequests.Select(x => x.PurchaseInvoiceLineId).ToArray();
    var priorRows = await db.SupplierReturnLines.Where(x => x.TenantId == tenantId && requestedIds.Contains(x.PurchaseInvoiceLineId) && x.SupplierReturn.Status == SupplierReturnStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceLineId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity), Subtotal = g.Sum(x => x.LineSubtotal), Discount = g.Sum(x => x.DiscountAmount), Tax = g.Sum(x => x.TaxAmount), Total = g.Sum(x => x.LineTotal) })
        .ToDictionaryAsync(x => x.Id, x => (x.Quantity, Amounts: new SalesQuoteLineAmounts(x.Subtotal, x.Discount, x.Tax, x.Total)));
    foreach (var row in returnRequests)
        if (row.Quantity > invoiceLines[row.PurchaseInvoiceLineId].Quantity - priorRows.GetValueOrDefault(row.PurchaseInvoiceLineId).Quantity)
            return Results.Conflict(new { error = "İade miktarı faturada kalan miktarı aşamaz.", purchaseInvoiceLineId = row.PurchaseInvoiceLineId,
                remainingQuantity = invoiceLines[row.PurchaseInvoiceLineId].Quantity - priorRows.GetValueOrDefault(row.PurchaseInvoiceLineId).Quantity });
    var itemIds = returnRequests.Select(x => invoiceLines[x.PurchaseInvoiceLineId].StockItemId).Distinct().ToArray();
    var stock = await db.InventoryTransactions.Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id && itemIds.Contains(x.StockItemId))
        .GroupBy(x => x.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
        .ToDictionaryAsync(x => x.Id, x => x.Quantity);
    var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == warehouse.Id
            && x.Status == SalesOrderReservationStatus.Active && itemIds.Contains(x.OrderLine.StockItemId))
        .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
        .ToDictionaryAsync(x => x.Id, x => x.Quantity);
    foreach (var group in returnRequests.GroupBy(x => invoiceLines[x.PurchaseInvoiceLineId].StockItemId))
    {
        var needed = group.Sum(x => x.Quantity);
        if (stock.GetValueOrDefault(group.Key) - reserved.GetValueOrDefault(group.Key) < needed) return Results.Conflict(new { error = "İade miktarı rezervasyonlar düşüldükten sonra kullanılabilir stok bakiyesini aşamaz.", stockItemId = group.Key,
            currentBalance = stock.GetValueOrDefault(group.Key), reservedQuantity = reserved.GetValueOrDefault(group.Key), requestedQuantity = needed });
    }
    var code = $"SRT-{Guid.NewGuid():N}".ToUpperInvariant();
    var supplierReturn = new SupplierReturn { TenantId = tenantId, RequestId = request.RequestId, PurchaseInvoiceId = invoice.Id,
        SupplierId = supplier.Id, WarehouseId = warehouse.Id, Code = code, ReturnDate = request.ReturnDate };
    var amountsList = new List<SalesQuoteLineAmounts>();
    foreach (var row in returnRequests)
    {
        var source = invoiceLines[row.PurchaseInvoiceLineId];
        var previous = priorRows.GetValueOrDefault(source.Id);
        var amounts = SalesReturnValidation.CalculateIncrementalAmounts(source.StockItemId, source.UnitPrice, source.DiscountPercent,
            source.VatPercent, previous.Quantity, previous.Amounts ?? new SalesQuoteLineAmounts(0, 0, 0, 0), row.Quantity);
        amountsList.Add(amounts);
        var line = new SupplierReturnLine { TenantId = tenantId, SupplierReturn = supplierReturn, PurchaseInvoiceId = invoice.Id,
            PurchaseInvoiceLineId = source.Id, OrderLineNumber = source.OrderLineNumber, StockItemId = source.StockItemId,
            StockCode = source.StockCode, StockName = source.StockName, UnitCode = source.UnitCode, Quantity = row.Quantity,
            UnitPrice = source.UnitPrice, DiscountPercent = source.DiscountPercent, VatPercent = source.VatPercent,
            LineSubtotal = amounts.LineSubtotal, DiscountAmount = amounts.DiscountAmount, TaxAmount = amounts.TaxAmount, LineTotal = amounts.LineTotal };
        supplierReturn.Lines.Add(line);
        var unitCostBase = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId
            && x.PurchaseReceiptLineId == source.PurchaseReceiptLineId && x.ReversalOfId == null).Select(x => x.UnitCostBase).SingleOrDefaultAsync();
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id,
            StockItemId = source.StockItemId, EntryDate = request.ReturnDate, Direction = InventoryDirection.Issue,
            Quantity = row.Quantity, UnitCostBase = unitCostBase, Description = $"Alış iadesi {code}", SupplierReturnLine = line });
    }
    SalesQuoteTotals totals;
    try { totals = SalesQuoteValidation.Sum(amountsList); }
    catch (OverflowException ex) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = [ex.Message] }); }
    if (totals.GrandTotal <= 0) return Results.Conflict(new { error = "Toplamı sıfır olan alış iadesi kaydedilemez." });
    supplierReturn.Subtotal = totals.Subtotal; supplierReturn.DiscountTotal = totals.DiscountTotal;
    supplierReturn.TaxTotal = totals.TaxTotal; supplierReturn.GrandTotal = totals.GrandTotal;
    db.SupplierReturns.Add(supplierReturn);
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id, SupplierReturn = supplierReturn,
        EntryDate = request.ReturnDate, Direction = CustomerLedgerDirection.Debit, Amount = totals.GrandTotal,
        CurrencyCode = invoice.CurrencyCode, Description = $"Alış iadesi {code} · Fatura {invoice.Code}" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "supplier-return.posted", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "İade istek anahtarı daha önce kullanıldı." }); }
    await transaction.CommitAsync();
    var returnLines = supplierReturn.Lines.OrderBy(x => x.OrderLineNumber).Select(x => new SupplierReturnLineView(x.PurchaseInvoiceLineId,
        x.OrderLineNumber, x.StockCode, x.StockName, x.UnitCode, x.Quantity, x.UnitPrice, x.DiscountPercent, x.VatPercent,
        x.LineSubtotal, x.DiscountAmount, x.TaxAmount, x.LineTotal)).ToList();
    return Results.Created($"/api/purchasing/returns/{supplierReturn.Id}", new SupplierReturnSummary(supplierReturn.Id, code,
        invoice.Id, invoice.Code, warehouse.Id, warehouse.Name, supplierReturn.ReturnDate, supplierReturn.Status,
        supplierReturn.GrandTotal, supplierReturn.Lines.Count, supplierReturn.CreatedAt, returnLines));
});
purchaseInvoices.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseOrderId, x.PurchaseReceiptId, x.SupplierId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var order = await db.PurchaseOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseOrderId}").SingleOrDefaultAsync();
    if (order is null) return Results.NotFound();
    var receipt = await db.PurchaseReceipts.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseReceipts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseReceiptId}").SingleOrDefaultAsync();
    if (receipt is null) return Results.NotFound();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    if (invoice.Status != PurchaseInvoiceStatus.Posted) return Results.Conflict(new { error = "Alış faturası daha önce iptal edildi." });
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    if (await db.SupplierPayments.AnyAsync(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id && x.Status == SupplierPaymentStatus.Posted))
        return Results.Conflict(new { error = "Alış faturası önce bağlı tedarikçi ödemeleri iptal edilerek kapatılmalıdır." });
    if (await db.SupplierReturns.AnyAsync(x => x.TenantId == tenantId && x.PurchaseInvoiceId == id && x.Status == SupplierReturnStatus.Posted))
        return Results.Conflict(new { error = "Alış faturası önce bağlı alış iadeleri iptal edilerek kapatılmalıdır." });
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {supplier.Id} AND [PurchaseInvoiceId] = {id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (invoice.GrandTotal > 0 && original is null) return Results.Conflict(new { error = "Alış faturasının cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (original is not null)
    {
        if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Alış faturasının cari hareketi zaten ters kayıtla kapatılmış." });
        db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Debit, Amount = original.Amount,
            CurrencyCode = original.CurrencyCode, Description = $"Alış faturası iptali {invoice.Code}", ReversalOfId = original.Id });
    }
    invoice.Status = PurchaseInvoiceStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "purchase-invoice.voided", Resource = invoice.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { invoice.Id, invoice.Code, invoice.Status });
});
var supplierReturns = app.MapGroup("/api/purchasing/returns").RequireAuthorization();
supplierReturns.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseInvoiceId, x.SupplierId, x.WarehouseId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseInvoiceId}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var warehouse = await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.WarehouseId}").SingleOrDefaultAsync();
    if (warehouse is null) return Results.NotFound();
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    var supplierReturn = await db.SupplierReturns.FromSqlInterpolated($"SELECT * FROM [dbo].[SupplierReturns] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (supplierReturn is null) return Results.NotFound();
    if (supplierReturn.Status != SupplierReturnStatus.Posted) return Results.Conflict(new { error = "Alış iadesi daha önce iptal edildi." });
    var lines = await db.SupplierReturnLines.Where(x => x.TenantId == tenantId && x.SupplierReturnId == id).ToListAsync();
    var movements = new List<InventoryTransaction>();
    foreach (var line in lines)
    {
        var source = await db.InventoryTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[InventoryTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [SupplierReturnLineId] = {line.Id} AND [ReversalOfId] IS NULL").ToListAsync();
        movements.AddRange(source);
    }
    if (movements.Count != lines.Count || movements.Any(x => x.Direction != InventoryDirection.Issue)
        || lines.Any(line => movements.Count(x => x.SupplierReturnLineId == line.Id && x.Quantity == line.Quantity) != 1))
        return Results.Conflict(new { error = "İade stok hareketleri kaynak satırlarla eşleşmediği için güvenli iptal yapılamadı." });
    var originalLedger = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {supplier.Id} AND [SupplierReturnId] = {id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (originalLedger is null || originalLedger.Direction != CustomerLedgerDirection.Debit || originalLedger.Amount != supplierReturn.GrandTotal)
        return Results.Conflict(new { error = "İadenin cari hareketi kaynak belgeyle eşleşmediği için güvenli iptal yapılamadı." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == originalLedger.Id)) return Results.Conflict(new { error = "İade cari hareketi daha önce ters kayıtla kapatılmış." });
    foreach (var movement in movements)
        db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = movement.StockItemId,
            EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = InventoryDirection.Receipt, Quantity = movement.Quantity,
            UnitCostBase = movement.UnitCostBase, Description = $"Alış iadesi iptali {supplierReturn.Code}", ReversalOfId = movement.Id, SupplierReturnLineId = movement.SupplierReturnLineId });
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id, SupplierReturnId = supplierReturn.Id,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Credit, Amount = originalLedger.Amount,
        CurrencyCode = originalLedger.CurrencyCode, Description = $"Alış iadesi iptali {supplierReturn.Code}", ReversalOfId = originalLedger.Id });
    supplierReturn.Status = SupplierReturnStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "supplier-return.voided", Resource = supplierReturn.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { supplierReturn.Id, supplierReturn.Code, supplierReturn.Status });
});
var supplierPayments = app.MapGroup("/api/purchasing/payments").RequireAuthorization();
supplierPayments.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var identity = await db.SupplierPayments.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
        .Select(x => new { x.PurchaseInvoiceId, x.SupplierId, x.FinancialAccountId }).SingleOrDefaultAsync();
    if (identity is null) return Results.NotFound();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var invoice = await db.PurchaseInvoices.FromSqlInterpolated($"SELECT * FROM [dbo].[PurchaseInvoices] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.PurchaseInvoiceId}").SingleOrDefaultAsync();
    if (invoice is null) return Results.NotFound();
    var supplier = await db.CustomerAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {identity.SupplierId}").SingleOrDefaultAsync();
    if (supplier is null) return Results.NotFound();
    var payment = await db.SupplierPayments.FromSqlInterpolated($"SELECT * FROM [dbo].[SupplierPayments] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (payment is null) return Results.NotFound();
    if (payment.Status != SupplierPaymentStatus.Posted) return Results.Conflict(new { error = "Tedarikçi ödemesi daha önce iptal edildi." });
    var original = await db.CustomerLedgerEntries.FromSqlInterpolated($"SELECT * FROM [dbo].[CustomerLedgerEntries] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [CustomerId] = {supplier.Id} AND [SupplierPaymentId] = {payment.Id} AND [ReversalOfId] IS NULL").SingleOrDefaultAsync();
    if (original is null) return Results.Conflict(new { error = "Ödemenin cari hareketi bulunamadığı için güvenli iptal yapılamadı." });
    if (await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id)) return Results.Conflict(new { error = "Ödeme cari hareketi zaten ters kayıtla kapatılmış." });
    if (identity.FinancialAccountId is { } accountId)
    {
        var financialAccount = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (financialAccount is null) return Results.Conflict(new { error = "Ödemeye bağlı finans hesabı bulunamadı." });
        var financialMovement = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [SupplierPaymentId] = {payment.Id}").SingleOrDefaultAsync();
        if (financialMovement is null || financialMovement.Direction != FinancialDirection.Outflow || financialMovement.Amount != payment.Amount)
            return Results.Conflict(new { error = "Ödemenin finans hareketi kaynak belgeyle eşleşmediği için güvenli iptal yapılamadı." });
        if (await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == financialMovement.Id))
            return Results.Conflict(new { error = "Ödemenin finans hareketi daha önce ters kayıtla kapatılmış." });
        db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccountId = financialAccount.Id,
            CurrencyCode = financialMovement.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Direction = FinancialDirection.Inflow, Amount = financialMovement.Amount, Description = $"Tedarikçi ödemesi iptali {payment.Code}",
            Reference = financialMovement.Reference, ReversalOfId = financialMovement.Id });
    }
    db.CustomerLedgerEntries.Add(new CustomerLedgerEntry { TenantId = tenantId, CustomerId = supplier.Id,
        EntryDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = CustomerLedgerDirection.Credit, Amount = original.Amount,
        CurrencyCode = original.CurrencyCode, Description = $"Tedarikçi ödemesi iptali {payment.Code}", ReversalOfId = original.Id });
    payment.Status = SupplierPaymentStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "supplier-payment.voided", Resource = payment.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { payment.Id, payment.Code, payment.Status });
});

app.MapGet("/api/finance/currency", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var currency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync();
    return currency is null ? Results.NotFound() : Results.Ok(new TenantCurrencySettingsView(currency));
}).RequireAuthorization();
app.MapPut("/api/finance/currency", async (TenantCurrencySettingsWriteRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.BaseCurrencyCode?.Trim().ToUpperInvariant();
    if (code is null || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z]{3}$"))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["baseCurrencyCode"] = ["Baz para birimi üç harfli ISO kodu olmalıdır."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var tenant = await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").SingleOrDefaultAsync();
    if (tenant is null) return Results.NotFound();
    if (tenant.BaseCurrencyCode != code)
    {
        var hasActivity = await db.TenantExchangeRates.AnyAsync(x => x.TenantId == tenantId)
            || await db.FinancialAccounts.AnyAsync(x => x.TenantId == tenantId)
            || await db.CustomerLedgerEntries.AnyAsync(x => x.TenantId == tenantId)
            || await db.PurchaseSupplierQuotes.AnyAsync(x => x.TenantId == tenantId)
            || await db.SalesQuotes.AnyAsync(x => x.TenantId == tenantId)
            || await db.SalesInvoices.AnyAsync(x => x.TenantId == tenantId)
            || await db.PurchaseInvoices.AnyAsync(x => x.TenantId == tenantId);
        if (hasActivity) return Results.Conflict(new { error = "Baz para birimi döviz kuru veya finansal hareket kaydedildikten sonra değiştirilemez." });
        tenant.BaseCurrencyCode = code;
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.base-currency.changed", Resource = code });
        await db.SaveChangesAsync();
    }
    await transaction.CommitAsync();
    return Results.Ok(new TenantCurrencySettingsView(tenant.BaseCurrencyCode));
}).RequireAuthorization();
app.MapGet("/api/finance/exchange-rates", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var rates = await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.CurrencyCode).ThenByDescending(x => x.Revision)
        .Select(x => new TenantExchangeRateView(x.Id, x.CurrencyCode, x.RateDate, x.Revision, x.Rate, x.Source, x.CreatedAt)).ToListAsync();
    return Results.Ok(rates);
}).RequireAuthorization();
app.MapPost("/api/finance/exchange-rates", async (TenantExchangeRateWriteRequest body, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    if (principal.FindFirstValue("role") != "TenantAdmin") return Results.Forbid();
    var code = body.CurrencyCode?.Trim().ToUpperInvariant();
    if (code is null || !System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z]{3}$") || body.RateDate > DateOnly.FromDateTime(DateTime.UtcNow)
        || body.Rate <= 0 || body.Rate > 9999999999.99999999m || body.Rate != decimal.Round(body.Rate, 8)
        || (body.Source?.Trim().Length ?? 0) > 160)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["rate"] = ["Döviz kodu, geçmiş/bugün tarih, pozitif decimal(18,8) kur ve en fazla 160 karakter kaynak girilmelidir."] });
    await using var transaction = await db.Database.BeginTransactionAsync();
    var tenant = await db.Tenants.FromSqlInterpolated($"SELECT * FROM [dbo].[Tenants] WITH (UPDLOCK, HOLDLOCK) WHERE [Id] = {tenantId}").SingleOrDefaultAsync();
    if (tenant is null) return Results.NotFound();
    if (code == tenant.BaseCurrencyCode) return Results.Conflict(new { error = "Baz para biriminin kuru her zaman 1 kabul edilir; ayrıca kaydedilmez." });
    var revision = (await db.TenantExchangeRates.Where(x => x.TenantId == tenantId && x.CurrencyCode == code && x.RateDate == body.RateDate)
        .Select(x => (int?)x.Revision).MaxAsync() ?? 0) + 1;
    var rate = new TenantExchangeRate { TenantId = tenantId, CurrencyCode = code, RateDate = body.RateDate, Revision = revision,
        Rate = body.Rate, Source = string.IsNullOrWhiteSpace(body.Source) ? null : body.Source.Trim(), CreatedByUserId = GetUserId(principal) };
    db.TenantExchangeRates.Add(rate);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "finance.exchange-rate.created", Resource = $"{code}:{body.RateDate}:r{revision}" });
    await db.SaveChangesAsync();
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/exchange-rates/{rate.Id}", new TenantExchangeRateView(rate.Id, rate.CurrencyCode, rate.RateDate, rate.Revision, rate.Rate, rate.Source, rate.CreatedAt));
}).RequireAuthorization();

app.MapGet("/api/finance/fx-exposure", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId)
        .Select(x => x.BaseCurrencyCode).SingleOrDefaultAsync();
    if (baseCurrency is null) return Results.NotFound();
    var asOf = DateOnly.FromDateTime(DateTime.UtcNow);
    var sales = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, Counterparty = x.Customer.Name, x.InvoiceDate, x.CurrencyCode, x.GrandTotal }).ToListAsync();
    var collected = await db.CustomerCollectionAllocations.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.CustomerCollection.Status == CustomerCollectionStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var salesReturns = await db.SalesReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesReturnStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var purchases = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, Counterparty = x.Supplier.Name, x.InvoiceDate, x.CurrencyCode, x.GrandTotal }).ToListAsync();
    var paid = await db.SupplierPayments.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierPaymentStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var purchaseReturns = await db.SupplierReturns.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SupplierReturnStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var exchangeRates = await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision)
        .Select(x => new { x.CurrencyCode, x.RateDate, x.Rate }).ToListAsync();
    decimal? RateAt(string currencyCode, DateOnly date) => currencyCode == baseCurrency ? 1m
        : exchangeRates.FirstOrDefault(x => x.CurrencyCode == currencyCode && x.RateDate <= date)?.Rate;

    var open = sales.Select(x => (Direction: "Receivable", x.Id, x.Code, x.Counterparty, x.InvoiceDate, x.CurrencyCode,
            Outstanding: Math.Max(0m, x.GrandTotal - collected.GetValueOrDefault(x.Id) - salesReturns.GetValueOrDefault(x.Id))))
        .Concat(purchases.Select(x => (Direction: "Payable", x.Id, x.Code, x.Counterparty, x.InvoiceDate, x.CurrencyCode,
            Outstanding: Math.Max(0m, x.GrandTotal - paid.GetValueOrDefault(x.Id) - purchaseReturns.GetValueOrDefault(x.Id)))))
        .Where(x => x.Outstanding > 0).ToList();
    var lines = new List<FxExposureLineView>(open.Count);
    foreach (var invoice in open)
    {
        var historicalRate = RateAt(invoice.CurrencyCode, invoice.InvoiceDate);
        var currentRate = RateAt(invoice.CurrencyCode, asOf);
        decimal? historicalAmount = historicalRate is null ? null : decimal.Round(invoice.Outstanding * historicalRate.Value, 2, MidpointRounding.AwayFromZero);
        decimal? currentAmount = currentRate is null ? null : decimal.Round(invoice.Outstanding * currentRate.Value, 2, MidpointRounding.AwayFromZero);
        lines.Add(new FxExposureLineView(invoice.Direction, invoice.Id, invoice.Code, invoice.Counterparty,
            invoice.InvoiceDate, invoice.CurrencyCode, invoice.Outstanding, historicalRate, currentRate,
            historicalAmount, currentAmount, historicalAmount is null || currentAmount is null ? null : currentAmount - historicalAmount));
    }
    var orderedLines = lines.OrderBy(x => x.Direction).ThenBy(x => x.CurrencyCode).ThenBy(x => x.InvoiceCode).ToList();
    var summaries = orderedLines.GroupBy(x => new { x.Direction, x.CurrencyCode }).Select(group =>
    {
        var unconverted = group.Count(x => x.HistoricalBaseAmount is null || x.CurrentBaseAmount is null);
        return new FxExposureCurrencySummary(group.Key.Direction, group.Key.CurrencyCode, group.Count(), group.Sum(x => x.OutstandingAmount),
            unconverted == 0 ? group.Sum(x => x.HistoricalBaseAmount!.Value) : null,
            unconverted == 0 ? group.Sum(x => x.CurrentBaseAmount!.Value) : null,
            unconverted == 0 ? group.Sum(x => x.EstimatedChangeBase!.Value) : null, unconverted);
    }).OrderBy(x => x.Direction).ThenBy(x => x.CurrencyCode).ToList();
    return Results.Ok(new FxExposureReport(baseCurrency, asOf, summaries, orderedLines));
}).RequireAuthorization();

var financeAccounts = app.MapGroup("/api/finance/accounts").RequireAuthorization();
app.MapGet("/api/finance/maturities", async (DateOnly? asOfDate, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var asOf = asOfDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
    var sales = await db.SalesInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == SalesInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, x.Customer.Name, x.InvoiceDate, x.CurrencyCode, x.GrandTotal, PaymentTermDays = x.Customer.PaymentTermDays })
        .ToListAsync();
    var collected = await db.CustomerCollectionAllocations.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.CustomerCollection.Status == CustomerCollectionStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var salesReturns = await db.SalesReturns.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.Status == SalesReturnStatus.Posted)
        .GroupBy(x => x.SalesInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);

    var purchases = await db.PurchaseInvoices.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status == PurchaseInvoiceStatus.Posted)
        .Select(x => new { x.Id, x.Code, CounterpartyName = x.Supplier.Name, x.InvoiceDate, x.DueDate, x.CurrencyCode, x.GrandTotal })
        .ToListAsync();
    var paid = await db.SupplierPayments.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.Status == SupplierPaymentStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.Amount) }).ToDictionaryAsync(x => x.Id, x => x.Amount);
    var purchaseReturns = await db.SupplierReturns.AsNoTracking()
        .Where(x => x.TenantId == tenantId && x.Status == SupplierReturnStatus.Posted)
        .GroupBy(x => x.PurchaseInvoiceId).Select(g => new { Id = g.Key, Amount = g.Sum(x => x.GrandTotal) }).ToDictionaryAsync(x => x.Id, x => x.Amount);

    var rows = sales.Select(x =>
    {
        var dueDate = x.InvoiceDate.AddDays(x.PaymentTermDays);
        var outstanding = Math.Max(0m, x.GrandTotal - collected.GetValueOrDefault(x.Id) - salesReturns.GetValueOrDefault(x.Id));
        return new { direction = "Receivable", invoiceId = x.Id, invoiceCode = x.Code, counterpartyName = x.Name,
            invoiceDate = x.InvoiceDate, dueDate, currencyCode = x.CurrencyCode, originalAmount = x.GrandTotal,
            outstandingAmount = outstanding, daysOverdue = Math.Max(0, asOf.DayNumber - dueDate.DayNumber) };
    }).Where(x => x.outstandingAmount > 0)
      .Concat(purchases.Select(x =>
      {
          var outstanding = Math.Max(0m, x.GrandTotal - paid.GetValueOrDefault(x.Id) - purchaseReturns.GetValueOrDefault(x.Id));
          return new { direction = "Payable", invoiceId = x.Id, invoiceCode = x.Code, counterpartyName = x.CounterpartyName,
              invoiceDate = x.InvoiceDate, dueDate = x.DueDate, currencyCode = x.CurrencyCode, originalAmount = x.GrandTotal,
              outstandingAmount = outstanding, daysOverdue = Math.Max(0, asOf.DayNumber - x.DueDate.DayNumber) };
      }).Where(x => x.outstandingAmount > 0))
      .OrderByDescending(x => x.daysOverdue).ThenBy(x => x.dueDate).ThenBy(x => x.counterpartyName).ToList();
    var summaries = rows.GroupBy(x => new { x.direction, x.currencyCode }).Select(g => new
    {
        g.Key.direction, g.Key.currencyCode, invoiceCount = g.Count(), outstandingAmount = g.Sum(x => x.outstandingAmount),
        notDue = g.Where(x => x.daysOverdue == 0).Sum(x => x.outstandingAmount),
        days1To30 = g.Where(x => x.daysOverdue is >= 1 and <= 30).Sum(x => x.outstandingAmount),
        days31To60 = g.Where(x => x.daysOverdue is >= 31 and <= 60).Sum(x => x.outstandingAmount),
        days61To90 = g.Where(x => x.daysOverdue is >= 61 and <= 90).Sum(x => x.outstandingAmount),
        over90Days = g.Where(x => x.daysOverdue > 90).Sum(x => x.outstandingAmount)
    }).OrderBy(x => x.direction).ThenBy(x => x.currencyCode).ToList();
    return Results.Ok(new { asOfDate = asOf, summaries, items = rows });
});
financeAccounts.MapGet("/", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var accounts = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderBy(x => x.Type).ThenBy(x => x.Code)
        .Select(x => new FinancialAccountSummary(x.Id, x.Code, x.Name, x.Type, x.CurrencyCode, x.IsActive,
            x.Transactions.Sum(t => (decimal?)(t.Direction == FinancialDirection.Inflow ? t.Amount : -t.Amount)) ?? 0m,
            x.Transactions.Count, x.CreatedAt)).ToListAsync();
    return Results.Ok(accounts);
});
financeAccounts.MapPost("/", async (FinancialAccountWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = FinancialAccountValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var code = request.Code.Trim().ToUpperInvariant();
    if (await db.FinancialAccounts.AnyAsync(x => x.TenantId == tenantId && x.Code == code))
        return Results.Conflict(new { error = "Bu hesap kodu bu firma için zaten kullanılıyor." });
    var account = new FinancialAccount { TenantId = tenantId, Code = code, Name = request.Name.Trim(), Type = request.Type,
        CurrencyCode = request.CurrencyCode.Trim().ToUpperInvariant() };
    db.FinancialAccounts.Add(account);
    if (request.OpeningBalance != 0)
        db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account,
            CurrencyCode = account.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Direction = request.OpeningBalance > 0 ? FinancialDirection.Inflow : FinancialDirection.Outflow,
            Amount = Math.Abs(request.OpeningBalance), Description = "Açılış bakiyesi" });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-account.created", Resource = code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu hesap kodu bu firma için zaten kullanılıyor." }); }
    return Results.Created($"/api/finance/accounts/{account.Id}", new FinancialAccountSummary(account.Id, account.Code,
        account.Name, account.Type, account.CurrencyCode, account.IsActive, request.OpeningBalance,
        request.OpeningBalance == 0 ? 0 : 1, account.CreatedAt));
});
financeAccounts.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var account = await db.FinancialAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (account is null) return Results.NotFound();
    var rows = await db.FinancialAccountTransactions.AsNoTracking().Include(x => x.CustomerCollection).Include(x => x.SupplierPayment).Include(x => x.Transfer)
        .Where(x => x.TenantId == tenantId && x.FinancialAccountId == id).OrderByDescending(x => x.TransactionDate).ThenByDescending(x => x.CreatedAt).ToListAsync();
    var transactions = rows.Select(x => new FinancialAccountTransactionView(x.Id, x.TransactionDate, x.Direction, x.Amount,
        x.CurrencyCode, x.Description, x.Reference, x.ReversalOfId is not null ? "Ters kayıt" : x.CustomerCollectionId is not null ? "Tahsilat" : x.SupplierPaymentId is not null ? "Tedarikçi ödemesi" : x.TransferId is not null ? "Hesap transferi" : x.RequestId is not null ? "Manuel hareket" : x.Description == "Açılış bakiyesi" ? "Açılış bakiyesi" : null,
        x.CustomerCollection?.Code ?? x.SupplierPayment?.Code ?? x.Transfer?.Code, x.ReversalOfId, x.CreatedAt, x.TransferId)).ToList();
    var balance = rows.Sum(x => x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount);
    return Results.Ok(new FinancialAccountDetail(account.Id, account.Code, account.Name, account.Type, account.CurrencyCode,
        account.IsActive, balance, account.CreatedAt, transactions));
});
financeAccounts.MapPost("/{id:guid}/movements", async (Guid id, FinancialAccountMovementWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = FinancialMovementValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var description = request.Description.Trim();
    var reference = string.IsNullOrWhiteSpace(request.Reference) ? null : request.Reference.Trim();
    var prior = await db.FinancialAccountTransactions.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (prior is not null)
    {
        if (prior.FinancialAccountId != id || prior.TransactionDate != request.TransactionDate || prior.Direction != request.Direction || prior.Amount != request.Amount || prior.Description != description || prior.Reference != reference)
            return Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir finans hareketinde kullanıldı." });
        return Results.Ok(new FinancialAccountTransactionView(prior.Id, prior.TransactionDate, prior.Direction, prior.Amount,
            prior.CurrencyCode, prior.Description, prior.Reference, "Manuel hareket", null, prior.ReversalOfId, prior.CreatedAt));
    }
    await using var transaction = await db.Database.BeginTransactionAsync();
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (account is null) return Results.NotFound();
    if (!account.IsActive) return Results.Conflict(new { error = "Pasif hesaba hareket kaydedilemez." });
    if (request.Direction == FinancialDirection.Outflow && account.Type == FinancialAccountType.Cash)
    {
        var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == id)
            .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
        if (balance < request.Amount) return Results.Conflict(new { error = "Kasa bakiyesi manuel çıkış için yetersiz." });
    }
    var movement = new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account, CurrencyCode = account.CurrencyCode,
        TransactionDate = request.TransactionDate, Direction = request.Direction, Amount = request.Amount, Description = description,
        Reference = reference, RequestId = request.RequestId };
    db.FinancialAccountTransactions.Add(movement);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-account.movement-posted", Resource = account.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Bu tekrar gönderim anahtarı başka bir işlemde kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/accounts/{id}/transactions/{movement.Id}", new FinancialAccountTransactionView(movement.Id,
        movement.TransactionDate, movement.Direction, movement.Amount, movement.CurrencyCode, movement.Description, movement.Reference,
        "Manuel hareket", null, null, movement.CreatedAt));
});
financeAccounts.MapPost("/{id:guid}/transactions/{transactionId:guid}/void", async (Guid id, Guid transactionId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (account is null) return Results.NotFound();
    var original = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {transactionId} AND [FinancialAccountId] = {id}").SingleOrDefaultAsync();
    if (original is null) return Results.NotFound();
    if (original.RequestId is null || original.TransferId is not null || original.CustomerCollectionId is not null || original.SupplierPaymentId is not null)
        return Results.Conflict(new { error = "Yalnızca manuel finans hareketleri bu işlemle iptal edilebilir." });
    if (await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.ReversalOfId == original.Id))
        return Results.Conflict(new { error = "Finans hareketi daha önce iptal edilmiş." });
    var reverseDirection = original.Direction == FinancialDirection.Inflow ? FinancialDirection.Outflow : FinancialDirection.Inflow;
    if (reverseDirection == FinancialDirection.Outflow && account.Type == FinancialAccountType.Cash)
    {
        var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == id)
            .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
        if (balance < original.Amount) return Results.Conflict(new { error = "Kasa bakiyesi bu hareketi ters kayıtla iptal etmek için yetersiz." });
    }
    db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account,
        CurrencyCode = account.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow), Direction = reverseDirection,
        Amount = original.Amount, Description = $"Finans hareketi iptali {original.Id:N}", Reference = original.Reference, ReversalOfId = original.Id });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-account.movement-voided", Resource = account.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { original.Id, status = "Voided" });
});
financeAccounts.MapPost("/{id:guid}/status", async (Guid id, bool isActive, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (account is null) return Results.NotFound();
    if (account.IsActive == isActive) return Results.Ok(new { account.Id, account.IsActive });
    account.IsActive = isActive;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = isActive ? "financial-account.activated" : "financial-account.deactivated", Resource = account.Code });
    await db.SaveChangesAsync();
    return Results.Ok(new { account.Id, account.IsActive });
});

var financialTransfers = app.MapGroup("/api/finance/transfers").RequireAuthorization();
financialTransfers.MapGet("/", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var rows = await db.FinancialAccountTransfers.AsNoTracking().Where(x => x.TenantId == tenantId)
        .OrderByDescending(x => x.TransferDate).ThenByDescending(x => x.CreatedAt).Take(200).ToListAsync();
    var accountIds = rows.SelectMany(x => new[] { x.FromAccountId, x.ToAccountId }).Distinct().ToArray();
    var names = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && accountIds.Contains(x.Id))
        .ToDictionaryAsync(x => x.Id, x => x.Name);
    return Results.Ok(rows.Select(x => new FinancialAccountTransferSummary(x.Id, x.Code, x.FromAccountId, names[x.FromAccountId],
        x.ToAccountId, names[x.ToAccountId], x.CurrencyCode, x.TransferDate, x.Amount, x.Reference, x.Description, x.Status, x.CreatedAt,
        x.ToCurrencyCode, x.DestinationAmount, x.ExchangeRate)));
});
financialTransfers.MapPost("/", async (FinancialAccountTransferWriteRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = FinancialMovementValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var description = request.Description.Trim();
    var reference = string.IsNullOrWhiteSpace(request.Reference) ? null : request.Reference.Trim();
    var prior = await db.FinancialAccountTransfers.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (prior is not null)
    {
        if (prior.FromAccountId != request.FromAccountId || prior.ToAccountId != request.ToAccountId || prior.TransferDate != request.TransferDate || prior.Amount != request.Amount || prior.ExchangeRate != request.ExchangeRate || prior.Description != description || prior.Reference != reference)
            return Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir hesap transferinde kullanıldı." });
        var priorNames = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && (x.Id == prior.FromAccountId || x.Id == prior.ToAccountId)).ToDictionaryAsync(x => x.Id, x => x.Name);
        return Results.Ok(new FinancialAccountTransferSummary(prior.Id, prior.Code, prior.FromAccountId, priorNames[prior.FromAccountId],
            prior.ToAccountId, priorNames[prior.ToAccountId], prior.CurrencyCode, prior.TransferDate, prior.Amount, prior.Reference, prior.Description,
            prior.Status, prior.CreatedAt, prior.ToCurrencyCode, prior.DestinationAmount, prior.ExchangeRate));
    }
    await using var transaction = await db.Database.BeginTransactionAsync();
    FinancialAccount? fromAccount = null;
    FinancialAccount? toAccount = null;
    foreach (var accountId in new[] { request.FromAccountId, request.ToAccountId }.OrderBy(x => x))
    {
        var locked = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (accountId == request.FromAccountId) fromAccount = locked; else toAccount = locked;
    }
    if (fromAccount is null || toAccount is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["accountId"] = ["Kaynak veya hedef hesap bulunamadı."] });
    if (!fromAccount.IsActive || !toAccount.IsActive) return Results.Conflict(new { error = "Transfer için her iki hesap da aktif olmalıdır." });
    if (fromAccount.CurrencyCode == toAccount.CurrencyCode && request.ExchangeRate != 1m)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["exchangeRate"] = ["Aynı dövizli hesaplar arasında kur 1 olmalıdır."] });
    decimal destinationAmount;
    try { destinationAmount = decimal.Round(request.Amount * request.ExchangeRate, 2, MidpointRounding.AwayFromZero); }
    catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["exchangeRate"] = ["Hedef tutar decimal(18,2) sınırını aşıyor."] }); }
    if (destinationAmount <= 0 || destinationAmount > 9999999999999999.99m)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["exchangeRate"] = ["Kur sonucu oluşan hedef tutar sıfırdan büyük olmalı ve decimal(18,2) sınırını aşmamalıdır."] });
    if (fromAccount.Type == FinancialAccountType.Cash)
    {
        var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == fromAccount.Id)
            .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
        if (balance < request.Amount) return Results.Conflict(new { error = "Kaynak kasa bakiyesi transfer için yetersiz." });
    }
    var transfer = new FinancialAccountTransfer { TenantId = tenantId, RequestId = request.RequestId,
        Code = $"TR-{Guid.NewGuid():N}".ToUpperInvariant(), FromAccountId = fromAccount.Id, ToAccountId = toAccount.Id,
        CurrencyCode = fromAccount.CurrencyCode, ToCurrencyCode = toAccount.CurrencyCode, TransferDate = request.TransferDate,
        Amount = request.Amount, DestinationAmount = destinationAmount, ExchangeRate = request.ExchangeRate,
        Reference = reference, Description = description };
    db.FinancialAccountTransfers.Add(transfer);
    db.FinancialAccountTransactions.AddRange(
        new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = fromAccount, CurrencyCode = transfer.CurrencyCode,
            TransactionDate = transfer.TransferDate, Direction = FinancialDirection.Outflow, Amount = transfer.Amount,
            Description = transfer.Description, Reference = transfer.Reference, Transfer = transfer },
        new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = toAccount, CurrencyCode = transfer.ToCurrencyCode,
            TransactionDate = transfer.TransferDate, Direction = FinancialDirection.Inflow, Amount = transfer.DestinationAmount,
            Description = transfer.Description, Reference = transfer.Reference, Transfer = transfer });
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-transfer.posted", Resource = transfer.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Transfer tekrar gönderim anahtarı başka bir istekte kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/transfers/{transfer.Id}", new FinancialAccountTransferSummary(transfer.Id, transfer.Code,
        fromAccount.Id, fromAccount.Name, toAccount.Id, toAccount.Name, transfer.CurrencyCode, transfer.TransferDate,
        transfer.Amount, transfer.Reference, transfer.Description, transfer.Status, transfer.CreatedAt,
        transfer.ToCurrencyCode, transfer.DestinationAmount, transfer.ExchangeRate));
});
financialTransfers.MapPost("/{id:guid}/void", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var transfer = await db.FinancialAccountTransfers.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransfers] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (transfer is null) return Results.NotFound();
    if (transfer.Status != FinancialTransferStatus.Posted) return Results.Conflict(new { error = "Transfer daha önce iptal edilmiş." });
    var accounts = new Dictionary<Guid, FinancialAccount>();
    foreach (var accountId in new[] { transfer.FromAccountId, transfer.ToAccountId }.OrderBy(x => x))
    {
        var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {accountId}").SingleOrDefaultAsync();
        if (account is null) return Results.Conflict(new { error = "Transfer hesabı bulunamadı; iptal işlemi yapılamadı." });
        accounts[accountId] = account;
    }
    var originals = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [TransferId] = {transfer.Id}").ToListAsync();
    if (originals.Count != 2 || !originals.Any(x => x.FinancialAccountId == transfer.FromAccountId && x.CurrencyCode == transfer.CurrencyCode && x.Direction == FinancialDirection.Outflow && x.Amount == transfer.Amount)
        || !originals.Any(x => x.FinancialAccountId == transfer.ToAccountId && x.CurrencyCode == transfer.ToCurrencyCode && x.Direction == FinancialDirection.Inflow && x.Amount == transfer.DestinationAmount))
        return Results.Conflict(new { error = "Transfer finans hareketleri tutarsız; iptal işlemi durduruldu." });
    if (await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && originals.Select(m => m.Id).Contains(x.ReversalOfId ?? Guid.Empty)))
        return Results.Conflict(new { error = "Transfer hareketlerinden biri daha önce ters kayıtla iptal edilmiş." });
    var destination = accounts[transfer.ToAccountId];
    if (destination.Type == FinancialAccountType.Cash)
    {
        var balance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == destination.Id)
            .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
        if (balance < transfer.DestinationAmount) return Results.Conflict(new { error = "Hedef kasa bakiyesi transferi ters kayıtla iptal etmek için yetersiz." });
    }
    foreach (var movement in originals)
        db.FinancialAccountTransactions.Add(new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = accounts[movement.FinancialAccountId],
            CurrencyCode = movement.CurrencyCode, TransactionDate = DateOnly.FromDateTime(DateTime.UtcNow),
            Direction = movement.Direction == FinancialDirection.Inflow ? FinancialDirection.Outflow : FinancialDirection.Inflow,
            Amount = movement.Amount, Description = $"Transfer iptali {transfer.Code}", Reference = transfer.Reference, ReversalOfId = movement.Id });
    transfer.Status = FinancialTransferStatus.Voided;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "financial-transfer.voided", Resource = transfer.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { transfer.Id, transfer.Code, transfer.Status });
});

var bankStatements = app.MapGroup("/api/finance/statements").RequireAuthorization();
bankStatements.MapGet("/", async (ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var statements = await db.BankStatements.AsNoTracking().Include(x => x.Account).Where(x => x.TenantId == tenantId)
        .OrderByDescending(x => x.EndDate).ThenByDescending(x => x.CreatedAt).Take(200)
        .Select(x => new BankStatementSummary(x.Id, x.Code, x.AccountId, x.Account.Name, x.CurrencyCode, x.StartDate, x.EndDate,
            x.OpeningBalance, x.ClosingBalance, x.Lines.Count, x.Lines.Count(l => l.FinancialAccountTransactionId != null), x.Status, x.CreatedAt)).ToListAsync();
    return Results.Ok(statements);
});
bankStatements.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var statement = await db.BankStatements.AsNoTracking().Include(x => x.Account).Include(x => x.Lines)
        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (statement is null) return Results.NotFound();
    var lines = statement.Lines.OrderBy(x => x.LineNumber).Select(x => new BankStatementLineView(x.Id, x.LineNumber, x.ExternalId,
        x.TransactionDate, x.Direction, x.Amount, x.Description, x.Reference, x.FinancialAccountTransactionId, x.IsBookEntryCreated, x.MatchedAt)).ToList();
    return Results.Ok(new BankStatementDetail(statement.Id, statement.Code, statement.AccountId, statement.Account.Name,
        statement.CurrencyCode, statement.StartDate, statement.EndDate, statement.OpeningBalance, statement.ClosingBalance,
        statement.Status, statement.CreatedAt, lines));
});
bankStatements.MapGet("/{id:guid}/unmatched-book-movements", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var statement = await db.BankStatements.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id);
    if (statement is null) return Results.NotFound();
    var movements = await db.FinancialAccountTransactions.AsNoTracking().Include(x => x.CustomerCollection).Include(x => x.SupplierPayment).Include(x => x.Transfer)
        .Where(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.TransactionDate >= statement.StartDate && x.TransactionDate <= statement.EndDate && !db.BankStatementLines.Any(line => line.TenantId == tenantId && line.FinancialAccountTransactionId == x.Id))
        .OrderBy(x => x.TransactionDate).ThenBy(x => x.CreatedAt).Select(x => new BankStatementUnmatchedMovementView(x.Id, x.TransactionDate,
            x.Direction, x.Amount, x.CurrencyCode, x.Description, x.Reference,
            x.CustomerCollectionId != null ? "Tahsilat" : x.SupplierPaymentId != null ? "Tedarikçi ödemesi" : x.TransferId != null ? "Hesap transferi" : x.RequestId != null ? "Manuel hareket" : null,
            x.CustomerCollection!.Code ?? x.SupplierPayment!.Code ?? x.Transfer!.Code)).ToListAsync();
    return Results.Ok(movements);
});
financeAccounts.MapPost("/{id:guid}/statements", async (Guid id, BankStatementImportRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    var errors = BankStatementValidation.Validate(request);
    if (errors is not null) return Results.ValidationProblem(errors);
    var prior = await db.BankStatements.AsNoTracking().Include(x => x.Lines).SingleOrDefaultAsync(x => x.TenantId == tenantId && x.RequestId == request.RequestId);
    if (prior is not null)
    {
        var sameLines = prior.AccountId == id && prior.StartDate == request.StartDate && prior.EndDate == request.EndDate && prior.OpeningBalance == request.OpeningBalance && prior.ClosingBalance == request.ClosingBalance && prior.Lines.Count == request.Lines.Count;
        if (sameLines)
        {
            var oldLines = prior.Lines.OrderBy(x => x.LineNumber).ToArray();
            for (var i = 0; i < oldLines.Length; i++)
            {
                var input = request.Lines[i];
                if (oldLines[i].TransactionDate != input.TransactionDate || oldLines[i].Direction != (input.SignedAmount > 0 ? FinancialDirection.Inflow : FinancialDirection.Outflow) || oldLines[i].Amount != Math.Abs(input.SignedAmount) || oldLines[i].Description != input.Description.Trim() || oldLines[i].Reference != (string.IsNullOrWhiteSpace(input.Reference) ? null : input.Reference.Trim()) || oldLines[i].ExternalId != (string.IsNullOrWhiteSpace(input.ExternalId) ? null : input.ExternalId.Trim())) { sameLines = false; break; }
            }
        }
        if (!sameLines) return Results.Conflict(new { error = "Bu tekrar gönderim anahtarı farklı bir ekstre içe aktarımında kullanıldı." });
        var oldAccountName = await db.FinancialAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id).Select(x => x.Name).SingleAsync();
        return Results.Ok(new BankStatementSummary(prior.Id, prior.Code, prior.AccountId, oldAccountName, prior.CurrencyCode,
            prior.StartDate, prior.EndDate, prior.OpeningBalance, prior.ClosingBalance, prior.Lines.Count,
            prior.Lines.Count(x => x.FinancialAccountTransactionId != null), prior.Status, prior.CreatedAt));
    }
    await using var transaction = await db.Database.BeginTransactionAsync();
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (account is null) return Results.NotFound();
    if (account.Type != FinancialAccountType.Bank) return Results.Conflict(new { error = "Banka ekstresi yalnızca banka hesabına aktarılabilir." });
    if (!account.IsActive) return Results.Conflict(new { error = "Pasif banka hesabına ekstre aktarılamaz." });
    var overlapping = await db.BankStatements.AnyAsync(x => x.TenantId == tenantId && x.AccountId == account.Id && x.StartDate <= request.EndDate && x.EndDate >= request.StartDate);
    if (overlapping) return Results.Conflict(new { error = "Bu dönemle çakışan bir banka ekstresi zaten aktarılmış." });
    var statement = new BankStatement { TenantId = tenantId, Account = account, CurrencyCode = account.CurrencyCode,
        RequestId = request.RequestId, Code = $"BS-{Guid.NewGuid():N}".ToUpperInvariant(), StartDate = request.StartDate,
        EndDate = request.EndDate, OpeningBalance = request.OpeningBalance, ClosingBalance = request.ClosingBalance };
    for (var i = 0; i < request.Lines.Count; i++)
    {
        var input = request.Lines[i];
        statement.Lines.Add(new BankStatementLine { TenantId = tenantId, Statement = statement, FinancialAccountId = account.Id,
            CurrencyCode = account.CurrencyCode, LineNumber = i + 1, ExternalId = string.IsNullOrWhiteSpace(input.ExternalId) ? null : input.ExternalId.Trim(),
            TransactionDate = input.TransactionDate, Direction = input.SignedAmount > 0 ? FinancialDirection.Inflow : FinancialDirection.Outflow,
            Amount = Math.Abs(input.SignedAmount), Description = input.Description.Trim(), Reference = string.IsNullOrWhiteSpace(input.Reference) ? null : input.Reference.Trim() });
    }
    db.BankStatements.Add(statement);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.imported", Resource = statement.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Ekstre dönem veya satır kimlikleri başka bir kayıtta kullanıldı." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/statements/{statement.Id}", new BankStatementSummary(statement.Id, statement.Code,
        account.Id, account.Name, account.CurrencyCode, statement.StartDate, statement.EndDate, statement.OpeningBalance,
        statement.ClosingBalance, statement.Lines.Count, 0, statement.Status, statement.CreatedAt));
});
bankStatements.MapPost("/{id:guid}/auto-match", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var statement = await db.BankStatements.FromSqlInterpolated($"SELECT * FROM [dbo].[BankStatements] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (statement is null) return Results.NotFound();
    if (statement.Status != BankStatementStatus.Imported) return Results.Conflict(new { error = "Mutabakatı tamamlanmış ekstre değiştirilemez." });
    var lines = await db.BankStatementLines.Where(x => x.TenantId == tenantId && x.StatementId == id && x.FinancialAccountTransactionId == null).OrderBy(x => x.LineNumber).ToListAsync();
    var claimed = new HashSet<Guid>();
    var matched = 0;
    var ambiguous = 0;
    foreach (var line in lines)
    {
        var candidates = await db.FinancialAccountTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.CurrencyCode == statement.CurrencyCode && x.TransactionDate == line.TransactionDate && x.Direction == line.Direction && x.Amount == line.Amount && !db.BankStatementLines.Any(l => l.TenantId == tenantId && l.FinancialAccountTransactionId == x.Id))
            .OrderBy(x => x.CreatedAt).ThenBy(x => x.Id).Take(2).Select(x => x.Id).ToListAsync();
        if (candidates.Count == 1 && claimed.Add(candidates[0]))
        {
            line.FinancialAccountTransactionId = candidates[0]; line.MatchedAt = DateTimeOffset.UtcNow; matched++;
        }
        else if (candidates.Count > 1) ambiguous++;
    }
    if (matched > 0)
    {
        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.auto-matched", Resource = statement.Code });
        await db.SaveChangesAsync();
    }
    await transaction.CommitAsync();
    var remaining = await db.BankStatementLines.CountAsync(x => x.TenantId == tenantId && x.StatementId == id && x.FinancialAccountTransactionId == null);
    return Results.Ok(new { matched, remaining, ambiguous });
});
bankStatements.MapPost("/{id:guid}/lines/{lineId:guid}/match", async (Guid id, Guid lineId, BankStatementMatchRequest request, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var statement = await db.BankStatements.FromSqlInterpolated($"SELECT * FROM [dbo].[BankStatements] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (statement is null) return Results.NotFound();
    if (statement.Status != BankStatementStatus.Imported) return Results.Conflict(new { error = "Mutabakatı tamamlanmış ekstre değiştirilemez." });
    var line = await db.BankStatementLines.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StatementId == id && x.Id == lineId);
    if (line is null) return Results.NotFound();
    if (line.FinancialAccountTransactionId is not null) return Results.Conflict(new { error = "Ekstre satırı zaten bir finans hareketiyle eşleştirilmiş." });
    var movement = await db.FinancialAccountTransactions.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccountTransactions] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {request.FinancialAccountTransactionId}").SingleOrDefaultAsync();
    if (movement is null || movement.FinancialAccountId != statement.AccountId || movement.CurrencyCode != statement.CurrencyCode || movement.TransactionDate != line.TransactionDate || movement.Direction != line.Direction || movement.Amount != line.Amount)
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["financialAccountTransactionId"] = ["Seçilen hareket hesap, tarih, yön ve tutar bakımından ekstre satırıyla eşleşmiyor."] });
    if (await db.BankStatementLines.AnyAsync(x => x.TenantId == tenantId && x.FinancialAccountTransactionId == movement.Id))
        return Results.Conflict(new { error = "Bu finans hareketi başka bir ekstre satırına bağlanmış." });
    line.FinancialAccountTransactionId = movement.Id; line.MatchedAt = DateTimeOffset.UtcNow;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.line-matched", Resource = statement.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Finans hareketi eşzamanlı olarak başka bir ekstre satırına bağlandı." }); }
    await transaction.CommitAsync();
    return Results.Ok(new { line.Id, line.FinancialAccountTransactionId, line.MatchedAt });
});
bankStatements.MapPost("/{id:guid}/lines/{lineId:guid}/create-book-entry", async (Guid id, Guid lineId, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var statement = await db.BankStatements.FromSqlInterpolated($"SELECT * FROM [dbo].[BankStatements] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (statement is null) return Results.NotFound();
    if (statement.Status != BankStatementStatus.Imported) return Results.Conflict(new { error = "Mutabakatı tamamlanmış ekstre değiştirilemez." });
    var line = await db.BankStatementLines.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.StatementId == id && x.Id == lineId);
    if (line is null) return Results.NotFound();
    if (line.FinancialAccountTransactionId is not null) return Results.Conflict(new { error = "Ekstre satırı zaten bir finans hareketine bağlanmış." });
    var account = await db.FinancialAccounts.FromSqlInterpolated($"SELECT * FROM [dbo].[FinancialAccounts] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {statement.AccountId}").SingleOrDefaultAsync();
    if (account is null || account.Type != FinancialAccountType.Bank) return Results.Conflict(new { error = "Ekstre banka hesabı bulunamadı." });
    var movement = new FinancialAccountTransaction { TenantId = tenantId, FinancialAccount = account, CurrencyCode = statement.CurrencyCode,
        TransactionDate = line.TransactionDate, Direction = line.Direction, Amount = line.Amount,
        Description = $"Ekstre {statement.Code}: {line.Description}", Reference = line.Reference, RequestId = line.Id };
    line.FinancialAccountTransaction = movement; line.IsBookEntryCreated = true; line.MatchedAt = DateTimeOffset.UtcNow;
    db.FinancialAccountTransactions.Add(movement);
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.book-entry-created", Resource = statement.Code });
    try { await db.SaveChangesAsync(); }
    catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Ekstre satırı için finans hareketi zaten oluşturulmuş." }); }
    await transaction.CommitAsync();
    return Results.Created($"/api/finance/accounts/{account.Id}/transactions/{movement.Id}", new { LineId = line.Id, TransactionId = movement.Id, line.IsBookEntryCreated, line.MatchedAt });
});
bankStatements.MapPost("/{id:guid}/reconcile", async (Guid id, ClaimsPrincipal principal, PlatformDbContext db) =>
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var statement = await db.BankStatements.FromSqlInterpolated($"SELECT * FROM [dbo].[BankStatements] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (statement is null) return Results.NotFound();
    if (statement.Status != BankStatementStatus.Imported) return Results.Conflict(new { error = "Ekstre mutabakatı daha önce tamamlandı." });
    if (await db.BankStatementLines.AnyAsync(x => x.TenantId == tenantId && x.StatementId == id && x.FinancialAccountTransactionId == null))
        return Results.Conflict(new { error = "Eşleşmemiş ekstre satırları var." });
    var hasUnmatchedBookEntries = await db.FinancialAccountTransactions.AnyAsync(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.TransactionDate >= statement.StartDate && x.TransactionDate <= statement.EndDate && !db.BankStatementLines.Any(l => l.TenantId == tenantId && l.FinancialAccountTransactionId == x.Id));
    if (hasUnmatchedBookEntries) return Results.Conflict(new { error = "Ekstre döneminde bankada bulunmayan kayıtlı finans hareketleri var." });
    var openingBalance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.TransactionDate < statement.StartDate)
        .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
    var closingBalance = await db.FinancialAccountTransactions.Where(x => x.TenantId == tenantId && x.FinancialAccountId == statement.AccountId && x.TransactionDate <= statement.EndDate)
        .SumAsync(x => (decimal?)(x.Direction == FinancialDirection.Inflow ? x.Amount : -x.Amount)) ?? 0m;
    if (openingBalance != statement.OpeningBalance || closingBalance != statement.ClosingBalance)
        return Results.Conflict(new { error = "Ekstre açılış veya kapanış bakiyesi finans defteriyle eşleşmiyor.", bookOpeningBalance = openingBalance, bookClosingBalance = closingBalance });
    statement.Status = BankStatementStatus.Reconciled;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = "bank-statement.reconciled", Resource = statement.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    return Results.Ok(new { statement.Id, statement.Code, statement.Status, statement.OpeningBalance, statement.ClosingBalance });
});

app.Run();

static bool TryNormalizePurchaseRequestFields(IReadOnlyDictionary<string, string?>? rawValues,
    IReadOnlyCollection<PurchaseRequestCustomFieldDefinition> definitions,
    out Dictionary<Guid, (PurchaseRequestCustomFieldDefinition Definition, string Value)> normalized,
    out Dictionary<string, string[]> errors)
{
    normalized = new Dictionary<Guid, (PurchaseRequestCustomFieldDefinition, string)>();
    errors = new Dictionary<string, string[]>();
    if (rawValues is { Count: > 40 }) errors["customFields"] = ["En fazla 40 özel alan gönderilebilir."];
    var byCode = definitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
    if (rawValues is not null)
    {
        foreach (var (code, rawValue) in rawValues)
        {
            if (string.IsNullOrWhiteSpace(code) || !byCode.TryGetValue(code, out var definition))
            {
                errors[$"customFields.{code}"] = ["Alan kodu bu tenant içinde etkin değil."];
                continue;
            }
            if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, rawValue, out var value))
            {
                errors[$"customFields.{code}"] = [$"'{definition.Label}' alanı veri türüne veya uzunluk sınırına uymuyor."];
                continue;
            }
            if (value.Length > 0) normalized[definition.Id] = (definition, value);
        }
    }
    PurchaseRequestCustomFieldDefinition? missing = null;
    foreach (var definition in definitions)
        if (definition.IsRequired && !normalized.ContainsKey(definition.Id)) { missing = definition; break; }
    if (missing is not null) errors[$"customFields.{missing.Code}"] = [$"'{missing.Label}' alanı zorunludur."];
    return errors.Count == 0;
}

static PurchaseRequestCustomFieldDefinitionRevision ToPurchaseRequestCustomFieldRevision(PurchaseRequestCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId, DefinitionId = definition.Id, Version = definition.Version, Code = definition.Code, Label = definition.Label,
    DataType = definition.DataType, MaxLength = definition.MaxLength, IsRequired = definition.IsRequired, IsActive = definition.IsActive,
    ChangeKind = changeKind, ChangedByUserId = userId
};

static CustomerCustomFieldDefinitionRevision ToCustomerCustomFieldRevision(CustomerCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId,
    DefinitionId = definition.Id,
    Version = definition.Version,
    Code = definition.Code,
    Label = definition.Label,
    DataType = definition.DataType,
    MaxLength = definition.MaxLength,
    IsRequired = definition.IsRequired,
    IsActive = definition.IsActive,
    ChangeKind = changeKind,
    ChangedByUserId = userId
};

static StockItemCustomFieldDefinitionRevision ToStockCustomFieldRevision(StockItemCustomFieldDefinition definition, Guid? userId, string changeKind) => new()
{
    TenantId = definition.TenantId,
    DefinitionId = definition.Id,
    Version = definition.Version,
    Code = definition.Code,
    Label = definition.Label,
    DataType = definition.DataType,
    MaxLength = definition.MaxLength,
    IsRequired = definition.IsRequired,
    IsActive = definition.IsActive,
    ChangeKind = changeKind,
    ChangedByUserId = userId
};

static async Task<IResult> UpdateSalesQuoteStatusAsync(Guid id, SalesQuoteStatus target, ClaimsPrincipal principal, PlatformDbContext db)
{
    if (!TryGetTenantId(principal, out var tenantId)) return Results.Forbid();
    await using var transaction = await db.Database.BeginTransactionAsync();
    var quote = await db.SalesQuotes.FromSqlInterpolated($"SELECT * FROM [dbo].[SalesQuotes] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync();
    if (quote is null) return Results.NotFound();
    if (!SalesQuoteWorkflow.CanTransition(quote.Status, target)) return Results.Conflict(new { error = "Teklif durumu bu işlem için uygun değil." });
    if (target == SalesQuoteStatus.Accepted && quote.ValidUntil < DateOnly.FromDateTime(DateTime.UtcNow))
        return Results.Conflict(new { error = "Geçerlilik tarihi geçmiş teklif kabul edilemez." });
    quote.Status = target;
    db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = GetUserId(principal), Action = target == SalesQuoteStatus.Accepted ? "sales-quote.accepted" : "sales-quote.rejected", Resource = quote.Code });
    await db.SaveChangesAsync(); await transaction.CommitAsync();
    var customerName = await db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == quote.CustomerId).Select(x => x.Name).SingleAsync();
    var lineCount = await db.SalesQuoteLines.CountAsync(x => x.TenantId == tenantId && x.QuoteId == quote.Id);
    var hasSalesOrder = await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.QuoteId == quote.Id);
    return Results.Ok(new SalesQuoteSummary(quote.Id, quote.Code, quote.CustomerId, customerName, quote.QuoteDate, quote.ValidUntil,
        quote.CurrencyCode, quote.Status, quote.GrandTotal, lineCount, quote.CreatedAt, hasSalesOrder));
}

static async Task SeedBootstrapUserAsync(PlatformDbContext db, IConfiguration c)
{
    var email = c["Bootstrap:Email"]?.Trim().ToLowerInvariant(); var password = c["Bootstrap:Password"];
    if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password) || await db.Users.AnyAsync()) return;
    var tenant = new Tenant { Name = c["Bootstrap:TenantName"] ?? "Nexora Demo", Slug = "nexora-demo" };
    var user = new AppUser { Email = email, DisplayName = c["Bootstrap:DisplayName"] ?? "Platform Admin", PasswordHash = PasswordHashing.Hash(password) };
    db.AddRange(tenant, user); db.TenantMemberships.Add(new TenantMembership { User = user, Tenant = tenant, Role = "TenantAdmin" }); await db.SaveChangesAsync();
}
static async Task BaselineEnsureCreatedDatabaseAsync(PlatformDbContext db)
{
    // Phase 1 used EnsureCreated before migrations existed. Adopt that exact schema
    // without dropping data, so future migrations can evolve the same database.
    try { await db.Database.OpenConnectionAsync(); }
    catch (SqlException ex) when (ex.Number == 4060) { return; } // Database does not exist yet; Migrate creates it.
    try
    {
        await db.Database.ExecuteSqlRawAsync("""
        IF OBJECT_ID(N'[dbo].[Users]', N'U') IS NOT NULL
           AND OBJECT_ID(N'[dbo].[__EFMigrationsHistory]', N'U') IS NULL
        BEGIN
            CREATE TABLE [dbo].[__EFMigrationsHistory] (
                [MigrationId] nvarchar(150) NOT NULL,
                [ProductVersion] nvarchar(32) NOT NULL,
                CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
            );
            INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
            VALUES (N'20261014203054_InitialPlatformSchema', N'10.0.13');
        END
        """);
    }
    finally { await db.Database.CloseConnectionAsync(); }
}
static bool TryGetTenantId(ClaimsPrincipal principal, out Guid tenantId) => Guid.TryParse(principal.FindFirstValue("tenant_id"), out tenantId);
static Guid? GetUserId(ClaimsPrincipal principal) => Guid.TryParse(principal.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;
static async Task<decimal?> GetWeightedAverageUnitCostBaseAsync(PlatformDbContext db, Guid tenantId, Guid stockItemId, DateOnly asOfDate)
{
    var totals = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == stockItemId && x.EntryDate <= asOfDate)
        .GroupBy(_ => 1).Select(g => new
        {
            OnHand = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
            Unvalued = g.Sum(x => (decimal?)(x.UnitCostBase == null ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m)) ?? 0m,
            Value = g.Sum(x => (decimal?)(x.UnitCostBase == null ? 0m : (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) * x.UnitCostBase.Value)) ?? 0m
        }).SingleOrDefaultAsync();
    if (totals is null || totals.OnHand <= 0m || totals.Unvalued > 0m) return null;
    return decimal.Round(totals.Value / totals.OnHand, 8, MidpointRounding.AwayFromZero);
}
static async Task<decimal?> GetTenantRateAsync(PlatformDbContext db, Guid tenantId, string currencyCode, DateOnly rateDate)
{
    var baseCurrency = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync();
    if (currencyCode == baseCurrency) return 1m;
    return await db.TenantExchangeRates.AsNoTracking().Where(x => x.TenantId == tenantId && x.CurrencyCode == currencyCode && x.RateDate <= rateDate)
        .OrderByDescending(x => x.RateDate).ThenByDescending(x => x.Revision).Select(x => (decimal?)x.Rate).FirstOrDefaultAsync();
}
static string? NormalizeTaxNumber(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
static CustomerAddressView ToAddressView(CustomerAddress x) => new(x.Id, x.Kind, x.Label, x.AddressLine, x.City, x.District, x.PostalCode, x.CountryCode, x.IsDefault, x.IsActive);
static bool IsUniqueViolation(DbUpdateException exception) => exception.InnerException is SqlException { Number: 2601 or 2627 };
internal sealed record LoginRequest(string Email, string Password);
internal sealed record SelectTenantRequest(Guid TenantId);
internal static class TokenIssuer
{
    public static string Issue(IEnumerable<Claim> claims, IConfiguration c)
    {
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(c["Authentication:SigningKey"]!));
        var token = new JwtSecurityToken(c["Authentication:Issuer"] ?? "AIERP", c["Authentication:Audience"] ?? "AIERP", claims,
            DateTime.UtcNow.AddSeconds(-10), DateTime.UtcNow.AddMinutes(30), new SigningCredentials(key, SecurityAlgorithms.HmacSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
internal static class PasswordHashing
{
    private const int Iterations = 210_000;
    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16); var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, 32);
        return $"v1.{Iterations}.{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }
    public static bool Verify(string password, string encoded)
    {
        try
        {
            var p = encoded.Split('.'); if (p.Length != 4 || p[0] != "v1" || !int.TryParse(p[1], out var n)) return false;
            var expected = Convert.FromBase64String(p[3]); var actual = Rfc2898DeriveBytes.Pbkdf2(password, Convert.FromBase64String(p[2]), n, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException) { return false; }
    }
}
