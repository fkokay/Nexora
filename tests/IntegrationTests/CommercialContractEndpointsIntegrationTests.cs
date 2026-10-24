using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class CommercialContractEndpointsIntegrationTests
{
    [Fact]
    public async Task Contract_source_selector_pages_searches_and_filters_inside_admin_tenant_scope()
    {
        var tenantA = Guid.NewGuid(); var tenantB = Guid.NewGuid();
        var dbName = $"commercial-contract-sources-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(dbName));
        builder.Services.AddAuthentication("contracts-source-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("contracts-source-test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapCommercialContractEndpoints(); await app.StartAsync();

        var tenant = new Tenant { Id = tenantA, Name = "Contract tenant", Slug = $"contract-{tenantA:N}" };
        var otherTenant = new Tenant { Id = tenantB, Name = "Other contract tenant", Slug = $"contract-{tenantB:N}" };
        var customer = new CustomerAccount { TenantId = tenantA, Tenant = tenant, Code = "CUS-1", Name = "Synthetic customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var otherCustomer = new CustomerAccount { TenantId = tenantA, Tenant = tenant, Code = "CUS-2", Name = "Other customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        var supplier = new CustomerAccount { TenantId = tenantA, Tenant = tenant, Code = "SUP-1", Name = "Synthetic supplier", Type = CounterpartyType.Supplier, CurrencyCode = "TRY" };
        var bothParty = new CustomerAccount { TenantId = tenantA, Tenant = tenant, Code = "CUS-SUP-BOTH", Name = "Both direction party", Type = CounterpartyType.Both, CurrencyCode = "TRY" };
        var inactiveCustomer = new CustomerAccount { TenantId = tenantA, Tenant = tenant, Code = "CUS-INACTIVE", Name = "Inactive customer", Type = CounterpartyType.Customer, IsActive = false, CurrencyCode = "TRY" };
        var foreignCustomer = new CustomerAccount { TenantId = tenantB, Tenant = otherTenant, Code = "CUS-3", Name = "Foreign customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenant, otherTenant); db.CustomerAccounts.AddRange(customer, otherCustomer, supplier, bothParty, inactiveCustomer, foreignCustomer);
            db.CustomerAccounts.AddRange(Enumerable.Range(0, 120).Select(index => new CustomerAccount
            {
                TenantId = tenantA, Tenant = tenant, Code = $"CUS-BULK-{index:000}", Name = $"Bulk customer {index:000}",
                Type = CounterpartyType.Customer, CurrencyCode = "TRY"
            }));
            db.SalesQuotes.AddRange(Enumerable.Range(0, 120).Select(index => new SalesQuote
            {
                TenantId = tenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer,
                Code = $"SQ-{index:000}", CurrencyCode = "TRY", QuoteDate = new DateOnly(2026, 1, 1), ValidUntil = new DateOnly(2026, 12, 31)
            }));
            db.SalesQuotes.AddRange(
                new SalesQuote { TenantId = tenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "SQ-USD", CurrencyCode = "USD", QuoteDate = new DateOnly(2026, 1, 1), ValidUntil = new DateOnly(2026, 12, 31) },
                new SalesQuote { TenantId = tenantA, Tenant = tenant, CustomerId = otherCustomer.Id, Customer = otherCustomer, Code = "SQ-OTHER-CUSTOMER", CurrencyCode = "TRY", QuoteDate = new DateOnly(2026, 1, 1), ValidUntil = new DateOnly(2026, 12, 31) },
                new SalesQuote { TenantId = tenantB, Tenant = otherTenant, CustomerId = foreignCustomer.Id, Customer = foreignCustomer, Code = "SQ-FOREIGN-TENANT", CurrencyCode = "TRY", QuoteDate = new DateOnly(2026, 1, 1), ValidUntil = new DateOnly(2026, 12, 31) });
            var orderQuote = new SalesQuote { TenantId = tenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "SQ-ORDER-SOURCE", CurrencyCode = "TRY", QuoteDate = new DateOnly(2026, 1, 1), ValidUntil = new DateOnly(2026, 12, 31) };
            db.SalesQuotes.Add(orderQuote);
            db.SalesOrders.Add(new SalesOrder { TenantId = tenantA, Tenant = tenant, QuoteId = orderQuote.Id, Quote = orderQuote, CustomerId = customer.Id, Customer = customer, Code = "SO-SOURCE-1", CurrencyCode = "TRY", OrderDate = new DateOnly(2026, 1, 2) });
            var purchaseRequest = new PurchaseRequest { TenantId = tenantA, Tenant = tenant, RequestedByUserId = Guid.NewGuid(), Code = "PR-SOURCE-1", RequestDate = new DateOnly(2026, 1, 2), Description = "Synthetic request" };
            db.PurchaseRequests.Add(purchaseRequest);
            db.PurchaseSupplierQuotes.Add(new PurchaseSupplierQuote { TenantId = tenantA, PurchaseRequestId = purchaseRequest.Id, PurchaseRequest = purchaseRequest, SupplierId = supplier.Id, Supplier = supplier, Code = "PQ-SOURCE-1", QuoteDate = new DateOnly(2026, 1, 2), CurrencyCode = "TRY" });
            db.PurchaseOrders.Add(new PurchaseOrder { TenantId = tenantA, Tenant = tenant, SupplierId = supplier.Id, Supplier = supplier, Code = "PO-SOURCE-1", OrderDate = new DateOnly(2026, 1, 2), CurrencyCode = "TRY" });
            await db.SaveChangesAsync();
        }

        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));
        var counterpartyUrl = "/api/commercial-contracts/counterparties?type=Sales&pageSize=50";
        var firstCounterparties = await client.GetFromJsonAsync<JsonElement>(counterpartyUrl + "&page=1");
        Assert.Equal(123, firstCounterparties.GetProperty("total").GetInt32());
        Assert.Equal(50, firstCounterparties.GetProperty("items").GetArrayLength());
        var thirdCounterparties = await client.GetFromJsonAsync<JsonElement>(counterpartyUrl + "&page=3");
        Assert.Equal(23, thirdCounterparties.GetProperty("items").GetArrayLength());
        var searchedCounterparty = await client.GetFromJsonAsync<JsonElement>(counterpartyUrl + "&q=CUS-BULK-119");
        Assert.Equal(1, searchedCounterparty.GetProperty("total").GetInt32());
        Assert.Equal("CUS-BULK-119", searchedCounterparty.GetProperty("items")[0].GetProperty("code").GetString());
        var bothForPurchase = await client.GetFromJsonAsync<JsonElement>("/api/commercial-contracts/counterparties?type=Purchase");
        Assert.Equal(2, bothForPurchase.GetProperty("total").GetInt32());
        Assert.Contains(bothForPurchase.GetProperty("items").EnumerateArray(), item => item.GetProperty("type").GetString() == "Both");
        var inactiveMatch = await client.GetFromJsonAsync<JsonElement>(counterpartyUrl + "&q=CUS-INACTIVE");
        Assert.Equal(0, inactiveMatch.GetProperty("total").GetInt32());
        var baseUrl = $"/api/commercial-contracts/sources?kind=SalesQuote&counterpartyId={customer.Id:D}&currencyCode=try&pageSize=50";
        var first = await client.GetFromJsonAsync<JsonElement>(baseUrl + "&page=1");
        Assert.Equal(121, first.GetProperty("total").GetInt32());
        Assert.Equal(50, first.GetProperty("items").GetArrayLength());
        var third = await client.GetFromJsonAsync<JsonElement>(baseUrl + "&page=3");
        Assert.Equal(21, third.GetProperty("items").GetArrayLength());
        var found = await client.GetFromJsonAsync<JsonElement>(baseUrl + "&page=1&q=SQ-119");
        Assert.Equal(1, found.GetProperty("total").GetInt32());
        Assert.Equal("SQ-119", found.GetProperty("items")[0].GetProperty("code").GetString());
        var wrongCurrency = await client.GetFromJsonAsync<JsonElement>($"/api/commercial-contracts/sources?kind=SalesQuote&counterpartyId={customer.Id:D}&currencyCode=EUR");
        Assert.Equal(0, wrongCurrency.GetProperty("total").GetInt32());
        var wrongCounterparty = await client.GetFromJsonAsync<JsonElement>($"/api/commercial-contracts/sources?kind=SalesQuote&counterpartyId={otherCustomer.Id:D}&currencyCode=TRY");
        Assert.Equal(1, wrongCounterparty.GetProperty("total").GetInt32());
        Assert.Equal("SQ-OTHER-CUSTOMER", wrongCounterparty.GetProperty("items")[0].GetProperty("code").GetString());
        var incompatibleCounterparty = await client.GetFromJsonAsync<JsonElement>($"/api/commercial-contracts/sources?kind=PurchaseOrder&counterpartyId={customer.Id:D}&currencyCode=TRY");
        Assert.Equal(0, incompatibleCounterparty.GetProperty("total").GetInt32());
        foreach (var sourceCase in new[]
        {
            (Kind: "SalesOrder", Counterparty: customer.Id, Code: "SO-SOURCE-1"),
            (Kind: "PurchaseSupplierQuote", Counterparty: supplier.Id, Code: "PQ-SOURCE-1"),
            (Kind: "PurchaseOrder", Counterparty: supplier.Id, Code: "PO-SOURCE-1")
        })
        {
            var sourcePage = await client.GetFromJsonAsync<JsonElement>($"/api/commercial-contracts/sources?kind={sourceCase.Kind}&counterpartyId={sourceCase.Counterparty:D}&currencyCode=TRY&q={sourceCase.Code}");
            Assert.Equal(1, sourcePage.GetProperty("total").GetInt32());
            Assert.Equal(sourceCase.Code, sourcePage.GetProperty("items")[0].GetProperty("code").GetString());
        }

        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(baseUrl)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/commercial-contracts/counterparties?type=Sales")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        var foreignCounterpartySearch = await client.GetFromJsonAsync<JsonElement>($"/api/commercial-contracts/counterparties?type=Sales&q={foreignCustomer.Code}");
        Assert.Equal(0, foreignCounterpartySearch.GetProperty("total").GetInt32());
        var foreignCounterpartyPage = await client.GetFromJsonAsync<JsonElement>($"/api/commercial-contracts/sources?kind=SalesQuote&counterpartyId={foreignCustomer.Id:D}&currencyCode=TRY");
        Assert.Equal(0, foreignCounterpartyPage.GetProperty("total").GetInt32());
        var foreignSourceSearch = await client.GetFromJsonAsync<JsonElement>($"/api/commercial-contracts/sources?kind=SalesQuote&counterpartyId={customer.Id:D}&currencyCode=TRY&q=SQ-FOREIGN-TENANT");
        Assert.Equal(0, foreignSourceSearch.GetProperty("total").GetInt32());
        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantB.ToString("D"));
        var otherTenantPage = await client.GetFromJsonAsync<JsonElement>($"/api/commercial-contracts/sources?kind=SalesQuote&counterpartyId={foreignCustomer.Id:D}&currencyCode=TRY");
        Assert.Equal(1, otherTenantPage.GetProperty("total").GetInt32());
    }

    [Fact]
    public async Task Contract_create_transition_replay_and_tenant_isolation_are_enforced()
    {
        var tenantA = Guid.NewGuid(); var tenantB = Guid.NewGuid();
        var dbName = $"commercial-contracts-{Guid.NewGuid():N}";
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(dbName));
        builder.Services.AddAuthentication("contracts-test").AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("contracts-test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.ConfigureHttpJsonOptions(options => options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization(); app.MapCommercialContractEndpoints(); await app.StartAsync();

        var tenant = new Tenant { Id = tenantA, Name = "Contract tenant", Slug = $"contract-{tenantA:N}" };
        var otherTenant = new Tenant { Id = tenantB, Name = "Other contract tenant", Slug = $"contract-{tenantB:N}" };
        var customer = new CustomerAccount { TenantId = tenantA, Tenant = tenant, Code = "CUS-1", Name = "Synthetic customer", Type = CounterpartyType.Customer, CurrencyCode = "TRY" };
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>(); await db.Database.EnsureCreatedAsync();
            db.Tenants.AddRange(tenant, otherTenant); db.CustomerAccounts.Add(customer); await db.SaveChangesAsync();
        }
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantA.ToString("D"));
        var key = Guid.NewGuid();
        var request = new { code = " sales-2026-001 ", type = "Sales", counterpartyId = customer.Id,
            effectiveFrom = today.ToString("yyyy-MM-dd"), effectiveThrough = today.AddMonths(6).ToString("yyyy-MM-dd"), currencyCode = "try",
            salesQuoteId = (Guid?)null, salesOrderId = (Guid?)null, purchaseSupplierQuoteId = (Guid?)null, purchaseOrderId = (Guid?)null, idempotencyKey = key };
        using var created = await client.PostAsJsonAsync("/api/commercial-contracts", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var createdBody = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
        var id = createdBody.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("SALES-2026-001", createdBody.RootElement.GetProperty("code").GetString());
        Assert.Equal("Draft", createdBody.RootElement.GetProperty("status").GetString());
        using var replay = await client.PostAsJsonAsync("/api/commercial-contracts", request);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        using var badReplay = await client.PostAsJsonAsync("/api/commercial-contracts", new { code = "different", request.type, request.counterpartyId,
            request.effectiveFrom, request.effectiveThrough, request.currencyCode, request.salesQuoteId, request.salesOrderId,
            request.purchaseSupplierQuoteId, request.purchaseOrderId, idempotencyKey = key });
        Assert.Equal(HttpStatusCode.Conflict, badReplay.StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync($"/api/commercial-contracts/{id}/transitions", new { status = "Active", reason = "", idempotencyKey = Guid.NewGuid(), revision = 1 })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/commercial-contracts")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role");
        var transitionKey = Guid.NewGuid();
        using var activated = await client.PostAsJsonAsync($"/api/commercial-contracts/{id}/transitions", new { status = "Active", reason = "approved", idempotencyKey = transitionKey, revision = 1 });
        Assert.Equal(HttpStatusCode.OK, activated.StatusCode);
        using var transitionReplay = await client.PostAsJsonAsync($"/api/commercial-contracts/{id}/transitions", new { status = "Active", reason = "approved", idempotencyKey = transitionKey, revision = 1 });
        Assert.Equal(HttpStatusCode.OK, transitionReplay.StatusCode);
        using var replayJson = JsonDocument.Parse(await transitionReplay.Content.ReadAsStringAsync());
        Assert.True(replayJson.RootElement.GetProperty("replayed").GetBoolean());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync($"/api/commercial-contracts/{id}/transitions", new { status = "Draft", reason = "", idempotencyKey = Guid.NewGuid(), revision = 2 })).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant"); client.DefaultRequestHeaders.Add("X-Test-Tenant", tenantB.ToString("D"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/commercial-contracts/{id}")).StatusCode);
        Assert.Equal(0, (await client.GetFromJsonAsync<JsonElement>("/api/commercial-contracts")).GetProperty("total").GetInt32());

        await using var verifyScope = app.Services.CreateAsyncScope();
        var verifyDb = verifyScope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var persisted = await verifyDb.Set<CommercialContract>().SingleAsync(x => x.TenantId == tenantA && x.Id == id);
        Assert.Equal(CommercialContractStatus.Active, persisted.Status); Assert.Equal(2, persisted.Revision);
        Assert.Single(await verifyDb.Set<CommercialContractStatusTransition>().Where(x => x.TenantId == tenantA && x.ContractId == id).ToListAsync());
        Assert.Equal(1, await verifyDb.AuditEvents.CountAsync(x => x.TenantId == tenantA && x.Action == "commercial-contract.created"));
        Assert.Equal(1, await verifyDb.AuditEvents.CountAsync(x => x.TenantId == tenantA && x.Action == "commercial-contract.status-changed"));
    }
}
