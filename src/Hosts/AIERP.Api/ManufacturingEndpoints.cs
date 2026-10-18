using System.Data;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

public static class ManufacturingEndpoints
{
    public static void MapManufacturingEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/manufacturing").WithTags("Üretim").RequireAuthorization();
        var boms = group.MapGroup("/boms");
        var orders = group.MapGroup("/orders");
        var workCenters = group.MapGroup("/work-centers");

        workCenters.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            return Results.Ok(await db.ManufacturingWorkCenters.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.Code).Take(200).Select(x => new WorkCenterView(x.Id, x.Code, x.Name, x.CapacityMinutesPerDay,
                    x.LaborCostPerHourBase, x.OverheadCostPerHourBase, x.IsActive)).ToListAsync(ct));
        });

        workCenters.MapPost("/", async (WorkCenterWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var code = request.Code?.Trim().ToUpperInvariant(); var name = request.Name?.Trim();
            if (!ValidCode(code) || string.IsNullOrWhiteSpace(name) || name.Length > 160 || request.CapacityMinutesPerDay is < 1 or > 1440 ||
                request.LaborCostPerHourBase is < 0m or > 99999999999999.9999m || request.OverheadCostPerHourBase is < 0m or > 99999999999999.9999m)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["workCenter"] = ["Kod, ad, günlük kapasite (1–1440 dakika) ve geçerli saatlik maliyetler zorunludur."] });
            if (await db.ManufacturingWorkCenters.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu tenant için iş merkezi kodu zaten kullanımda." });
            var center = new ManufacturingWorkCenter { TenantId = tenantId, Code = code!, Name = name!, CapacityMinutesPerDay = request.CapacityMinutesPerDay,
                LaborCostPerHourBase = decimal.Round(request.LaborCostPerHourBase, 4, MidpointRounding.AwayFromZero),
                OverheadCostPerHourBase = decimal.Round(request.OverheadCostPerHourBase, 4, MidpointRounding.AwayFromZero) };
            db.ManufacturingWorkCenters.Add(center);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.work-center.created", Resource = code! });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/manufacturing/work-centers/{center.Id}", new WorkCenterView(center.Id, center.Code, center.Name,
                center.CapacityMinutesPerDay, center.LaborCostPerHourBase, center.OverheadCostPerHourBase, center.IsActive));
        });

        group.MapPost("/mrp/plan", async (MrpPlanRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var requestedDemand = request.Demand ?? [];
            if (request.WarehouseId == Guid.Empty || requestedDemand.Count > 100 || (requestedDemand.Count == 0 && !request.IncludeOpenSalesOrders) ||
                requestedDemand.Any(x => x.StockItemId == Guid.Empty || x.Quantity is <= 0m or > 99999999999999.9999m) ||
                requestedDemand.GroupBy(x => (x.StockItemId, x.RequiredByDate ?? request.PlanDate)).Any(x => x.Count() > 1))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["demand"] = ["Plan için depo ve 1–100 benzersiz tarih/stok kombinasyonlu, pozitif talep satırı gereklidir."] });
            var planningDate = request.PlanDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
            var today = DateOnly.FromDateTime(DateTime.UtcNow);
            if (planningDate < today.AddYears(-10) || planningDate > today.AddYears(10))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["planDate"] = ["Planlama tarihi bugünün en fazla 10 yıl öncesi/sonrası olabilir."] });
            if (requestedDemand.Any(x => x.RequiredByDate is { } due && (due < planningDate.AddYears(-10) || due > planningDate.AddYears(10))))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["demand"] = ["İhtiyaç tarihleri planlama tarihinin en fazla 10 yıl öncesi/sonrası olabilir."] });
            if (!await db.Warehouses.AsNoTracking().AnyAsync(x => x.TenantId == tenantId && x.Id == request.WarehouseId && x.IsActive, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["warehouseId"] = ["Aktif depo bulunamadı."] });
            var itemIds = requestedDemand.Select(x => x.StockItemId).Distinct().ToArray();
            if (await db.StockItems.AsNoTracking().CountAsync(x => x.TenantId == tenantId && x.IsActive && itemIds.Contains(x.Id), ct) != itemIds.Length)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["demand"] = ["Talep satırlarından biri bu tenantta bulunamadı veya pasif."] });
            try
            {
                var result = await CalculateMrpAsync(db, tenantId, request, ct);
                if (result.Error is not null) return Results.Conflict(new { error = result.Error });
                if (result.Plan!.Lines.Count > 500 || result.Plan.Lines.Sum(x => x.Sources.Count) > 5000)
                    return Results.Conflict(new { error = "Plan saklama sınırı aşıldı; talebi daraltıp yeniden hesaplayın." });
                var snapshot = new MrpPlanSnapshot
                {
                    TenantId = tenantId,
                    WarehouseId = result.Plan.WarehouseId,
                    PlanDate = planningDate,
                    IncludesOpenSalesOrders = result.Plan.IncludesOpenSalesOrders,
                    SupplyCaveat = result.Plan.SupplyCaveat,
                    ResultJson = JsonSerializer.Serialize(result.Plan),
                    CreatedByUserId = userId
                };
                db.MrpPlanSnapshots.Add(snapshot);
                db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.mrp-plan.created", Resource = snapshot.Id.ToString() });
                await db.SaveChangesAsync(ct);
                return Results.Ok(result.Plan with { PlanId = snapshot.Id });
            }
            catch (OverflowException)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["demand"] = ["Reçete patlatma miktarı desteklenen decimal sınırını aşıyor."] });
            }
        }).WithName("PlanMaterialRequirements");

        group.MapGet("/mrp/plans", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var rows = await db.MrpPlanSnapshots.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderByDescending(x => x.CreatedAt).Take(100)
                .Select(x => new MrpPlanHistoryView(x.Id, x.WarehouseId, x.PlanDate, x.IncludesOpenSalesOrders, x.CreatedAt, x.CreatedByUserId))
                .ToListAsync(ct);
            return Results.Ok(rows);
        }).WithName("ListMrpPlans");

        group.MapGet("/mrp/plans/{id:guid}", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var snapshot = await db.MrpPlanSnapshots.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (snapshot is null) return Results.NotFound();
            var plan = JsonSerializer.Deserialize<MrpPlanView>(snapshot.ResultJson);
            var converted = ReadMrpConversionState(snapshot.ConversionStateJson);
            return plan is null ? Results.Problem("MRP plan snapshot could not be read.", statusCode: 500) : Results.Ok(plan with { PlanId = snapshot.Id, ConvertedLineIndexes = converted.Select(x => x.LineIndex).ToArray() });
        }).WithName("GetMrpPlan");

        group.MapPost("/mrp/plans/{id:guid}/convert", async (Guid id, MrpPlanConvertRequest request, ClaimsPrincipal user,
            TenantDbContext db, PlatformDbContext platformDb, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!request.Confirm || request.Lines is null || request.Lines.Count is < 1 or > 100 ||
                request.Lines.Select(x => x.LineIndex).Distinct().Count() != request.Lines.Count || request.Lines.Any(x => x.LineIndex < 0))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["confirmation"] = ["En az bir benzersiz öneri satırı seçin ve dönüşümü açıkça onaylayın."] });

            var snapshot = await db.MrpPlanSnapshots.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (snapshot is null) return Results.NotFound();
            var plan = JsonSerializer.Deserialize<MrpPlanView>(snapshot.ResultJson);
            if (plan is null) return Results.Problem("MRP plan snapshot could not be read.", statusCode: 500);
            var selected = new List<(int Index, MrpLineView Line, MrpPlanConvertLineRequest Choice)>();
            foreach (var choice in request.Lines)
            {
                if (choice.LineIndex >= plan.Lines.Count) return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Seçilen öneri satırı bu planda bulunamadı."] });
                var line = plan.Lines[choice.LineIndex];
                if (line.Recommendation is not ("Üret" or "Satın al") || line.NetRequirement <= 0m || line.Issue is not null)
                    return Results.Conflict(new { error = $"{line.StockCode} satırı uygulanabilir bir üretim/satın alma önerisi değil." });
                selected.Add((choice.LineIndex, line, choice));
            }
            var previous = ReadMrpConversionState(snapshot.ConversionStateJson);
            var previousIndexes = previous.Select(x => x.LineIndex).ToHashSet();
            if (selected.Any(x => previousIndexes.Contains(x.Index))) return Results.Conflict(new { error = "Bu plan satırlarından en az biri daha önce emre dönüştürüldü." });

            var purchaseLines = selected.Where(x => x.Line.Recommendation == "Satın al").ToArray();
            TenantMembership? userMembership = null;
            if (purchaseLines.Length > 0)
            {
                userMembership = await platformDb.TenantMemberships.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.UserId == userId, ct);
                if (userMembership is null) return Results.Forbid();
            }
            if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == snapshot.WarehouseId && x.IsActive, ct))
                return Results.Conflict(new { error = "Planın deposu artık etkin değil; yeni plan hesaplayın." });

            var fieldDefinitions = await db.PurchaseRequestCustomFieldDefinitions.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.IsActive).ToListAsync(ct);
            var normalizedFields = new Dictionary<Guid, (PurchaseRequestCustomFieldDefinition Definition, string Value)>();
            var fieldErrors = new Dictionary<string, string[]>();
            if (purchaseLines.Length > 0)
            {
                if (request.PurchaseRequestCustomFields is { Count: > 40 })
                    fieldErrors["purchaseRequestCustomFields"] = ["En fazla 40 özel alan gönderilebilir."];
                var byCode = fieldDefinitions.ToDictionary(x => x.Code, StringComparer.Ordinal);
                if (request.PurchaseRequestCustomFields is not null)
                foreach (var (code, rawValue) in request.PurchaseRequestCustomFields)
                {
                    if (!byCode.TryGetValue(code, out var definition)) { fieldErrors[$"purchaseRequestCustomFields.{code}"] = ["Alan kodu bu tenant içinde etkin değil."]; continue; }
                    if (!StockCustomFieldValidation.TryNormalize(definition.DataType, definition.MaxLength, rawValue, out var value))
                    { fieldErrors[$"purchaseRequestCustomFields.{code}"] = [$"'{definition.Label}' alanı geçersiz."]; continue; }
                    if (value.Length > 0) normalizedFields[definition.Id] = (definition, value);
                }
                foreach (var definition in fieldDefinitions.Where(x => x.IsRequired && !normalizedFields.ContainsKey(x.Id)))
                    fieldErrors[$"purchaseRequestCustomFields.{definition.Code}"] = [$"'{definition.Label}' alanı zorunludur."];
            }
            if (fieldErrors.Count > 0) return Results.ValidationProblem(fieldErrors);

            foreach (var suggestion in selected.Where(x => x.Line.Recommendation == "Üret"))
            {
                var candidates = await db.BillOfMaterials.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && x.ProductStockItemId == suggestion.Line.StockItemId)
                    .Select(x => x.Id).ToListAsync(ct);
                var bomId = suggestion.Choice.BillOfMaterialId ?? (candidates.Count == 1 ? candidates[0] : Guid.Empty);
                if (bomId == Guid.Empty || !candidates.Contains(bomId))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { [$"lines[{suggestion.Index}].billOfMaterialId"] = ["Bu üretim önerisi için geçerli aktif ürün reçetesini seçin."] });
            }

            Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction? transaction = null;
            try
            {
                if (db.Database.IsRelational()) transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);
                if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == snapshot.WarehouseId && x.IsActive, ct))
                    return Results.Conflict(new { error = "Planın deposu artık etkin değil; yeni plan hesaplayın." });
                var requestDate = DateOnly.FromDateTime(DateTime.UtcNow);
                var created = new List<MrpConversionResult>();
                foreach (var suggestion in selected)
                {
                    var code = $"MRP-{id.ToString("N")[..8]}-{suggestion.Index + 1}";
                    if (suggestion.Line.Recommendation == "Satın al")
                    {
                        var item = await db.StockItems.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == suggestion.Line.StockItemId && x.IsActive, ct);
                        if (item is null) return Results.Conflict(new { error = $"{suggestion.Line.StockCode} stok kartı artık etkin değil." });
                        if (item.TrackingMode == InventoryTrackingMode.Serial && suggestion.Line.NetRequirement != decimal.Truncate(suggestion.Line.NetRequirement))
                            return Results.Conflict(new { error = $"{item.Code} seri izlemeli olduğu için önerilen miktar tam sayı olmalıdır." });
                        if (await db.PurchaseRequests.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                            return Results.Conflict(new { error = $"Oluşturma kodu {code} zaten kullanılıyor." });
                        var purchaseRequest = new PurchaseRequest { TenantId = tenantId, RequestedByUserId = userId,
                            RequestedBy = userMembership!, Code = code, RequestDate = requestDate,
                            NeededByDate = suggestion.Line.RequiredByDate < requestDate ? requestDate : suggestion.Line.RequiredByDate,
                            Description = $"MRP planı {id:N} · {item.Code} için önerilen sipariş tarihi {suggestion.Line.RecommendedOrderDate}, ihtiyaç tarihi {suggestion.Line.RequiredByDate}" };
                        purchaseRequest.Lines.Add(new PurchaseRequestLine { TenantId = tenantId, PurchaseRequest = purchaseRequest,
                            LineNumber = 1, StockItemId = item.Id, StockCode = item.Code, StockName = item.Name,
                            UnitCode = item.UnitCode, Quantity = suggestion.Line.NetRequirement });
                        foreach (var (definitionId, value) in normalizedFields)
                        {
                            purchaseRequest.CustomFieldValues.Add(new PurchaseRequestCustomFieldValue { TenantId = tenantId, PurchaseRequestId = purchaseRequest.Id,
                                DefinitionId = definitionId, Value = value.Value, DefinitionVersion = value.Definition.Version });
                            db.PurchaseRequestCustomFieldValueRevisions.Add(new PurchaseRequestCustomFieldValueRevision { TenantId = tenantId,
                                PurchaseRequestId = purchaseRequest.Id, DefinitionId = definitionId, NewValue = value.Value,
                                DefinitionVersion = value.Definition.Version, ChangedByUserId = userId });
                        }
                        db.PurchaseRequests.Add(purchaseRequest);
                        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "purchase-request.submitted-from-mrp", Resource = code });
                        await BusinessRuleEndpoints.ApplyPurchaseRequestRulesAsync(db, purchaseRequest, ct);
                        created.Add(new MrpConversionResult(suggestion.Index, "PurchaseRequest", purchaseRequest.Id, code));
                    }
                    else
                    {
                        var bom = await db.BillOfMaterials.Include(x => x.Lines).Include(x => x.Operations)
                            .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == suggestion.Choice.BillOfMaterialId ||
                                x.TenantId == tenantId && suggestion.Choice.BillOfMaterialId == null && x.IsActive && x.ProductStockItemId == suggestion.Line.StockItemId, ct);
                        if (bom is null || !bom.IsActive || bom.ProductStockItemId != suggestion.Line.StockItemId)
                            return Results.Conflict(new { error = $"{suggestion.Line.StockCode} için reçete değişti; planı yeniden hesaplayın." });
                        if (await db.ManufacturingOrders.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                            return Results.Conflict(new { error = $"Oluşturma kodu {code} zaten kullanılıyor." });
                        var centers = await db.ManufacturingWorkCenters.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && bom.Operations.Select(o => o.WorkCenterId).Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
                        if (centers.Count != bom.Operations.Select(x => x.WorkCenterId).Distinct().Count())
                            return Results.Conflict(new { error = $"{bom.Code} reçetesindeki bir iş merkezi etkin değil." });
                        var componentIds = bom.Lines.Select(x => x.ComponentStockItemId).Distinct().ToArray();
                        var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && componentIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
                        if (items.Count != componentIds.Length) return Results.Conflict(new { error = $"{bom.Code} reçetesinde etkin olmayan bir bileşen var." });
                        (BillOfMaterialLine line, decimal quantity)[] components;
                        try { components = bom.Lines.Select(x => (x, decimal.Round(x.Quantity * (1m + x.ScrapPercent / 100m) / bom.OutputQuantity * suggestion.Line.NetRequirement, 4, MidpointRounding.AwayFromZero))).ToArray(); }
                        catch (OverflowException) { return Results.Conflict(new { error = "Üretim önerisi bileşen miktarı sınırını aşıyor." }); }
                        if (components.Any(x => x.quantity <= 0m || x.quantity > 99999999999999.9999m || items[x.line.ComponentStockItemId].TrackingMode == InventoryTrackingMode.Serial && x.quantity != decimal.Truncate(x.quantity)))
                            return Results.Conflict(new { error = "Üretim önerisi reçete bileşen miktarlarıyla uyumlu değil." });
                        var product = await db.StockItems.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == bom.ProductStockItemId && x.IsActive, ct);
                        if (product is null || product.TrackingMode == InventoryTrackingMode.Serial && suggestion.Line.NetRequirement != decimal.Truncate(suggestion.Line.NetRequirement))
                            return Results.Conflict(new { error = "Üretim önerisi mamulün izleme gereksinimleriyle uyumlu değil." });
                        var order = new ManufacturingOrder { TenantId = tenantId, Code = code, BillOfMaterialId = bom.Id, WarehouseId = snapshot.WarehouseId,
                            PlannedQuantity = suggestion.Line.NetRequirement, PlannedDate = suggestion.Line.RecommendedOrderDate, Status = ManufacturingOrderStatus.Planned };
                        order.Lines = components.Select(x => new ManufacturingOrderLine { TenantId = tenantId, ComponentStockItemId = x.line.ComponentStockItemId,
                            ComponentCodeSnapshot = items[x.line.ComponentStockItemId].Code, ComponentNameSnapshot = items[x.line.ComponentStockItemId].Name, RequiredQuantity = x.quantity }).ToList();
                        try
                        {
                            order.Operations = bom.Operations.OrderBy(x => x.Sequence).Select(operation =>
                            {
                                var center = centers[operation.WorkCenterId];
                                var runMinutes = decimal.Round(operation.RunMinutesPerOutputUnit * order.PlannedQuantity / bom.OutputQuantity, 2, MidpointRounding.AwayFromZero);
                                var cost = decimal.Round((operation.SetupMinutes + runMinutes) / 60m * (center.LaborCostPerHourBase + center.OverheadCostPerHourBase), 4, MidpointRounding.AwayFromZero);
                                if (runMinutes > 9999999999.99m || cost > 99999999999999.9999m) throw new OverflowException();
                                return new ManufacturingOrderOperation { TenantId = tenantId, Sequence = operation.Sequence, WorkCenterId = center.Id,
                                    WorkCenterCodeSnapshot = center.Code, WorkCenterNameSnapshot = center.Name, SetupMinutes = operation.SetupMinutes,
                                    RunMinutes = runMinutes, LaborCostPerHourBase = center.LaborCostPerHourBase, OverheadCostPerHourBase = center.OverheadCostPerHourBase, PlannedCostBase = cost };
                            }).ToList();
                        }
                        catch (OverflowException) { return Results.Conflict(new { error = "Üretim önerisinin operasyon süresi veya maliyeti desteklenen aralığı aşıyor." }); }
                        db.ManufacturingOrders.Add(order);
                        db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.order.created-from-mrp", Resource = code });
                        created.Add(new MrpConversionResult(suggestion.Index, "ManufacturingOrder", order.Id, code));
                    }
                }
                snapshot.ConversionStateJson = JsonSerializer.Serialize(previous.Concat(created));
                await db.SaveChangesAsync(ct);
                if (transaction is not null) await transaction.CommitAsync(ct);
                return Results.Ok(new { planId = id, created, convertedLineCount = previousIndexes.Count + created.Count });
            }
            catch (DbUpdateConcurrencyException)
            {
                if (transaction is not null) await transaction.RollbackAsync(ct);
                return Results.Conflict(new { error = "MRP planı eşzamanlı olarak değiştirildi; plan geçmişini yenileyip tekrar deneyin." });
            }
            catch (DbUpdateException ex) when (ex.InnerException is Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 })
            {
                if (transaction is not null) await transaction.RollbackAsync(ct);
                return Results.Conflict(new { error = "Öneri siparişi daha önce oluşturuldu; planı yenileyin." });
            }
            finally { if (transaction is not null) await transaction.DisposeAsync(); }
        }).WithName("ConvertMrpPlanRecommendations");

        boms.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var rows = await db.BillOfMaterials.AsNoTracking().Where(x => x.TenantId == tenantId)
                .OrderBy(x => x.Code).Take(100).Select(x => new BomView(x.Id, x.Code, x.Name, x.ProductStockItemId,
                    db.StockItems.Where(s => s.TenantId == tenantId && s.Id == x.ProductStockItemId).Select(s => s.Code + " · " + s.Name).FirstOrDefault() ?? "",
                    db.StockItems.Where(s => s.TenantId == tenantId && s.Id == x.ProductStockItemId).Select(s => s.TrackingMode.ToString()).FirstOrDefault() ?? "None",
                    x.OutputQuantity, x.IsActive, x.Lines.OrderBy(l => l.ComponentStockItemId).Select(l => new BomLineView(l.ComponentStockItemId,
                        db.StockItems.Where(s => s.TenantId == tenantId && s.Id == l.ComponentStockItemId).Select(s => s.Code + " · " + s.Name).FirstOrDefault() ?? "",
                        l.Quantity, l.ScrapPercent)).ToList(), Convert.ToBase64String(x.RowVersion),
                    x.Operations.OrderBy(o => o.Sequence).Select(o => new BomOperationView(o.Sequence, o.WorkCenterId,
                        db.ManufacturingWorkCenters.Where(w => w.TenantId == tenantId && w.Id == o.WorkCenterId).Select(w => w.Code + " · " + w.Name).FirstOrDefault() ?? "",
                        o.SetupMinutes, o.RunMinutesPerOutputUnit)).ToList()))
                .ToListAsync(ct);
            return Results.Ok(rows);
        });

        boms.MapPost("/", async (BomWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!ValidateBom(request, out var code, out var name, out var error)) return Results.ValidationProblem(error!);
            var operations = request.Operations ?? [];
            if (operations.Count > 50 || operations.Any(x => x.Sequence <= 0 || x.WorkCenterId == Guid.Empty || x.SetupMinutes is < 0m or > 9999999999.99m ||
                    x.RunMinutesPerOutputUnit is < 0m or > 99999999.9999m || x.SetupMinutes + x.RunMinutesPerOutputUnit <= 0m) ||
                operations.Select(x => x.Sequence).Distinct().Count() != operations.Count)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["operations"] = ["Operasyon sırası benzersiz olmalı; süreler negatif olamaz ve en az bir süre pozitif olmalıdır (en fazla 50 operasyon)."] });
            var workCenterIds = operations.Select(x => x.WorkCenterId).Distinct().ToArray();
            var activeCenters = await db.ManufacturingWorkCenters.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && workCenterIds.Contains(x.Id)).ToListAsync(ct);
            if (activeCenters.Count != workCenterIds.Length)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["operations"] = ["Operasyonlardan biri için aktif iş merkezi bulunamadı."] });
            if (await db.BillOfMaterials.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu tenant için reçete kodu zaten kullanımda." });
            var product = await db.StockItems.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.ProductStockItemId && x.IsActive, ct);
            if (product is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["productStockItemId"] = ["Aktif mamul stok kartı bulunamadı."] });
            var componentIds = request.Lines.Select(x => x.ComponentStockItemId).Distinct().ToArray();
            if (componentIds.Length != request.Lines.Count || componentIds.Contains(product.Id))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Bileşenler tekrarsız olmalı ve mamulün kendisini içermemelidir."] });
            var components = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && componentIds.Contains(x.Id) && x.IsActive).ToListAsync(ct);
            if (components.Count != componentIds.Length)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["lines"] = ["Bileşenlerden biri bu tenantta bulunamadı veya pasif."] });
            var bom = new BillOfMaterial { TenantId = tenantId, Code = code!, Name = name!, ProductStockItemId = product.Id,
                OutputQuantity = request.OutputQuantity, IsActive = true };
            bom.Lines = request.Lines.Select(x => new BillOfMaterialLine { TenantId = tenantId, ComponentStockItemId = x.ComponentStockItemId,
                Quantity = x.Quantity, ScrapPercent = x.ScrapPercent }).ToList();
            bom.Operations = operations.OrderBy(x => x.Sequence).Select(x => new BillOfMaterialOperation { TenantId = tenantId, Sequence = x.Sequence,
                WorkCenterId = x.WorkCenterId, SetupMinutes = decimal.Round(x.SetupMinutes, 2, MidpointRounding.AwayFromZero),
                RunMinutesPerOutputUnit = decimal.Round(x.RunMinutesPerOutputUnit, 4, MidpointRounding.AwayFromZero) }).ToList();
            db.BillOfMaterials.Add(bom);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.bom.created", Resource = code! });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/manufacturing/boms/{bom.Id}", await ReadBomAsync(db, tenantId, bom.Id, ct));
        });

        boms.MapPost("/{id:guid}/deactivate", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            var bom = await db.BillOfMaterials.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
            if (bom is null) return Results.NotFound();
            if (await db.ManufacturingOrders.AnyAsync(x => x.TenantId == tenantId && x.BillOfMaterialId == id &&
                    (x.Status == ManufacturingOrderStatus.Planned || x.Status == ManufacturingOrderStatus.Released), ct))
                return Results.Conflict(new { error = "Açık üretim emri olan reçete pasife alınamaz." });
            if (!bom.IsActive) return Results.NoContent();
            bom.IsActive = false;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.bom.deactivated", Resource = bom.Code });
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        orders.MapGet("/", async (ClaimsPrincipal user, TenantDbContext db, string? status, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            var query = db.ManufacturingOrders.AsNoTracking().Where(x => x.TenantId == tenantId);
            if (!string.IsNullOrWhiteSpace(status))
            {
                if (!Enum.TryParse<ManufacturingOrderStatus>(status, true, out var parsed) || !Enum.IsDefined(parsed))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["status"] = ["Üretim emri durumu geçersiz."] });
                query = query.Where(x => x.Status == parsed);
            }
            var rows = await query.OrderByDescending(x => x.PlannedDate).ThenBy(x => x.Code).Take(100).Select(x => new OrderView(x.Id, x.Code,
                x.BillOfMaterialId, db.BillOfMaterials.Where(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId).Select(b => b.Code + " · " + b.Name).FirstOrDefault() ?? "",
                x.WarehouseId, db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.WarehouseId).Select(w => w.Code + " · " + w.Name).FirstOrDefault() ?? "",
                x.PlannedQuantity, x.Status.ToString(), x.PlannedDate, x.CompletedAt,
                x.Lines.OrderBy(l => l.ComponentCodeSnapshot).Select(l => new OrderLineView(l.ComponentStockItemId, l.ComponentCodeSnapshot, l.ComponentNameSnapshot, l.RequiredQuantity)).ToList(),
                x.Operations.OrderBy(o => o.Sequence).Select(o => new ManufacturingOrderOperationView(o.Id, o.Sequence, o.WorkCenterId,
                    o.WorkCenterCodeSnapshot, o.WorkCenterNameSnapshot, o.SetupMinutes, o.RunMinutes, o.PlannedCostBase,
                    o.ScheduledStartDate, o.ScheduledEndDate, o.LaborCostPerHourBase, o.OverheadCostPerHourBase, o.Status.ToString(),
                    o.ActualSetupMinutes, o.ActualRunMinutes, o.ActualCostBase, o.StartedAt, o.CompletedAt,
                    db.ManufacturingCapacityAllocations.Where(a => a.TenantId == tenantId && a.ManufacturingOrderOperationId == o.Id)
                        .OrderBy(a => a.ScheduledDate).Select(a => new CapacityDayView(a.ScheduledDate, a.AllocatedMinutes)).ToList())).ToList(),
                Convert.ToBase64String(x.RowVersion))).ToListAsync(ct);
            return Results.Ok(rows);
        });

        orders.MapPost("/", async (ManufacturingOrderWriteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (!ValidCode(request.Code) || request.PlannedQuantity is <= 0 or > 99999999999999.9999m || request.PlannedDate == default)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["order"] = ["Emir kodu, pozitif üretim miktarı veya plan tarihi geçersiz."] });
            var code = request.Code!.Trim().ToUpperInvariant();
            if (await db.ManufacturingOrders.AnyAsync(x => x.TenantId == tenantId && x.Code == code, ct))
                return Results.Conflict(new { error = "Bu tenant için üretim emri kodu zaten kullanımda." });
            var bom = await db.BillOfMaterials.AsNoTracking().Include(x => x.Lines).Include(x => x.Operations)
                .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == request.BillOfMaterialId && x.IsActive, ct);
            if (bom is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["billOfMaterialId"] = ["Aktif reçete bulunamadı."] });
            if (!await db.Warehouses.AnyAsync(x => x.TenantId == tenantId && x.Id == request.WarehouseId && x.IsActive, ct))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["warehouseId"] = ["Aktif depo bulunamadı."] });
            var centerIds = bom.Operations.Select(x => x.WorkCenterId).Distinct().ToArray();
            var centers = await db.ManufacturingWorkCenters.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive && centerIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            if (centers.Count != centerIds.Length) return Results.Conflict(new { error = "Reçetedeki operasyon iş merkezlerinden biri pasif veya bulunamıyor." });
            var items = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive &&
                (x.Id == bom.ProductStockItemId || bom.Lines.Select(l => l.ComponentStockItemId).Contains(x.Id))).ToListAsync(ct);
            if (items.Select(x => x.Id).Distinct().Count() != bom.Lines.Select(x => x.ComponentStockItemId).Append(bom.ProductStockItemId).Distinct().Count())
                return Results.Conflict(new { error = "Reçetedeki mamul veya bileşen stok kartlarından biri pasif." });
            var product = items.Single(x => x.Id == bom.ProductStockItemId);
            (BillOfMaterialLine line, decimal required)[] lines;
            try
            {
                lines = bom.Lines.Select(line => (line, decimal.Round(line.Quantity * (1m + line.ScrapPercent / 100m) /
                    bom.OutputQuantity * request.PlannedQuantity, 4, MidpointRounding.AwayFromZero))).ToArray();
            }
            catch (OverflowException)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["plannedQuantity"] = ["Plan miktarı reçete hesap sınırlarını aşıyor."] });
            }
            if (lines.Any(x => x.required <= 0m || x.required > 99999999999999.9999m))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["plannedQuantity"] = ["Plan miktarı reçete bileşen sınırlarını aşıyor."] });
            if (product.TrackingMode == InventoryTrackingMode.Serial && request.PlannedQuantity != decimal.Truncate(request.PlannedQuantity))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["plannedQuantity"] = ["Seri izlemeli mamulün plan miktarı tam sayı olmalıdır."] });
            if (lines.Any(x => items.Single(i => i.Id == x.line.ComponentStockItemId).TrackingMode == InventoryTrackingMode.Serial && x.required != decimal.Truncate(x.required)))
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["plannedQuantity"] = ["Seri izlemeli bileşenlerin planlanan tüketim miktarı tam sayı olmalıdır."] });
            var order = new ManufacturingOrder { TenantId = tenantId, Code = code, BillOfMaterialId = bom.Id, WarehouseId = request.WarehouseId,
                PlannedQuantity = request.PlannedQuantity, PlannedDate = request.PlannedDate, Status = ManufacturingOrderStatus.Planned };
            order.Lines = lines.Select(x => { var item = items.Single(i => i.Id == x.line.ComponentStockItemId); return new ManufacturingOrderLine {
                TenantId = tenantId, ComponentStockItemId = item.Id, ComponentCodeSnapshot = item.Code, ComponentNameSnapshot = item.Name, RequiredQuantity = x.required }; }).ToList();
            try
            {
                order.Operations = bom.Operations.OrderBy(x => x.Sequence).Select(operation =>
                {
                    var center = centers[operation.WorkCenterId];
                    var runMinutes = decimal.Round(operation.RunMinutesPerOutputUnit * request.PlannedQuantity / bom.OutputQuantity, 2, MidpointRounding.AwayFromZero);
                    var cost = decimal.Round((operation.SetupMinutes + runMinutes) / 60m * (center.LaborCostPerHourBase + center.OverheadCostPerHourBase), 4, MidpointRounding.AwayFromZero);
                    if (runMinutes > 9999999999.99m || cost > 99999999999999.9999m) throw new OverflowException();
                    return new ManufacturingOrderOperation { TenantId = tenantId, Sequence = operation.Sequence, WorkCenterId = center.Id,
                        WorkCenterCodeSnapshot = center.Code, WorkCenterNameSnapshot = center.Name, SetupMinutes = operation.SetupMinutes,
                        RunMinutes = runMinutes, LaborCostPerHourBase = center.LaborCostPerHourBase,
                        OverheadCostPerHourBase = center.OverheadCostPerHourBase, PlannedCostBase = cost };
                }).ToList();
            }
            catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["plannedQuantity"] = ["Operasyon süresi veya maliyeti desteklenen aralığı aşıyor."] }); }
            db.ManufacturingOrders.Add(order);
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.order.created", Resource = code });
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/manufacturing/orders/{order.Id}", await ReadOrderAsync(db, tenantId, order.Id, ct));
        });

        orders.MapPost("/{id:guid}/schedule", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out _)) return Results.Forbid();
            await using var transaction = await BeginMutationAsync(db, ct);
            var order = await LockOrderAsync(db, tenantId, id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status != ManufacturingOrderStatus.Planned) return Results.Conflict(new { error = "Yalnız planlı üretim emirleri kapasiteye çizelgelenebilir." });
            var operations = await db.ManufacturingOrderOperations.Where(x => x.TenantId == tenantId && x.ManufacturingOrderId == id).OrderBy(x => x.Sequence).ToListAsync(ct);
            if (operations.Count == 0) return Results.Conflict(new { error = "Emrin reçetesinde çizelgelenecek operasyon bulunmuyor." });
            var workCenterIds = operations.Select(x => x.WorkCenterId).Distinct().Order().ToArray();
            var centers = new Dictionary<Guid, ManufacturingWorkCenter>();
            foreach (var workCenterId in workCenterIds)
            {
                var center = db.Database.IsSqlServer()
                    ? await db.ManufacturingWorkCenters.FromSqlInterpolated($"SELECT * FROM [dbo].[ManufacturingWorkCenters] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {workCenterId}").SingleOrDefaultAsync(ct)
                    : await db.ManufacturingWorkCenters.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == workCenterId, ct);
                if (center is null || !center.IsActive) return Results.Conflict(new { error = "Operasyon iş merkezlerinden biri pasif veya bulunamıyor." });
                centers[center.Id] = center;
            }
            var operationIds = operations.Select(x => x.Id).ToArray();
            var previous = await db.ManufacturingCapacityAllocations.Where(x => x.TenantId == tenantId && operationIds.Contains(x.ManufacturingOrderOperationId)).ToListAsync(ct);
            db.ManufacturingCapacityAllocations.RemoveRange(previous);
            foreach (var operation in operations) { operation.ScheduledStartDate = null; operation.ScheduledEndDate = null; }
            var startDate = DateOnly.FromDateTime(DateTime.UtcNow);
            if (order.PlannedDate > startDate) startDate = order.PlannedDate;
            var loads = await db.ManufacturingCapacityAllocations.AsNoTracking().Where(x => x.TenantId == tenantId && workCenterIds.Contains(x.WorkCenterId) &&
                    !operationIds.Contains(x.ManufacturingOrderOperationId) && x.ScheduledDate >= startDate)
                .GroupBy(x => new { x.WorkCenterId, x.ScheduledDate }).Select(g => new { g.Key.WorkCenterId, g.Key.ScheduledDate, Minutes = g.Sum(x => x.AllocatedMinutes) })
                .ToDictionaryAsync(x => (x.WorkCenterId, x.ScheduledDate), x => x.Minutes, ct);
            var earliestDate = startDate;
            foreach (var operation in operations)
            {
                var remaining = operation.SetupMinutes + operation.RunMinutes;
                DateOnly? first = null; DateOnly? last = null;
                for (var day = earliestDate; remaining > 0m && day.DayNumber <= startDate.AddDays(365).DayNumber; day = day.AddDays(1))
                {
                    var center = centers[operation.WorkCenterId];
                    var key = (center.Id, day);
                    var free = Math.Max(0m, center.CapacityMinutesPerDay - loads.GetValueOrDefault(key));
                    var take = Math.Min(remaining, free);
                    if (take <= 0m) continue;
                    db.ManufacturingCapacityAllocations.Add(new ManufacturingCapacityAllocation { TenantId = tenantId,
                        ManufacturingOrderOperationId = operation.Id, WorkCenterId = center.Id, ScheduledDate = day, AllocatedMinutes = take });
                    loads[key] = loads.GetValueOrDefault(key) + take; remaining -= take;
                    first ??= day; last = day;
                }
                if (remaining > 0m) return Results.Conflict(new { error = $"{operation.WorkCenterCodeSnapshot} için 365 gün içinde yeterli günlük kapasite yok; çizelge kaydedilmedi." });
                operation.ScheduledStartDate = first; operation.ScheduledEndDate = last; earliestDate = last!.Value;
            }
            await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Ok(await ReadOrderAsync(db, tenantId, id, ct));
        });

        orders.MapPost("/{id:guid}/release", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            await using var transaction = await BeginMutationAsync(db, ct);
            var order = await LockOrderAsync(db, tenantId, id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status != ManufacturingOrderStatus.Planned) return Results.Conflict(new { error = "Yalnız planlı üretim emirleri serbest bırakılabilir." });
            var operations = await db.ManufacturingOrderOperations.AsNoTracking().Where(x => x.TenantId == tenantId && x.ManufacturingOrderId == id).ToListAsync(ct);
            if (operations.Any(x => x.ScheduledStartDate is null || x.ScheduledEndDate is null))
                return Results.Conflict(new { error = "Rota operasyonlarının tamamı serbest bırakılmadan önce kapasiteye çizelgelenmelidir." });
            order.Status = ManufacturingOrderStatus.Released;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.order.released", Resource = order.Code });
            await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Ok(await ReadOrderAsync(db, tenantId, id, ct));
        });

        orders.MapPost("/{id:guid}/operations/{operationId:guid}/start", async (Guid id, Guid operationId, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            await using var transaction = await BeginMutationAsync(db, ct);
            var order = await LockOrderAsync(db, tenantId, id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status != ManufacturingOrderStatus.Released) return Results.Conflict(new { error = "Operasyon yalnız serbest bırakılmış üretim emrinde başlatılabilir." });
            var operation = await db.ManufacturingOrderOperations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ManufacturingOrderId == id && x.Id == operationId, ct);
            if (operation is null) return Results.NotFound();
            if (operation.Status != ManufacturingOperationStatus.Planned || operation.ScheduledStartDate is null)
                return Results.Conflict(new { error = "Operasyon çizelgelenmemiş veya daha önce başlatılmış." });
            if (DateOnly.FromDateTime(DateTime.UtcNow) < operation.ScheduledStartDate.Value)
                return Results.Conflict(new { error = "Operasyon planlanan başlangıç tarihinden önce başlatılamaz." });
            if (await db.ManufacturingOrderOperations.AnyAsync(x => x.TenantId == tenantId && x.ManufacturingOrderId == id && x.Sequence < operation.Sequence &&
                    x.Status != ManufacturingOperationStatus.Completed, ct))
                return Results.Conflict(new { error = "Önceki rota operasyonları tamamlanmadan bu operasyon başlatılamaz." });
            operation.Status = ManufacturingOperationStatus.InProgress; operation.StartedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.operation.started", Resource = $"{order.Code}/{operation.Sequence}" });
            await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Ok(await ReadOrderAsync(db, tenantId, id, ct));
        });

        orders.MapPost("/{id:guid}/operations/{operationId:guid}/complete", async (Guid id, Guid operationId, ManufacturingOperationCompleteRequest request,
            ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            if (request.ActualSetupMinutes is < 0m or > 9999999999.99m || request.ActualRunMinutes is < 0m or > 9999999999.99m ||
                request.ActualSetupMinutes + request.ActualRunMinutes <= 0m)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["actualMinutes"] = ["Gerçek kurulum/çalışma süreleri negatif olamaz, desteklenen aralıkta olmalı ve toplam süre pozitif olmalıdır."] });
            await using var transaction = await BeginMutationAsync(db, ct);
            var order = await LockOrderAsync(db, tenantId, id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status != ManufacturingOrderStatus.Released) return Results.Conflict(new { error = "Operasyon yalnız serbest bırakılmış üretim emrinde tamamlanabilir." });
            var operation = await db.ManufacturingOrderOperations.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.ManufacturingOrderId == id && x.Id == operationId, ct);
            if (operation is null) return Results.NotFound();
            if (operation.Status != ManufacturingOperationStatus.InProgress) return Results.Conflict(new { error = "Yalnız başlatılmış operasyonlar tamamlanabilir." });
            decimal actualCost;
            try { actualCost = decimal.Round((request.ActualSetupMinutes + request.ActualRunMinutes) / 60m *
                (operation.LaborCostPerHourBase + operation.OverheadCostPerHourBase), 4, MidpointRounding.AwayFromZero); }
            catch (OverflowException) { return Results.ValidationProblem(new Dictionary<string, string[]> { ["actualMinutes"] = ["Gerçek operasyon maliyeti desteklenen aralığı aşıyor."] }); }
            if (actualCost > 99999999999999.9999m)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["actualMinutes"] = ["Gerçek operasyon maliyeti desteklenen aralığı aşıyor."] });
            operation.ActualSetupMinutes = decimal.Round(request.ActualSetupMinutes, 2, MidpointRounding.AwayFromZero);
            operation.ActualRunMinutes = decimal.Round(request.ActualRunMinutes, 2, MidpointRounding.AwayFromZero);
            operation.ActualCostBase = actualCost; operation.Status = ManufacturingOperationStatus.Completed; operation.CompletedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.operation.completed", Resource = $"{order.Code}/{operation.Sequence}" });
            await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.Ok(await ReadOrderAsync(db, tenantId, id, ct));
        });

        orders.MapPost("/{id:guid}/complete", async (Guid id, ManufacturingCompleteRequest request, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            await using var transaction = await BeginMutationAsync(db, ct);
            var order = await LockOrderAsync(db, tenantId, id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status != ManufacturingOrderStatus.Released) return Results.Conflict(new { error = "Yalnız serbest bırakılmış üretim emirleri tamamlanabilir." });
            var orderOperations = await db.ManufacturingOrderOperations.Where(x => x.TenantId == tenantId && x.ManufacturingOrderId == id).ToListAsync(ct);
            if (orderOperations.Any(x => x.Status != ManufacturingOperationStatus.Completed || x.ActualCostBase is null))
                return Results.Conflict(new { error = "Üretim emri tamamlanmadan önce tüm rota operasyonlarında gerçek süre ve maliyet kaydı tamamlanmalıdır." });
            var lines = await db.ManufacturingOrderLines.Where(x => x.TenantId == tenantId && x.ManufacturingOrderId == id).OrderBy(x => x.ComponentStockItemId).ToListAsync(ct);
            var warehouse = db.Database.IsSqlServer()
                ? await db.Warehouses.FromSqlInterpolated($"SELECT * FROM [dbo].[Warehouses] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {order.WarehouseId}").SingleOrDefaultAsync(ct)
                : await db.Warehouses.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == order.WarehouseId, ct);
            if (warehouse is null || !warehouse.IsActive) return Results.Conflict(new { error = "Üretim deposu bulunamadı veya pasif." });
            var bom = await db.BillOfMaterials.AsNoTracking().SingleAsync(x => x.TenantId == tenantId && x.Id == order.BillOfMaterialId, ct);
            var itemIds = lines.Select(x => x.ComponentStockItemId).Append(bom.ProductStockItemId).Distinct().Order().ToArray();
            var stockItems = new List<StockItem>();
            foreach (var itemId in itemIds)
            {
                var item = db.Database.IsSqlServer()
                    ? await db.StockItems.FromSqlInterpolated($"SELECT * FROM [dbo].[StockItems] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {itemId}").SingleOrDefaultAsync(ct)
                    : await db.StockItems.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == itemId, ct);
                if (item is null || !item.IsActive) return Results.Conflict(new { error = "Reçetedeki stok kartlarından biri bulunamadı veya pasif." });
                stockItems.Add(item);
            }
            var product = stockItems.Single(x => x.Id == bom.ProductStockItemId);
            var movementDate = DateOnly.FromDateTime(DateTime.UtcNow);
            var finishedTracking = request.FinishedGoodsTracking ?? [];
            var outputTrackingError = ValidateTrackingAllocations(product.TrackingMode, finishedTracking, order.PlannedQuantity);
            if (outputTrackingError is not null)
                return Results.ValidationProblem(new Dictionary<string, string[]> { ["finishedGoodsTracking"] = [outputTrackingError] });
            if (product.TrackingMode == InventoryTrackingMode.Lot)
            {
                if (finishedTracking.Any(x => x.ExpiryDate < movementDate))
                    return Results.ValidationProblem(new Dictionary<string, string[]> { ["finishedGoodsTracking"] = ["Üretilen lotun son kullanma tarihi bugünden önce olamaz."] });
                foreach (var allocation in finishedTracking)
                {
                    var priorExpiryDates = await db.InventoryTransactionTraces.AsNoTracking()
                        .Where(x => x.TenantId == tenantId && x.StockItemId == product.Id && x.TrackingCode == allocation.TrackingCode.Trim())
                        .Select(x => (DateOnly?)x.ExpiryDate).ToListAsync(ct);
                    if (priorExpiryDates.Any(x => x != allocation.ExpiryDate))
                        return Results.Conflict(new { error = $"Lot {allocation.TrackingCode} için son kullanma tarihi değiştirilmiş." });
                }
            }
            if (product.TrackingMode == InventoryTrackingMode.Serial)
            {
                foreach (var allocation in finishedTracking)
                    if (await db.InventoryTransactionTraces.AnyAsync(x => x.TenantId == tenantId && x.StockItemId == product.Id && x.TrackingCode == allocation.TrackingCode.Trim(), ct))
                        return Results.Conflict(new { error = $"Seri numarası {allocation.TrackingCode} daha önce kullanılmış." });
            }
            var componentIds = lines.Select(x => x.ComponentStockItemId).ToArray();
            var balances = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == order.WarehouseId && componentIds.Contains(x.StockItemId))
                .GroupBy(x => x.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
                .ToDictionaryAsync(x => x.Id, x => x.Quantity, ct);
            var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == order.WarehouseId &&
                    x.Status == SalesOrderReservationStatus.Active && componentIds.Contains(x.OrderLine.StockItemId))
                .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
                .ToDictionaryAsync(x => x.Id, x => x.Quantity, ct);
            var shortLines = lines.Where(x => balances.GetValueOrDefault(x.ComponentStockItemId) - reserved.GetValueOrDefault(x.ComponentStockItemId) < x.RequiredQuantity).ToList();
            if (shortLines.Count > 0) return Results.Conflict(new { error = "Bileşen stokları açık satış rezervasyonları düşüldükten sonra yetersiz.", shortages = shortLines.Select(x => new {
                x.ComponentStockItemId, x.ComponentCodeSnapshot, requiredQuantity = x.RequiredQuantity,
                availableQuantity = balances.GetValueOrDefault(x.ComponentStockItemId) - reserved.GetValueOrDefault(x.ComponentStockItemId) }) });

            var trackingItems = stockItems.ToDictionary(x => x.Id);
            var allocationsByLine = new Dictionary<Guid, List<InventoryTrackingAllocationRequest>>();
            foreach (var line in lines)
            {
                var component = trackingItems[line.ComponentStockItemId];
                if (component.TrackingMode == InventoryTrackingMode.None) continue;
                var allocations = await AllocateAvailableTrackingAsync(db, tenantId, order.WarehouseId, component, line.RequiredQuantity, movementDate: DateOnly.FromDateTime(DateTime.UtcNow), ct);
                if (allocations is null)
                    return Results.Conflict(new { error = $"{line.ComponentCodeSnapshot} için son kullanma tarihi geçmemiş, izlenen miktar yetersiz.", requiredQuantity = line.RequiredQuantity });
                allocationsByLine[line.Id] = allocations;
            }

            decimal? totalCost = 0m;
            try
            {
                foreach (var line in lines)
                {
                    var unitCost = await WeightedCostAsync(db, tenantId, line.ComponentStockItemId, movementDate, ct);
                    if (unitCost is null) totalCost = null;
                    else if (totalCost.HasValue) totalCost += decimal.Round(line.RequiredQuantity * unitCost.Value, 8, MidpointRounding.AwayFromZero);
                    db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = line.ComponentStockItemId,
                        EntryDate = movementDate, Direction = InventoryDirection.Issue, Quantity = line.RequiredQuantity, UnitCostBase = unitCost,
                        Description = $"Üretim {order.Code} bileşen tüketimi",
                        Tracking = allocationsByLine.GetValueOrDefault(line.Id, []).Select(x => new InventoryTransactionTrace { TenantId = tenantId,
                            StockItemId = line.ComponentStockItemId, TrackingMode = trackingItems[line.ComponentStockItemId].TrackingMode,
                            TrackingCode = x.TrackingCode, Quantity = x.Quantity, ExpiryDate = x.ExpiryDate }).ToList() });
                }
                var operationCost = orderOperations.Sum(x => x.ActualCostBase ?? 0m);
                if (totalCost.HasValue) totalCost += operationCost;
            }
            catch (OverflowException)
            {
                return Results.Conflict(new { error = "Bileşen toplam maliyeti desteklenen decimal aralığını aşıyor; stok hareketi kaydedilmedi." });
            }
            decimal? outputUnitCost;
            try { outputUnitCost = totalCost is null ? null : decimal.Round(totalCost.Value / order.PlannedQuantity, 8, MidpointRounding.AwayFromZero); }
            catch (OverflowException) { return Results.Conflict(new { error = "Mamul birim maliyeti desteklenen decimal aralığını aşıyor; stok hareketi kaydedilmedi." }); }
            db.InventoryTransactions.Add(new InventoryTransaction { TenantId = tenantId, WarehouseId = warehouse.Id, StockItemId = product.Id,
                EntryDate = movementDate, Direction = InventoryDirection.Receipt, Quantity = order.PlannedQuantity, UnitCostBase = outputUnitCost,
                Description = $"Üretim {order.Code} mamul girişi",
                Tracking = finishedTracking.Select(x => new InventoryTransactionTrace { TenantId = tenantId, StockItemId = product.Id,
                    TrackingMode = product.TrackingMode, TrackingCode = x.TrackingCode.Trim(), Quantity = x.Quantity, ExpiryDate = x.ExpiryDate }).ToList() });
            order.Status = ManufacturingOrderStatus.Completed; order.CompletedAt = DateTimeOffset.UtcNow;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.order.completed", Resource = order.Code });
            await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct);
            var baseCurrencyCode = await db.Tenants.AsNoTracking().Where(x => x.Id == tenantId).Select(x => x.BaseCurrencyCode).SingleAsync(ct);
            return Results.Ok(new { order = await ReadOrderAsync(db, tenantId, id, ct), baseCurrencyCode, totalCostBase = totalCost, unitCostBase = outputUnitCost,
                operationCostBase = orderOperations.Sum(x => x.ActualCostBase ?? 0m),
                costStatus = totalCost is null ? "IncompleteComponentCost" : "Valued" });
        });

        orders.MapPost("/{id:guid}/cancel", async (Guid id, ClaimsPrincipal user, TenantDbContext db, CancellationToken ct) =>
        {
            if (!TryIdentity(user, out var tenantId, out var userId)) return Results.Forbid();
            await using var transaction = await BeginMutationAsync(db, ct);
            var order = await LockOrderAsync(db, tenantId, id, ct);
            if (order is null) return Results.NotFound();
            if (order.Status is not (ManufacturingOrderStatus.Planned or ManufacturingOrderStatus.Released))
                return Results.Conflict(new { error = "Tamamlanmış veya iptal edilmiş üretim emri iptal edilemez." });
            var operationIds = await db.ManufacturingOrderOperations.AsNoTracking().Where(x => x.TenantId == tenantId && x.ManufacturingOrderId == id)
                .Select(x => x.Id).ToArrayAsync(ct);
            var capacityAllocations = await db.ManufacturingCapacityAllocations.Where(x => x.TenantId == tenantId && operationIds.Contains(x.ManufacturingOrderOperationId)).ToListAsync(ct);
            db.ManufacturingCapacityAllocations.RemoveRange(capacityAllocations);
            order.Status = ManufacturingOrderStatus.Cancelled;
            db.AuditEvents.Add(new AuditEvent { TenantId = tenantId, UserId = userId, Action = "manufacturing.order.cancelled", Resource = order.Code });
            await db.SaveChangesAsync(ct); if (transaction is not null) await transaction.CommitAsync(ct);
            return Results.NoContent();
        });
    }

    private static bool TryIdentity(ClaimsPrincipal user, out Guid tenantId, out Guid userId)
    {
        var hasTenant = Guid.TryParse(user.FindFirstValue("tenant_id"), out tenantId);
        var hasUser = Guid.TryParse(user.FindFirstValue("sub"), out userId);
        return hasTenant && hasUser;
    }
    private static List<MrpConversionResult> ReadMrpConversionState(string json) =>
        string.IsNullOrWhiteSpace(json) ? [] : JsonSerializer.Deserialize<List<MrpConversionResult>>(json) ?? [];
    private static bool ValidCode(string? value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 48 &&
        Regex.IsMatch(value, "^[A-Za-z][A-Za-z0-9_-]*$", RegexOptions.CultureInvariant);
    private static bool ValidateBom(BomWriteRequest request, out string? code, out string? name, out Dictionary<string,string[]>? errors)
    {
        code = request.Code?.Trim().ToUpperInvariant(); name = request.Name?.Trim(); errors = [];
        if (!ValidCode(code)) errors["code"] = ["Reçete kodu harfle başlamalı; en fazla 48 harf, rakam, tire veya alt çizgi içermelidir."];
        if (string.IsNullOrWhiteSpace(name) || name.Length > 160) errors["name"] = ["Reçete adı zorunludur ve en fazla 160 karakter olabilir."];
        if (request.OutputQuantity is <= 0 or > 99999999999999.9999m) errors["outputQuantity"] = ["Çıktı miktarı pozitif ve desteklenen aralıkta olmalıdır."];
        if (request.Lines is null || request.Lines.Count is < 1 or > 100) errors["lines"] = ["Reçete 1–100 bileşen içermelidir."];
        else if (request.Lines.Any(x => x.Quantity is <= 0 or > 99999999999999.9999m || x.ScrapPercent is < 0 or > 100)) errors["lines"] = ["Bileşen miktarı pozitif, fire oranı ise 0–100 arasında olmalıdır."];
        if (errors.Count == 0) { errors = null; return true; } return false;
    }
    private static async Task<(MrpPlanView? Plan, string? Error)> CalculateMrpAsync(TenantDbContext db, Guid tenantId, MrpPlanRequest request, CancellationToken ct)
    {
        var planDate = request.PlanDate ?? DateOnly.FromDateTime(DateTime.UtcNow);
        var stockItems = await db.StockItems.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).OrderBy(x => x.Code).ToListAsync(ct);
        var stockById = stockItems.ToDictionary(x => x.Id);
        var boms = await db.BillOfMaterials.AsNoTracking().Include(x => x.Lines)
            .Where(x => x.TenantId == tenantId && x.IsActive).ToListAsync(ct);
        var bomsByProduct = boms.GroupBy(x => x.ProductStockItemId).ToDictionary(x => x.Key, x => x.OrderBy(b => b.Code).ToArray());

        var balances = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == request.WarehouseId)
            .GroupBy(x => x.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) })
            .ToDictionaryAsync(x => x.Id, x => x.Quantity, ct);
        var reserved = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == request.WarehouseId && x.Status == SalesOrderReservationStatus.Active)
            .GroupBy(x => x.OrderLine.StockItemId).Select(g => new { Id = g.Key, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
            .ToDictionaryAsync(x => x.Id, x => x.Quantity, ct);
        var reservedByOrderLine = await db.SalesOrderReservations.AsNoTracking().Where(x => x.TenantId == tenantId && x.WarehouseId == request.WarehouseId && x.Status == SalesOrderReservationStatus.Active)
            .GroupBy(x => new { x.OrderId, x.OrderLineNumber }).Select(g => new { g.Key.OrderId, g.Key.OrderLineNumber, Quantity = g.Sum(x => x.Quantity - x.FulfilledQuantity) })
            .ToDictionaryAsync(x => (x.OrderId, x.OrderLineNumber), x => x.Quantity, ct);

        var openPurchaseLines = await db.PurchaseOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId &&
                (x.PurchaseOrder.Status == PurchaseOrderStatus.Open || x.PurchaseOrder.Status == PurchaseOrderStatus.PartiallyReceived))
            .Select(x => new { x.PurchaseOrderId, x.LineNumber, x.StockItemId, x.Quantity, x.PurchaseOrder.ExpectedReceiptDate, x.PurchaseOrder.TargetWarehouseId }).ToListAsync(ct);
        var receivedPurchaseLines = await db.PurchaseReceiptLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.Receipt.Status == PurchaseReceiptStatus.Posted)
            .GroupBy(x => new { x.PurchaseOrderId, x.OrderLineNumber }).Select(g => new { g.Key.PurchaseOrderId, g.Key.OrderLineNumber, Quantity = g.Sum(x => x.Quantity) })
            .ToDictionaryAsync(x => (x.PurchaseOrderId, x.OrderLineNumber), x => x.Quantity, ct);
        var supply = new Dictionary<Guid, List<MrpSupplyBucket>>();
        void AddSupply(Guid stockItemId, DateOnly availableDate, decimal quantity, MrpSupplyKind kind)
        {
            if (quantity <= 0m) return;
            if (!supply.TryGetValue(stockItemId, out var buckets)) supply[stockItemId] = buckets = [];
            buckets.Add(new MrpSupplyBucket(availableDate, quantity, kind));
        }
        foreach (var item in stockItems)
            AddSupply(item.Id, planDate, Math.Max(0m, balances.GetValueOrDefault(item.Id) - reserved.GetValueOrDefault(item.Id)), MrpSupplyKind.Stock);
        foreach (var line in openPurchaseLines)
        {
            var remaining = Math.Max(0m, line.Quantity - receivedPurchaseLines.GetValueOrDefault((line.PurchaseOrderId, line.LineNumber)));
            if (line.TargetWarehouseId == request.WarehouseId && line.ExpectedReceiptDate is { } due)
                AddSupply(line.StockItemId, due, remaining, MrpSupplyKind.Purchase);
        }

        var openOrders = await db.ManufacturingOrders.AsNoTracking().Include(x => x.Lines)
            .Where(x => x.TenantId == tenantId && x.WarehouseId == request.WarehouseId &&
                (x.Status == ManufacturingOrderStatus.Planned || x.Status == ManufacturingOrderStatus.Released)).ToListAsync(ct);
        var bomProduct = boms.ToDictionary(x => x.Id, x => x.ProductStockItemId);
        var nodes = new List<MrpDemandNode>();
        foreach (var demand in request.Demand ?? [])
            nodes.Add(new MrpDemandNode(demand.StockItemId, demand.Quantity, demand.RequiredByDate ?? planDate, 0, [demand.StockItemId], "Ek talep"));
        if (request.IncludeOpenSalesOrders)
        {
            var delivered = await db.SalesDeliveryLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.Delivery.Status == SalesDeliveryStatus.Posted)
                .GroupBy(x => new { x.OrderId, x.OrderLineNumber }).Select(g => new { g.Key.OrderId, g.Key.OrderLineNumber, Quantity = g.Sum(x => x.Quantity) })
                .ToDictionaryAsync(x => (x.OrderId, x.OrderLineNumber), x => x.Quantity, ct);
            var salesLines = await db.SalesOrderLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.Order.Status == SalesOrderStatus.Open)
                .Select(x => new { x.OrderId, x.LineNumber, x.StockItemId, x.StockCode, x.Quantity, x.Order.Code, x.Order.RequestedDeliveryDate }).ToListAsync(ct);
            foreach (var line in salesLines)
            {
                var remaining = Math.Max(0m, line.Quantity - delivered.GetValueOrDefault((line.OrderId, line.LineNumber)) - reservedByOrderLine.GetValueOrDefault((line.OrderId, line.LineNumber)));
                if (remaining > 0m) nodes.Add(new MrpDemandNode(line.StockItemId, remaining, line.RequestedDeliveryDate ?? planDate, 0, [line.StockItemId], $"Satış {line.Code} · {line.StockCode}"));
            }
        }
        foreach (var order in openOrders)
        {
            if (bomProduct.TryGetValue(order.BillOfMaterialId, out var productId))
            {
                var availableDate = order.Operations.Where(x => x.ScheduledEndDate is not null).Select(x => x.ScheduledEndDate!.Value).DefaultIfEmpty(order.PlannedDate).Max();
                AddSupply(productId, availableDate, order.PlannedQuantity, MrpSupplyKind.Production);
            }
            var componentNeedDate = order.Operations.Where(x => x.ScheduledStartDate is not null).Select(x => x.ScheduledStartDate!.Value).DefaultIfEmpty(order.PlannedDate).Min();
            foreach (var line in order.Lines)
                nodes.Add(new MrpDemandNode(line.ComponentStockItemId, line.RequiredQuantity, componentNeedDate, 0, [line.ComponentStockItemId], $"Açık üretim {order.Code}"));
        }

        var output = new List<MrpLineView>();
        for (var depth = 0; nodes.Count > 0; depth++)
        {
            if (depth > 20 || nodes.Count > 2000 || output.Count > 1000)
                return (null, "Reçete patlatma derinlik veya satır sınırını aştı; plan kısaltılmadı.");
            var current = nodes; nodes = [];
            foreach (var cycle in current.Where(x => x.Path.Take(x.Path.Count - 1).Contains(x.StockItemId)))
                return (null, $"Reçete döngüsü algılandı: {string.Join(" → ", cycle.Path.Select(id => stockById.GetValueOrDefault(id)?.Code ?? id.ToString()))}.");
            foreach (var group in current.GroupBy(x => (x.StockItemId, x.RequiredByDate)).OrderBy(x => stockById[x.Key.StockItemId].Code).ThenBy(x => x.Key.RequiredByDate))
            {
                var item = stockById[group.Key.StockItemId];
                var requiredBy = group.Key.RequiredByDate;
                var gross = group.Sum(x => x.Quantity);
                var onHand = Math.Max(0m, balances.GetValueOrDefault(item.Id));
                var reservedQty = Math.Max(0m, reserved.GetValueOrDefault(item.Id));
                var eligibleSupply = supply.GetValueOrDefault(item.Id, []).Where(x => x.Remaining > 0m && x.AvailableDate <= requiredBy).OrderBy(x => x.AvailableDate).ToList();
                var remainingNeed = gross;
                decimal fromStock = 0m, fromPo = 0m, fromProduction = 0m;
                foreach (var bucket in eligibleSupply)
                {
                    var take = Math.Min(remainingNeed, bucket.Remaining);
                    bucket.Remaining -= take; remainingNeed -= take;
                    if (bucket.Kind == MrpSupplyKind.Stock) fromStock += take;
                    else if (bucket.Kind == MrpSupplyKind.Purchase) fromPo += take;
                    else fromProduction += take;
                    if (remainingNeed == 0m) break;
                }
                var net = remainingNeed;
                var recommendedAction = "Karşılandı";
                var issue = (string?)null;
                var recommendedOrderDate = requiredBy;
                var productBoms = bomsByProduct.GetValueOrDefault(item.Id, []);
                if (net > 0m)
                {
                    if (item.TrackingMode == InventoryTrackingMode.Serial && net != decimal.Truncate(net))
                        { issue = "Seri izlemeli talep tam sayı değil; otomatik öneri oluşturulmadı."; recommendedAction = "İncele"; }
                    else if (productBoms.Length > 1)
                        { issue = "Birden fazla aktif reçete var; tekil üretim önerisi için reçetelerden biri pasife alınmalı."; recommendedAction = "İncele"; }
                    else if (productBoms.Length == 1)
                    {
                        var bom = productBoms[0]; recommendedAction = "Üret";
                        recommendedOrderDate = requiredBy.AddDays(-item.ManufacturingLeadTimeDays);
                        foreach (var line in bom.Lines)
                        {
                            if (group.Any(x => x.Path.Contains(line.ComponentStockItemId)))
                                return (null, $"Reçete döngüsü algılandı: {string.Join(" → ", group.First().Path.Select(id => stockById.GetValueOrDefault(id)?.Code ?? id.ToString()).Append(stockById.GetValueOrDefault(line.ComponentStockItemId)?.Code ?? line.ComponentStockItemId.ToString()))}.");
                            var required = decimal.Round(line.Quantity * (1m + line.ScrapPercent / 100m) / bom.OutputQuantity * net, 4, MidpointRounding.AwayFromZero);
                            var path = group.First().Path.Append(line.ComponentStockItemId).ToArray();
                            nodes.Add(new MrpDemandNode(line.ComponentStockItemId, required, recommendedOrderDate, depth + 1, path, $"{bom.Code} / {item.Code}"));
                        }
                    }
                    else { recommendedAction = "Satın al"; recommendedOrderDate = requiredBy.AddDays(-item.ProcurementLeadTimeDays); }
                }
                output.Add(new MrpLineView(item.Id, item.Code, item.Name, item.UnitCode, depth, gross, onHand, reservedQty, fromStock, fromPo, fromProduction,
                    net, recommendedAction, issue, group.Select(x => x.Source).Distinct().Take(8).ToArray(), requiredBy, recommendedOrderDate));
            }
        }
        var view = new MrpPlanView(request.WarehouseId, DateTimeOffset.UtcNow, true,
            "Açık satın alma miktarları yalnız hedef deposu seçili depo olan ve beklenen teslim tarihi ihtiyaç tarihinden geç olmayan siparişlerden alınır. Teslim tarihi/hedef deposu olmayan eski siparişler zamanlanmış arz sayılmaz. İstenen teslim tarihi girilmemiş açık satış siparişleri planlama tarihinde gerekli kabul edilir.", output);
        return (view, null);
    }

    private sealed record MrpDemandNode(Guid StockItemId, decimal Quantity, DateOnly RequiredByDate, int Depth, IReadOnlyList<Guid> Path, string Source);
    private enum MrpSupplyKind { Stock, Purchase, Production }
    private sealed class MrpSupplyBucket(DateOnly availableDate, decimal remaining, MrpSupplyKind kind)
    {
        public DateOnly AvailableDate { get; } = availableDate;
        public decimal Remaining { get; set; } = remaining;
        public MrpSupplyKind Kind { get; } = kind;
    }

    private static string? ValidateTrackingAllocations(InventoryTrackingMode mode, IReadOnlyList<InventoryTrackingAllocationRequest> allocations, decimal quantity)
    {
        if (allocations.Count == 0) return mode == InventoryTrackingMode.None ? null : "İzleme modu açık mamul için lot veya seri kodları zorunludur.";
        if (mode == InventoryTrackingMode.None) return "Takip modu kapalı mamul için lot/seri kodu gönderilemez.";
        if (allocations.Any(x => string.IsNullOrWhiteSpace(x.TrackingCode) || x.TrackingCode.Trim().Length > 80 || x.Quantity <= 0m))
            return "Takip kodu ve miktar geçerli olmalıdır.";
        if (allocations.GroupBy(x => x.TrackingCode.Trim(), StringComparer.OrdinalIgnoreCase).Any(x => x.Count() > 1))
            return "Mamul girişinde aynı takip kodu tekrarlanamaz.";
        if (mode == InventoryTrackingMode.Serial && allocations.Any(x => x.Quantity != 1m || x.ExpiryDate is not null))
            return "Her mamul seri numarası 1 adet olmalı ve son kullanma tarihi taşımamalıdır.";
        if (mode == InventoryTrackingMode.Lot && allocations.Any(x => x.ExpiryDate is null))
            return "Mamul lot girişinde son kullanma tarihi zorunludur.";
        if (allocations.Sum(x => x.Quantity) != quantity) return "Mamul takip satırlarının toplamı üretim miktarına eşit olmalıdır.";
        return null;
    }
    private static async Task<BomView?> ReadBomAsync(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct) =>
        await db.BillOfMaterials.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id)
            .Select(x => new BomView(x.Id, x.Code, x.Name, x.ProductStockItemId,
                db.StockItems.Where(s => s.TenantId == tenantId && s.Id == x.ProductStockItemId).Select(s => s.Code + " · " + s.Name).FirstOrDefault() ?? "",
                db.StockItems.Where(s => s.TenantId == tenantId && s.Id == x.ProductStockItemId).Select(s => s.TrackingMode.ToString()).FirstOrDefault() ?? "None",
                x.OutputQuantity, x.IsActive, x.Lines.OrderBy(l => l.ComponentStockItemId).Select(l => new BomLineView(l.ComponentStockItemId,
                    db.StockItems.Where(s => s.TenantId == tenantId && s.Id == l.ComponentStockItemId).Select(s => s.Code + " · " + s.Name).FirstOrDefault() ?? "",
                    l.Quantity, l.ScrapPercent)).ToList(), Convert.ToBase64String(x.RowVersion),
                x.Operations.OrderBy(o => o.Sequence).Select(o => new BomOperationView(o.Sequence, o.WorkCenterId,
                    db.ManufacturingWorkCenters.Where(w => w.TenantId == tenantId && w.Id == o.WorkCenterId).Select(w => w.Code + " · " + w.Name).FirstOrDefault() ?? "",
                    o.SetupMinutes, o.RunMinutesPerOutputUnit)).ToList())).SingleOrDefaultAsync(ct);
    private static async Task<object?> ReadOrderAsync(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct) =>
        await db.ManufacturingOrders.AsNoTracking().Where(x => x.TenantId == tenantId && x.Id == id).Select(x => new OrderView(x.Id, x.Code,
            x.BillOfMaterialId, db.BillOfMaterials.Where(b => b.TenantId == tenantId && b.Id == x.BillOfMaterialId).Select(b => b.Code + " · " + b.Name).FirstOrDefault() ?? "",
            x.WarehouseId, db.Warehouses.Where(w => w.TenantId == tenantId && w.Id == x.WarehouseId).Select(w => w.Code + " · " + w.Name).FirstOrDefault() ?? "",
            x.PlannedQuantity, x.Status.ToString(), x.PlannedDate, x.CompletedAt, x.Lines.OrderBy(l => l.ComponentCodeSnapshot)
                .Select(l => new OrderLineView(l.ComponentStockItemId, l.ComponentCodeSnapshot, l.ComponentNameSnapshot, l.RequiredQuantity)).ToList(),
            x.Operations.OrderBy(o => o.Sequence).Select(o => new ManufacturingOrderOperationView(o.Id, o.Sequence, o.WorkCenterId,
                o.WorkCenterCodeSnapshot, o.WorkCenterNameSnapshot, o.SetupMinutes, o.RunMinutes, o.PlannedCostBase,
                o.ScheduledStartDate, o.ScheduledEndDate, o.LaborCostPerHourBase, o.OverheadCostPerHourBase, o.Status.ToString(),
                o.ActualSetupMinutes, o.ActualRunMinutes, o.ActualCostBase, o.StartedAt, o.CompletedAt,
                db.ManufacturingCapacityAllocations.Where(a => a.TenantId == tenantId && a.ManufacturingOrderOperationId == o.Id)
                    .OrderBy(a => a.ScheduledDate).Select(a => new CapacityDayView(a.ScheduledDate, a.AllocatedMinutes)).ToList())).ToList(),
            Convert.ToBase64String(x.RowVersion))).SingleOrDefaultAsync(ct);
    private static async Task<IDbContextTransaction?> BeginMutationAsync(TenantDbContext db, CancellationToken ct) => db.Database.IsRelational()
        ? await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct) : null;
    private static Task<ManufacturingOrder?> LockOrderAsync(TenantDbContext db, Guid tenantId, Guid id, CancellationToken ct) => db.Database.IsSqlServer()
        ? db.ManufacturingOrders.FromSqlInterpolated($"SELECT * FROM [dbo].[ManufacturingOrders] WITH (UPDLOCK, HOLDLOCK) WHERE [TenantId] = {tenantId} AND [Id] = {id}").SingleOrDefaultAsync(ct)
        : db.ManufacturingOrders.SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Id == id, ct);
    private static async Task<decimal?> WeightedCostAsync(TenantDbContext db, Guid tenantId, Guid stockItemId, DateOnly asOfDate, CancellationToken ct)
    {
        var totals = await db.InventoryTransactions.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == stockItemId && x.EntryDate <= asOfDate)
            .GroupBy(_ => 1).Select(g => new { Quantity = g.Sum(x => x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity),
                Unvalued = g.Sum(x => (decimal?)(x.UnitCostBase == null ? (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) : 0m)) ?? 0m,
                Value = g.Sum(x => (decimal?)(x.UnitCostBase == null ? 0m : (x.Direction == InventoryDirection.Receipt ? x.Quantity : -x.Quantity) * x.UnitCostBase.Value)) ?? 0m }).SingleOrDefaultAsync(ct);
        if (totals is null || totals.Quantity <= 0m || totals.Unvalued > 0m) return null;
        var adjustments = await db.InventoryCostAdjustmentLines.AsNoTracking().Where(x => x.TenantId == tenantId && x.StockItemId == stockItemId && x.Adjustment.EntryDate <= asOfDate)
            .SumAsync(x => (decimal?)x.AmountBase, ct) ?? 0m;
        return decimal.Round((totals.Value + adjustments) / totals.Quantity, 8, MidpointRounding.AwayFromZero);
    }
    private static async Task<List<InventoryTrackingAllocationRequest>?> AllocateAvailableTrackingAsync(TenantDbContext db, Guid tenantId,
        Guid warehouseId, StockItem item, decimal quantity, DateOnly movementDate, CancellationToken ct)
    {
        if (item.TrackingMode == InventoryTrackingMode.None) return [];
        var available = await (from trace in db.InventoryTransactionTraces.AsNoTracking()
            join movement in db.InventoryTransactions.AsNoTracking()
                on new { trace.TenantId, trace.InventoryTransactionId } equals new { movement.TenantId, InventoryTransactionId = movement.Id }
            where trace.TenantId == tenantId && movement.WarehouseId == warehouseId && trace.StockItemId == item.Id
                && (trace.ExpiryDate == null || trace.ExpiryDate >= movementDate)
            group new { trace, movement } by new { trace.TrackingCode, trace.ExpiryDate } into grouped
            select new { grouped.Key.TrackingCode, grouped.Key.ExpiryDate,
                Quantity = grouped.Sum(x => x.movement.Direction == InventoryDirection.Receipt ? x.trace.Quantity : -x.trace.Quantity) })
            .Where(x => x.Quantity > 0m).OrderBy(x => x.ExpiryDate).ThenBy(x => x.TrackingCode).ToListAsync(ct);
        var result = new List<InventoryTrackingAllocationRequest>();
        var remaining = quantity;
        foreach (var row in available)
        {
            var take = item.TrackingMode == InventoryTrackingMode.Serial ? 1m : Math.Min(remaining, row.Quantity);
            if (take <= 0m) continue;
            if (item.TrackingMode == InventoryTrackingMode.Serial && (row.Quantity < 1m || row.ExpiryDate is not null)) return null;
            result.Add(new InventoryTrackingAllocationRequest(row.TrackingCode, take, row.ExpiryDate));
            remaining -= take;
            if (remaining <= 0m) break;
        }
        return remaining == 0m ? result : null;
    }
}

