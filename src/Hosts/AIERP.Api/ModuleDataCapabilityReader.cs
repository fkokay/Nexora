using System.Text.Json;
using System.Text;
using AIERP.ModuleSDK;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;

internal sealed record ModuleDataCapabilityRequest(string Code, JsonElement Query);
internal sealed record ModuleCapabilityCustomer(Guid Id, string Code, string Name, string CurrencyCode);
internal sealed record ModuleCapabilityCustomerCandidate(Guid Id, string Code, string Name, string CurrencyCode, CounterpartyType Type, bool IsActive);
internal sealed record ModuleCapabilityStockItem(Guid Id, string Code, string Name, string UnitCode, decimal OnHand, decimal Reserved, decimal Available);
internal sealed record ModuleCapabilityStockCandidate(Guid Id, string Code, string Name, string UnitCode, decimal OnHand, decimal Reserved, decimal Available, bool IsActive);
internal sealed record ModuleCapabilityData(string Code, JsonElement Result);
internal sealed record ModuleCapabilityReadResult(bool Allowed, bool Forbidden, string? Error, IReadOnlyList<ModuleCapabilityData> Data)
{
    public static ModuleCapabilityReadResult Invalid(string error) => new(false, false, error, []);
    public static ModuleCapabilityReadResult Denied() => new(false, true, "Modül veri capability izni reddedildi.", []);
    public static ModuleCapabilityReadResult Success(IReadOnlyList<ModuleCapabilityData> data) => new(true, false, null, data);
}

