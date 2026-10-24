using System.Security.Claims;
using System.Data;
using System.Text.RegularExpressions;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal static partial class OperationalProjectEndpoints
{
    public static void MapOperationalProjectEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/projects").WithTags("Projeler · Operasyon").RequireAuthorization();
        group.MapGet("/", async (string? search, string? status, string? taskCompletion, bool? overdueOnly, int? upcomingWithinDays, int? timeEntryDays, int page, int pageSize, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
            if (page < 1 || pageSize is < 1 or > 100) return Results.BadRequest(new { error = "Sayfa 1’den, sayfa boyutu 1–100 arasında olmalıdır." });
            if (!string.IsNullOrWhiteSpace(taskCompletion) && taskCompletion is not ("has-open" or "all-complete" or "no-tasks")) return Results.BadRequest(new { error = "Görev filtresi geçersiz." });
            if (upcomingWithinDays is < 1 or > 365) return Results.BadRequest(new { error = "Yaklaşan tarih aralığı 1–365 gün arasında olmalıdır." });
            if (timeEntryDays is not (null or 7 or 30 or 90)) return Results.BadRequest(new { error = "Süre kaydı dönemi geçersiz." });
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var upcomingThrough = upcomingWithinDays.HasValue ? today.AddDays(upcomingWithinDays.Value) : (DateOnly?)null;
            var timeSince = timeEntryDays.HasValue ? today.AddDays(-timeEntryDays.Value) : (DateOnly?)null;
            var query = db.OperationalProjects.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(search))
            {
                var term = search.Trim();
                query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term));
            }
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<OperationalProjectStatus>(status, true, out var parsed) || !Enum.IsDefined(parsed)) return Results.BadRequest(new { error = "Proje durumu geçersiz." });
                query = query.Where(x => x.Status == parsed);
            }
            var tasks = db.OperationalProjectTasks.AsNoTracking().Where(t => t.TenantId == tenantId);
            var openTasks = tasks.Where(t => t.Status == ProjectTaskStatus.Open || t.Status == ProjectTaskStatus.InProgress || t.Status == ProjectTaskStatus.Blocked);
            if (taskCompletion == "has-open") query = query.Where(p => openTasks.Any(t => t.ProjectId == p.Id));
            else if (taskCompletion == "all-complete") query = query.Where(p => tasks.Any(t => t.ProjectId == p.Id) && !tasks.Any(t => t.ProjectId == p.Id && t.Status != ProjectTaskStatus.Completed));
            else if (taskCompletion == "no-tasks") query = query.Where(p => !tasks.Any(t => t.ProjectId == p.Id));
            if (overdueOnly == true) query = query.Where(p => openTasks.Any(t => t.ProjectId == p.Id && t.EndDate.HasValue && t.EndDate < today));
            if (upcomingThrough.HasValue)
            {
                var through = upcomingThrough.Value;
                query = query.Where(p => (p.Status != OperationalProjectStatus.Completed && p.Status != OperationalProjectStatus.Cancelled && p.EndDate >= today && p.EndDate <= through) || tasks.Any(t => t.ProjectId == p.Id && (t.Status == ProjectTaskStatus.Open || t.Status == ProjectTaskStatus.InProgress || t.Status == ProjectTaskStatus.Blocked) && t.EndDate >= today && t.EndDate <= through));
            }
            if (timeSince.HasValue)
            {
                var since = timeSince.Value;
                var timeRows = db.OperationalProjectTimeEntries.AsNoTracking().Where(t => t.TenantId == tenantId && t.WorkDate >= since);
                if (role != "TenantAdmin") timeRows = timeRows.Where(t => t.UserId == userId);
                query = query.Where(p => timeRows.Any(t => t.ProjectId == p.Id));
            }
            var total = await query.CountAsync(ct);
            var items = await query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.Code).Skip((page - 1) * pageSize).Take(pageSize)
                .Select(x => new ProjectSummary(x.Id, x.Code, x.Name, x.CustomerAccountId, x.StartDate, x.EndDate, x.Status.ToString(), x.BudgetAmount, x.CurrencyCode,
                    x.CreatedAt, x.UpdatedAt, db.OperationalProjectTasks.Count(t => t.TenantId == tenantId && t.ProjectId == x.Id),
                    db.OperationalProjectResourceAllocations.Where(a => a.TenantId == tenantId && a.ProjectId == x.Id).Sum(a => (decimal?)a.PlannedHours) ?? 0,
                    db.OperationalProjectTimeEntries.Where(t => t.TenantId == tenantId && t.ProjectId == x.Id && (role == "TenantAdmin" || t.UserId == userId)).Sum(t => (decimal?)t.Hours) ?? 0,
                    db.OperationalProjectTasks.Count(t => t.TenantId == tenantId && t.ProjectId == x.Id && t.Status == ProjectTaskStatus.Completed),
                    db.OperationalProjectTasks.Count(t => t.TenantId == tenantId && t.ProjectId == x.Id && (t.Status == ProjectTaskStatus.Open || t.Status == ProjectTaskStatus.InProgress || t.Status == ProjectTaskStatus.Blocked) && t.EndDate.HasValue && t.EndDate < today),
                    db.OperationalProjectTasks.Where(t => t.TenantId == tenantId && t.ProjectId == x.Id && (t.Status == ProjectTaskStatus.Open || t.Status == ProjectTaskStatus.InProgress || t.Status == ProjectTaskStatus.Blocked) && t.EndDate >= today).Min(t => (DateOnly?)t.EndDate),
                    db.OperationalProjectTimeEntries.Count(t => t.TenantId == tenantId && t.ProjectId == x.Id && (role == "TenantAdmin" || t.UserId == userId)),
                    db.OperationalProjectTimeEntries.Where(t => t.TenantId == tenantId && t.ProjectId == x.Id && (role == "TenantAdmin" || t.UserId == userId)).Max(t => (DateOnly?)t.WorkDate)))
                .ToListAsync(ct);
            return Results.Ok(new { items, page, pageSize, total });
        });
        group.MapGet("/dashboard-summary", async (int? timeEntryDays, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
            if (timeEntryDays is not (null or 7 or 30 or 90)) return Results.BadRequest(new { error = "Süre kaydı dönemi geçersiz." });
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            var projects = db.OperationalProjects.AsNoTracking().Where(x => x.TenantId == tenantId);
            var tasks = db.OperationalProjectTasks.AsNoTracking().Where(x => x.TenantId == tenantId);
            var openTasks = tasks.Where(x => x.Status == ProjectTaskStatus.Open || x.Status == ProjectTaskStatus.InProgress || x.Status == ProjectTaskStatus.Blocked);
            var entries = db.OperationalProjectTimeEntries.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (role != "TenantAdmin") entries = entries.Where(x => x.UserId == userId);
            if (timeEntryDays.HasValue) entries = entries.Where(x => x.WorkDate >= today.AddDays(-timeEntryDays.Value));
            return Results.Ok(new ProjectDashboardSummary(
                await projects.CountAsync(ct),
                await projects.CountAsync(x => x.Status == OperationalProjectStatus.Active, ct),
                await tasks.CountAsync(ct),
                await tasks.CountAsync(x => x.Status == ProjectTaskStatus.Completed, ct),
                await openTasks.CountAsync(x => x.EndDate.HasValue && x.EndDate < today, ct),
                await projects.CountAsync(x => x.EndDate >= today && x.EndDate <= today.AddDays(30), ct),
                await entries.SumAsync(x => (decimal?)x.Hours, ct) ?? 0,
                await entries.CountAsync(ct)));
        });
        group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
            var project = await db.OperationalProjects.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (project is null) return Results.NotFound();
            var tasks = await db.OperationalProjectTasks.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == id)
                .OrderBy(x => x.StartDate).ThenBy(x => x.Code).Select(x => ToTask(x)).ToListAsync(ct);
            var allocations = await db.OperationalProjectResourceAllocations.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == id)
                .OrderByDescending(x => x.CreatedAt).Select(x => ToAllocation(x)).ToListAsync(ct);
            var timeQuery = db.OperationalProjectTimeEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == id);
            if (role != "TenantAdmin") timeQuery = timeQuery.Where(x => x.UserId == userId);
            var timeEntries = await timeQuery.OrderByDescending(x => x.WorkDate).ThenByDescending(x => x.CreatedAt).Take(200)
                .Select(x => ToTimeEntry(x)).ToListAsync(ct);
            return Results.Ok(new ProjectDetail(ToProject(project), tasks, allocations, timeEntries));
        });
        group.MapGet("/{id:guid}/cost-summary", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenantId, out var userId, out var role)) return Results.Forbid();
            var project = await db.OperationalProjects.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (project is null) return Results.NotFound();
            var plannedGroups = await db.OperationalProjectResourceAllocations.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ProjectId == id)
                .GroupBy(x => x.CurrencyCode)
                .Select(g => new
                {
                    CurrencyCode = g.Key,
                    AllocatedHours = g.Sum(x => x.PlannedHours),
                    PricedHours = g.Sum(x => x.PlannedHourlyCost.HasValue ? x.PlannedHours : 0m),
                    UnpricedHours = g.Sum(x => x.PlannedHourlyCost.HasValue ? 0m : x.PlannedHours),
                    PlannedCost = g.Sum(x => x.PlannedHourlyCost.GetValueOrDefault() * x.PlannedHours),
                    AllocationCount = g.Count()
                }).ToListAsync(ct);
            var planned = plannedGroups.OrderBy(x => x.CurrencyCode)
                .Select(x => new PlannedProjectCostCurrencyView(x.CurrencyCode, x.AllocatedHours, x.PricedHours, x.UnpricedHours, x.PlannedCost, x.AllocationCount)).ToArray();
            var timeQuery = db.OperationalProjectTimeEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.ProjectId == id);
            if (role != "TenantAdmin") timeQuery = timeQuery.Where(x => x.UserId == userId);
            var actualHours = await timeQuery.SumAsync(x => (decimal?)x.Hours, ct) ?? 0;
            var actualEntries = await timeQuery.CountAsync(ct);
            return Results.Ok(new ProjectCostReportView(
                project.Id, project.Code, project.Name, project.Status.ToString(), project.BudgetAmount, project.CurrencyCode,
                planned, actualHours, actualEntries, null,
                "Süre kayıtlarında saatlik ücret veya personele bağlı maliyet bulunmuyor; gerçekleşen işçilik maliyeti ve faturalandırılabilir tutar hesaplanmadı. Plan maliyetleri ayrı para birimlerinde gösterilir."));
        });
        group.MapPost("/", async (OperationalProjectWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdmin(user, out var tenantId, out var userId)) return Results.Forbid();
            var errors = Validate(request);
            if (errors is not null) return Results.ValidationProblem(errors);
            var code = request.Code!.Trim().ToUpperInvariant();
            if (await db.OperationalProjects.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct)) return Results.Conflict(new { error = "Proje kodu firma içinde zaten kullanılıyor." });
            if (request.CustomerAccountId.HasValue && !await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == request.CustomerAccountId.Value && x.Type != CounterpartyType.Supplier, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerAccountId"] = ["Müşteri hesabı bulunamadı veya bu firmaya ait değil."] });
            var now = DateTimeOffset.UtcNow;
            var row = new OperationalProject { TenantId = tenantId, Code = code, Name = request.Name!.Trim(), CustomerAccountId = request.CustomerAccountId,
                StartDate = request.StartDate, EndDate = request.EndDate, Status = OperationalProjectStatus.Draft, BudgetAmount = decimal.Round(request.BudgetAmount, 2),
                CurrencyCode = request.CurrencyCode!.Trim().ToUpperInvariant(), Notes = Clean(request.Notes), CreatedByUserId = userId, UpdatedByUserId = userId, CreatedAt = now, UpdatedAt = now };
            db.OperationalProjects.Add(row); Audit(db, tenantId, userId, "project.created", $"{row.Id}:{row.Code}");
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Proje kodu firma içinde zaten kullanılıyor." }); }
            return Results.Created($"/api/projects/{row.Id}", ToProject(row));
        });
        group.MapPut("/{id:guid}", async (Guid id, OperationalProjectWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdmin(user, out var tenantId, out var userId)) return Results.Forbid();
            var errors = Validate(request);
            if (errors is not null) return Results.ValidationProblem(errors);
            var row = await db.OperationalProjects.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (row is null) return Results.NotFound();
            if (row.Status is OperationalProjectStatus.Completed or OperationalProjectStatus.Cancelled) return Results.Conflict(new { error = "Tamamlanan veya iptal edilen proje düzenlenemez." });
            var code = request.Code!.Trim().ToUpperInvariant();
            if (await db.OperationalProjects.AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.Code == code, ct)) return Results.Conflict(new { error = "Proje kodu firma içinde zaten kullanılıyor." });
            if (request.CustomerAccountId.HasValue && !await db.CustomerAccounts.AnyAsync(x => x.TenantId == tenantId && x.Id == request.CustomerAccountId.Value && x.Type != CounterpartyType.Supplier, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["customerAccountId"] = ["Müşteri hesabı bulunamadı veya bu firmaya ait değil."] });
            row.Code = code; row.Name = request.Name!.Trim(); row.CustomerAccountId = request.CustomerAccountId; row.StartDate = request.StartDate; row.EndDate = request.EndDate;
            row.BudgetAmount = decimal.Round(request.BudgetAmount, 2); row.CurrencyCode = request.CurrencyCode!.Trim().ToUpperInvariant(); row.Notes = Clean(request.Notes);
            row.UpdatedByUserId = userId; row.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, tenantId, userId, "project.updated", $"{row.Id}:{row.Code}"); await db.SaveChangesAsync(ct);
            return Results.Ok(ToProject(row));
        });
        group.MapPost("/{id:guid}/status", async (Guid id, OperationalProjectStatusRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdmin(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!Enum.TryParse<OperationalProjectStatus>(request.Status, true, out var next) || !Enum.IsDefined(next)) return Results.BadRequest(new { error = "Proje durumu geçersiz." });
            var row = await db.OperationalProjects.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (row is null) return Results.NotFound();
            if (!CanTransition(row.Status, next)) return Results.Conflict(new { error = $"{row.Status} durumundan {next} durumuna geçiş yapılamaz." });
            var previous = row.Status; row.Status = next; row.UpdatedByUserId = userId; row.UpdatedAt = DateTimeOffset.UtcNow;
            Audit(db, tenantId, userId, "project.status-changed", $"{row.Id}:{previous}->{next}"); await db.SaveChangesAsync(ct);
            return Results.Ok(ToProject(row));
        });
        group.MapPost("/{id:guid}/tasks", async (Guid id, ProjectTaskWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdmin(user, out var tenantId, out var userId)) return Results.Forbid();
            var invalid = ValidateTask(request); if (invalid is not null) return Results.ValidationProblem(invalid);
            var project = await db.OperationalProjects.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (project is null) return Results.NotFound();
            if (project.Status is OperationalProjectStatus.Completed or OperationalProjectStatus.Cancelled) return Results.Conflict(new { error = "Tamamlanan veya iptal edilen projeye görev eklenemez." });
            var code = request.Code!.Trim().ToUpperInvariant();
            if (await db.OperationalProjectTasks.AnyAsync(x => x.TenantId == tenantId && x.ProjectId == id && x.Code == code, ct)) return Results.Conflict(new { error = "Görev kodu proje içinde zaten kullanılıyor." });
            var task = new OperationalProjectTask { TenantId = tenantId, ProjectId = id, Code = code, Name = request.Name!.Trim(), StartDate = request.StartDate,
                EndDate = request.EndDate, PlannedHours = decimal.Round(request.PlannedHours, 2), CreatedByUserId = userId };
            db.OperationalProjectTasks.Add(task); Audit(db, tenantId, userId, "project.task.created", $"{id}:{task.Code}");
            try { await db.SaveChangesAsync(ct); } catch (DbUpdateException ex) when (IsUniqueViolation(ex)) { return Results.Conflict(new { error = "Görev kodu proje içinde zaten kullanılıyor." }); }
            return Results.Created($"/api/projects/{id}/tasks/{task.Id}", ToTask(task));
        });
        group.MapPost("/{id:guid}/tasks/{taskId:guid}/status", async (Guid id, Guid taskId, ProjectTaskStatusRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdmin(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!Enum.TryParse<ProjectTaskStatus>(request.Status, true, out var next) || !Enum.IsDefined(next)) return Results.BadRequest(new { error = "Görev durumu geçersiz." });
            var project = await db.OperationalProjects.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (project is null) return Results.NotFound();
            if (project.Status is OperationalProjectStatus.Completed or OperationalProjectStatus.Cancelled) return Results.Conflict(new { error = "Tamamlanan veya iptal edilen projenin görev durumu değiştirilemez." });
            var task = await db.OperationalProjectTasks.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == id && x.Id == taskId, ct);
            if (task is null) return Results.NotFound();
            if (!CanTransition(task.Status, next)) return Results.Conflict(new { error = "Bu görev durumu geçişine izin verilmiyor." });
            var previous = task.Status; task.Status = next;
            Audit(db, tenantId, userId, "project.task-status-changed", $"{id}:{task.Code}:{previous}->{next}");
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToTask(task));
        });
        group.MapPost("/{id:guid}/resources", async (Guid id, ProjectResourceAllocationRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryAdmin(user, out var tenantId, out var userId)) return Results.Forbid();
            var invalid = ValidateAllocation(request); if (invalid is not null) return Results.ValidationProblem(invalid);
            var project = await db.OperationalProjects.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (project is null) return Results.NotFound();
            if (project.Status is OperationalProjectStatus.Completed or OperationalProjectStatus.Cancelled) return Results.Conflict(new { error = "Tamamlanan veya iptal edilen projeye kaynak atanamaz." });
            if (request.TaskId.HasValue && !await db.OperationalProjectTasks.AnyAsync(x => x.TenantId == tenantId && x.ProjectId == id && x.Id == request.TaskId.Value, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["taskId"] = ["Görev bu projede bulunamadı."] });
            var employeeName = "";
            if (request.EmployeeId.HasValue)
            {
                var employee = await db.EmployeeRecords.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.EmployeeId.Value && x.Status != EmployeeEmploymentStatus.Terminated, ct);
                if (employee is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["employeeId"] = ["Aktif personel bulunamadı veya bu firmaya ait değil."] });
                employeeName = employee.FullName;
            }
            var row = new OperationalProjectResourceAllocation { TenantId = tenantId, ProjectId = id, TaskId = request.TaskId, EmployeeId = request.EmployeeId,
                ResourceName = request.EmployeeId.HasValue ? employeeName : request.ResourceName!.Trim(), PlannedHours = decimal.Round(request.PlannedHours, 2),
                PlannedHourlyCost = request.PlannedHourlyCost is null ? null : decimal.Round(request.PlannedHourlyCost.Value, 2),
                CurrencyCode = request.CurrencyCode!.Trim().ToUpperInvariant(), Notes = Clean(request.Notes), CreatedByUserId = userId };
            db.OperationalProjectResourceAllocations.Add(row); Audit(db, tenantId, userId, "project.resource-allocated", $"{id}:{row.ResourceName}:{row.PlannedHours}h");
            await db.SaveChangesAsync(ct); return Results.Created($"/api/projects/{id}/resources/{row.Id}", ToAllocation(row));
        });
        group.MapPost("/{id:guid}/time-entries", async (Guid id, ProjectTimeEntryRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryContext(user, out var tenantId, out var userId, out _)) return Results.Forbid();
            var invalid = ValidateTimeEntry(request); if (invalid is not null) return Results.ValidationProblem(invalid);
            var project = await db.OperationalProjects.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (project is null) return Results.NotFound();
            if (project.Status is OperationalProjectStatus.Cancelled) return Results.Conflict(new { error = "İptal edilen projeye süre kaydı girilemez." });
            if ((project.StartDate.HasValue && request.WorkDate < project.StartDate.Value) || (project.EndDate.HasValue && request.WorkDate > project.EndDate.Value))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["workDate"] = ["Çalışma tarihi proje tarih aralığının dışında."] });
            if (request.TaskId.HasValue)
            {
                var task = await db.OperationalProjectTasks.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ProjectId == id && x.Id == request.TaskId.Value, ct);
                if (task is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["taskId"] = ["Görev bu projede bulunamadı."] });
                if (task.Status == ProjectTaskStatus.Cancelled) return Results.Conflict(new { error = "İptal edilen göreve süre kaydı girilemez." });
                if ((task.StartDate.HasValue && request.WorkDate < task.StartDate.Value) || (task.EndDate.HasValue && request.WorkDate > task.EndDate.Value))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["workDate"] = ["Çalışma tarihi görev tarih aralığının dışında."] });
            }
            // Serializable isolation plus the tenant/user/date index prevents concurrent writes from exceeding the daily cap.
            await using var transaction = db.Database.IsRelational()
                ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct)
                : null;
            var dayTotal = await db.OperationalProjectTimeEntries.Where(x => x.TenantId == tenantId && x.UserId == userId && x.WorkDate == request.WorkDate).SumAsync(x => (decimal?)x.Hours, ct) ?? 0;
            if (dayTotal + request.Hours > 24m) return Results.ValidationProblem(new Dictionary<string, string[]> { ["hours"] = ["Bir kullanıcı aynı gün en fazla 24 saat kaydedebilir."] });
            var row = new OperationalProjectTimeEntry { TenantId = tenantId, ProjectId = id, TaskId = request.TaskId, UserId = userId,
                WorkDate = request.WorkDate, Hours = request.Hours, Description = Clean(request.Description), CreatedAt = DateTimeOffset.UtcNow };
            db.OperationalProjectTimeEntries.Add(row);
            Audit(db, tenantId, userId, "project.time-recorded", $"{id}:{row.Id}:{row.WorkDate}:{row.Hours}h");
            await db.SaveChangesAsync(ct);
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Created($"/api/projects/{id}/time-entries/{row.Id}", ToTimeEntry(row));
        });
    }

    private static Dictionary<string, string[]>? Validate(OperationalProjectWriteRequest r)
    {
        var e = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(r.Code) || !ProjectCodeRegex().IsMatch(r.Code.Trim())) e["code"] = ["Proje kodu 1–40 karakter; harf/rakamla başlamalı ve yalnız harf, rakam, . _ / - içermelidir."];
        if (string.IsNullOrWhiteSpace(r.Name) || r.Name.Trim().Length > 160) e["name"] = ["Proje adı 1–160 karakter olmalıdır."];
        if (r.StartDate.HasValue && r.EndDate.HasValue && r.EndDate < r.StartDate) e["endDate"] = ["Bitiş tarihi başlangıç tarihinden önce olamaz."];
        if (r.BudgetAmount < 0 || r.BudgetAmount > 9999999999999999m) e["budgetAmount"] = ["Operasyonel bütçe sıfır veya pozitif olmalıdır."];
        if (!CurrencyRegex().IsMatch(r.CurrencyCode ?? "")) e["currencyCode"] = ["Para birimi üç harfli ISO kodu olmalıdır."];
        if (r.Notes?.Length > 1000) e["notes"] = ["Not en fazla 1000 karakter olmalıdır."];
        return e.Count == 0 ? null : e;
    }
    private static Dictionary<string, string[]>? ValidateTask(ProjectTaskWriteRequest r)
    {
        var e = new Dictionary<string, string[]>();
        if (string.IsNullOrWhiteSpace(r.Code) || !ProjectCodeRegex().IsMatch(r.Code.Trim())) e["code"] = ["Görev kodu geçersiz."];
        if (string.IsNullOrWhiteSpace(r.Name) || r.Name.Trim().Length > 160) e["name"] = ["Görev adı 1–160 karakter olmalıdır."];
        if (r.StartDate.HasValue && r.EndDate.HasValue && r.EndDate < r.StartDate) e["endDate"] = ["Bitiş tarihi başlangıç tarihinden önce olamaz."];
        if (r.PlannedHours < 0 || r.PlannedHours > 9999999999m) e["plannedHours"] = ["Planlanan saat sıfır veya pozitif olmalıdır."];
        return e.Count == 0 ? null : e;
    }
    private static Dictionary<string, string[]>? ValidateAllocation(ProjectResourceAllocationRequest r)
    {
        var e = new Dictionary<string, string[]>();
        if (r.EmployeeId.HasValue == !string.IsNullOrWhiteSpace(r.ResourceName)) e["resource"] = ["Personel seçin veya kaynak adı girin; ikisini aynı anda kullanmayın."];
        if (r.PlannedHours <= 0 || r.PlannedHours > 9999999999m) e["plannedHours"] = ["Planlanan saat sıfırdan büyük olmalıdır."];
        if (r.PlannedHourlyCost is < 0 or > 9999999999999999m) e["plannedHourlyCost"] = ["Saatlik plan maliyeti negatif olamaz."];
        if (r.ResourceName?.Length > 120) e["resourceName"] = ["Kaynak adı en fazla 120 karakter olmalıdır."];
        if (!CurrencyRegex().IsMatch(r.CurrencyCode ?? "")) e["currencyCode"] = ["Para birimi üç harfli ISO kodu olmalıdır."];
        if (r.Notes?.Length > 500) e["notes"] = ["Not en fazla 500 karakter olmalıdır."];
        return e.Count == 0 ? null : e;
    }
    private static Dictionary<string, string[]>? ValidateTimeEntry(ProjectTimeEntryRequest r)
    {
        var e = new Dictionary<string, string[]>();
        if (r.Hours < 0.25m || r.Hours > 24m || r.Hours * 4m != decimal.Truncate(r.Hours * 4m)) e["hours"] = ["Süre 0,25–24 saat aralığında ve 15 dakikalık adımlarla girilmelidir."];
        if (r.WorkDate == default) e["workDate"] = ["Çalışma tarihi zorunludur."];
        if (r.WorkDate > DateOnly.FromDateTime(DateTime.UtcNow)) e["workDate"] = ["Çalışma tarihi gelecekte olamaz (UTC tarihine göre)."];
        if (r.Description?.Length > 500) e["description"] = ["Açıklama en fazla 500 karakter olabilir."];
        return e.Count == 0 ? null : e;
    }
    private static bool CanTransition(OperationalProjectStatus current, OperationalProjectStatus next) => (current, next) switch
    {
        (OperationalProjectStatus.Draft, OperationalProjectStatus.Active or OperationalProjectStatus.Cancelled) => true,
        (OperationalProjectStatus.Active, OperationalProjectStatus.OnHold or OperationalProjectStatus.Completed or OperationalProjectStatus.Cancelled) => true,
        (OperationalProjectStatus.OnHold, OperationalProjectStatus.Active or OperationalProjectStatus.Cancelled) => true,
        _ => false
    };
    private static bool CanTransition(ProjectTaskStatus current, ProjectTaskStatus next) => (current, next) switch
    {
        (ProjectTaskStatus.Open, ProjectTaskStatus.InProgress or ProjectTaskStatus.Blocked or ProjectTaskStatus.Completed or ProjectTaskStatus.Cancelled) => true,
        (ProjectTaskStatus.InProgress, ProjectTaskStatus.Open or ProjectTaskStatus.Blocked or ProjectTaskStatus.Completed or ProjectTaskStatus.Cancelled) => true,
        (ProjectTaskStatus.Blocked, ProjectTaskStatus.Open or ProjectTaskStatus.InProgress or ProjectTaskStatus.Completed or ProjectTaskStatus.Cancelled) => true,
        _ => false
    };
    private static ProjectView ToProject(OperationalProject x) => new(x.Id,x.Code,x.Name,x.CustomerAccountId,x.StartDate,x.EndDate,x.Status.ToString(),x.BudgetAmount,x.CurrencyCode,x.Notes,x.CreatedByUserId,x.UpdatedByUserId,x.CreatedAt,x.UpdatedAt);
    private static ProjectTaskView ToTask(OperationalProjectTask x) => new(x.Id,x.ProjectId,x.Code,x.Name,x.StartDate,x.EndDate,x.PlannedHours,x.Status.ToString(),x.CreatedByUserId,x.CreatedAt);
    private static ProjectResourceAllocationView ToAllocation(OperationalProjectResourceAllocation x) => new(x.Id,x.ProjectId,x.TaskId,x.EmployeeId,x.ResourceName,x.PlannedHours,x.PlannedHourlyCost,x.CurrencyCode,x.Notes,x.CreatedByUserId,x.CreatedAt);
    private static ProjectTimeEntryView ToTimeEntry(OperationalProjectTimeEntry x) => new(x.Id,x.ProjectId,x.TaskId,x.UserId,x.WorkDate,x.Hours,x.Description,x.CreatedAt);
    private static bool TryContext(ClaimsPrincipal u,out Guid tenantId,out Guid userId,out string role) { tenantId=Guid.Empty; userId=Guid.Empty; role=u.FindFirstValue("role")??""; var tenantOk=Guid.TryParse(u.FindFirstValue("tenant_id"),out tenantId); var userOk=Guid.TryParse(u.FindFirstValue("sub"),out userId); return tenantOk&&userOk&&role is "TenantAdmin" or "TenantDeveloper" or "TenantUser"; }
    private static bool TryAdmin(ClaimsPrincipal u,out Guid tenantId,out Guid userId) => TryContext(u,out tenantId,out userId,out var role)&&role=="TenantAdmin";
    private static void Audit(TenantDbContext db,Guid tenantId,Guid userId,string action,string resource)=>db.AuditEvents.Add(new AuditEvent{TenantId=tenantId,UserId=userId,Action=action,Resource=resource});
    private static string? Clean(string? value)=>string.IsNullOrWhiteSpace(value)?null:value.Trim();
    private static bool IsUniqueViolation(DbUpdateException ex)=>ex.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 };
    [GeneratedRegex("^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$",RegexOptions.CultureInvariant)] private static partial Regex ProjectCodeRegex();
    [GeneratedRegex("^[A-Za-z]{3}$",RegexOptions.CultureInvariant)] private static partial Regex CurrencyRegex();
}

