using System.Security.Claims;
using System.Data;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

internal static partial class ForeignTradeEndpoints
{
    private static readonly string[] AllowedTransportModes = ["Road", "Sea", "Air", "Rail", "Multimodal"];
    private static readonly string[] AllowedIncoterms = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"];
    // ISO 3166-1 assigned alpha-2 codes. Do not accept every two-letter string:
    // invalid codes end up in customs, shipment, and reporting records as if authoritative.
    private static readonly HashSet<string> Iso3166Alpha2Codes = new(
        (
        "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
        "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
        "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
        "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
        "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
        "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
        "UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
        ).Split(' ', StringSplitOptions.RemoveEmptyEntries), StringComparer.Ordinal);

    public static void MapForeignTradeEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/foreign-trade").WithTags("Dış Ticaret").RequireAuthorization();
        group.MapGet("/capabilities", async (ClaimsPrincipal user, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId) || UserId(user) is not { } userId || user.FindFirstValue("role") is not { } role) return Results.Forbid();
            Task<bool> Allowed(string code)
            {
                var definition = PlatformPermissionCatalog.Definitions.Single(x => x.Code == code);
                return authorizer.IsAllowedAsync(tenantId, userId, role, new ResolvedPlatformPermission(definition,
                    new Dictionary<string, string> { ["subject.userId"] = userId.ToString("D"), ["subject.role"] = role,
                        ["resource.type"] = definition.ResourceType, ["resource.tenantId"] = tenantId.ToString("D"), ["request.action"] = definition.Action }), ct);
            }
            var create = await Allowed("erp.foreign-trade.create");
            var update = await Allowed("erp.foreign-trade.update");
            var execute = await Allowed("erp.foreign-trade.execute");
            return Results.Ok(new { canCreate = create, canUpdate = update, canAdvance = execute });
        });
        group.MapGet("/orders", async (string direction, ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId) || !await IsAllowedAsync(user, tenantId, "erp.foreign-trade.read", authorizer, ct)) return Results.Forbid();
            if (!TryDirection(direction, out var tradeDirection)) return Results.BadRequest(new { error = "Yön Import veya Export olmalıdır." });
            if (tradeDirection == ForeignTradeDirection.Import)
                return Results.Ok(await db.PurchaseOrders.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status != PurchaseOrderStatus.Cancelled)
                    .OrderByDescending(x => x.OrderDate).Take(100).Select(x => new ForeignTradeOrderOption(x.Id, x.Code, x.Supplier.Name,
                        x.OrderDate, x.CurrencyCode, x.GrandTotal, x.Status.ToString())).ToListAsync(ct));
            return Results.Ok(await db.SalesOrders.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status != SalesOrderStatus.Cancelled)
                .OrderByDescending(x => x.OrderDate).Take(100).Select(x => new ForeignTradeOrderOption(x.Id, x.Code, x.Customer.Name,
                    x.OrderDate, x.CurrencyCode, x.GrandTotal, x.Status.ToString())).ToListAsync(ct));
        });

        group.MapGet("/cases", async (string? direction, string? status, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer authorizer, int page = 1, int pageSize = 50, CancellationToken ct = default) =>
        {
            if (!TryTenant(user, out var tenantId) || !await IsAllowedAsync(user, tenantId, "erp.foreign-trade.read", authorizer, ct)) return Results.Forbid();
            if (page < 1 || pageSize is < 1 or > 100) return Results.BadRequest(new { error = "Sayfa 1’den, sayfa boyutu 1–100 arasında olmalıdır." });
            var query = db.Set<ForeignTradeCase>().AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(direction))
            {
                if (!TryDirection(direction, out var parsedDirection)) return Results.BadRequest(new { error = "Dış ticaret yönü geçersiz." });
                query = query.Where(x => x.Direction == parsedDirection);
            }
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<ForeignTradeStatus>(status, true, out var parsedStatus) || !Enum.IsDefined(parsedStatus)) return Results.BadRequest(new { error = "Durum geçersiz." });
                query = query.Where(x => x.Status == parsedStatus);
            }
            var total = await query.CountAsync(ct);
            var rows = await query.OrderByDescending(x => x.UpdatedAt).ThenBy(x => x.ReferenceCode)
                .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
            var items = rows.Select(ToView).ToList();
            return Results.Ok(new { items, page, pageSize, total });
        });

        group.MapPost("/cases", async (ForeignTradeCaseWriteRequest request, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId) || !await IsAllowedAsync(user, tenantId, "erp.foreign-trade.create", authorizer, ct)) return Results.Forbid();
            var validation = Validate(request);
            if (validation is not null) return Results.ValidationProblem(validation);
            if (await db.Set<ForeignTradeCase>().AnyAsync(x => x.TenantId == tenantId && x.ReferenceCode == request.ReferenceCode!.Trim(), ct))
                return Results.Conflict(new { error = "Bu dış ticaret referansı firma içinde zaten kullanılmış." });
            var direction = Enum.Parse<ForeignTradeDirection>(request.Direction!, true);
            if (direction == ForeignTradeDirection.Import)
            {
                if (request.PurchaseOrderId is null || request.SalesOrderId is not null || !await db.PurchaseOrders.AnyAsync(x => x.TenantId == tenantId && x.Id == request.PurchaseOrderId && x.Status != PurchaseOrderStatus.Cancelled, ct))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["purchaseOrderId"] = ["İthalat için aynı firmaya ait iptal edilmemiş bir satın alma siparişi seçin."] });
            }
            else if (request.SalesOrderId is null || request.PurchaseOrderId is not null || !await db.SalesOrders.AnyAsync(x => x.TenantId == tenantId && x.Id == request.SalesOrderId && x.Status != SalesOrderStatus.Cancelled, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["salesOrderId"] = ["İhracat için aynı firmaya ait iptal edilmemiş bir satış siparişi seçin."] });

            var orderCurrency = direction == ForeignTradeDirection.Import
                ? await db.PurchaseOrders.Where(x => x.TenantId == tenantId && x.Id == request.PurchaseOrderId).Select(x => x.CurrencyCode).SingleAsync(ct)
                : await db.SalesOrders.Where(x => x.TenantId == tenantId && x.Id == request.SalesOrderId).Select(x => x.CurrencyCode).SingleAsync(ct);
            var record = new ForeignTradeCase
            {
                TenantId = tenantId, Direction = direction, PurchaseOrderId = request.PurchaseOrderId, SalesOrderId = request.SalesOrderId,
                InventoryPostingRequired = true,
                ReferenceCode = request.ReferenceCode!.Trim(), OriginCountryCode = request.OriginCountryCode!.Trim().ToUpperInvariant(),
                DestinationCountryCode = request.DestinationCountryCode!.Trim().ToUpperInvariant(), IncotermsCode = NormalizeOptional(request.IncotermsCode)?.ToUpperInvariant(),
                HarmonizedSystemCode = NormalizeOptional(request.HarmonizedSystemCode), TransportMode = request.TransportMode!,
                CarrierReference = NormalizeOptional(request.CarrierReference), CustomsReference = NormalizeOptional(request.CustomsReference),
                DeclaredValue = request.DeclaredValue, CurrencyCode = orderCurrency, PlannedShipDate = request.PlannedShipDate,
                PlannedArrivalDate = request.PlannedArrivalDate, Notes = NormalizeOptional(request.Notes), CreatedByUserId = UserId(user)
            };
            db.Set<ForeignTradeCase>().Add(record);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "foreign-trade.case.created", Resource = $"{record.Direction}:{record.ReferenceCode}:{orderCurrency}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException exception) when (exception.InnerException is SqlException { Number: 2601 or 2627 })
            { return Results.Conflict(new { error = "Bu dış ticaret referansı firma içinde zaten kullanılmış." }); }
            return Results.Created($"/api/foreign-trade/cases/{record.Id}", ToView(record));
        });

        group.MapPut("/cases/{id:guid}", async (Guid id, ForeignTradeCaseWriteRequest request, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId) || !await IsAllowedAsync(user, tenantId, "erp.foreign-trade.update", authorizer, ct)) return Results.Forbid();
            var validation = Validate(request);
            if (validation is not null) return Results.ValidationProblem(validation);
            var record = await db.Set<ForeignTradeCase>().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (record.Status is not (ForeignTradeStatus.Draft or ForeignTradeStatus.Booked)) return Results.Conflict(new { error = "Sevkiyat başladıktan sonra temel dosya bilgileri değiştirilemez." });
            if (await db.Set<ForeignTradeCase>().AnyAsync(x => x.TenantId == tenantId && x.Id != id && x.ReferenceCode == request.ReferenceCode!.Trim(), ct))
                return Results.Conflict(new { error = "Bu dış ticaret referansı firma içinde zaten kullanılmış." });
            if (!string.Equals(request.Direction, record.Direction.ToString(), StringComparison.OrdinalIgnoreCase) || request.PurchaseOrderId != record.PurchaseOrderId || request.SalesOrderId != record.SalesOrderId)
                return Results.Conflict(new { error = "Dış ticaret yönü veya bağlı sipariş sonradan değiştirilemez." });
            record.ReferenceCode = request.ReferenceCode!.Trim(); record.OriginCountryCode = request.OriginCountryCode!.Trim().ToUpperInvariant();
            record.DestinationCountryCode = request.DestinationCountryCode!.Trim().ToUpperInvariant(); record.IncotermsCode = NormalizeOptional(request.IncotermsCode)?.ToUpperInvariant();
            record.HarmonizedSystemCode = NormalizeOptional(request.HarmonizedSystemCode); record.TransportMode = request.TransportMode!;
            record.CarrierReference = NormalizeOptional(request.CarrierReference); record.CustomsReference = NormalizeOptional(request.CustomsReference);
            record.DeclaredValue = request.DeclaredValue; record.PlannedShipDate = request.PlannedShipDate; record.PlannedArrivalDate = request.PlannedArrivalDate;
            record.Notes = NormalizeOptional(request.Notes); record.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "foreign-trade.case.updated", Resource = $"{record.Direction}:{record.ReferenceCode}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(record));
        });

        group.MapGet("/cases/{id:guid}/inventory-documents", async (Guid id, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId) || !await IsAllowedAsync(user, tenantId, "erp.foreign-trade.read", authorizer, ct)) return Results.Forbid();
            var tradeCase = await db.Set<ForeignTradeCase>().AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (tradeCase is null) return Results.NotFound();
            if (tradeCase.Direction == ForeignTradeDirection.Import)
            {
                var receipts = await db.PurchaseReceipts.AsNoTracking().Include(x => x.Lines).Include(x => x.Warehouse)
                    .Where(x => x.TenantId == tenantId && x.PurchaseOrderId == tradeCase.PurchaseOrderId && x.Status == PurchaseReceiptStatus.Posted)
                    .OrderByDescending(x => x.ReceiptDate).ThenBy(x => x.Code).Take(100).ToListAsync(ct);
                var options = new List<ForeignTradeInventoryDocumentOption>();
                foreach (var receipt in receipts)
                {
                    if (await HasPostedInventoryMovementsAsync(db, tenantId, receipt.Lines.Select(x => x.Id).ToArray(), purchase: true, ct))
                        options.Add(new(receipt.Id, receipt.Code, receipt.ReceiptDate, receipt.Warehouse.Name, receipt.Lines.Count, tradeCase.PurchaseReceiptId == receipt.Id));
                }
                return Results.Ok(options);
            }
            var deliveries = await db.SalesDeliveries.AsNoTracking().Include(x => x.Lines).Include(x => x.Warehouse)
                .Where(x => x.TenantId == tenantId && x.OrderId == tradeCase.SalesOrderId && x.Status == SalesDeliveryStatus.Posted)
                .OrderByDescending(x => x.DeliveryDate).ThenBy(x => x.Code).Take(100).ToListAsync(ct);
            var deliveryOptions = new List<ForeignTradeInventoryDocumentOption>();
            foreach (var delivery in deliveries)
            {
                if (await HasPostedInventoryMovementsAsync(db, tenantId, delivery.Lines.Select(x => x.Id).ToArray(), purchase: false, ct))
                    deliveryOptions.Add(new(delivery.Id, delivery.Code, delivery.DeliveryDate, delivery.Warehouse.Name, delivery.Lines.Count, tradeCase.SalesDeliveryId == delivery.Id));
            }
            return Results.Ok(deliveryOptions);
        });

        group.MapPost("/cases/{id:guid}/inventory-document", async (Guid id, ForeignTradeInventoryDocumentRequest request,
            ClaimsPrincipal user, TenantDbContext db, IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId) || !await IsAllowedAsync(user, tenantId, "erp.foreign-trade.execute", authorizer, ct)) return Results.Forbid();
            if (request.DocumentId == Guid.Empty) return Results.BadRequest(new { error = "Stok belgesi seçilmelidir." });
            await using var transaction = db.Database.IsRelational() ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
            var tradeCase = db.Database.IsSqlServer()
                ? await db.Set<ForeignTradeCase>().FromSqlInterpolated($"SELECT * FROM [dbo].[ForeignTradeCases] WITH (UPDLOCK, ROWLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync(ct)
                : await db.Set<ForeignTradeCase>().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (tradeCase is null) return Results.NotFound();
            var existingId = tradeCase.Direction == ForeignTradeDirection.Import ? tradeCase.PurchaseReceiptId : tradeCase.SalesDeliveryId;
            if (existingId == request.DocumentId) return Results.Ok(ToView(tradeCase)); // Idempotent retry.
            if (existingId.HasValue) return Results.Conflict(new { error = "Bu dış ticaret dosyasına farklı bir stok belgesi zaten bağlanmış." });

            if (tradeCase.Direction == ForeignTradeDirection.Import)
            {
                if (tradeCase.Status is not (ForeignTradeStatus.Arrived or ForeignTradeStatus.Closed))
                    return Results.Conflict(new { error = "İthalat dosyasına mal kabul belgesi yalnızca varış kaydedildikten sonra bağlanabilir." });
                var receipt = await db.PurchaseReceipts.AsNoTracking().Include(x => x.Lines)
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.DocumentId && x.PurchaseOrderId == tradeCase.PurchaseOrderId && x.Status == PurchaseReceiptStatus.Posted, ct);
                if (receipt is null) return Results.Conflict(new { error = "Seçilen mal kabul belgesi aynı firmaya ve dış ticaret siparişine ait kayıtlı bir belge değil." });
                if (!await HasPostedInventoryMovementsAsync(db, tenantId, receipt.Lines.Select(x => x.Id).ToArray(), purchase: true, ct))
                    return Results.Conflict(new { error = "Mal kabul belgesinin tüm satırları için stok defteri hareketi bulunmalıdır." });
                if (await db.Set<ForeignTradeCase>().AnyAsync(x => x.TenantId == tenantId && x.PurchaseReceiptId == receipt.Id, ct))
                    return Results.Conflict(new { error = "Bu mal kabul belgesi başka bir dış ticaret dosyasına bağlı." });
                tradeCase.PurchaseReceiptId = receipt.Id;
            }
            else
            {
                if (tradeCase.Status is not (ForeignTradeStatus.Shipped or ForeignTradeStatus.CustomsClearance or ForeignTradeStatus.Arrived or ForeignTradeStatus.Closed))
                    return Results.Conflict(new { error = "İhracat teslimat belgesi, sevkiyat başladıktan sonra bağlanabilir." });
                var delivery = await db.SalesDeliveries.AsNoTracking().Include(x => x.Lines)
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.DocumentId && x.OrderId == tradeCase.SalesOrderId && x.Status == SalesDeliveryStatus.Posted, ct);
                if (delivery is null) return Results.Conflict(new { error = "Seçilen teslimat belgesi aynı firmaya ve dış ticaret siparişine ait kayıtlı bir belge değil." });
                if (!await HasPostedInventoryMovementsAsync(db, tenantId, delivery.Lines.Select(x => x.Id).ToArray(), purchase: false, ct))
                    return Results.Conflict(new { error = "Teslimat belgesinin tüm satırları için stok defteri hareketi bulunmalıdır." });
                if (await db.Set<ForeignTradeCase>().AnyAsync(x => x.TenantId == tenantId && x.SalesDeliveryId == delivery.Id, ct))
                    return Results.Conflict(new { error = "Bu teslimat belgesi başka bir dış ticaret dosyasına bağlı." });
                tradeCase.SalesDeliveryId = delivery.Id;
            }
            tradeCase.InventoryDocumentLinkedAt = DateTimeOffset.UtcNow;
            tradeCase.InventoryDocumentLinkedByUserId = UserId(user);
            tradeCase.UpdatedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "foreign-trade.case.inventory-document-linked", Resource = $"{tradeCase.ReferenceCode}:{request.DocumentId:D}" });
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException exception) when (exception.InnerException is SqlException { Number: 2601 or 2627 })
            { return Results.Conflict(new { error = "Bu stok belgesi başka bir dış ticaret dosyasına bağlanmış." }); }
            if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Ok(ToView(tradeCase));
        });

        group.MapPost("/cases/{id:guid}/transition", async (Guid id, ForeignTradeTransitionRequest request, ClaimsPrincipal user, TenantDbContext db,
            IPlatformPermissionAuthorizer authorizer, CancellationToken ct) =>
        {
            if (!TryTenant(user, out var tenantId) || !await IsAllowedAsync(user, tenantId, "erp.foreign-trade.execute", authorizer, ct)) return Results.Forbid();
            var record = await db.Set<ForeignTradeCase>().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (!Enum.TryParse<ForeignTradeStatus>(request.Status, true, out var next) || !Enum.IsDefined(next)) return Results.BadRequest(new { error = "Yeni durum geçersiz." });
            if (!CanTransition(record.Status, next)) return Results.Conflict(new { error = $"{record.Status} durumundan {next} durumuna geçişe izin verilmiyor." });
            var transitionValidation = ValidateTransition(request);
            if (transitionValidation is not null) return Results.ValidationProblem(transitionValidation);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            if (next == ForeignTradeStatus.Shipped)
            {
                if (!record.PlannedShipDate.HasValue || record.DeclaredValue <= 0 || string.IsNullOrWhiteSpace(record.IncotermsCode))
                    return Results.Conflict(new { error = "Sevkiyat öncesinde planlanan tarih, pozitif beyan değeri ve Incoterms kodu girilmelidir." });
                record.ActualShipDate = request.ActualDate ?? today;
            }
            if (next == ForeignTradeStatus.Arrived) record.ActualArrivalDate = request.ActualDate ?? today;
            if (next == ForeignTradeStatus.CustomsClearance && string.IsNullOrWhiteSpace(request.CustomsReference) && string.IsNullOrWhiteSpace(record.CustomsReference))
                return Results.Conflict(new { error = "Gümrük işlemine geçmek için gümrük referansı girilmelidir." });
            if (next == ForeignTradeStatus.CustomsClearance && record.Direction == ForeignTradeDirection.Export && record.InventoryPostingRequired)
            {
                if (!record.SalesDeliveryId.HasValue)
                    return Results.Conflict(new { error = "İhracat gümrük aşamasına geçmeden önce standart teslimat belgesini oluşturup stoktan düşürün ve bu dosyaya bağlayın." });
                var postedDelivery = await db.SalesDeliveries.AsNoTracking().Include(x => x.Lines)
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == record.SalesDeliveryId && x.OrderId == record.SalesOrderId && x.Status == SalesDeliveryStatus.Posted, ct);
                if (postedDelivery is null || !await HasPostedInventoryMovementsAsync(db, tenantId, postedDelivery.Lines.Select(x => x.Id).ToArray(), purchase: false, ct))
                    return Results.Conflict(new { error = "Bağlı teslimat belgesi artık kayıtlı ve etkin stok hareketlerine sahip değil; dosyayı ilerletmeden önce belge durumunu düzeltin." });
            }
            if (next == ForeignTradeStatus.Arrived && record.ActualShipDate.HasValue && record.ActualArrivalDate < record.ActualShipDate)
                return Results.Conflict(new { error = "Gerçek varış tarihi gerçek sevkiyat tarihinden önce olamaz." });
            if (next == ForeignTradeStatus.Closed && !record.ActualArrivalDate.HasValue)
                return Results.Conflict(new { error = "Dosya kapatılmadan önce gerçek varış tarihi kaydedilmelidir." });
            if (next == ForeignTradeStatus.Closed && record.Direction == ForeignTradeDirection.Import && record.InventoryPostingRequired)
            {
                if (!record.PurchaseReceiptId.HasValue)
                    return Results.Conflict(new { error = "İthalat dosyası kapanmadan önce standart mal kabul belgesini oluşturup stoğa alın ve bu dosyaya bağlayın." });
                var postedReceipt = await db.PurchaseReceipts.AsNoTracking().Include(x => x.Lines)
                    .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == record.PurchaseReceiptId && x.PurchaseOrderId == record.PurchaseOrderId && x.Status == PurchaseReceiptStatus.Posted, ct);
                if (postedReceipt is null || !await HasPostedInventoryMovementsAsync(db, tenantId, postedReceipt.Lines.Select(x => x.Id).ToArray(), purchase: true, ct))
                    return Results.Conflict(new { error = "Bağlı mal kabul belgesi artık kayıtlı ve etkin stok hareketlerine sahip değil; dosyayı ilerletmeden önce belge durumunu düzeltin." });
            }
            var previous = record.Status;
            record.Status = next; record.UpdatedAt = DateTimeOffset.UtcNow;
            if (!string.IsNullOrWhiteSpace(request.CustomsReference)) record.CustomsReference = NormalizeOptional(request.CustomsReference);
            if (!string.IsNullOrWhiteSpace(request.CarrierReference)) record.CarrierReference = NormalizeOptional(request.CarrierReference);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = UserId(user), Action = "foreign-trade.case.status-changed", Resource = $"{record.ReferenceCode}:{previous}->{next}" });
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(record));
        });
    }

    private static Dictionary<string, string[]>? Validate(ForeignTradeCaseWriteRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (!TryDirection(request.Direction, out _)) errors["direction"] = ["Yön Import veya Export olmalıdır."];
        if (string.IsNullOrWhiteSpace(request.ReferenceCode) || request.ReferenceCode.Trim().Length > 50 || !Regex.IsMatch(request.ReferenceCode.Trim(), "^[A-Za-z0-9][A-Za-z0-9._/-]{0,49}$")) errors["referenceCode"] = ["Referans 1–50 karakter olmalı ve harf, rakam, nokta, alt çizgi, eğik çizgi veya tire içermelidir."];
        if (!CountryCode(request.OriginCountryCode)) errors["originCountryCode"] = ["Çıkış ülkesi ISO 3166-1 alfa-2 kodu olmalıdır."];
        if (!CountryCode(request.DestinationCountryCode)) errors["destinationCountryCode"] = ["Varış ülkesi ISO 3166-1 alfa-2 kodu olmalıdır."];
        if (CountryCode(request.OriginCountryCode) && CountryCode(request.DestinationCountryCode) && request.OriginCountryCode!.Equals(request.DestinationCountryCode, StringComparison.OrdinalIgnoreCase)) errors["destinationCountryCode"] = ["Çıkış ve varış ülkeleri farklı olmalıdır."];
        if (request.IncotermsCode is { Length: > 0 } incoterms && !AllowedIncoterms.Contains(incoterms.Trim().ToUpperInvariant(), StringComparer.Ordinal)) errors["incotermsCode"] = ["2020 Incoterms kodlarından birini seçin."];
        if (request.HarmonizedSystemCode is { Length: > 0 } hs && !Regex.IsMatch(hs.Trim(), "^[0-9]{6,10}$")) errors["harmonizedSystemCode"] = ["HS kodu 6–10 rakam olmalıdır."];
        if (!AllowedTransportModes.Contains(request.TransportMode, StringComparer.Ordinal)) errors["transportMode"] = ["Taşıma türü geçersiz."];
        if (request.DeclaredValue is < 0 or > 999999999999m) errors["declaredValue"] = ["Beyan değeri sıfır veya pozitif ve sınırlar içinde olmalıdır."];
        if (request.CarrierReference?.Length > 100) errors["carrierReference"] = ["Taşıyıcı referansı en fazla 100 karakter olmalıdır."];
        if (request.CustomsReference?.Length > 100) errors["customsReference"] = ["Gümrük referansı en fazla 100 karakter olmalıdır."];
        if (request.Notes?.Length > 1000) errors["notes"] = ["Not en fazla 1000 karakter olmalıdır."];
        if (request.PlannedShipDate.HasValue && request.PlannedArrivalDate.HasValue && request.PlannedArrivalDate < request.PlannedShipDate) errors["plannedArrivalDate"] = ["Tahmini varış tarihi planlanan sevkiyattan önce olamaz."];
        return errors.Count == 0 ? null : errors;
    }

    private static Dictionary<string, string[]>? ValidateTransition(ForeignTradeTransitionRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        if (request.CarrierReference?.Length > 100) errors["carrierReference"] = ["Taşıyıcı referansı en fazla 100 karakter olmalıdır."];
        if (request.CustomsReference?.Length > 100) errors["customsReference"] = ["Gümrük referansı en fazla 100 karakter olmalıdır."];
        if (request.ActualDate is { } actualDate && actualDate > DateOnly.FromDateTime(DateTime.UtcNow))
            errors["actualDate"] = ["Gerçek sevkiyat veya varış tarihi gelecekte olamaz."];
        return errors.Count == 0 ? null : errors;
    }

    private static bool CanTransition(ForeignTradeStatus current, ForeignTradeStatus next) => (current, next) switch
    {
        (ForeignTradeStatus.Draft, ForeignTradeStatus.Booked or ForeignTradeStatus.Cancelled) => true,
        (ForeignTradeStatus.Booked, ForeignTradeStatus.Shipped or ForeignTradeStatus.Cancelled) => true,
        (ForeignTradeStatus.Shipped, ForeignTradeStatus.CustomsClearance) => true,
        (ForeignTradeStatus.CustomsClearance, ForeignTradeStatus.Arrived) => true,
        (ForeignTradeStatus.Arrived, ForeignTradeStatus.Closed) => true,
        _ => false
    };

    private static ForeignTradeCaseView ToView(ForeignTradeCase x) => new(x.Id, x.Direction.ToString(), x.Status.ToString(), x.PurchaseOrderId, x.SalesOrderId,
        x.ReferenceCode, x.OriginCountryCode, x.DestinationCountryCode, x.IncotermsCode, x.HarmonizedSystemCode, x.TransportMode, x.CarrierReference,
        x.CustomsReference, x.DeclaredValue, x.CurrencyCode, x.PlannedShipDate, x.ActualShipDate, x.PlannedArrivalDate, x.ActualArrivalDate, x.Notes, x.UpdatedAt,
        x.InventoryPostingRequired, x.PurchaseReceiptId, x.SalesDeliveryId, x.InventoryDocumentLinkedAt);
    private static async Task<bool> HasPostedInventoryMovementsAsync(TenantDbContext db, Guid tenantId, Guid[] lineIds, bool purchase, CancellationToken ct)
    {
        if (lineIds.Length == 0) return false;
        var distinctIds = lineIds.Distinct().ToArray();
        var movementCount = purchase
            ? await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.PurchaseReceiptLineId != null && distinctIds.Contains(x.PurchaseReceiptLineId.Value) && x.ReversalOfId == null && !db.InventoryTransactions.Any(r => r.TenantId == tenantId && r.ReversalOfId == x.Id)).Select(x => x.PurchaseReceiptLineId!.Value).Distinct().CountAsync(ct)
            : await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.SalesDeliveryLineId != null && distinctIds.Contains(x.SalesDeliveryLineId.Value) && x.ReversalOfId == null && !db.InventoryTransactions.Any(r => r.TenantId == tenantId && r.ReversalOfId == x.Id)).Select(x => x.SalesDeliveryLineId!.Value).Distinct().CountAsync(ct);
        return movementCount == distinctIds.Length;
    }
    private static bool TryDirection(string? value, out ForeignTradeDirection direction) => Enum.TryParse(value, true, out direction) && Enum.IsDefined(direction);
    private static bool CountryCode(string? value) => value is { Length: 2 } && Iso3166Alpha2Codes.Contains(value.ToUpperInvariant());
    private static string? NormalizeOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static Guid? UserId(ClaimsPrincipal user) => Guid.TryParse(user.FindFirstValue("sub"), out var id) ? id : null;
    private static bool TryTenant(ClaimsPrincipal user, out Guid tenantId) => Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
    private static async Task<bool> IsAllowedAsync(ClaimsPrincipal user, Guid tenantId, string permissionCode,
        IPlatformPermissionAuthorizer authorizer, CancellationToken cancellationToken)
    {
        var userId = UserId(user);
        var role = user.FindFirstValue("role");
        var permission = PlatformPermissionCatalog.Definitions.FirstOrDefault(x => x.Code == permissionCode);
        if (userId is null || string.IsNullOrWhiteSpace(role) || permission is null) return false;
        var resolved = new ResolvedPlatformPermission(permission, new Dictionary<string, string>
        {
            ["subject.userId"] = userId.Value.ToString("D"),
            ["subject.role"] = role,
            ["resource.type"] = permission.ResourceType,
            ["resource.tenantId"] = tenantId.ToString("D"),
            ["request.action"] = permission.Action
        });
        return await authorizer.IsAllowedAsync(tenantId, userId.Value, role, resolved, cancellationToken);
    }
}

