using System.Text.Json;
using AIERP.ModuleSDK;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class ModuleDataCapabilityIntegrationTests
{
    [Fact]
    public void ModuleInvocationRequest_BindsOptionalCapabilityQueries()
    {
        const string json = """{"action":"tickets.search","input":{"status":"Open"},"capabilities":[{"code":"customers.search","query":{"term":"Acme","limit":5}}]}""";
        var request = JsonSerializer.Deserialize<TenantModuleInvocationRequest>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(request);
        Assert.Equal("tickets.search", request!.Action);
        var capability = Assert.Single(request.Capabilities!);
        Assert.Equal("customers.search", capability.Code);
        Assert.Equal("Acme", capability.Query.GetProperty("term").GetString());
    }

    [Fact]
    public async Task Customer_search_is_permission_gated_bounded_and_tenant_scoped()
    {
        var database = $"module-capabilities-{Guid.NewGuid():N}";
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(database + "-platform").Options;
        var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase(database + "-tenant").Options;
        await using var platform = new PlatformDbContext(platformOptions);
        await using var tenantDb = new TenantDbContext(tenantOptions);
        var tenant = new Tenant { Name = "Tenant A", Slug = "tenant-a" };
        var otherTenant = new Tenant { Name = "Tenant B", Slug = "tenant-b" };
        var user = new AppUser { Email = "developer@example.test", DisplayName = "Developer" };
        var deniedCustomer = new CustomerAccount { TenantId = tenant.Id, Code = "ACME-02", Name = "Acme restricted", Type = CounterpartyType.Customer, CurrencyCode = "EUR" };
        const string permissionCode = "erp.module.catalog.customer.read";
        var permission = new PermissionDefinition { Code = permissionCode, ResourceType = "erp.module.catalog", Action = "execute", Description = "Search customers" };
        platform.Tenants.AddRange(tenant, otherTenant);
        platform.Users.Add(user);
        platform.PermissionDefinitions.Add(permission);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, Tenant = tenant, UserId = user.Id, User = user, Role = "TenantUser" });
        platform.TenantPermissionRules.AddRange(
            new TenantPermissionRule
            {
                TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permissionCode, Permission = permission, Effect = TenantPermissionEffect.Allow,
                ResourceType = "erp.module.catalog", AttributeName = "resource.route.menuEntryCode",
                AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = "customers.search"
            },
            new TenantPermissionRule
            {
                TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permissionCode, Permission = permission, Effect = TenantPermissionEffect.Deny,
                ResourceType = "erp.module.catalog", AttributeName = "resource.customerId",
                AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = deniedCustomer.Id.ToString("D")
            });
        await platform.SaveChangesAsync();
        tenantDb.CustomerAccounts.AddRange(
            new CustomerAccount { TenantId = tenant.Id, Code = "ACME-01", Name = "Acme A", Type = CounterpartyType.Customer, CurrencyCode = "TRY" },
            deniedCustomer,
            new CustomerAccount { TenantId = otherTenant.Id, Code = "ACME-99", Name = "Acme B secret", Type = CounterpartyType.Customer, CurrencyCode = "USD" },
            new CustomerAccount { TenantId = tenant.Id, Code = "SUP-01", Name = "Acme supplier", Type = CounterpartyType.Supplier, CurrencyCode = "TRY" });
        await tenantDb.SaveChangesAsync();
        var manifest = new ModuleManifest("catalog", "Catalog", "1.0.0", "Nexora", "1.0.0", [],
            [new ModulePermission("customer.read", "Search customer directory")], [], [],
            [new ModuleDataCapability("customers.search", "customer.read")]);
        using var query = JsonDocument.Parse("{\"term\":\"ACME\",\"limit\":5}");
        var reader = new PlatformPermissionAuthorizer(platform);

        var result = await ModuleDataCapabilityReader.ReadAsync(manifest,
            [new ModuleDataCapabilityRequest("customers.search", query.RootElement)], tenant.Id, user.Id, "TenantUser", tenantDb, reader, CancellationToken.None);

        Assert.True(result.Allowed, result.Error);
        var data = Assert.Single(result.Data);
        var customer = Assert.Single(data.Result.EnumerateArray());
        Assert.Equal("ACME-01", customer.GetProperty("code").GetString());
        Assert.Equal("Acme A", customer.GetProperty("name").GetString());
        Assert.False(customer.TryGetProperty("taxNumber", out _));

        using var oversized = JsonDocument.Parse("{\"term\":\"A\"}");
        var tooShort = await ModuleDataCapabilityReader.ReadAsync(manifest,
            [new ModuleDataCapabilityRequest("customers.search", oversized.RootElement)], tenant.Id, user.Id, "TenantUser", tenantDb, reader, CancellationToken.None);
        Assert.False(tooShort.Allowed);
        Assert.Contains("2–100", tooShort.Error, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Supplier_search_is_tenant_scoped_and_applies_supplier_level_abac()
    {
        var database = $"module-supplier-capability-{Guid.NewGuid():N}";
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(database + "-platform").Options;
        var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase(database + "-tenant").Options;
        await using var platform = new PlatformDbContext(platformOptions);
        await using var tenantDb = new TenantDbContext(tenantOptions);
        var tenant = new Tenant { Name = "Tenant A", Slug = "tenant-a" };
        var otherTenant = new Tenant { Name = "Tenant B", Slug = "tenant-b" };
        var user = new AppUser { Email = "supplier-reader@example.test", DisplayName = "Supplier reader" };
        var allowed = new CustomerAccount { TenantId = tenant.Id, Code = "SUP-01", Name = "Allowed supplier", Type = CounterpartyType.Supplier, CurrencyCode = "TRY" };
        var denied = new CustomerAccount { TenantId = tenant.Id, Code = "SUP-02", Name = "Restricted supplier", Type = CounterpartyType.Both, CurrencyCode = "EUR" };
        const string permissionCode = "erp.module.purchasing.supplier.read";
        const string resourceType = "erp.module.purchasing";
        var permission = new PermissionDefinition { Code = permissionCode, ResourceType = resourceType, Action = "execute", Description = "Search suppliers" };
        platform.Tenants.AddRange(tenant, otherTenant);
        platform.Users.Add(user);
        platform.PermissionDefinitions.Add(permission);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, Tenant = tenant, UserId = user.Id, User = user, Role = "TenantUser" });
        platform.TenantPermissionRules.AddRange(
            new TenantPermissionRule
            {
                TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permissionCode, Permission = permission, Effect = TenantPermissionEffect.Allow, ResourceType = resourceType,
                AttributeName = "resource.route.menuEntryCode", AttributeOperator = TenantPermissionConditionOperator.Equals,
                AttributeValue = "suppliers.search"
            },
            new TenantPermissionRule
            {
                TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permissionCode, Permission = permission, Effect = TenantPermissionEffect.Deny, ResourceType = resourceType,
                AttributeName = "resource.supplierId", AttributeOperator = TenantPermissionConditionOperator.Equals,
                AttributeValue = denied.Id.ToString("D")
            });
        await platform.SaveChangesAsync();
        tenantDb.CustomerAccounts.AddRange(
            allowed,
            denied,
            new CustomerAccount { TenantId = tenant.Id, Code = "CUST-01", Name = "Customer excluded", Type = CounterpartyType.Customer, CurrencyCode = "USD" },
            new CustomerAccount { TenantId = otherTenant.Id, Code = "SUP-99", Name = "Foreign supplier", Type = CounterpartyType.Supplier, CurrencyCode = "USD" });
        await tenantDb.SaveChangesAsync();
        var manifest = new ModuleManifest("purchasing", "Purchasing", "1.0.0", "Nexora", "1.0.0", [],
            [new ModulePermission("supplier.read", "Search supplier directory")], [], [],
            [new ModuleDataCapability("suppliers.search", "supplier.read")]);
        using var query = JsonDocument.Parse("{\"term\":\"SUP\",\"limit\":10}");

        var result = await ModuleDataCapabilityReader.ReadAsync(manifest,
            [new ModuleDataCapabilityRequest("suppliers.search", query.RootElement)], tenant.Id, user.Id, "TenantUser", tenantDb,
            new PlatformPermissionAuthorizer(platform), CancellationToken.None);

        Assert.True(result.Allowed, result.Error);
        var supplier = Assert.Single(Assert.Single(result.Data).Result.EnumerateArray());
        Assert.Equal(allowed.Id, supplier.GetProperty("id").GetGuid());
        Assert.Equal("SUP-01", supplier.GetProperty("code").GetString());
    }

    [Fact]
    public async Task Inventory_availability_search_returns_tenant_balances_and_active_reservations()
    {
        var database = $"module-stock-capability-{Guid.NewGuid():N}";
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(database + "-platform").Options;
        var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase(database + "-tenant").Options;
        await using var platform = new PlatformDbContext(platformOptions);
        await using var tenantDb = new TenantDbContext(tenantOptions);
        var tenant = new Tenant { Name = "Tenant A", Slug = "tenant-a" };
        var otherTenant = new Tenant { Name = "Tenant B", Slug = "tenant-b" };
        var user = new AppUser { Email = "stock-reader@example.test", DisplayName = "Stock reader" };
        const string permissionCode = "erp.module.inventory.stock.read";
        var permission = new PermissionDefinition { Code = permissionCode, ResourceType = "erp.module.inventory", Action = "execute", Description = "Read availability" };
        platform.Tenants.AddRange(tenant, otherTenant);
        platform.Users.Add(user);
        platform.PermissionDefinitions.Add(permission);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, Tenant = tenant, UserId = user.Id, User = user, Role = "TenantUser" });
        platform.TenantPermissionRules.AddRange(
            new TenantPermissionRule
            {
                TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permissionCode, Permission = permission, Effect = TenantPermissionEffect.Allow,
                ResourceType = "erp.module.inventory", AttributeName = "resource.route.menuEntryCode",
                AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = "inventory.availability.search"
            },
            new TenantPermissionRule
            {
                TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permissionCode, Permission = permission, Effect = TenantPermissionEffect.Deny,
                ResourceType = "erp.module.inventory", AttributeName = "resource.stockCode",
                AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = "WIDGET-RESTRICTED"
            });
        await platform.SaveChangesAsync();

        var stock = new StockItem { TenantId = tenant.Id, Code = "WIDGET-A", Name = "Widget A", IsActive = true };
        var otherStock = new StockItem { TenantId = otherTenant.Id, Code = "WIDGET-B", Name = "Widget B secret", IsActive = true };
        var warehouse = new Warehouse { TenantId = tenant.Id, Code = "WH-A", Name = "Warehouse A" };
        var otherWarehouse = new Warehouse { TenantId = otherTenant.Id, Code = "WH-B", Name = "Warehouse B" };
        var deniedStock = new StockItem { TenantId = tenant.Id, Code = "WIDGET-RESTRICTED", Name = "Restricted widget", IsActive = true };
        tenantDb.StockItems.AddRange(stock, otherStock, deniedStock);
        tenantDb.Warehouses.AddRange(warehouse, otherWarehouse);
        tenantDb.InventoryTransactions.AddRange(
            new InventoryTransaction { TenantId = tenant.Id, StockItemId = stock.Id, StockItem = stock, WarehouseId = warehouse.Id, Warehouse = warehouse, EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 20m },
            new InventoryTransaction { TenantId = tenant.Id, StockItemId = stock.Id, StockItem = stock, WarehouseId = warehouse.Id, Warehouse = warehouse, EntryDate = new DateOnly(2026, 10, 2), Direction = InventoryDirection.Issue, Quantity = 5m },
            new InventoryTransaction { TenantId = otherTenant.Id, StockItemId = otherStock.Id, StockItem = otherStock, WarehouseId = otherWarehouse.Id, Warehouse = otherWarehouse, EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 999m });
        var customer = new CustomerAccount { TenantId = tenant.Id, Code = "C-A", Name = "Customer A", Type = CounterpartyType.Customer };
        var quote = new SalesQuote { TenantId = tenant.Id, CustomerId = customer.Id, Customer = customer, Code = "Q-A", QuoteDate = new DateOnly(2026, 10, 1), ValidUntil = new DateOnly(2026, 10, 31) };
        var order = new SalesOrder { TenantId = tenant.Id, QuoteId = quote.Id, Quote = quote, CustomerId = customer.Id, Customer = customer, Code = "O-A", OrderDate = new DateOnly(2026, 10, 2) };
        var orderLine = new SalesOrderLine { TenantId = tenant.Id, OrderId = order.Id, Order = order, LineNumber = 1, StockItemId = stock.Id, StockItem = stock, StockCode = stock.Code, StockName = stock.Name, Quantity = 10m };
        tenantDb.SalesQuotes.Add(quote);
        tenantDb.SalesOrders.Add(order);
        tenantDb.SalesOrderLines.Add(orderLine);
        tenantDb.SalesOrderReservations.Add(new SalesOrderReservation
        {
            TenantId = tenant.Id, OrderId = order.Id, Order = order, OrderLineNumber = orderLine.LineNumber, OrderLine = orderLine,
            WarehouseId = warehouse.Id, Warehouse = warehouse, Quantity = 4m, FulfilledQuantity = 1m, Status = SalesOrderReservationStatus.Active
        });
        await tenantDb.SaveChangesAsync();
        var manifest = new ModuleManifest("inventory", "Inventory", "1.0.0", "Nexora", "1.0.0", [],
            [new ModulePermission("stock.read", "Read stock availability")], [], [],
            [new ModuleDataCapability("inventory.availability.search", "stock.read")]);
        using var query = JsonDocument.Parse("{\"term\":\"WIDGET\",\"limit\":10}");

        var result = await ModuleDataCapabilityReader.ReadAsync(manifest,
            [new ModuleDataCapabilityRequest("inventory.availability.search", query.RootElement)], tenant.Id, user.Id, "TenantUser", tenantDb,
            new PlatformPermissionAuthorizer(platform), CancellationToken.None);

        Assert.True(result.Allowed, result.Error);
        var data = Assert.Single(result.Data);
        var stockRow = Assert.Single(data.Result.EnumerateArray());
        Assert.Equal("WIDGET-A", stockRow.GetProperty("code").GetString());
        Assert.Equal(15m, stockRow.GetProperty("onHand").GetDecimal());
        Assert.Equal(3m, stockRow.GetProperty("reserved").GetDecimal());
        Assert.Equal(12m, stockRow.GetProperty("available").GetDecimal());
        Assert.False(stockRow.TryGetProperty("minimumStock", out _));
        Assert.DoesNotContain(data.Result.EnumerateArray(), item => item.GetProperty("code").GetString() == "WIDGET-RESTRICTED");
    }

    [Fact]
    public async Task Customer_search_denies_ungranted_capability_and_rejects_undeclared_requests()
    {
        var database = $"module-capability-denial-{Guid.NewGuid():N}";
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(database + "-platform").Options;
        var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase(database + "-tenant").Options;
        await using var platform = new PlatformDbContext(platformOptions);
        await using var tenantDb = new TenantDbContext(tenantOptions);
        var tenant = new Tenant { Name = "Tenant A", Slug = "tenant-a" };
        var user = new AppUser { Email = "developer@example.test", DisplayName = "Developer" };
        platform.Tenants.Add(tenant);
        platform.Users.Add(user);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, Tenant = tenant, UserId = user.Id, User = user, Role = "TenantUser" });
        await platform.SaveChangesAsync();
        var manifest = new ModuleManifest("catalog", "Catalog", "1.0.0", "Nexora", "1.0.0", [],
            [new ModulePermission("customer.read", "Search customer directory")], [], [],
            [new ModuleDataCapability("customers.search", "customer.read")]);
        using var query = JsonDocument.Parse("{\"term\":\"ACME\"}");
        var reader = new PlatformPermissionAuthorizer(platform);

        var denied = await ModuleDataCapabilityReader.ReadAsync(manifest,
            [new ModuleDataCapabilityRequest("customers.search", query.RootElement)], tenant.Id, user.Id, "TenantUser", tenantDb, reader, CancellationToken.None);
        var notDeclared = await ModuleDataCapabilityReader.ReadAsync(manifest with { DataCapabilities = [] },
            [new ModuleDataCapabilityRequest("customers.search", query.RootElement)], tenant.Id, user.Id, "TenantUser", tenantDb, reader, CancellationToken.None);

        Assert.True(denied.Forbidden);
        Assert.Empty(denied.Data);
        Assert.False(notDeclared.Allowed);
        Assert.Contains("manifestinde tanımlı değil", notDeclared.Error, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Customer_balance_uses_ledger_currency_and_checks_customer_level_abac()
    {
        var database = $"module-customer-balance-{Guid.NewGuid():N}";
        var platformOptions = new DbContextOptionsBuilder<PlatformDbContext>().UseInMemoryDatabase(database + "-platform").Options;
        var tenantOptions = new DbContextOptionsBuilder<TenantDbContext>().UseInMemoryDatabase(database + "-tenant").Options;
        await using var platform = new PlatformDbContext(platformOptions);
        await using var tenantDb = new TenantDbContext(tenantOptions);
        var tenant = new Tenant { Name = "Tenant A", Slug = "tenant-a" };
        var otherTenant = new Tenant { Name = "Tenant B", Slug = "tenant-b" };
        var user = new AppUser { Email = "finance-reader@example.test", DisplayName = "Finance reader" };
        var allowedCustomer = new CustomerAccount { TenantId = tenant.Id, Code = "CUST-A", Name = "Customer A", Type = CounterpartyType.Customer, CurrencyCode = "USD", RiskLimit = 500m };
        var deniedCustomer = new CustomerAccount { TenantId = tenant.Id, Code = "CUST-D", Name = "Customer D", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var foreignCustomer = new CustomerAccount { TenantId = otherTenant.Id, Code = "CUST-X", Name = "Foreign customer", Type = CounterpartyType.Customer, CurrencyCode = "USD" };
        const string permissionCode = "erp.module.finance.balance.read";
        const string resourceType = "erp.module.finance";
        var permission = new PermissionDefinition { Code = permissionCode, ResourceType = resourceType, Action = "execute", Description = "Read customer balances" };
        platform.Tenants.AddRange(tenant, otherTenant);
        platform.Users.Add(user);
        platform.PermissionDefinitions.Add(permission);
        platform.TenantMemberships.Add(new TenantMembership { TenantId = tenant.Id, Tenant = tenant, UserId = user.Id, User = user, Role = "TenantUser" });
        platform.TenantPermissionRules.AddRange(
            new TenantPermissionRule
            {
                TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permissionCode, Permission = permission, Effect = TenantPermissionEffect.Allow, ResourceType = resourceType,
                AttributeName = "resource.route.menuEntryCode", AttributeOperator = TenantPermissionConditionOperator.Equals,
                AttributeValue = "customers.balance.read"
            },
            new TenantPermissionRule
            {
                TenantId = tenant.Id, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permissionCode, Permission = permission, Effect = TenantPermissionEffect.Deny, ResourceType = resourceType,
                AttributeName = "resource.customerId", AttributeOperator = TenantPermissionConditionOperator.Equals,
                AttributeValue = deniedCustomer.Id.ToString("D")
            });
        await platform.SaveChangesAsync();
        tenantDb.CustomerAccounts.AddRange(allowedCustomer, deniedCustomer, foreignCustomer);
        tenantDb.CustomerLedgerEntries.AddRange(
            new CustomerLedgerEntry { TenantId = tenant.Id, CustomerId = allowedCustomer.Id, Customer = allowedCustomer, EntryDate = new DateOnly(2026, 10, 1), Direction = CustomerLedgerDirection.Debit, Amount = 200m, CurrencyCode = "USD" },
            new CustomerLedgerEntry { TenantId = tenant.Id, CustomerId = allowedCustomer.Id, Customer = allowedCustomer, EntryDate = new DateOnly(2026, 10, 2), Direction = CustomerLedgerDirection.Credit, Amount = 50m, CurrencyCode = "USD" },
            new CustomerLedgerEntry { TenantId = otherTenant.Id, CustomerId = foreignCustomer.Id, Customer = foreignCustomer, EntryDate = new DateOnly(2026, 10, 1), Direction = CustomerLedgerDirection.Debit, Amount = 9999m, CurrencyCode = "USD" });
        await tenantDb.SaveChangesAsync();
        var manifest = new ModuleManifest("finance", "Finance", "1.0.0", "Nexora", "1.0.0", [],
            [new ModulePermission("balance.read", "Read customer balances")], [], [],
            [new ModuleDataCapability("customers.balance.read", "balance.read")]);
        using var allowedQuery = JsonDocument.Parse("{\"customerCode\":\"CUST-A\"}");
        using var deniedQuery = JsonDocument.Parse("{\"customerCode\":\"CUST-D\"}");
        using var foreignQuery = JsonDocument.Parse("{\"customerCode\":\"CUST-X\"}");
        var reader = new PlatformPermissionAuthorizer(platform);

        var allowed = await ModuleDataCapabilityReader.ReadAsync(manifest,
            [new ModuleDataCapabilityRequest("customers.balance.read", allowedQuery.RootElement)], tenant.Id, user.Id, "TenantUser", tenantDb, reader, CancellationToken.None);
        var denied = await ModuleDataCapabilityReader.ReadAsync(manifest,
            [new ModuleDataCapabilityRequest("customers.balance.read", deniedQuery.RootElement)], tenant.Id, user.Id, "TenantUser", tenantDb, reader, CancellationToken.None);
        var foreign = await ModuleDataCapabilityReader.ReadAsync(manifest,
            [new ModuleDataCapabilityRequest("customers.balance.read", foreignQuery.RootElement)], tenant.Id, user.Id, "TenantUser", tenantDb, reader, CancellationToken.None);

        Assert.True(allowed.Allowed, allowed.Error);
        var balance = Assert.Single(allowed.Data).Result;
        Assert.Equal("USD", balance.GetProperty("currencyCode").GetString());
        Assert.Equal(150m, balance.GetProperty("balance").GetDecimal());
        Assert.Equal("Debit", balance.GetProperty("balanceSide").GetString());
        Assert.Equal(500m, balance.GetProperty("riskLimit").GetDecimal());
        Assert.True(denied.Forbidden);
        Assert.Equal(JsonValueKind.Null, Assert.Single(foreign.Data).Result.ValueKind);
    }
}
