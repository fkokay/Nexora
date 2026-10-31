using System.Security.Claims;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

public static class CommercialContractEndpoints
{
    public static void MapCommercialContractEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/commercial-contracts").WithTags("Ticari Sözleşmeler").RequireAuthorization();

        group.MapGet("/counterparties", async (string? type, string? q, int? page, int? pageSize,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out _)) return Results.Forbid();
            if (!Enum.TryParse<CommercialContractType>(type, true, out var contractType) || !Enum.IsDefined(contractType))
                return Results.BadRequest(new { error = "Cari yönü Sales veya Purchase olmalıdır." });
            var term = q?.Trim();
            if (term?.Length > 100) return Results.BadRequest(new { error = "Arama metni en fazla 100 karakter olabilir." });
            var currentPage = Math.Clamp(page ?? 1, 1, 1_000_000);
            var size = Math.Clamp(pageSize ?? 25, 1, 50);
            var compatibleType = contractType == CommercialContractType.Sales ? CounterpartyType.Customer : CounterpartyType.Supplier;
            var query = db.CustomerAccounts.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive
                && (x.Type == compatibleType || x.Type == CounterpartyType.Both));
            if (!string.IsNullOrWhiteSpace(term))
                query = query.Where(x => x.Code.Contains(term) || x.Name.Contains(term) || (x.TaxNumber != null && x.TaxNumber.Contains(term)));
            var total = await query.CountAsync(ct);
            var items = await query.OrderBy(x => x.Name).ThenBy(x => x.Code).ThenBy(x => x.Id)
                .Skip((currentPage - 1) * size).Take(size)
                .Select(x => new CommercialContractCounterpartyView(x.Id, x.Code, x.Name, x.Type, x.CurrencyCode)).ToListAsync(ct);
            return Results.Ok(new CommercialContractCounterpartyPage(items, currentPage, size, total));
        });

        // Contract creation is TenantAdmin-only, so the selector uses the same role boundary and
        // never proxies a broader unfiltered page through one of the document list endpoints.
        group.MapGet("/sources", async (string? kind, Guid? counterpartyId, string? currencyCode, string? q,
            int? page, int? pageSize, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out _)) return Results.Forbid();
            if (!Enum.TryParse<CommercialContractSourceKind>(kind, true, out var sourceKind) || !Enum.IsDefined(sourceKind))
                return Results.BadRequest(new { error = "Kaynak türü SalesQuote, SalesOrder, PurchaseSupplierQuote veya PurchaseOrder olmalıdır." });
            var normalizedCurrency = currencyCode?.Trim();
            if (counterpartyId is null || counterpartyId == Guid.Empty || normalizedCurrency is null || normalizedCurrency.Length != 3 || normalizedCurrency.Any(c => !char.IsAsciiLetter(c)))
                return Results.BadRequest(new { error = "Cari hesap ve ISO 4217 biçiminde üç harfli para birimi zorunludur." });
            var term = q?.Trim();
            if (term?.Length > 100) return Results.BadRequest(new { error = "Arama metni en fazla 100 karakter olabilir." });
            var currentPage = Math.Clamp(page ?? 1, 1, 1_000_000);
            var size = Math.Clamp(pageSize ?? 25, 1, 50);
            var counterpartyKey = counterpartyId.Value;
            var currency = normalizedCurrency!.ToUpperInvariant();
            var expectedCounterpartyType = sourceKind is CommercialContractSourceKind.SalesQuote or CommercialContractSourceKind.SalesOrder
                ? CounterpartyType.Customer : CounterpartyType.Supplier;
            var counterpartyIsEligible = await db.CustomerAccounts.AsNoTracking().AnyAsync(x => x.TenantId == tenantId
                && x.Id == counterpartyKey && x.IsActive && (x.Type == expectedCounterpartyType || x.Type == CounterpartyType.Both), ct);
            if (!counterpartyIsEligible)
                return Results.Ok(new CommercialContractSourcePage([], currentPage, size, 0));

            IQueryable<CommercialContractSourceView> query = sourceKind switch
            {
                CommercialContractSourceKind.SalesQuote => db.SalesQuotes.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && x.CustomerId == counterpartyKey && x.CurrencyCode == currency)
                    .Select(x => new CommercialContractSourceView(x.Id, x.Code, x.CustomerId, x.Customer.Name, x.CurrencyCode)),
                CommercialContractSourceKind.SalesOrder => db.SalesOrders.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && x.CustomerId == counterpartyKey && x.CurrencyCode == currency)
                    .Select(x => new CommercialContractSourceView(x.Id, x.Code, x.CustomerId, x.Customer.Name, x.CurrencyCode)),
                CommercialContractSourceKind.PurchaseSupplierQuote => db.PurchaseSupplierQuotes.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && x.SupplierId == counterpartyKey && x.CurrencyCode == currency)
                    .Select(x => new CommercialContractSourceView(x.Id, x.Code, x.SupplierId, x.Supplier.Name, x.CurrencyCode)),
                CommercialContractSourceKind.PurchaseOrder => db.PurchaseOrders.AsNoTracking()
                    .Where(x => x.TenantId == tenantId && x.SupplierId == counterpartyKey && x.CurrencyCode == currency)
                    .Select(x => new CommercialContractSourceView(x.Id, x.Code, x.SupplierId, x.Supplier.Name, x.CurrencyCode)),
                _ => throw new InvalidOperationException("Validated source kind was not handled.")
            };
            if (!string.IsNullOrWhiteSpace(term))
                query = query.Where(x => x.Code.Contains(term) || x.CounterpartyName.Contains(term));
            var total = await query.CountAsync(ct);
            var items = await query.OrderBy(x => x.Code).ThenBy(x => x.Id)
                .Skip((currentPage - 1) * size).Take(size).ToListAsync(ct);
            return Results.Ok(new CommercialContractSourcePage(items, currentPage, size, total));
        });

        group.MapGet("/", async (string? type, string? status, string? search, string? sortBy, string? sortDirection, int? page, int? pageSize, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out _, allowReader: true)) return Results.Forbid();
            var currentPage = Math.Max(1, page ?? 1); var size = Math.Clamp(pageSize ?? 50, 1, 100);
            var term = search?.Trim();
            if (term?.Length > 100) return Results.BadRequest(new { error = "Arama metni en fazla 100 karakter olabilir." });
            sortBy = string.IsNullOrWhiteSpace(sortBy) ? "createdAt" : sortBy.Trim();
            sortDirection = string.IsNullOrWhiteSpace(sortDirection) ? "desc" : sortDirection.Trim().ToLowerInvariant();
            if (sortBy is not ("code" or "type" or "counterpartyName" or "effectiveFrom" or "effectiveThrough" or "currencyCode" or "status" or "revision" or "createdAt" or "updatedAt") || sortDirection is not ("asc" or "desc"))
                return Results.BadRequest(new { error = "Sözleşme sıralaması geçersiz." });
            var query = db.Set<CommercialContract>().AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(type))
            {
                if (!Enum.TryParse<CommercialContractType>(type, true, out var parsed) || !Enum.IsDefined(parsed)) return Results.BadRequest(new { error = "Sözleşme türü Sales veya Purchase olmalıdır." });
                query = query.Where(x => x.Type == parsed);
            }
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<CommercialContractStatus>(status, true, out var parsed) || !Enum.IsDefined(parsed)) return Results.BadRequest(new { error = "Sözleşme durumu geçersiz." });
                query = query.Where(x => x.Status == parsed);
            }
            if (!string.IsNullOrWhiteSpace(term))
                query = query.Where(x => x.Code.Contains(term) || x.CounterpartyNameSnapshot.Contains(term));
            var total = await query.CountAsync(ct);
            IOrderedQueryable<CommercialContract> ordered = (sortBy, sortDirection) switch
            {
                ("code", "asc") => query.OrderBy(x => x.Code), ("code", _) => query.OrderByDescending(x => x.Code),
                ("type", "asc") => query.OrderBy(x => x.Type), ("type", _) => query.OrderByDescending(x => x.Type),
                ("counterpartyName", "asc") => query.OrderBy(x => x.CounterpartyNameSnapshot), ("counterpartyName", _) => query.OrderByDescending(x => x.CounterpartyNameSnapshot),
                ("effectiveFrom", "asc") => query.OrderBy(x => x.EffectiveFrom), ("effectiveFrom", _) => query.OrderByDescending(x => x.EffectiveFrom),
                ("effectiveThrough", "asc") => query.OrderBy(x => x.EffectiveThrough), ("effectiveThrough", _) => query.OrderByDescending(x => x.EffectiveThrough),
                ("currencyCode", "asc") => query.OrderBy(x => x.CurrencyCode), ("currencyCode", _) => query.OrderByDescending(x => x.CurrencyCode),
                ("status", "asc") => query.OrderBy(x => x.Status), ("status", _) => query.OrderByDescending(x => x.Status),
                ("revision", "asc") => query.OrderBy(x => x.Revision), ("revision", _) => query.OrderByDescending(x => x.Revision),
                ("createdAt", "asc") => query.OrderBy(x => x.CreatedAt), ("createdAt", _) => query.OrderByDescending(x => x.CreatedAt),
                ("updatedAt", "asc") => query.OrderBy(x => x.UpdatedAt), _ => query.OrderByDescending(x => x.UpdatedAt)
            };
            var rows = await ordered.ThenBy(x => x.Code).ThenBy(x => x.Id).Skip((currentPage - 1) * size).Take(size).ToListAsync(ct);
            return Results.Ok(new { items = rows.Select(ToView), page = currentPage, pageSize = size, total });
        });

        group.MapGet("/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out _, allowReader: true)) return Results.Forbid();
            var contract = await db.Set<CommercialContract>().AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (contract is null) return Results.NotFound();
            var transitions = await db.Set<CommercialContractStatusTransition>().AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ContractId == id).OrderBy(x => x.ChangedAt).ToListAsync(ct);
            return Results.Ok(new { contract = ToView(contract), transitions = transitions.Select(ToTransitionView) });
        });

        group.MapPost("/", async (CommercialContractCreateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
            var validation = Validate(request);
            if (validation is not null) return Results.ValidationProblem(validation);
            var code = NormalizeCode(request.Code!);
            var currency = request.CurrencyCode!.Trim().ToUpperInvariant();
            var existingRequest = await db.Set<CommercialContract>().AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CreateIdempotencyKey == request.IdempotencyKey, ct);
            if (existingRequest is not null)
            {
                if (!SameRequest(existingRequest, request, code, currency)) return Results.Conflict(new { error = "Bu işlem anahtarı farklı bir sözleşme isteğinde kullanılmış." });
                return Results.Ok(ToView(existingRequest));
            }
            var counterparty = await db.CustomerAccounts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.CounterpartyId && x.IsActive &&
                (request.Type == CommercialContractType.Sales ? x.Type == CounterpartyType.Customer || x.Type == CounterpartyType.Both : x.Type == CounterpartyType.Supplier || x.Type == CounterpartyType.Both), ct);
            if (counterparty is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["counterpartyId"] = ["Aynı firmada etkin ve sözleşme yönüne uygun bir cari hesap seçilmelidir."] });
            if (await db.Set<CommercialContract>().AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct)) return Results.Conflict(new { error = "Sözleşme kodu bu firmada zaten kullanılıyor." });
            var sourceCheck = await ValidateSourceAsync(db, tenantId, request, counterparty.Id, currency, ct);
            if (sourceCheck is not null) return Results.ValidationProblem(sourceCheck);
            var now = DateTimeOffset.UtcNow;
            var contract = new CommercialContract
            {
                TenantId = tenantId, Code = code, Type = request.Type, CounterpartyId = counterparty.Id,
                CounterpartyNameSnapshot = counterparty.Name, EffectiveFrom = request.EffectiveFrom, EffectiveThrough = request.EffectiveThrough,
                CurrencyCode = currency, Status = CommercialContractStatus.Draft, SalesQuoteId = request.SalesQuoteId,
                SalesOrderId = request.SalesOrderId, PurchaseSupplierQuoteId = request.PurchaseSupplierQuoteId,
                PurchaseOrderId = request.PurchaseOrderId, CreateIdempotencyKey = request.IdempotencyKey,
                CreatedByUserId = userId, CreatedAt = now, UpdatedAt = now
            };
            db.Set<CommercialContract>().Add(contract);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "commercial-contract.created", Resource = $"{contract.Type}:{contract.Code}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException)
            {
                db.ChangeTracker.Clear();
                var prior = await db.Set<CommercialContract>().AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.CreateIdempotencyKey == request.IdempotencyKey, ct);
                if (prior is not null && SameRequest(prior, request, code, currency)) return Results.Ok(ToView(prior));
                return Results.Conflict(new { error = "Sözleşme kodu veya işlem anahtarı eşzamanlı başka bir istekte kullanıldı." });
            }
            return Results.Created($"/api/commercial-contracts/{contract.Id}", ToView(contract));
        });

        group.MapPut("/{id:guid}", async (Guid id, CommercialContractUpdateRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
            if (request.Revision < 1 || request.EffectiveFrom == default || request.EffectiveThrough < request.EffectiveFrom || request.EffectiveThrough.Year > 2100)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["effectiveDates"] = ["Geçerli bir sözleşme aralığı ve revision zorunludur."] });
            var contract = await db.Set<CommercialContract>().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (contract is null) return Results.NotFound();
            if (contract.Status != CommercialContractStatus.Draft) return Results.Conflict(new { error = "Temel bilgiler yalnızca taslak sözleşmede düzenlenebilir." });
            if (contract.EffectiveFrom == request.EffectiveFrom && contract.EffectiveThrough == request.EffectiveThrough)
                return Results.Ok(ToView(contract));
            if (contract.Revision != request.Revision) return Results.Conflict(new { error = "Sözleşme başka bir işlemde değişti; yenileyip tekrar deneyin.", currentRevision = contract.Revision });
            contract.EffectiveFrom = request.EffectiveFrom; contract.EffectiveThrough = request.EffectiveThrough;
            contract.UpdatedAt = DateTimeOffset.UtcNow; contract.Revision++;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "commercial-contract.updated", Resource = $"{contract.Type}:{contract.Code}:{contract.Revision}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Sözleşme eşzamanlı olarak değişti; yenileyip tekrar deneyin." }); }
            return Results.Ok(ToView(contract));
        });

        group.MapPost("/{id:guid}/transitions", async (Guid id, CommercialContractTransitionRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryScope(user, out var tenantId, out var userId)) return Results.Forbid();
            if (request.IdempotencyKey == Guid.Empty || request.Revision < 1 || !Enum.IsDefined(request.Status) || (request.Reason?.Length ?? 0) > 500)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["transition"] = ["İşlem anahtarı, geçerli hedef durum ve revision zorunludur; açıklama en fazla 500 karakter olabilir."] });
            var prior = await db.Set<CommercialContractStatusTransition>().AsNoTracking()
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.IdempotencyKey == request.IdempotencyKey, ct);
            if (prior is not null)
            {
                if (prior.ContractId != id || prior.ToStatus != request.Status || !string.Equals(prior.Reason, Clean(request.Reason), StringComparison.Ordinal))
                    return Results.Conflict(new { error = "Bu işlem anahtarı farklı bir durum geçişinde kullanılmış." });
                var replay = await db.Set<CommercialContract>().AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
                return replay is null ? Results.NotFound() : Results.Ok(new { contract = ToView(replay), transition = ToTransitionView(prior), replayed = true });
            }
            var contract = await db.Set<CommercialContract>().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (contract is null) return Results.NotFound();
            if (contract.Revision != request.Revision) return Results.Conflict(new { error = "Sözleşme başka bir işlemde değişti; yenileyip tekrar deneyin.", currentRevision = contract.Revision });
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            if (!CanTransition(contract.Status, request.Status, contract.EffectiveFrom, contract.EffectiveThrough, today, out var reason))
                return Results.Conflict(new { error = reason });
            var transition = new CommercialContractStatusTransition { TenantId = tenantId, ContractId = id,
                FromStatus = contract.Status, ToStatus = request.Status, Reason = Clean(request.Reason),
                IdempotencyKey = request.IdempotencyKey, ChangedByUserId = userId, ChangedAt = DateTimeOffset.UtcNow };
            contract.Status = request.Status; contract.Revision++; contract.UpdatedAt = transition.ChangedAt;
            db.Set<CommercialContractStatusTransition>().Add(transition);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "commercial-contract.status-changed", Resource = $"{contract.Code}:{transition.FromStatus}->{transition.ToStatus}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateConcurrencyException) { return Results.Conflict(new { error = "Sözleşme eşzamanlı olarak değişti; yenileyip tekrar deneyin." }); }
            catch (DbUpdateException)
            {
                db.ChangeTracker.Clear();
                var duplicate = await db.Set<CommercialContractStatusTransition>().AsNoTracking()
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.IdempotencyKey == request.IdempotencyKey, ct);
                if (duplicate is not null && duplicate.ContractId == id && duplicate.ToStatus == request.Status && duplicate.Reason == Clean(request.Reason))
                {
                    var current = await db.Set<CommercialContract>().AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
                    if (current is not null) return Results.Ok(new { contract = ToView(current), transition = ToTransitionView(duplicate), replayed = true });
                }
                return Results.Conflict(new { error = "İşlem anahtarı veya durum geçişi eşzamanlı olarak kaydedildi." });
            }
            return Results.Ok(new { contract = ToView(contract), transition = ToTransitionView(transition), replayed = false });
        });
    }

    private static async Task<Dictionary<string, string[]>?> ValidateSourceAsync(TenantDbContext db, Guid tenantId,
        CommercialContractCreateRequest request, Guid counterpartyId, string currency, CancellationToken ct)
    {
        var links = new[] { request.SalesQuoteId, request.SalesOrderId, request.PurchaseSupplierQuoteId, request.PurchaseOrderId }.Count(x => x.HasValue);
        if (links > 1) return new() { ["source"] = ["En fazla bir kaynak teklif veya sipariş bağlanabilir."] };
        if (request.Type == CommercialContractType.Sales)
        {
            if (request.PurchaseSupplierQuoteId.HasValue || request.PurchaseOrderId.HasValue) return new() { ["source"] = ["Satış sözleşmesi satın alma belgesine bağlanamaz."] };
            if (request.SalesQuoteId is { } quoteId && !await db.SalesQuotes.AnyAsync(x => x.TenantId == tenantId && x.Id == quoteId && x.CustomerId == counterpartyId && x.CurrencyCode == currency, ct))
                return new() { ["salesQuoteId"] = ["Aynı firmaya, cariye ve para birimine ait satış teklifi bulunamadı."] };
            if (request.SalesOrderId is { } orderId && !await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.Id == orderId && x.CustomerId == counterpartyId && x.CurrencyCode == currency, ct))
                return new() { ["salesOrderId"] = ["Aynı firmaya, cariye ve para birimine ait satış siparişi bulunamadı."] };
        }
        else
        {
            if (request.SalesQuoteId.HasValue || request.SalesOrderId.HasValue) return new() { ["source"] = ["Satın alma sözleşmesi satış belgesine bağlanamaz."] };
            if (request.PurchaseSupplierQuoteId is { } quoteId && !await db.PurchaseSupplierQuotes.AnyAsync(x => x.TenantId == tenantId && x.Id == quoteId && x.SupplierId == counterpartyId && x.CurrencyCode == currency, ct))
                return new() { ["purchaseSupplierQuoteId"] = ["Aynı firmaya, cariye ve para birimine ait tedarikçi teklifi bulunamadı."] };
            if (request.PurchaseOrderId is { } orderId && !await db.PurchaseOrders.AnyAsync(x => x.TenantId == tenantId && x.Id == orderId && x.SupplierId == counterpartyId && x.CurrencyCode == currency, ct))
                return new() { ["purchaseOrderId"] = ["Aynı firmaya, cariye ve para birimine ait satın alma siparişi bulunamadı."] };
        }
        return null;
    }

    private static Dictionary<string, string[]>? Validate(CommercialContractCreateRequest request)
    {
        if (request.IdempotencyKey == Guid.Empty || !Enum.IsDefined(request.Type) || request.CounterpartyId == Guid.Empty ||
            request.EffectiveFrom == default || request.EffectiveThrough < request.EffectiveFrom || request.EffectiveFrom.Year < 2000 || request.EffectiveThrough.Year > 2100)
            return new() { ["contract"] = ["İşlem anahtarı, tür, cari ve 2000–2100 aralığında geçerli sözleşme tarihleri zorunludur."] };
        var code = request.Code?.Trim(); var currency = request.CurrencyCode?.Trim();
        if (string.IsNullOrWhiteSpace(code) || code.Length > 40 || code.Any(c => !(char.IsAsciiLetterOrDigit(c) || c is '-' or '_' or '/')))
            return new() { ["code"] = ["Kod 1–40 karakter olmalı, yalnızca harf, rakam, -, _ ve / içermelidir."] };
        if (currency?.Length != 3 || currency.Any(c => !char.IsAsciiLetter(c)))
            return new() { ["currencyCode"] = ["ISO 4217 biçiminde üç harfli para birimi kodu gereklidir."] };
        return null;
    }

    private static bool SameRequest(CommercialContract contract, CommercialContractCreateRequest request, string code, string currency) =>
        contract.Code == code && contract.Type == request.Type && contract.CounterpartyId == request.CounterpartyId &&
        contract.EffectiveFrom == request.EffectiveFrom && contract.EffectiveThrough == request.EffectiveThrough && contract.CurrencyCode == currency &&
        contract.SalesQuoteId == request.SalesQuoteId && contract.SalesOrderId == request.SalesOrderId &&
        contract.PurchaseSupplierQuoteId == request.PurchaseSupplierQuoteId && contract.PurchaseOrderId == request.PurchaseOrderId;

    private static bool CanTransition(CommercialContractStatus current, CommercialContractStatus target, DateOnly from, DateOnly through, DateOnly today, out string error)
    {
        var valid = current switch
        {
            CommercialContractStatus.Draft => target == CommercialContractStatus.Cancelled || target == CommercialContractStatus.Active && from <= today && today <= through,
            CommercialContractStatus.Active => target is CommercialContractStatus.Suspended or CommercialContractStatus.Completed or CommercialContractStatus.Terminated,
            CommercialContractStatus.Suspended => target is CommercialContractStatus.Active or CommercialContractStatus.Completed or CommercialContractStatus.Terminated,
            _ => false
        };
        if (valid && target == CommercialContractStatus.Active && (from > today || through < today)) valid = false;
        if (valid && target is CommercialContractStatus.Completed or CommercialContractStatus.Terminated && today < from) valid = false;
        error = valid ? "" : current == CommercialContractStatus.Draft && target == CommercialContractStatus.Active
            ? "Sözleşme yalnız geçerlilik tarihleri içindeyken etkinleştirilebilir."
            : "Bu sözleşme durumu geçişine izin verilmiyor.";
        return valid;
    }

    private static bool TryScope(ClaimsPrincipal user, out Guid tenantId, out Guid userId, bool allowReader = false)
    {
        tenantId = Guid.Empty; userId = Guid.Empty;
        var role = user.FindFirstValue("role");
        if (allowReader && role is not ("TenantAdmin" or "TenantUser")) return false;
        if (!allowReader && role != "TenantAdmin") return false;
        return Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId) &&
            Guid.TryParse(user.FindFirstValue("sub") ?? user.FindFirstValue(ClaimTypes.NameIdentifier), out userId);
    }

    private static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();
    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static CommercialContractView ToView(CommercialContract x) => new(x.Id, x.Code, x.Type.ToString(), x.CounterpartyId, x.CounterpartyNameSnapshot,
        x.EffectiveFrom, x.EffectiveThrough, x.CurrencyCode, x.Status.ToString(), x.SalesQuoteId, x.SalesOrderId,
        x.PurchaseSupplierQuoteId, x.PurchaseOrderId, x.Revision, x.CreatedAt, x.UpdatedAt);
    private static CommercialContractTransitionView ToTransitionView(CommercialContractStatusTransition x) => new(x.Id, x.ContractId,
        x.FromStatus.ToString(), x.ToStatus.ToString(), x.Reason, x.IdempotencyKey, x.ChangedByUserId, x.ChangedAt);

    public sealed record CommercialContractCreateRequest(string? Code, CommercialContractType Type, Guid CounterpartyId,
        DateOnly EffectiveFrom, DateOnly EffectiveThrough, string? CurrencyCode, Guid? SalesQuoteId, Guid? SalesOrderId,
        Guid? PurchaseSupplierQuoteId, Guid? PurchaseOrderId, Guid IdempotencyKey);
    public sealed record CommercialContractUpdateRequest(DateOnly EffectiveFrom, DateOnly EffectiveThrough, int Revision);
    public sealed record CommercialContractTransitionRequest(CommercialContractStatus Status, string? Reason, Guid IdempotencyKey, int Revision);
    public sealed record CommercialContractView(Guid Id, string Code, string Type, Guid CounterpartyId, string CounterpartyName,
        DateOnly EffectiveFrom, DateOnly EffectiveThrough, string CurrencyCode, string Status, Guid? SalesQuoteId,
        Guid? SalesOrderId, Guid? PurchaseSupplierQuoteId, Guid? PurchaseOrderId, int Revision, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
    public sealed record CommercialContractTransitionView(Guid Id, Guid ContractId, string FromStatus, string ToStatus,
        string? Reason, Guid IdempotencyKey, Guid ChangedByUserId, DateTimeOffset ChangedAt);
    public enum CommercialContractSourceKind { SalesQuote = 1, SalesOrder = 2, PurchaseSupplierQuote = 3, PurchaseOrder = 4 }
    public sealed record CommercialContractSourceView(Guid Id, string Code, Guid CounterpartyId, string CounterpartyName, string CurrencyCode);
    public sealed record CommercialContractSourcePage(IReadOnlyList<CommercialContractSourceView> Items, int Page, int PageSize, int Total);
    public sealed record CommercialContractCounterpartyView(Guid Id, string Code, string Name, CounterpartyType Type, string CurrencyCode);
    public sealed record CommercialContractCounterpartyPage(IReadOnlyList<CommercialContractCounterpartyView> Items, int Page, int PageSize, int Total);
}