public sealed record ForeignTradeCaseWriteRequest(string? Direction, Guid? PurchaseOrderId, Guid? SalesOrderId, string? ReferenceCode,
    string? OriginCountryCode, string? DestinationCountryCode, string? IncotermsCode, string? HarmonizedSystemCode,
    string? TransportMode, string? CarrierReference, string? CustomsReference, decimal DeclaredValue,
    DateOnly? PlannedShipDate, DateOnly? PlannedArrivalDate, string? Notes);
public sealed record ForeignTradeTransitionRequest(string? Status, DateOnly? ActualDate, string? CarrierReference, string? CustomsReference);
public sealed record ForeignTradeInventoryDocumentRequest(Guid DocumentId);
public sealed record ForeignTradeInventoryDocumentOption(Guid Id, string Code, DateOnly DocumentDate, string WarehouseName, int LineCount, bool IsLinked);
public sealed record ForeignTradeOrderOption(Guid Id, string Code, string CounterpartyName, DateOnly OrderDate, string CurrencyCode, decimal GrandTotal, string Status);
public sealed record ForeignTradeCaseView(Guid Id, string Direction, string Status, Guid? PurchaseOrderId, Guid? SalesOrderId,
    string ReferenceCode, string OriginCountryCode, string DestinationCountryCode, string? IncotermsCode, string? HarmonizedSystemCode,
    string TransportMode, string? CarrierReference, string? CustomsReference, decimal DeclaredValue, string CurrencyCode,
    DateOnly? PlannedShipDate, DateOnly? ActualShipDate, DateOnly? PlannedArrivalDate, DateOnly? ActualArrivalDate, string? Notes, DateTimeOffset UpdatedAt,
    bool InventoryPostingRequired, Guid? PurchaseReceiptId, Guid? SalesDeliveryId, DateTimeOffset? InventoryDocumentLinkedAt);