public sealed record WorkCenterWriteRequest(string? Code, string? Name, int CapacityMinutesPerDay, decimal LaborCostPerHourBase, decimal OverheadCostPerHourBase);
public sealed record WorkCenterView(Guid Id, string Code, string Name, int CapacityMinutesPerDay, decimal LaborCostPerHourBase, decimal OverheadCostPerHourBase, bool IsActive);
public sealed record BomWriteRequest(string? Code, string? Name, Guid ProductStockItemId, decimal OutputQuantity, IReadOnlyList<BomLineWriteRequest> Lines,
    IReadOnlyList<BomOperationWriteRequest>? Operations = null);
public sealed record BomLineWriteRequest(Guid ComponentStockItemId, decimal Quantity, decimal ScrapPercent = 0m);
public sealed record BomOperationWriteRequest(int Sequence, Guid WorkCenterId, decimal SetupMinutes, decimal RunMinutesPerOutputUnit);
public sealed record BomView(Guid Id, string Code, string Name, Guid ProductStockItemId, string ProductName, string ProductTrackingMode, decimal OutputQuantity,
    bool IsActive, IReadOnlyList<BomLineView> Lines, string RowVersion, IReadOnlyList<BomOperationView> Operations);
public sealed record BomLineView(Guid ComponentStockItemId, string ComponentName, decimal Quantity, decimal ScrapPercent);
public sealed record BomOperationView(int Sequence, Guid WorkCenterId, string WorkCenterName, decimal SetupMinutes, decimal RunMinutesPerOutputUnit);
public sealed record ManufacturingOrderWriteRequest(string? Code, Guid BillOfMaterialId, Guid WarehouseId, decimal PlannedQuantity, DateOnly PlannedDate);
public sealed record OrderView(Guid Id, string Code, Guid BillOfMaterialId, string BillOfMaterialName, Guid WarehouseId, string WarehouseName,
    decimal PlannedQuantity, string Status, DateOnly PlannedDate, DateTimeOffset? CompletedAt, IReadOnlyList<OrderLineView> Lines,
    IReadOnlyList<ManufacturingOrderOperationView> Operations, string RowVersion);
