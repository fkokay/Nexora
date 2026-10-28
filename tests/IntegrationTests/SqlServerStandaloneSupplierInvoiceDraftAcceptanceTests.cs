using System.Net;
using System.Net.Http.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using System.Text.Encodings.Web;
using Xunit;

namespace AIERP.Api.IntegrationTests;

[Collection("SQL Server acceptance")]
public sealed class SqlServerStandaloneSupplierInvoiceDraftAcceptanceTests
{
    [SqlServerAcceptanceFact]
    public async Task Draft_can_be_updated_with_current_rowversion_and_rejects_stale_or_cross_tenant_access()
    {
        var configuredConnection = Environment.GetEnvironmentVariable("AIERP_REPORT_TEST_SQL_CONNECTION_STRING");
        Assert.False(string.IsNullOrWhiteSpace(configuredConnection));
        var suffix = Guid.NewGuid().ToString("N");
        var platformConnection = DatabaseConnection(configuredConnection!, $"AIERP_StandaloneDraftPlatform_{suffix}");
        var tenantConnection = DatabaseConnection(configuredConnection!, $"AIERP_StandaloneDraftTenant_{suffix}");
        var tenantId = Guid.NewGuid();
        var otherTenantId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var tenantCreated = false;
        var platformCreated = false;

        await using var tenantSeed = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
        await using var platformSeed = new PlatformDbContext(new DbContextOptionsBuilder<PlatformDbContext>().UseSqlServer(platformConnection).Options);
        try
        {
            tenantCreated = await tenantSeed.Database.EnsureCreatedAsync();
            platformCreated = await platformSeed.Database.EnsureCreatedAsync();
            Assert.True(tenantCreated);
            Assert.True(platformCreated);

            var tenant = new Tenant { Id = tenantId, Name = "Draft tenant", Slug = $"draft-{tenantId:N}" };
            var otherTenant = new Tenant { Id = otherTenantId, Name = "Other draft tenant", Slug = $"draft-{otherTenantId:N}" };
            var supplier = Supplier(tenantId, tenant, "SUP-001", "Draft supplier");
            var otherSupplier = Supplier(otherTenantId, otherTenant, "SUP-OTHER", "Other tenant supplier");
            var foreignDraft = new PurchaseInvoiceDraft
            {
                TenantId = otherTenantId, SupplierId = otherSupplier.Id, Supplier = otherSupplier,
                RequestId = Guid.NewGuid(), InvoiceNumber = "INV-OTHER-001", InvoiceDate = new DateOnly(2026, 10, 24),
                CurrencyCode = "TRY", Subtotal = 100m, TaxTotal = 20m, GrandTotal = 120m, CreatedByUserId = userId,
            };
            foreignDraft.Lines.Add(new PurchaseInvoiceDraftLine
            {
                TenantId = otherTenantId, PurchaseInvoiceDraft = foreignDraft, LineNumber = 1,
                Description = "Other tenant service", Subtotal = 100m, TaxAmount = 20m, Total = 120m,
            });
            tenantSeed.Tenants.AddRange(tenant, otherTenant);
            tenantSeed.CustomerAccounts.AddRange(supplier, otherSupplier);
            tenantSeed.PurchaseInvoiceDrafts.Add(foreignDraft);
            await tenantSeed.SaveChangesAsync();

            var builder = WebApplication.CreateBuilder();
            builder.WebHost.UseTestServer();
            builder.Services.AddDbContext<TenantDbContext>(options => options.UseSqlServer(tenantConnection));
            builder.Services.AddDbContext<PlatformDbContext>(options => options.UseSqlServer(platformConnection));
            builder.Services.AddAuthentication("standalone-draft-sql-test")
                .AddScheme<AuthenticationSchemeOptions, SqlDraftAuthenticationHandler>("standalone-draft-sql-test", _ => { });
            builder.Services.AddAuthorization(options => options.DefaultPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser().Build());
            await using var app = builder.Build();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapPurchaseInvoiceDraftEndpoints();
            await app.StartAsync();

            using var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-User", userId.ToString("D"));
            client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
            var create = new StandaloneSupplierInvoiceDraftCreateRequest(Guid.NewGuid(), supplier.Id,
                "INV-DRAFT-001", new DateOnly(2026, 10, 24), null, "TRY", null,
                100m, 0m, 20m, 120m,
                [new StandaloneSupplierInvoiceDraftLineCreateRequest(1, "Consulting service", 1m, "EA", 100m, 100m, 0m, 20m, 120m)]);
            using var createResponse = await client.PostAsJsonAsync("/api/purchasing/standalone-invoices/", create);
            Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
            var created = await createResponse.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftDetail>();
            Assert.NotNull(created);
            Assert.Equal(8, Convert.FromBase64String(created.RowVersion).Length);

            var update = new StandaloneSupplierInvoiceDraftUpdateRequest(created.RowVersion, supplier.Id,
                "INV-DRAFT-001-REV1", create.InvoiceDate, create.DueDate, create.CurrencyCode,
                "Corrected source document", create.Subtotal, create.DiscountTotal, create.TaxTotal, create.GrandTotal, create.Lines);
            using var updateResponse = await client.PutAsJsonAsync($"/api/purchasing/standalone-invoices/{created.Id}", update);
            Assert.True(updateResponse.StatusCode == HttpStatusCode.OK,
                $"Expected 200 but received {(int)updateResponse.StatusCode}: {await updateResponse.Content.ReadAsStringAsync()}");
            var updated = await updateResponse.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftDetail>();
            Assert.NotNull(updated);
            Assert.Equal("Draft", updated.Status);
            Assert.Equal("INV-DRAFT-001-REV1", updated.InvoiceNumber);
            Assert.NotEqual(created.RowVersion, updated.RowVersion);

            using var staleResponse = await client.PutAsJsonAsync($"/api/purchasing/standalone-invoices/{created.Id}", update);
            Assert.Equal(HttpStatusCode.Conflict, staleResponse.StatusCode);

            var expense = new LedgerAccount { TenantId = tenantId, Code = "770", Name = "Expense", StatementSection = LedgerAccountStatementSection.Expense };
            var vat = new LedgerAccount { TenantId = tenantId, Code = "191", Name = "Input VAT", StatementSection = LedgerAccountStatementSection.Asset };
            var payable = new LedgerAccount { TenantId = tenantId, Code = "320", Name = "Supplier payable", StatementSection = LedgerAccountStatementSection.Liability };
            tenantSeed.LedgerAccounts.AddRange(expense, vat, payable);
            tenantSeed.LedgerAccountMappings.AddRange(
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.PurchasePayable, AccountId = payable.Id },
                new LedgerAccountMapping { TenantId = tenantId, MappingKey = LedgerMappingKeys.PurchaseTaxRecoverable, AccountId = vat.Id });
            await tenantSeed.SaveChangesAsync();

            var postingUpdate = new StandaloneSupplierInvoiceDraftUpdateRequest(updated.RowVersion, supplier.Id,
                updated.InvoiceNumber, updated.InvoiceDate, updated.DueDate, updated.CurrencyCode, updated.Notes,
                updated.Subtotal, updated.DiscountTotal, updated.TaxTotal, updated.GrandTotal,
                create.Lines.Select(line => line with { ExpenseAccountId = expense.Id }).ToArray());
            using var postingUpdateResponse = await client.PutAsJsonAsync($"/api/purchasing/standalone-invoices/{created.Id}", postingUpdate);
            Assert.Equal(HttpStatusCode.OK, postingUpdateResponse.StatusCode);
            var ready = await postingUpdateResponse.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftDetail>();
            Assert.NotNull(ready);

            using var postResponse = await client.PostAsync($"/api/purchasing/standalone-invoices/{created.Id}/post", null);
            Assert.True(postResponse.StatusCode == HttpStatusCode.OK,
                $"Expected 200 but received {(int)postResponse.StatusCode}: {await postResponse.Content.ReadAsStringAsync()}");
            var posted = await postResponse.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftPostingResult>();
            Assert.NotNull(posted);
            using var replayResponse = await client.PostAsync($"/api/purchasing/standalone-invoices/{created.Id}/post", null);
            Assert.Equal(HttpStatusCode.OK, replayResponse.StatusCode);
            var replay = await replayResponse.Content.ReadFromJsonAsync<StandaloneSupplierInvoiceDraftPostingResult>();
            Assert.NotNull(replay);
            Assert.Equal(posted.JournalEntryId, replay.JournalEntryId);
            Assert.Equal(posted.LedgerEntryId, replay.LedgerEntryId);

            using var foreignResponse = await client.GetAsync($"/api/purchasing/standalone-invoices/{foreignDraft.Id}");
            Assert.Equal(HttpStatusCode.NotFound, foreignResponse.StatusCode);
            using var foreignPostResponse = await client.PostAsync($"/api/purchasing/standalone-invoices/{foreignDraft.Id}/post", null);
            Assert.Equal(HttpStatusCode.NotFound, foreignPostResponse.StatusCode);

            await using var verify = new TenantDbContext(new DbContextOptionsBuilder<TenantDbContext>().UseSqlServer(tenantConnection).Options);
            Assert.Equal(1, await verify.PurchaseInvoiceDrafts.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(1, await verify.PurchaseInvoiceDraftLines.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(0, await verify.PurchaseInvoices.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(0, await verify.InventoryTransactions.CountAsync(x => x.TenantId == tenantId));
            Assert.Equal(1, await verify.CustomerLedgerEntries.CountAsync(x => x.TenantId == tenantId && x.PurchaseInvoiceDraftId == created.Id));
            Assert.Equal(1, await verify.JournalEntries.CountAsync(x => x.TenantId == tenantId && x.SourceType == "StandaloneInvoiceDraft" && x.SourceId == created.Id));
            Assert.Equal(0, await verify.SupplierPayments.CountAsync(x => x.TenantId == tenantId));
        }
        finally
        {
            if (tenantCreated) await tenantSeed.Database.EnsureDeletedAsync();
            if (platformCreated) await platformSeed.Database.EnsureDeletedAsync();
        }
    }

    private static CustomerAccount Supplier(Guid tenantId, Tenant tenant, string code, string name) => new()
    {
        TenantId = tenantId, Tenant = tenant, Code = code, Name = name, Type = CounterpartyType.Supplier,
        CurrencyCode = "TRY", IsActive = true,
    };

    private static string DatabaseConnection(string source, string name) => new SqlConnectionStringBuilder(source)
    {
        InitialCatalog = name, ConnectTimeout = 15, TrustServerCertificate = true,
    }.ConnectionString;

    private sealed class SqlDraftAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger, UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId)
                || !Guid.TryParse(Request.Headers["X-Test-User"], out var userId))
                return Task.FromResult(AuthenticateResult.NoResult());
            var claims = new[]
            {
                new Claim("tenant_id", tenantId.ToString("D")), new Claim("sub", userId.ToString("D")),
                new Claim("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin"),
            };
            var identity = new ClaimsIdentity(claims, Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