/// <summary>Executes fixed, tenant-scoped reads for signed module declarations. Modules never receive DB access.</summary>
internal static class ModuleDataCapabilityReader
{
    private const int MaximumRequestedCapabilities = 4;
    private const int MaximumQueryBytes = 4096;
    private static readonly JsonSerializerOptions DataJsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task<ModuleCapabilityReadResult> ReadAsync(
        ModuleManifest manifest,
        IReadOnlyList<ModuleDataCapabilityRequest>? requests,
        Guid tenantId,
        Guid userId,
        string role,
        TenantDbContext tenantDb,
        IPlatformPermissionAuthorizer authorizer,
        CancellationToken cancellationToken)
    {
        if (requests is null || requests.Count == 0) return ModuleCapabilityReadResult.Success([]);
        if (requests.Count > MaximumRequestedCapabilities) return ModuleCapabilityReadResult.Invalid("Bir modül çağrısında en fazla dört veri capability isteği gönderilebilir.");
        if (requests.Any(x => x is null || string.IsNullOrWhiteSpace(x.Code)))
            return ModuleCapabilityReadResult.Invalid("Veri capability isteği geçerli bir kod içermelidir.");
        if (requests.Select(x => x.Code).Distinct(StringComparer.Ordinal).Count() != requests.Count)
            return ModuleCapabilityReadResult.Invalid("Veri capability kodları yinelenemez.");

        var permissions = ModulePermissionPolicy.FromManifest(manifest);
        var output = new List<ModuleCapabilityData>(requests.Count);
        foreach (var request in requests)
        {
            if (!ModuleManifestValidator.SupportedDataCapabilities.Contains(request.Code))
                return ModuleCapabilityReadResult.Invalid($"'{request.Code}' veri capability’si desteklenmiyor.");
            var declaration = manifest.DataCapabilities?.SingleOrDefault(x => x.Code == request.Code);
            if (declaration is null)
                return ModuleCapabilityReadResult.Invalid($"'{request.Code}' capability’si imzalı modül manifestinde tanımlı değil.");
            var permission = permissions.SingleOrDefault(x => x.ModulePermissionCode == declaration.PermissionCode);
            if (permission is null) return ModuleCapabilityReadResult.Invalid("Veri capability izni manifest ile eşleşmiyor.");
            var resolved = new ResolvedPlatformPermission(permission.Policy,
                ModulePermissionPolicy.Attributes(tenantId, userId, role, manifest.ModuleCode, request.Code));
            if (!await authorizer.IsAllowedAsync(tenantId, userId, role, resolved, cancellationToken))
                return ModuleCapabilityReadResult.Denied();
            if (request.Query.ValueKind != JsonValueKind.Object || Encoding.UTF8.GetByteCount(request.Query.GetRawText()) > MaximumQueryBytes)
                return ModuleCapabilityReadResult.Invalid("Capability sorgusu nesne olmalı ve 4 KiB sınırını aşmamalıdır.");

            switch (request.Code)
            {
                case "customers.search":
                    if (!TryReadSearch(request.Query, "Müşteri", out var term, out var limit, out var error))
                        return ModuleCapabilityReadResult.Invalid(error!);
                    var customerCandidates = await tenantDb.CustomerAccounts.AsNoTracking()
                        .Where(x => x.TenantId == tenantId && x.IsActive && x.Type != CounterpartyType.Supplier &&
                            (x.Code.Contains(term) || x.Name.Contains(term)))
                        .OrderBy(x => x.Code)
                        .Take(limit)
                        .Select(x => new ModuleCapabilityCustomerCandidate(x.Id, x.Code, x.Name, x.CurrencyCode, x.Type, x.IsActive))
                        .ToListAsync(cancellationToken);
                    var customers = new List<ModuleCapabilityCustomer>(customerCandidates.Count);
                    foreach (var candidate in customerCandidates)
                    {
                        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                        {
                            ["resource.customerId"] = candidate.Id.ToString("D"),
                            ["resource.customerType"] = candidate.Type.ToString(),
                            ["resource.customerActive"] = candidate.IsActive.ToString().ToLowerInvariant()
                        };
                        var customerRowPermission = new ResolvedPlatformPermission(permission.Policy,
                            ModulePermissionPolicy.Attributes(tenantId, userId, role, manifest.ModuleCode, request.Code, attributes));
                        if (!await authorizer.IsAllowedAsync(tenantId, userId, role, customerRowPermission, cancellationToken)) continue;
                        customers.Add(new ModuleCapabilityCustomer(candidate.Id, candidate.Code, candidate.Name, candidate.CurrencyCode));
                    }
                    output.Add(new ModuleCapabilityData(request.Code, JsonSerializer.SerializeToElement(customers, DataJsonOptions)));
                    break;
                case "suppliers.search":
                    if (!TryReadSearch(request.Query, "Tedarikçi", out var supplierTerm, out var supplierLimit, out var supplierError))
                        return ModuleCapabilityReadResult.Invalid(supplierError!);
                    var supplierCandidates = await tenantDb.CustomerAccounts.AsNoTracking()
                        .Where(x => x.TenantId == tenantId && x.IsActive && x.Type != CounterpartyType.Customer &&
                            (x.Code.Contains(supplierTerm) || x.Name.Contains(supplierTerm)))
                        .OrderBy(x => x.Code)
                        .Take(supplierLimit)
                        .Select(x => new ModuleCapabilityCustomerCandidate(x.Id, x.Code, x.Name, x.CurrencyCode, x.Type, x.IsActive))
                        .ToListAsync(cancellationToken);
                    var suppliers = new List<ModuleCapabilityCustomer>(supplierCandidates.Count);
                    foreach (var candidate in supplierCandidates)
                    {
                        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                        {
                            ["resource.supplierId"] = candidate.Id.ToString("D"),
                            ["resource.supplierType"] = candidate.Type.ToString(),
                            ["resource.supplierActive"] = candidate.IsActive.ToString().ToLowerInvariant()
                        };
                        var supplierPermission = new ResolvedPlatformPermission(permission.Policy,
                            ModulePermissionPolicy.Attributes(tenantId, userId, role, manifest.ModuleCode, request.Code, attributes));
                        if (!await authorizer.IsAllowedAsync(tenantId, userId, role, supplierPermission, cancellationToken)) continue;
                        suppliers.Add(new ModuleCapabilityCustomer(candidate.Id, candidate.Code, candidate.Name, candidate.CurrencyCode));
                    }
                    output.Add(new ModuleCapabilityData(request.Code, JsonSerializer.SerializeToElement(suppliers, DataJsonOptions)));
                    break;
                case "customers.balance.read":
                    if (!TryReadCustomerCode(request.Query, out var customerCode, out var customerCodeError))
                        return ModuleCapabilityReadResult.Invalid(customerCodeError!);
                    var customer = await tenantDb.CustomerAccounts.AsNoTracking()
                        .SingleOrDefaultAsync(x => x.TenantId == tenantId && x.Code == customerCode, cancellationToken);
                    if (customer is null)
                    {
                        output.Add(new ModuleCapabilityData(request.Code, JsonSerializer.SerializeToElement<CustomerLedgerBalance?>(null, DataJsonOptions)));
                        break;
                    }
                    var customerAttributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                    {
                        ["resource.customerId"] = customer.Id.ToString("D"),
                        ["resource.customerType"] = customer.Type.ToString(),
                        ["resource.customerActive"] = customer.IsActive.ToString().ToLowerInvariant()
                    };
                    var customerPermission = new ResolvedPlatformPermission(permission.Policy,
                        ModulePermissionPolicy.Attributes(tenantId, userId, role, manifest.ModuleCode, request.Code, customerAttributes));
                    if (!await authorizer.IsAllowedAsync(tenantId, userId, role, customerPermission, cancellationToken))
                        return ModuleCapabilityReadResult.Denied();
                    var ledger = tenantDb.CustomerLedgerEntries.AsNoTracking().Where(x => x.TenantId == tenantId && x.CustomerId == customer.Id);
                    var debit = await ledger.Where(x => x.Direction == CustomerLedgerDirection.Debit).SumAsync(x => (decimal?)x.Amount, cancellationToken) ?? 0m;
                    var credit = await ledger.Where(x => x.Direction == CustomerLedgerDirection.Credit).SumAsync(x => (decimal?)x.Amount, cancellationToken) ?? 0m;
                    var balance = CustomerLedgerBalanceCalculator.Calculate(customer.CurrencyCode, debit, credit, customer.RiskLimit);
                    output.Add(new ModuleCapabilityData(request.Code, JsonSerializer.SerializeToElement(balance, DataJsonOptions)));
                    break;
                case "inventory.availability.search":
                    if (!TryReadSearch(request.Query, "Stok", out var stockTerm, out var stockLimit, out var stockError))
                        return ModuleCapabilityReadResult.Invalid(stockError!);
                    var stockCandidates = await (from item in tenantDb.StockItems.AsNoTracking()
                        where item.TenantId == tenantId && item.IsActive &&
                            (item.Code.Contains(stockTerm) || item.Name.Contains(stockTerm) || (item.Barcode != null && item.Barcode.Contains(stockTerm)))
                        let onHand = tenantDb.InventoryTransactions
                            .Where(move => move.TenantId == tenantId && move.StockItemId == item.Id)
                            .Sum(move => move.Direction == InventoryDirection.Receipt ? move.Quantity : -move.Quantity)
                        let reserved = tenantDb.SalesOrderReservations
                            .Where(reservation => reservation.TenantId == tenantId && reservation.Status == SalesOrderReservationStatus.Active
                                && reservation.OrderLine.TenantId == tenantId && reservation.OrderLine.StockItemId == item.Id)
                            .Sum(reservation => reservation.Quantity - reservation.FulfilledQuantity)
                        orderby item.Code
                        select new ModuleCapabilityStockCandidate(item.Id, item.Code, item.Name, item.UnitCode, onHand, reserved, onHand - reserved, item.IsActive))
                        .Take(stockLimit)
                        .ToListAsync(cancellationToken);
                    var stockItems = new List<ModuleCapabilityStockItem>(stockCandidates.Count);
                    foreach (var candidate in stockCandidates)
                    {
                        var attributes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                        {
                            ["resource.stockItemId"] = candidate.Id.ToString("D"),
                            ["resource.stockCode"] = candidate.Code,
                            ["resource.stockActive"] = candidate.IsActive.ToString().ToLowerInvariant()
                        };
                        var stockPermission = new ResolvedPlatformPermission(permission.Policy,
                            ModulePermissionPolicy.Attributes(tenantId, userId, role, manifest.ModuleCode, request.Code, attributes));
                        if (!await authorizer.IsAllowedAsync(tenantId, userId, role, stockPermission, cancellationToken)) continue;
                        stockItems.Add(new ModuleCapabilityStockItem(candidate.Id, candidate.Code, candidate.Name, candidate.UnitCode,
                            candidate.OnHand, candidate.Reserved, candidate.Available));
                    }
                    output.Add(new ModuleCapabilityData(request.Code, JsonSerializer.SerializeToElement(stockItems, DataJsonOptions)));
                    break;
                default:
                    return ModuleCapabilityReadResult.Invalid($"'{request.Code}' veri capability’si desteklenmiyor.");
            }
        }

        return ModuleCapabilityReadResult.Success(output);
    }

