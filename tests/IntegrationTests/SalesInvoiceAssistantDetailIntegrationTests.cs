using System.Net;
using System.Security.Claims;
using System.Text.Json;
using System.Net.Http.Json;
using System.Text.Encodings.Web;
using AIERP.Api;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class SalesInvoiceAssistantDetailIntegrationTests
{
    [Fact]
    public async Task Assistant_detail_requires_authentication_and_rejects_terms_outside_bounds()
    {
        await using var factory = new InvoiceApiFactory();
        using var client = factory.CreateClient();

        using var anonymous = await client.GetAsync("/api/sales/invoices/assistant-detail?q=INV-123");
        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);

        var tenantId = Guid.NewGuid();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tenant = new Tenant { Id = tenantId, Name = "Invoice test", Slug = $"invoice-{tenantId:N}", IsActive = true };
            db.Tenants.Add(tenant);
            db.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId,
                Tenant = tenant,
                DatabaseName = $"AIERPTenant_{tenantId:N}",
                State = TenantDatabaseProvisioningState.Ready
            });
            await db.SaveChangesAsync();
        }
        using var tooShort = await client.GetAsync("/api/sales/invoices/assistant-detail?q=x");
        using var tooLong = await client.GetAsync($"/api/sales/invoices/assistant-detail?q={new string('x', 101)}");
        using var purchaseTooShort = await client.GetAsync("/api/purchasing/invoices/assistant-detail?q=x");

        Assert.Equal(HttpStatusCode.BadRequest, tooShort.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, purchaseTooShort.StatusCode);
    }

    [Fact]
    public async Task Purchase_invoice_assistant_detail_enforces_supplier_scope_and_projects_bounded_financial_details()
    {
        await using var factory = new InvoiceApiFactory();
        using var client = factory.CreateClient();
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");

        var allowedSupplierId = Guid.NewGuid();
        var hiddenSupplierId = Guid.NewGuid();
        var allowedSupplier = new CustomerAccount { Id = allowedSupplierId, TenantId = tenantId, Code = "SUP-A", Name = "Authorized Supplier", Type = CounterpartyType.Supplier };
        var hiddenSupplier = new CustomerAccount { Id = hiddenSupplierId, TenantId = tenantId, Code = "SUP-B", Name = "Restricted Supplier", Type = CounterpartyType.Supplier };
        var allowedInvoice = CreatePurchaseInvoice(tenantId, allowedSupplier, "PINV-AUTHORIZED", "PO-AUTHORIZED", "GR-AUTHORIZED", 100m);
        var hiddenInvoice = CreatePurchaseInvoice(tenantId, hiddenSupplier, "PINV-HIDDEN", "PO-HIDDEN", "GR-HIDDEN", 900m);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tenant = new Tenant { Id = tenantId, Name = "Purchase invoice tenant", Slug = $"purchase-invoice-{tenantId:N}", IsActive = true };
            var permission = new PermissionDefinition
            {
                Code = "erp.purchase-invoices.read", ResourceType = "erp.purchase-invoices", Action = "read",
                Description = "Read purchase invoices"
            };
            platformDb.Tenants.Add(tenant);
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId, Tenant = tenant, DatabaseName = $"AIERPTenant_{tenantId:N}", State = TenantDatabaseProvisioningState.Ready
            });
            platformDb.PermissionDefinitions.Add(permission);
            platformDb.TenantPermissionRules.Add(new TenantPermissionRule
            {
                TenantId = tenantId, Tenant = tenant, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
                PermissionCode = permission.Code, Permission = permission, Effect = TenantPermissionEffect.Allow,
                ResourceType = "erp.purchase-invoices", AttributeName = "resource.supplierId",
                AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = allowedSupplierId.ToString("D")
            });
            await platformDb.SaveChangesAsync();

            var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            tenantDb.PurchaseInvoices.AddRange(allowedInvoice, hiddenInvoice);
            tenantDb.PurchaseInvoiceLines.Add(new PurchaseInvoiceLine
            {
                TenantId = tenantId, PurchaseInvoiceId = allowedInvoice.Id, PurchaseReceiptLineId = Guid.NewGuid(),
                OrderLineNumber = 1, StockItemId = Guid.NewGuid(), StockCode = "STK-1", StockName = "Widget", UnitCode = "EA",
                Quantity = 2m, UnitPrice = 50m, VatPercent = 20m, LineTotal = 100m
            });
            tenantDb.SupplierPayments.AddRange(
                new SupplierPayment { TenantId = tenantId, PurchaseInvoiceId = allowedInvoice.Id, SupplierId = allowedSupplierId, Supplier = allowedSupplier, Code = "PAY-PRIVATE", Amount = 40m, Status = SupplierPaymentStatus.Posted },
                new SupplierPayment { TenantId = tenantId, PurchaseInvoiceId = allowedInvoice.Id, SupplierId = allowedSupplierId, Supplier = allowedSupplier, Code = "PAY-VOID", Amount = 20m, Status = SupplierPaymentStatus.Voided });
            tenantDb.SupplierReturns.AddRange(
                new SupplierReturn { TenantId = tenantId, PurchaseInvoiceId = allowedInvoice.Id, SupplierId = allowedSupplierId, Supplier = allowedSupplier, WarehouseId = allowedInvoice.PurchaseReceipt.WarehouseId, Warehouse = allowedInvoice.PurchaseReceipt.Warehouse, Code = "RET-PRIVATE", ReturnDate = new DateOnly(2026, 1, 12), Status = SupplierReturnStatus.Posted, GrandTotal = 10m },
                new SupplierReturn { TenantId = tenantId, PurchaseInvoiceId = allowedInvoice.Id, SupplierId = allowedSupplierId, Supplier = allowedSupplier, WarehouseId = allowedInvoice.PurchaseReceipt.WarehouseId, Warehouse = allowedInvoice.PurchaseReceipt.Warehouse, Code = "RET-VOID", ReturnDate = new DateOnly(2026, 1, 13), Status = SupplierReturnStatus.Voided, GrandTotal = 25m });
            await tenantDb.SaveChangesAsync();
        }

        using var response = await client.GetAsync("/api/purchasing/invoices/assistant-detail?q=PINV");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        Assert.True(root.GetProperty("unique").GetBoolean());
        var invoice = root.GetProperty("invoice");
        Assert.Equal("PINV-AUTHORIZED", invoice.GetProperty("code").GetString());
        Assert.Equal(40m, invoice.GetProperty("paid").GetDecimal());
        Assert.Equal(10m, invoice.GetProperty("returned").GetDecimal());
        Assert.Equal(50m, invoice.GetProperty("outstanding").GetDecimal());
        Assert.Single(invoice.GetProperty("lines").EnumerateArray());
        var json = root.GetRawText();
        Assert.DoesNotContain("PINV-HIDDEN", json, StringComparison.Ordinal);
        Assert.DoesNotContain("Restricted Supplier", json, StringComparison.Ordinal);
        Assert.DoesNotContain(allowedInvoice.Id.ToString("D"), json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Authorized Supplier", json, StringComparison.Ordinal);
        Assert.DoesNotContain("PAY-PRIVATE", json, StringComparison.Ordinal);
        Assert.DoesNotContain("RET-PRIVATE", json, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Assistant_detail_returns_only_the_uniquely_authorized_invoice_and_bounded_financial_details()
    {
        await using var factory = new InvoiceApiFactory();
        using var client = factory.CreateClient();
        var tenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");

        var allowedCustomerId = Guid.NewGuid();
        var hiddenCustomerId = Guid.NewGuid();
        var allowedInvoiceId = Guid.NewGuid();
        var hiddenInvoiceId = Guid.NewGuid();
        var allowedInvoice = CreateInvoice(tenantId, allowedCustomerId, allowedInvoiceId,
            "INV-AUTHORIZED", "Acme Authorized", 110m);
        var hiddenInvoice = CreateInvoice(tenantId, hiddenCustomerId, hiddenInvoiceId,
            "INV-HIDDEN", "Acme Restricted", 900m);

        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tenant = new Tenant { Id = tenantId, Name = "Invoice detail tenant", Slug = $"invoice-detail-{tenantId:N}", IsActive = true };
            var permission = new PermissionDefinition
            {
                Code = "erp.sales-invoices.read",
                ResourceType = "erp.sales-invoices",
                Action = "read",
                Description = "Read sales invoices"
            };
            platformDb.Tenants.Add(tenant);
            platformDb.TenantDatabaseCatalog.Add(new TenantDatabaseCatalogEntry
            {
                TenantId = tenantId,
                Tenant = tenant,
                DatabaseName = $"AIERPTenant_{tenantId:N}",
                State = TenantDatabaseProvisioningState.Ready
            });
            platformDb.PermissionDefinitions.Add(permission);
            platformDb.TenantPermissionRules.Add(new TenantPermissionRule
            {
                TenantId = tenantId,
                Tenant = tenant,
                SubjectType = TenantPermissionSubjectType.Role,
                SubjectRole = "TenantUser",
                PermissionCode = permission.Code,
                Permission = permission,
                Effect = TenantPermissionEffect.Allow,
                ResourceType = "erp.sales-invoices",
                AttributeName = "resource.customerId",
                AttributeOperator = TenantPermissionConditionOperator.Equals,
                AttributeValue = allowedCustomerId.ToString("D")
            });
            await platformDb.SaveChangesAsync();

            var tenantDb = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            tenantDb.SalesInvoices.AddRange(allowedInvoice, hiddenInvoice);
            tenantDb.SalesInvoiceLines.Add(new SalesInvoiceLine
            {
                TenantId = tenantId,
                InvoiceId = allowedInvoiceId,
                OrderLineNumber = 1,
                StockItemId = Guid.NewGuid(),
                StockCode = "STK-001",
                StockName = "Widget",
                UnitCode = "EA",
                Quantity = 1m,
                UnitPrice = 100m,
                VatPercent = 10m,
                LineTotal = 110m
            });
            var postedCollection = new CustomerCollection
            {
                TenantId = tenantId,
                CustomerId = allowedCustomerId,
                Customer = allowedInvoice.Customer,
                Code = "COL-POSTED",
                CollectionDate = new DateOnly(2026, 1, 10),
                Amount = 40m,
                Status = CustomerCollectionStatus.Posted
            };
            var voidedCollection = new CustomerCollection
            {
                TenantId = tenantId,
                CustomerId = allowedCustomerId,
                Customer = allowedInvoice.Customer,
                Code = "COL-VOIDED",
                CollectionDate = new DateOnly(2026, 1, 11),
                Amount = 20m,
                Status = CustomerCollectionStatus.Voided
            };
            tenantDb.CustomerCollectionAllocations.AddRange(
                new CustomerCollectionAllocation { TenantId = tenantId, CustomerCollection = postedCollection, SalesInvoiceId = allowedInvoiceId, Amount = 40m },
                new CustomerCollectionAllocation { TenantId = tenantId, CustomerCollection = voidedCollection, SalesInvoiceId = allowedInvoiceId, Amount = 20m });
            tenantDb.SalesReturns.AddRange(
                new SalesReturn { TenantId = tenantId, SalesInvoiceId = allowedInvoiceId, CustomerId = allowedCustomerId, Code = "RET-POSTED", ReturnDate = new DateOnly(2026, 1, 12), Status = SalesReturnStatus.Posted, GrandTotal = 15m },
                new SalesReturn { TenantId = tenantId, SalesInvoiceId = allowedInvoiceId, CustomerId = allowedCustomerId, Code = "RET-VOIDED", ReturnDate = new DateOnly(2026, 1, 13), Status = SalesReturnStatus.Voided, GrandTotal = 25m });
            await tenantDb.SaveChangesAsync();
        }

        using var response = await client.GetAsync("/api/sales/invoices/assistant-detail?q=Acme");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = document.RootElement;
        Assert.Equal(1, root.GetProperty("totalCount").GetInt32());
        Assert.True(root.GetProperty("unique").GetBoolean());
        var invoice = root.GetProperty("invoice");
        Assert.Equal("INV-AUTHORIZED", invoice.GetProperty("code").GetString());
        Assert.Equal(40m, invoice.GetProperty("paid").GetDecimal());
        Assert.Equal(15m, invoice.GetProperty("returned").GetDecimal());
        Assert.Equal(55m, invoice.GetProperty("outstanding").GetDecimal());
        Assert.Single(invoice.GetProperty("lines").EnumerateArray());
        Assert.False(invoice.GetProperty("linesTruncated").GetBoolean());
        var json = root.GetRawText();
        Assert.DoesNotContain("INV-HIDDEN", json, StringComparison.Ordinal);
        Assert.DoesNotContain("Acme Restricted", json, StringComparison.Ordinal);
        Assert.DoesNotContain(allowedInvoiceId.ToString("D"), json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Acme Authorized", json, StringComparison.Ordinal);
        Assert.DoesNotContain("COL-POSTED", json, StringComparison.Ordinal);
        Assert.DoesNotContain("RET-POSTED", json, StringComparison.Ordinal);
    }

    private static SalesInvoice CreateInvoice(Guid tenantId, Guid customerId, Guid invoiceId,
        string code, string customerName, decimal total)
    {
        var customer = new CustomerAccount
        {
            Id = customerId,
            TenantId = tenantId,
            Code = $"C-{customerId:N}",
            Name = customerName,
            Type = CounterpartyType.Customer
        };
        var quote = new SalesQuote
        {
            TenantId = tenantId,
            CustomerId = customerId,
            Customer = customer,
            Code = $"Q-{code}",
            QuoteDate = new DateOnly(2026, 1, 1),
            ValidUntil = new DateOnly(2026, 1, 31)
        };
        var order = new SalesOrder
        {
            TenantId = tenantId,
            QuoteId = quote.Id,
            Quote = quote,
            CustomerId = customerId,
            Customer = customer,
            Code = $"SO-{code}",
            OrderDate = new DateOnly(2026, 1, 2)
        };
        var warehouse = new Warehouse { TenantId = tenantId, Code = $"WH-{code}", Name = "Test warehouse" };
        var delivery = new SalesDelivery
        {
            TenantId = tenantId,
            OrderId = order.Id,
            Order = order,
            WarehouseId = warehouse.Id,
            Warehouse = warehouse,
            Code = $"DN-{code}",
            DeliveryDate = new DateOnly(2026, 1, 3)
        };
        return new SalesInvoice
        {
            Id = invoiceId,
            TenantId = tenantId,
            DeliveryId = delivery.Id,
            Delivery = delivery,
            OrderId = order.Id,
            Order = order,
            CustomerId = customerId,
            Customer = customer,
            Code = code,
            InvoiceDate = new DateOnly(2026, 1, 4),
            CurrencyCode = "TRY",
            Status = SalesInvoiceStatus.Posted,
            GrandTotal = total,
            CreatedAt = DateTimeOffset.UtcNow
        };
    }

    private static PurchaseInvoice CreatePurchaseInvoice(Guid tenantId, CustomerAccount supplier,
        string code, string purchaseOrderCode, string receiptCode, decimal total)
    {
        var warehouse = new Warehouse { TenantId = tenantId, Code = $"WH-{receiptCode}", Name = "Test warehouse" };
        var order = new PurchaseOrder
        {
            TenantId = tenantId, SupplierId = supplier.Id, Supplier = supplier, Code = purchaseOrderCode,
            OrderDate = new DateOnly(2026, 1, 1), CurrencyCode = "EUR", GrandTotal = total
        };
        var receipt = new PurchaseReceipt
        {
            TenantId = tenantId, RequestId = Guid.NewGuid(), PurchaseOrderId = order.Id, PurchaseOrder = order,
            WarehouseId = warehouse.Id, Warehouse = warehouse, Code = receiptCode, ReceiptDate = new DateOnly(2026, 1, 2)
        };
        return new PurchaseInvoice
        {
            TenantId = tenantId, PurchaseReceiptId = receipt.Id, PurchaseReceipt = receipt, PurchaseOrderId = order.Id,
            PurchaseOrder = order, SupplierId = supplier.Id, Supplier = supplier, Code = code,
            InvoiceDate = new DateOnly(2026, 1, 3), DueDate = new DateOnly(2026, 2, 3), CurrencyCode = "EUR",
            Status = PurchaseInvoiceStatus.Posted, GrandTotal = total
        };
    }

    private sealed class InvoiceApiFactory : WebApplicationFactory<ApiEntryPointMarker>
    {
        private readonly string _databaseName = $"sales-invoice-assistant-{Guid.NewGuid():N}";

        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment(Environments.Production);
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<PlatformDbContext>();
                services.RemoveAll<DbContextOptions<PlatformDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<PlatformDbContext>>();
                services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(_databaseName));
                services.RemoveAll<TenantDbContext>();
                services.RemoveAll<DbContextOptions<TenantDbContext>>();
                services.RemoveAll<IDbContextOptionsConfiguration<TenantDbContext>>();
                services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase($"{_databaseName}-tenant"));
                services.RemoveAll<ITenantSqlCredentialReader>();
                services.AddSingleton<ITenantSqlCredentialReader, TestTenantSqlCredentialReader>();
                services.AddAuthentication(options =>
                {
                    options.DefaultAuthenticateScheme = TestAuthenticationHandler.SchemeName;
                    options.DefaultChallengeScheme = TestAuthenticationHandler.SchemeName;
                    options.DefaultForbidScheme = TestAuthenticationHandler.SchemeName;
                }).AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>(TestAuthenticationHandler.SchemeName, _ => { });
                services.PostConfigure<AuthorizationOptions>(options =>
                    options.DefaultPolicy = new AuthorizationPolicyBuilder(TestAuthenticationHandler.SchemeName)
                        .RequireAuthenticatedUser().Build());
                foreach (var worker in services.Where(x => x.ServiceType == typeof(IHostedService)
                             && x.ImplementationType?.Name is "IntegrationOperationWorker" or "AuditRetentionWorker" or "TcmbExchangeRateWorker").ToArray())
                    services.Remove(worker);
            });
        }

        protected override IHost CreateHost(IHostBuilder builder)
        {
            builder.ConfigureHostConfiguration(configuration => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Authentication:SigningKey"] = "synthetic-sales-invoice-auth-signing-key-32-bytes",
                ["Authentication:Issuer"] = "AIERP",
                ["Authentication:Audience"] = "AIERP",
                ["PluginHost:SigningKey"] = "synthetic-sales-invoice-plugin-signing-key-32-bytes",
                ["PluginHost:BaseUrl"] = "http://plugin-host.invalid",
                ["ConnectionStrings:Platform"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:Tenant"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["ConnectionStrings:AIStudio"] = "Server=localhost;Database=unused;User Id=test;Password=test;TrustServerCertificate=True",
                ["Database:SeparationEnabled"] = "true",
                ["Database:ApplyMigrationsOnStartup"] = "false",
                ["Vault:Address"] = "https://vault.test",
                ["Vault:TenantSqlCredentialReader:RoleId"] = "sales-invoice-test-role",
                ["Vault:TenantSqlCredentialReader:SecretId"] = "sales-invoice-test-secret",
                ["AI:SettingsEncryptionKey"] = Convert.ToBase64String(Enumerable.Range(1, 32).Select(x => (byte)x).ToArray()),
                ["AI:LiveEvaluation:Enabled"] = "false"
            }));
            return base.CreateHost(builder);
        }
    }

    private sealed class TestTenantSqlCredentialReader : ITenantSqlCredentialReader
    {
        public Task<TenantSqlCredential> ReadAsync(Guid tenantId, TenantSqlDatabaseComponent component,
            string secretReference, CancellationToken cancellationToken = default) => Task.FromResult(new TenantSqlCredential(
            TenantSqlCredentialPath.DatabaseName(tenantId, component), $"aierp_t_{tenantId:N}", "synthetic-password", 1));
    }

    private sealed class TestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "sales-invoice-assistant-test";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId))
                return Task.FromResult(AuthenticateResult.NoResult());
            var userId = Guid.TryParse(Request.Headers["X-Test-User"], out var parsed) ? parsed : Guid.NewGuid();
            var claims = new[]
            {
                new Claim("tenant_id", tenantId.ToString("D")),
                new Claim("sub", userId.ToString("D")),
                new Claim("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin")
            };
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(
                new ClaimsPrincipal(new ClaimsIdentity(claims, SchemeName)), SchemeName)));
        }
    }
}