public sealed record OrderLineView(Guid ComponentStockItemId, string ComponentCode, string ComponentName, decimal RequiredQuantity);
public sealed record CapacityDayView(DateOnly Date, decimal Minutes);
public sealed record ManufacturingOrderOperationView(Guid Id, int Sequence, Guid WorkCenterId, string WorkCenterCode, string WorkCenterName,
    decimal SetupMinutes, decimal RunMinutes, decimal PlannedCostBase, DateOnly? ScheduledStartDate, DateOnly? ScheduledEndDate,
    decimal LaborCostPerHourBase, decimal OverheadCostPerHourBase, string Status, decimal? ActualSetupMinutes, decimal? ActualRunMinutes,
    decimal? ActualCostBase, DateTimeOffset? StartedAt, DateTimeOffset? CompletedAt, IReadOnlyList<CapacityDayView> CapacityDays);
public sealed record ManufacturingCompleteRequest(IReadOnlyList<InventoryTrackingAllocationRequest>? FinishedGoodsTracking = null);
public sealed record ManufacturingOperationCompleteRequest(decimal ActualSetupMinutes, decimal ActualRunMinutes);
public sealed record MrpDemandRequest(Guid StockItemId, decimal Quantity, DateOnly? RequiredByDate = null);
public sealed record MrpPlanRequest(Guid WarehouseId, IReadOnlyList<MrpDemandRequest>? Demand = null, bool IncludeOpenSalesOrders = true, DateOnly? PlanDate = null);
public sealed record MrpPlanConvertLineRequest(int LineIndex, Guid? BillOfMaterialId = null);
public sealed record MrpPlanConvertRequest(bool Confirm, IReadOnlyList<MrpPlanConvertLineRequest>? Lines,
    IReadOnlyDictionary<string, string?>? PurchaseRequestCustomFields = null);
public sealed record MrpConversionResult(int LineIndex, string ResourceType, Guid ResourceId, string Code);
public sealed record MrpPlanView(Guid WarehouseId, DateTimeOffset PlannedAt, bool IncludesOpenSalesOrders, string SupplyCaveat,
    IReadOnlyList<MrpLineView> Lines, Guid? PlanId = null, IReadOnlyList<int>? ConvertedLineIndexes = null);
public sealed record MrpPlanHistoryView(Guid Id, Guid WarehouseId, DateOnly PlanDate, bool IncludesOpenSalesOrders, DateTimeOffset CreatedAt, Guid CreatedByUserId);
public sealed record MrpLineView(Guid StockItemId, string StockCode, string StockName, string UnitCode, int Level, decimal GrossRequirement,
    decimal OnHand, decimal Reserved, decimal FromOnHand, decimal FromOpenPurchaseOrders, decimal FromOpenManufacturingOrders,
    decimal NetRequirement, string Recommendation, string? Issue, IReadOnlyList<string> Sources, DateOnly RequiredByDate, DateOnly RecommendedOrderDate);