public sealed record OperationalProjectWriteRequest(string? Code,string? Name,Guid? CustomerAccountId,DateOnly? StartDate,DateOnly? EndDate,decimal BudgetAmount,string? CurrencyCode,string? Notes);
public sealed record OperationalProjectStatusRequest(string? Status);
public sealed record ProjectTaskWriteRequest(string? Code,string? Name,DateOnly? StartDate,DateOnly? EndDate,decimal PlannedHours);
public sealed record ProjectTaskStatusRequest(string? Status);
public sealed record ProjectResourceAllocationRequest(Guid? TaskId,Guid? EmployeeId,string? ResourceName,decimal PlannedHours,decimal? PlannedHourlyCost,string? CurrencyCode,string? Notes);
public sealed record ProjectTimeEntryRequest(Guid? TaskId,DateOnly WorkDate,decimal Hours,string? Description);
public sealed record ProjectView(Guid Id,string Code,string Name,Guid? CustomerAccountId,DateOnly? StartDate,DateOnly? EndDate,string Status,decimal BudgetAmount,string CurrencyCode,string? Notes,Guid CreatedByUserId,Guid UpdatedByUserId,DateTimeOffset CreatedAt,DateTimeOffset UpdatedAt);
public sealed record ProjectSummary(Guid Id,string Code,string Name,Guid? CustomerAccountId,DateOnly? StartDate,DateOnly? EndDate,string Status,decimal BudgetAmount,string CurrencyCode,DateTimeOffset CreatedAt,DateTimeOffset UpdatedAt,int TaskCount,decimal AllocatedHours,decimal ActualHours,int CompletedTaskCount,int OverdueTaskCount,DateOnly? NextTaskDate,int TimeEntryCount,DateOnly? LatestTimeEntryDate);
public sealed record ProjectDashboardSummary(int ProjectCount,int ActiveProjectCount,int TaskCount,int CompletedTaskCount,int OverdueTaskCount,int ProjectsEndingIn30Days,decimal TimeEntryHours,int TimeEntryCount);
public sealed record ProjectTaskView(Guid Id,Guid ProjectId,string Code,string Name,DateOnly? StartDate,DateOnly? EndDate,decimal PlannedHours,string Status,Guid CreatedByUserId,DateTimeOffset CreatedAt);
public sealed record ProjectResourceAllocationView(Guid Id,Guid ProjectId,Guid? TaskId,Guid? EmployeeId,string ResourceName,decimal PlannedHours,decimal? PlannedHourlyCost,string CurrencyCode,string? Notes,Guid CreatedByUserId,DateTimeOffset CreatedAt);
public sealed record ProjectTimeEntryView(Guid Id,Guid ProjectId,Guid? TaskId,Guid UserId,DateOnly WorkDate,decimal Hours,string? Description,DateTimeOffset CreatedAt);
public sealed record PlannedProjectCostCurrencyView(string CurrencyCode,decimal AllocatedHours,decimal PricedHours,decimal UnpricedHours,decimal PlannedCost,int AllocationCount);
public sealed record ProjectCostReportView(Guid ProjectId,string ProjectCode,string ProjectName,string Status,decimal BudgetAmount,string BudgetCurrencyCode,IReadOnlyList<PlannedProjectCostCurrencyView> PlannedCosts,decimal ActualHours,int ActualTimeEntryCount,decimal? ActualLaborCost,string Limitation);
public sealed record ProjectDetail(ProjectView Project,IReadOnlyList<ProjectTaskView> Tasks,IReadOnlyList<ProjectResourceAllocationView> Allocations,IReadOnlyList<ProjectTimeEntryView> TimeEntries);