    private static bool TryReadCustomerCode(JsonElement query, out string customerCode, out string? error)
    {
        customerCode = string.Empty;
        error = null;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in query.EnumerateObject())
        {
            if (!seen.Add(property.Name) || property.Name != "customerCode")
            {
                error = "Cari bakiye sorgusunda yalnızca customerCode alanı kullanılabilir.";
                return false;
            }
        }
        if (!query.TryGetProperty("customerCode", out var codeElement) || codeElement.ValueKind != JsonValueKind.String)
        {
            error = "Cari bakiye sorgusunda customerCode metni gereklidir.";
            return false;
        }
        customerCode = codeElement.GetString()?.Trim().ToUpperInvariant() ?? string.Empty;
        if (customerCode.Length is < 1 or > 64 || customerCode.Any(char.IsControl))
        {
            error = "Cari kodu 1–64 karakter olmalı ve kontrol karakteri içermemelidir.";
            return false;
        }
        return true;
    }

    private static bool TryReadSearch(JsonElement query, string entityName, out string term, out int limit, out string? error)
    {
        term = string.Empty;
        limit = 10;
        error = null;
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in query.EnumerateObject())
        {
            if (!seen.Add(property.Name) || property.Name is not ("term" or "limit"))
            {
                error = $"{entityName} arama sorgusunda yalnızca benzersiz term ve limit alanları kullanılabilir.";
                return false;
            }
        }

        if (!query.TryGetProperty("term", out var termElement) || termElement.ValueKind != JsonValueKind.String)
        {
            error = $"{entityName} arama sorgusunda term metni gereklidir.";
            return false;
        }
        term = termElement.GetString()?.Trim() ?? string.Empty;
        if (term.Length is < 2 or > 100 || term.Any(char.IsControl))
        {
            error = $"{entityName} arama terimi 2–100 karakter olmalı ve kontrol karakteri içermemelidir.";
            return false;
        }
        if (query.TryGetProperty("limit", out var limitElement) &&
            (limitElement.ValueKind != JsonValueKind.Number || !limitElement.TryGetInt32(out limit) || limit is < 1 or > 25))
        {
            error = $"{entityName} arama limit değeri 1–25 arasında tam sayı olmalıdır.";
            return false;
        }
        return true;
    }
}
