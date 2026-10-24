extern alias Api;
using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class StandaloneSupplierInvoiceDraftIntegrationTests
{
    [Fact]
    public async Task Standalone_invoice_can_be_saved_without_order_or_receipt_and_has_no_posting_effects()
    {
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var dbName = $"standalone-invoice-draft-{Guid.NewGuid():N}";
        var tenant = new Tenant { Id = tenantId, Name = "Draft tenant", Slug = $"draft-{tenantId:N}" };
        var otherTenant = new Tenant { Id = otherTenantId, Name = "Other draft tenant", Slug = $"draft-{otherTenantId:N}" };
        var supplier = new CustomerAccount
        {
            TenantId = tenantId,
            Tenant = tenant,
            Code = "SUP-001",
            Name = "Draft supplier",
            Type = CounterpartyType.Supplier,
            CurrencyCode = "TRY",
            IsActive = true,
        };
        var inactiveSupplier = new CustomerAccount
        {
            TenantId = tenantId,
            Tenant = tenant,
            Code = "SUP-INACTIVE",
            Name = "Inactive supplier",
            Type = CounterpartyType.Supplier,
            CurrencyCode = "TRY",
            IsActive = false,
        };
        var scopedOutSupplier = new CustomerAccount
        {
            TenantId = tenantId,
            Tenant = tenant,
            Code = "SUP-SCOPED-OUT",
            Name = "Scoped out supplier",
            Type = CounterpartyType.Supplier,
            CurrencyCode = "TRY",
            IsActive = true,
        };
        var otherSupplier = new CustomerAccount
        {
            TenantId = otherTenantId,
            Tenant = otherTenant,
            Code = "SUP-OTHER",
            Name = "Other tenant supplier",
            Type = CounterpartyType.Supplier,
            CurrencyCode = "TRY",
            IsActive = true,
        };
        var otherTenantDraft = new PurchaseInvoiceDraft
        {
            TenantId = otherTenantId,
            SupplierId = otherSupplier.Id,
            Supplier = otherSupplier,
            RequestId = Guid.NewGuid(),
            InvoiceNumber = "INV-OTHER-001",
            InvoiceDate = new DateOnly(2026, 10, 24),
            CurrencyCode = "TRY",
            Subtotal = 100m,
            TaxTotal = 20m,
            GrandTotal = 120m,
            CreatedByUserId = Guid.NewGuid(),
        };
        otherTenantDraft.Lines.Add(new PurchaseInvoiceDraftLine
        {
            TenantId = otherTenantId,
            PurchaseInvoiceDraft = otherTenantDraft,
            LineNumber = 1,
            Description = "Other tenant service",
            Subtotal = 100m,
            TaxAmount = 20m,
            Total = 120m,
        });
        var scopedOutDraft = new PurchaseInvoiceDraft
        {
            TenantId = tenantId,
            SupplierId = scopedOutSupplier.Id,
            Supplier = scopedOutSupplier,
            RequestId = Guid.NewGuid(),
            InvoiceNumber = "INV-SCOPED-OUT",
            InvoiceDate = new DateOnly(2026, 10, 24),
            CurrencyCode = "TRY",
            Subtotal = 30m,
            TaxTotal = 6m,
            GrandTotal = 36m,
            CreatedByUserId = Guid.NewGuid(),
        };
        scopedOutDraft.Lines.Add(new PurchaseInvoiceDraftLine
        {
            TenantId = tenantId,
            PurchaseInvoiceDraft = scopedOutDraft,
            LineNumber = 1,
            Description = "Scoped-out service",
            Subtotal = 30m,
            TaxAmount = 6m,
            Total = 36m,
        });

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(dbName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{dbName}-platform")
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddScoped<IPlatformPermissionAuthorizer, PlatformPermissionAuthorizer>();
        builder.Services.AddScoped<IAuthorizationHandler, Api::PermissionAuthorizationHandler>();
        builder.Services.AddAuthentication("standalone-invoice-draft-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("standalone-invoice-draft-test", _ => { });
        builder.Services.AddAuthorization(options => options.DefaultPolicy = new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser().AddRequirements(new Api::PermissionRequirement()).Build());

        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapPurchaseInvoiceDraftEndpoints();
        await app.StartAsync();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenant, otherTenant);
            db.CustomerAccounts.AddRange(supplier, inactiveSupplier, scopedOutSupplier, otherSupplier);
            db.PurchaseInvoiceDrafts.AddRange(otherTenantDraft, scopedOutDraft);
            await db.SaveChangesAsync();

            var platform = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var userId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
            var platformTenant = new Tenant { Id = tenantId, Name = tenant.Name, Slug = tenant.Slug };
            var user = new AppUser { Id = userId, Email = "draft-user@example.invalid", DisplayName = "Draft test user" };
            var permission = new PermissionDefinition
            {
                Code = "erp.purchase-invoices.read",
                ResourceType = "erp.purchase-invoices",
                Action = "read",
                Description = "Read supplier invoices",
            };
            platform.Tenants.Add(platformTenant);
            platform.Users.Add(user);
            platform.TenantMemberships.Add(new TenantMembership
            {
                TenantId = tenantId,
                Tenant = platformTenant,
                UserId = userId,
                User = user,
                Role = "TenantAdmin",
            });
            platform.PermissionDefinitions.Add(permission);
            platform.TenantPermissionRules.AddRange(
                new TenantPermissionRule
                {
                    TenantId = tenantId,
                    SubjectType = TenantPermissionSubjectType.Role,
                    SubjectRole = "TenantUser",
                    PermissionCode = permission.Code,
                    Permission = permission,
                    Effect = TenantPermissionEffect.Allow,
                    ResourceType = permission.ResourceType,
                    AttributeName = "resource.supplierId",
                    AttributeOperator = TenantPermissionConditionOperator.Equals,
                    AttributeValue = supplier.Id.ToString("D"),
                });
            await platform.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        var request = new StandaloneSupplierInvoiceDraftCreateRequest(
            Guid.NewGuid(), supplier.Id, "INV-DRAFT-001", new DateOnly(2026, 10, 24), null, "TRY", "No order or receipt",
            100m, 0m, 20m, 120m,
            [new StandaloneSupplierInvoiceDraftLineCreateRequest(1, "Consulting service", 1m, "EA", 100m, 100m, 0m, 20m, 120m)]);

        using var response = await client.PostAsJsonAsync("/api/purchasing/standalone-invoices/", request);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var created = await response.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftDetail>();
        Assert.NotNull(created);
        Assert.Equal("Draft", created.Status);
        Assert.Equal(supplier.Id, created.SupplierId);
        Assert.Single(created.Lines);

        // Replaying the same request is idempotent and still only records the source draft.
        using var replayResponse = await client.PostAsJsonAsync("/api/purchasing/standalone-invoices/", request);
        Assert.Equal(HttpStatusCode.OK, replayResponse.StatusCode);
        var replay = await replayResponse.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftDetail>();
        Assert.NotNull(replay);
        Assert.Equal(created.Id, replay.Id);

        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        Assert.Equal(2, await verifyDb.PurchaseInvoiceDrafts.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(2, await verifyDb.PurchaseInvoiceDraftLines.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.PurchaseOrders.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.PurchaseReceipts.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.PurchaseInvoices.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.InventoryTransactions.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.CustomerLedgerEntries.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.JournalEntries.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(0, await verifyDb.SupplierPayments.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(2, await verifyDb.PurchaseInvoiceDrafts.CountAsync(x => x.TenantId == tenantId));
        Assert.Equal(2, await verifyDb.PurchaseInvoiceDraftLines.CountAsync(x => x.TenantId == tenantId));

        // Tenant scope is enforced on both draft reads and supplier selection.
        using var foreignDraftResponse = await client.GetAsync($"/api/purchasing/standalone-invoices/{otherTenantDraft.Id}");
        Assert.Equal(HttpStatusCode.NotFound, foreignDraftResponse.StatusCode);

        var inactiveSupplierRequest = request with { RequestId = Guid.NewGuid(), SupplierId = inactiveSupplier.Id };
        using var inactiveSupplierResponse = await client.PostAsJsonAsync("/api/purchasing/standalone-invoices/", inactiveSupplierRequest);
        Assert.Equal(HttpStatusCode.BadRequest, inactiveSupplierResponse.StatusCode);

        var foreignSupplierRequest = request with { RequestId = Guid.NewGuid(), SupplierId = otherSupplier.Id };
        using var foreignSupplierResponse = await client.PostAsJsonAsync("/api/purchasing/standalone-invoices/", foreignSupplierRequest);
        Assert.Equal(HttpStatusCode.BadRequest, foreignSupplierResponse.StatusCode);

        // Alternate roles see only supplier-scoped drafts in collections and details.
        await using (var permissionScope = app.Services.CreateAsyncScope())
        {
            var platform = permissionScope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var membership = await platform.TenantMemberships.SingleAsync(x => x.TenantId == tenantId);
            membership.Role = "TenantUser";
            await platform.SaveChangesAsync();
        }
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        using var scopedListResponse = await client.GetAsync("/api/purchasing/standalone-invoices/?page=1&pageSize=50");
        Assert.Equal(HttpStatusCode.OK, scopedListResponse.StatusCode);
        var scopedList = await scopedListResponse.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftPage>();
        Assert.NotNull(scopedList);
        Assert.Single(scopedList.Items);
        Assert.Equal(created.Id, scopedList.Items[0].Id);

        using var permittedDraftResponse = await client.GetAsync($"/api/purchasing/standalone-invoices/{created.Id}");
        Assert.Equal(HttpStatusCode.OK, permittedDraftResponse.StatusCode);
        using var scopedOutDraftResponse = await client.GetAsync($"/api/purchasing/standalone-invoices/{scopedOutDraft.Id}");
        Assert.Equal(HttpStatusCode.Forbidden, scopedOutDraftResponse.StatusCode);
    }
}
