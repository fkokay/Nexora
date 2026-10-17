using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AIERP.Platform.Application;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Xunit;
using Microsoft.Extensions.Options;

namespace AIERP.Api.IntegrationTests;

public sealed class ReportEndpointsIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Catalog_requires_authenticated_tenant_context()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();

        var response = await client.GetAsync("/api/reports/catalog");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Dynamic_list_views_are_tenant_scoped_separate_from_reports_and_cannot_group()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var definition = new
        {
            source = "customers", columns = new[] { "code", "name", "currencyCode" }, filters = Array.Empty<object>(),
            sortBy = "name", descending = false, page = 1, pageSize = 50
        };
        var create = await client.PostAsJsonAsync("/api/reports/", new { name = "Active customer list", kind = "List", definition });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        using var created = JsonDocument.Parse(await create.Content.ReadAsStringAsync());
        Assert.Equal("List", created.RootElement.GetProperty("kind").GetString());

        var lists = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/?kind=List");
        Assert.Single(lists!);
        Assert.Empty((await client.GetFromJsonAsync<JsonElement[]>("/api/reports/?kind=Report"))!);
        var rendered = await client.PostAsJsonAsync($"/api/reports/{created.RootElement.GetProperty("id").GetGuid()}/run", new { page = 1, pageSize = 50 });
        rendered.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await rendered.Content.ReadAsStringAsync());
        Assert.Equal(2, result.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(3, result.RootElement.GetProperty("columns").GetArrayLength());

        var grouped = await client.PostAsJsonAsync("/api/reports/", new
        {
            name = "Grouped list must fail", kind = "List",
            definition = new
            {
                source = "customers", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
                descending = false, page = 1, pageSize = 50, groupByFields = new[] { "currencyCode" }, aggregate = "count"
            }
        });
        Assert.Equal(HttpStatusCode.BadRequest, grouped.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/reports/?kind=Custom")).StatusCode);
    }

    [Fact]
    public async Task Saved_report_reads_updates_and_runs_are_isolated_between_tenants()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var definition = new
        {
            source = "customers",
            columns = new[] { "code", "name" },
            filters = Array.Empty<object>(),
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        };

        var createResponse = await client.PostAsJsonAsync("/api/reports/", new { name = "Tenant A report", definition });
        Assert.Equal(HttpStatusCode.Created, createResponse.StatusCode);
        using var created = JsonDocument.Parse(await createResponse.Content.ReadAsStringAsync());
        var reportId = created.RootElement.GetProperty("id").GetGuid();
        var ownList = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/");
        Assert.Single(ownList!);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenantList = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/");
        Assert.Empty(otherTenantList!);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync($"/api/reports/{reportId}/run", new { page = 1, pageSize = 50 })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"/api/reports/{reportId}", new { name = "Overwritten", definition })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/reports/{reportId}")).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var ownerRun = await client.PostAsJsonAsync($"/api/reports/{reportId}/run", new { page = 1, pageSize = 50 });
        ownerRun.EnsureSuccessStatusCode();
        using var result = JsonDocument.Parse(await ownerRun.Content.ReadAsStringAsync());
        Assert.Equal(2, result.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Dashboard_widgets_are_persisted_tenant_scoped_and_admin_managed()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/dashboard/widgets/")).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var definition = new
        {
            source = "customers", columns = new[] { "code" }, filters = Array.Empty<object>(),
            sortBy = "code", descending = false, page = 1, pageSize = 50
        };
        var reportResponse = await client.PostAsJsonAsync("/api/reports/", new { name = "Dashboard source", definition });
        Assert.Equal(HttpStatusCode.Created, reportResponse.StatusCode);
        using var report = JsonDocument.Parse(await reportResponse.Content.ReadAsStringAsync());
        var reportId = report.RootElement.GetProperty("id").GetGuid();

        var createWidget = await client.PostAsJsonAsync("/api/dashboard/widgets/", new { savedReportId = reportId });
        Assert.Equal(HttpStatusCode.Created, createWidget.StatusCode);
        using var created = JsonDocument.Parse(await createWidget.Content.ReadAsStringAsync());
        var widgetId = created.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("Dashboard source", created.RootElement.GetProperty("name").GetString());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/dashboard/widgets/", new { savedReportId = reportId })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PutAsJsonAsync("/api/dashboard/widgets/order", new { widgetIds = new[] { widgetId } })).StatusCode);

        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.DeleteAsync($"/api/dashboard/widgets/{widgetId}")).StatusCode);
        var visibleToUser = await client.GetFromJsonAsync<JsonElement[]>("/api/dashboard/widgets/");
        Assert.Single(visibleToUser!);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString());
        var otherTenantWidgets = await client.GetFromJsonAsync<JsonElement[]>("/api/dashboard/widgets/");
        Assert.Empty(otherTenantWidgets!);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync("/api/dashboard/widgets/order", new { widgetIds = new[] { widgetId } })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"/api/dashboard/widgets/{widgetId}")).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/dashboard/widgets/{widgetId}")).StatusCode);
        var emptyAfterDelete = await client.GetFromJsonAsync<JsonElement[]>("/api/dashboard/widgets/");
        Assert.Empty(emptyAfterDelete!);
    }

    [Fact]
    public async Task Stock_report_is_tenant_scoped_supports_null_drilldown_and_grouped_csv()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var catalogResponse = await client.GetAsync("/api/reports/catalog");
        catalogResponse.EnsureSuccessStatusCode();
        using var catalog = JsonDocument.Parse(await catalogResponse.Content.ReadAsStringAsync());
        Assert.Contains(catalog.RootElement.EnumerateArray(), source => source.GetProperty("code").GetString() == "stockItems");

        var definition = new
        {
            source = "stockItems",
            columns = new[] { "code", "minimumStock" },
            filters = Array.Empty<object>(),
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "category", "trackingMode" },
            aggregate = "sumMinimumStock"
        };
        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalGroups").GetInt32());
        Assert.Equal(2, grouped.RootElement.GetProperty("groupByFields").GetArrayLength());
        var row = grouped.RootElement.GetProperty("groups")[0];
        Assert.Equal(1, row.GetProperty("rowCount").GetInt32());
        Assert.Equal(5.5m, row.GetProperty("value").GetDecimal());
        Assert.Equal(JsonValueKind.Null, row.GetProperty("groupValues")[0].ValueKind);

        var availabilityDefinition = new
        {
            source = "stockItems",
            columns = new[] { "code", "onHand", "reserved", "available" },
            filters = Array.Empty<object>(),
            sortBy = "available",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "category", "trackingMode" },
            aggregate = "sumAvailable"
        };
        var availabilityResponse = await client.PostAsJsonAsync("/api/reports/run", availabilityDefinition);
        availabilityResponse.EnsureSuccessStatusCode();
        using var availability = JsonDocument.Parse(await availabilityResponse.Content.ReadAsStringAsync());
        Assert.Equal(12m, availability.RootElement.GetProperty("groups")[0].GetProperty("value").GetDecimal());

        var drilldown = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "stockItems",
            columns = new[] { "code", "onHand", "reserved", "available" },
            filters = new object[]
            {
                new { field = "category", @operator = "isNull", value = "" },
                new { field = "trackingMode", @operator = "equals", value = "None" },
                new { field = "available", @operator = "gte", value = "12" }
            },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        });
        drilldown.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await drilldown.Content.ReadAsStringAsync());
        Assert.Equal(row.GetProperty("rowCount").GetInt32(), details.RootElement.GetProperty("totalCount").GetInt32());
        var detailRow = details.RootElement.GetProperty("rows")[0];
        Assert.Equal(15m, detailRow.GetProperty("onHand").GetDecimal());
        Assert.Equal(3m, detailRow.GetProperty("reserved").GetDecimal());
        Assert.Equal(12m, detailRow.GetProperty("available").GetDecimal());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", availabilityDefinition);
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("Kategori", csv);
        Assert.Contains("12", csv);

        var invalidNullFilter = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "stockItems",
            columns = new[] { "code" },
            filters = new[] { new { field = "code", @operator = "isNull", value = "" } },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidNullFilter.StatusCode);
    }

    [Fact]
    public async Task Customer_report_groups_nullable_risk_limit_and_keeps_tenant_boundary()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "customers",
            columns = new[] { "code" },
            filters = Array.Empty<object>(),
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "isActive", "currencyCode" },
            aggregate = "sumRiskLimit"
        });
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(2, grouped.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalGroups").GetInt32());
        Assert.Equal(12000m, grouped.RootElement.GetProperty("groups")[0].GetProperty("value").GetDecimal());

        var nullableGroupsResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "customers",
            columns = new[] { "code" },
            filters = Array.Empty<object>(),
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "riskLimit" },
            aggregate = "count"
        });
        nullableGroupsResponse.EnsureSuccessStatusCode();
        using var nullableGroups = JsonDocument.Parse(await nullableGroupsResponse.Content.ReadAsStringAsync());
        Assert.Equal(2, nullableGroups.RootElement.GetProperty("totalGroups").GetInt32());
        var nullGroup = nullableGroups.RootElement.GetProperty("groups").EnumerateArray()
            .Single(row => row.GetProperty("groupValue").ValueKind == JsonValueKind.Null);
        Assert.Equal(1, nullGroup.GetProperty("rowCount").GetInt32());

        var nullDetail = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "customers",
            columns = new[] { "code" },
            filters = new[] { new { field = "riskLimit", @operator = "isNull", value = "" } },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        });
        nullDetail.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await nullDetail.Content.ReadAsStringAsync());
        Assert.Equal(nullGroup.GetProperty("rowCount").GetInt32(), details.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Sales_invoice_report_requires_currency_context_for_money_and_drills_by_date()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var unsafeAggregate = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesInvoices",
            columns = new[] { "code" },
            filters = Array.Empty<object>(),
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "invoiceDate" },
            aggregate = "sumGrandTotal"
        });
        Assert.Equal(HttpStatusCode.BadRequest, unsafeAggregate.StatusCode);

        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesInvoices",
            columns = new[] { "code" },
            filters = new[] { new { field = "currencyCode", @operator = "equals", value = "USD" } },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50,
            groupByFields = new[] { "invoiceDate" },
            aggregate = "sumGrandTotal"
        });
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(250m, grouped.RootElement.GetProperty("groups")[0].GetProperty("value").GetDecimal());
        var groupValue = grouped.RootElement.GetProperty("groups")[0].GetProperty("groupValue").GetString()!;

        var detailsResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "salesInvoices",
            columns = new[] { "code" },
            filters = new object[]
            {
                new { field = "currencyCode", @operator = "equals", value = "USD" },
                new { field = "invoiceDate", @operator = "gte", value = groupValue },
                new { field = "invoiceDate", @operator = "lte", value = groupValue }
            },
            sortBy = "code",
            descending = false,
            page = 1,
            pageSize = 50
        });
        detailsResponse.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await detailsResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, details.RootElement.GetProperty("totalCount").GetInt32());
    }

    [Fact]
    public async Task Purchase_order_report_is_tenant_scoped_and_currency_safe()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());

        var catalogResponse = await client.GetAsync("/api/reports/catalog");
        catalogResponse.EnsureSuccessStatusCode();
        using var catalog = JsonDocument.Parse(await catalogResponse.Content.ReadAsStringAsync());
        Assert.Contains(catalog.RootElement.EnumerateArray(), source => source.GetProperty("code").GetString() == "purchaseOrders");

        var unsafeAggregate = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseOrders", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "orderDate" }, aggregate = "sumGrandTotal"
        });
        Assert.Equal(HttpStatusCode.BadRequest, unsafeAggregate.StatusCode);

        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseOrders", columns = new[] { "code" },
            filters = new[] { new { field = "currencyCode", @operator = "equals", value = "USD" } }, sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "orderDate" }, aggregate = "sumGrandTotal"
        });
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalGroups").GetInt32());
        Assert.Equal(350m, grouped.RootElement.GetProperty("groups")[0].GetProperty("value").GetDecimal());

        var detailResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseOrders", columns = new[] { "code", "supplierCode", "supplierName", "orderDate", "currencyCode", "status", "grandTotal" },
            filters = new object[]
            {
                new { field = "currencyCode", @operator = "equals", value = "USD" },
                new { field = "status", @operator = "equals", value = "Open" }
            }, sortBy = "code", descending = false, page = 1, pageSize = 50
        });
        detailResponse.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await detailResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, details.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("PO-A", details.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", new
        {
            source = "purchaseOrders", columns = new[] { "code" },
            filters = new[] { new { field = "currencyCode", @operator = "equals", value = "USD" } }, sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "orderDate" }, aggregate = "sumGrandTotal"
        });
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("Sipariş genel toplamları", csv);
        Assert.Contains("350", csv);
    }

    [Fact]
    public async Task Accepted_sales_quotes_route_through_rules_and_block_order_conversion_until_decided()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/business-rules/catalog");
        Assert.Contains(catalog!, trigger => trigger.GetProperty("code").GetString() == "sales-quote.accepted");

        var workflowCreate = await client.PostAsJsonAsync("/api/workflows/definitions", new
        {
            code = "finance-review", name = "Finance review", description = "Review accepted sales quotes",
            steps = new[] { new { name = "Finance", approverRole = "TenantAdmin" } }
        });
        Assert.Equal(HttpStatusCode.Created, workflowCreate.StatusCode);
        using var workflowCreated = JsonDocument.Parse(await workflowCreate.Content.ReadAsStringAsync());
        var workflowId = workflowCreated.RootElement.GetProperty("id").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/workflows/definitions/{workflowId}/publish", new { })).StatusCode);

        var ruleCreate = await client.PostAsJsonAsync("/api/business-rules/", new
        {
            code = "large-quote-review", name = "Large quote review", trigger = "sales-quote.accepted", workflowCode = "finance-review",
            conditions = new[] { new { field = "grandTotal", @operator = "GreaterThanOrEqual", value = "100000" } }
        });
        Assert.Equal(HttpStatusCode.Created, ruleCreate.StatusCode);
        using var ruleCreated = JsonDocument.Parse(await ruleCreate.Content.ReadAsStringAsync());
        var ruleId = ruleCreated.RootElement.GetProperty("id").GetGuid();
        Assert.Equal("sales-quote.accepted", ruleCreated.RootElement.GetProperty("trigger").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync($"/api/business-rules/{ruleId}/publish", new { })).StatusCode);
        var badRule = await client.PostAsJsonAsync("/api/business-rules/", new
        {
            code = "invalid-quote-rule", name = "Invalid quote rule", trigger = "sales-quote.accepted", workflowCode = "finance-review",
            conditions = new[] { new { field = "neededByDate", @operator = "IsEmpty", value = "" } }
        });
        Assert.Equal(HttpStatusCode.BadRequest, badRule.StatusCode);

        SalesQuote matchingQuote;
        SalesQuote rejectedQuote;
        SalesQuote nonMatchingQuote;
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            var tenant = await db.Tenants.SingleAsync(x => x.Id == TenantA);
            var customer = await db.CustomerAccounts.OrderBy(x => x.Code).FirstAsync(x => x.TenantId == TenantA);
            matchingQuote = new SalesQuote { TenantId = TenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "SQ-MATCH", QuoteDate = new DateOnly(2026, 10, 17), ValidUntil = new DateOnly(2026, 12, 31), CurrencyCode = customer.CurrencyCode, Status = SalesQuoteStatus.Accepted, GrandTotal = 150_000m };
            rejectedQuote = new SalesQuote { TenantId = TenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "SQ-REJECT", QuoteDate = new DateOnly(2026, 10, 17), ValidUntil = new DateOnly(2026, 12, 31), CurrencyCode = customer.CurrencyCode, Status = SalesQuoteStatus.Accepted, GrandTotal = 250_000m };
            nonMatchingQuote = new SalesQuote { TenantId = TenantA, Tenant = tenant, CustomerId = customer.Id, Customer = customer, Code = "SQ-SMALL", QuoteDate = new DateOnly(2026, 10, 17), ValidUntil = new DateOnly(2026, 12, 31), CurrencyCode = customer.CurrencyCode, Status = SalesQuoteStatus.Accepted, GrandTotal = 95_000m };
            db.AddRange(matchingQuote, rejectedQuote, nonMatchingQuote);
            await db.SaveChangesAsync();

            await BusinessRuleEndpoints.ApplySalesQuoteAcceptedRulesAsync(db, matchingQuote, Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), CancellationToken.None);
            await BusinessRuleEndpoints.ApplySalesQuoteAcceptedRulesAsync(db, rejectedQuote, Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), CancellationToken.None);
            await BusinessRuleEndpoints.ApplySalesQuoteAcceptedRulesAsync(db, nonMatchingQuote, Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), CancellationToken.None);
            await db.SaveChangesAsync();

            Assert.True(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, matchingQuote.Id, CancellationToken.None));
            Assert.True(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, rejectedQuote.Id, CancellationToken.None));
            Assert.False(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, nonMatchingQuote.Id, CancellationToken.None));
            var evaluations = await db.TenantBusinessRuleEvaluations.OrderBy(x => x.EventId).ToListAsync();
            Assert.Equal(3, evaluations.Count);
            Assert.Equal(2, evaluations.Count(x => x.Matched));
        }

        var instances = await client.GetFromJsonAsync<JsonElement[]>("/api/workflows/instances") ?? [];
        var matchingInstance = instances.Single(x => x.GetProperty("subjectId").GetGuid() == matchingQuote.Id);
        var rejectedInstance = instances.Single(x => x.GetProperty("subjectId").GetGuid() == rejectedQuote.Id);
        Assert.Equal("Pending", matchingInstance.GetProperty("status").GetString());
        Assert.Equal("SalesQuote", matchingInstance.GetProperty("subjectType").GetString());

        client.DefaultRequestHeaders.Add("X-Test-User", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var approved = await client.PostAsJsonAsync($"/api/workflows/instances/{matchingInstance.GetProperty("id").GetGuid()}/decision", new { decision = "Approved", comment = "Finance approved" });
        approved.EnsureSuccessStatusCode();
        var rejected = await client.PostAsJsonAsync($"/api/workflows/instances/{rejectedInstance.GetProperty("id").GetGuid()}/decision", new { decision = "Rejected", comment = "Margin below policy" });
        rejected.EnsureSuccessStatusCode();

        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
            Assert.Equal(SalesQuoteStatus.Accepted, (await db.SalesQuotes.SingleAsync(x => x.Id == matchingQuote.Id)).Status);
            Assert.Equal(SalesQuoteStatus.Rejected, (await db.SalesQuotes.SingleAsync(x => x.Id == rejectedQuote.Id)).Status);
            Assert.False(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, matchingQuote.Id, CancellationToken.None));
            Assert.False(await BusinessRuleEndpoints.IsSalesQuoteAwaitingApprovalAsync(db, TenantA, rejectedQuote.Id, CancellationToken.None));
        }
    }

    [Fact]
    public async Task Purchase_request_report_applies_owner_abac_filters_and_exports_only_visible_rows()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString());
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");

        var catalog = await client.GetFromJsonAsync<JsonElement[]>("/api/reports/catalog");
        Assert.Contains(catalog!, source => source.GetProperty("code").GetString() == "purchaseRequests");

        var definition = new
        {
            source = "purchaseRequests", columns = new[] { "code", "requesterUserId", "status", "neededByDate" },
            filters = Array.Empty<object>(), sortBy = "code", descending = false, page = 1, pageSize = 50
        };
        var detailResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        detailResponse.EnsureSuccessStatusCode();
        using var details = JsonDocument.Parse(await detailResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, details.RootElement.GetProperty("totalCount").GetInt32());
        Assert.Equal("PR-OWNER", details.RootElement.GetProperty("rows")[0].GetProperty("code").GetString());
        Assert.Equal("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", details.RootElement.GetProperty("rows")[0].GetProperty("requesterUserId").GetString());
        Assert.Equal(JsonValueKind.Null, details.RootElement.GetProperty("rows")[0].GetProperty("neededByDate").ValueKind);

        var nullDateFilter = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseRequests", columns = new[] { "code" },
            filters = new[] { new { field = "neededByDate", @operator = "isNull", value = "" } },
            sortBy = "code", descending = false, page = 1, pageSize = 50
        });
        nullDateFilter.EnsureSuccessStatusCode();
        using var nullDateResult = JsonDocument.Parse(await nullDateFilter.Content.ReadAsStringAsync());
        Assert.Equal(1, nullDateResult.RootElement.GetProperty("totalCount").GetInt32());

        var groupedResponse = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseRequests", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status" }, aggregate = "count"
        });
        groupedResponse.EnsureSuccessStatusCode();
        using var grouped = JsonDocument.Parse(await groupedResponse.Content.ReadAsStringAsync());
        Assert.Equal(1, grouped.RootElement.GetProperty("totalGroups").GetInt32());
        Assert.Equal("Submitted", grouped.RootElement.GetProperty("groups")[0].GetProperty("groupValue").GetString());
        Assert.Equal(1, grouped.RootElement.GetProperty("groups")[0].GetProperty("rowCount").GetInt32());

        var csvResponse = await client.PostAsJsonAsync("/api/reports/export", definition);
        Assert.Equal(HttpStatusCode.OK, csvResponse.StatusCode);
        var csv = await csvResponse.Content.ReadAsStringAsync();
        Assert.Contains("PR-OWNER", csv);
        Assert.DoesNotContain("PR-OTHER", csv);

        var invalidGrouping = await client.PostAsJsonAsync("/api/reports/run", new
        {
            source = "purchaseRequests", columns = new[] { "code" }, filters = Array.Empty<object>(), sortBy = "code",
            descending = false, page = 1, pageSize = 50, groupByFields = new[] { "status", "requestDate" }, aggregate = "count"
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalidGrouping.StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Role");
        var adminResponse = await client.PostAsJsonAsync("/api/reports/run", definition);
        adminResponse.EnsureSuccessStatusCode();
        using var adminResult = JsonDocument.Parse(await adminResponse.Content.ReadAsStringAsync());
        Assert.Equal(2, adminResult.RootElement.GetProperty("totalCount").GetInt32());
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var databaseName = $"reports-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName)
            .ConfigureWarnings(warnings => warnings.Ignore(InMemoryEventId.TransactionIgnoredWarning)));
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase($"{databaseName}-platform"));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();

        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapReportEndpoints();
        app.MapDashboardWidgetEndpoints();
        app.MapWorkflowEndpoints();
        app.MapBusinessRuleEndpoints();
        await app.StartAsync();

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TenantDbContext>();
        var platformDb = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.EnsureCreatedAsync();
        await platformDb.Database.EnsureCreatedAsync();
        var tenantA = new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" };
        var tenantB = new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" };
        var customerA = new CustomerAccount { TenantId = TenantA, Tenant = tenantA, Code = "CUST-A", Name = "A customer", Type = CounterpartyType.Customer, CurrencyCode = "USD", RiskLimit = 12000m };
        var customerANoLimit = new CustomerAccount { TenantId = TenantA, Tenant = tenantA, Code = "CUST-A-NULL", Name = "A customer without limit", Type = CounterpartyType.Customer, CurrencyCode = "USD", RiskLimit = null };
        var customerB = new CustomerAccount { TenantId = TenantB, Tenant = tenantB, Code = "CUST-B", Name = "B customer", Type = CounterpartyType.Customer, CurrencyCode = "USD", RiskLimit = 900000m };
        db.Tenants.AddRange(tenantA, tenantB);
        db.CustomerAccounts.AddRange(customerA, customerANoLimit, customerB);
        var stockA = new StockItem { TenantId = TenantA, Tenant = tenantA, Code = "STOCK-A", Name = "A item", Category = null, MinimumStock = 5.5m };
        var stockB = new StockItem { TenantId = TenantB, Tenant = tenantB, Code = "STOCK-B", Name = "B item", Category = null, MinimumStock = 900m };
        db.StockItems.AddRange(stockA, stockB);
        var warehouseA = new Warehouse { TenantId = TenantA, Tenant = tenantA, Code = "WH-A", Name = "A warehouse" };
        var warehouseB = new Warehouse { TenantId = TenantB, Tenant = tenantB, Code = "WH-B", Name = "B warehouse" };
        var quoteA = new SalesQuote { TenantId = TenantA, Tenant = tenantA, CustomerId = customerA.Id, Customer = customerA, Code = "Q-A", QuoteDate = new DateOnly(2026, 10, 1), ValidUntil = new DateOnly(2026, 10, 31), CurrencyCode = "USD" };
        var orderA = new SalesOrder { TenantId = TenantA, Tenant = tenantA, QuoteId = quoteA.Id, Quote = quoteA, CustomerId = customerA.Id, Customer = customerA, Code = "O-A", OrderDate = new DateOnly(2026, 10, 2), CurrencyCode = "USD" };
        quoteA.Order = orderA;
        var deliveryA = new SalesDelivery { TenantId = TenantA, Tenant = tenantA, OrderId = orderA.Id, Order = orderA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, RequestId = Guid.NewGuid(), Code = "D-A", DeliveryDate = new DateOnly(2026, 10, 15) };
        var orderLineA = new SalesOrderLine { TenantId = TenantA, OrderId = orderA.Id, Order = orderA, LineNumber = 1, StockItemId = stockA.Id, StockItem = stockA, StockCode = stockA.Code, StockName = stockA.Name, Quantity = 10m };
        var reservationA = new SalesOrderReservation { TenantId = TenantA, Tenant = tenantA, OrderId = orderA.Id, Order = orderA, OrderLineNumber = orderLineA.LineNumber, OrderLine = orderLineA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, RequestId = Guid.NewGuid(), Quantity = 4m, FulfilledQuantity = 1m, Status = SalesOrderReservationStatus.Active };
        var receiptA = new InventoryTransaction { TenantId = TenantA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, StockItemId = stockA.Id, StockItem = stockA, EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 20m, Description = "Test receipt" };
        var issueA = new InventoryTransaction { TenantId = TenantA, WarehouseId = warehouseA.Id, Warehouse = warehouseA, StockItemId = stockA.Id, StockItem = stockA, EntryDate = new DateOnly(2026, 10, 2), Direction = InventoryDirection.Issue, Quantity = 5m, Description = "Test issue" };
        var receiptB = new InventoryTransaction { TenantId = TenantB, WarehouseId = warehouseB.Id, Warehouse = warehouseB, StockItemId = stockB.Id, StockItem = stockB, EntryDate = new DateOnly(2026, 10, 1), Direction = InventoryDirection.Receipt, Quantity = 100m, Description = "Other tenant receipt" };
        var invoiceA = new SalesInvoice { TenantId = TenantA, Tenant = tenantA, DeliveryId = deliveryA.Id, Delivery = deliveryA, OrderId = orderA.Id, Order = orderA, CustomerId = customerA.Id, Customer = customerA, Code = "INV-A", InvoiceDate = new DateOnly(2026, 10, 15), CurrencyCode = "USD", GrandTotal = 250m };
        var quoteB = new SalesQuote { TenantId = TenantB, Tenant = tenantB, CustomerId = customerB.Id, Customer = customerB, Code = "Q-B", QuoteDate = new DateOnly(2026, 10, 1), ValidUntil = new DateOnly(2026, 10, 31), CurrencyCode = "USD" };
        var orderB = new SalesOrder { TenantId = TenantB, Tenant = tenantB, QuoteId = quoteB.Id, Quote = quoteB, CustomerId = customerB.Id, Customer = customerB, Code = "O-B", OrderDate = new DateOnly(2026, 10, 2), CurrencyCode = "USD" };
        quoteB.Order = orderB;
        var deliveryB = new SalesDelivery { TenantId = TenantB, Tenant = tenantB, OrderId = orderB.Id, Order = orderB, WarehouseId = warehouseB.Id, Warehouse = warehouseB, RequestId = Guid.NewGuid(), Code = "D-B", DeliveryDate = new DateOnly(2026, 10, 15) };
        var invoiceB = new SalesInvoice { TenantId = TenantB, Tenant = tenantB, DeliveryId = deliveryB.Id, Delivery = deliveryB, OrderId = orderB.Id, Order = orderB, CustomerId = customerB.Id, Customer = customerB, Code = "INV-B", InvoiceDate = new DateOnly(2026, 10, 15), CurrencyCode = "USD", GrandTotal = 900000m };
        var purchaseOrderA = new PurchaseOrder { TenantId = TenantA, Tenant = tenantA, SupplierId = customerA.Id, Supplier = customerA, Code = "PO-A", OrderDate = new DateOnly(2026, 10, 3), CurrencyCode = "USD", Status = PurchaseOrderStatus.Open, Subtotal = 315m, TaxTotal = 35m, GrandTotal = 350m };
        var purchaseOrderB = new PurchaseOrder { TenantId = TenantB, Tenant = tenantB, SupplierId = customerB.Id, Supplier = customerB, Code = "PO-B", OrderDate = new DateOnly(2026, 10, 3), CurrencyCode = "USD", Status = PurchaseOrderStatus.Open, Subtotal = 8_100_000m, TaxTotal = 900_000m, GrandTotal = 9_000_000m };
        var currentUserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
        var otherUserId = Guid.Parse("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
        var ownedRequest = new PurchaseRequest { TenantId = TenantA, Tenant = tenantA, RequestedByUserId = currentUserId, Code = "PR-OWNER", RequestDate = new DateOnly(2026, 10, 10), Description = "Visible request", Status = PurchaseRequestStatus.Submitted };
        var otherRequest = new PurchaseRequest { TenantId = TenantA, Tenant = tenantA, RequestedByUserId = otherUserId, Code = "PR-OTHER", RequestDate = new DateOnly(2026, 10, 11), Description = "Hidden request", Status = PurchaseRequestStatus.Approved };
        var requestTenantB = new PurchaseRequest { TenantId = TenantB, Tenant = tenantB, RequestedByUserId = currentUserId, Code = "PR-TENANT-B", RequestDate = new DateOnly(2026, 10, 12), Description = "Other tenant", Status = PurchaseRequestStatus.Submitted };
        db.AddRange(ownedRequest, otherRequest, requestTenantB,
            warehouseA, quoteA, orderA, orderLineA, reservationA, deliveryA, invoiceA, receiptA, issueA, warehouseB, receiptB, quoteB, orderB, deliveryB, invoiceB, purchaseOrderA, purchaseOrderB);
        platformDb.Tenants.AddRange(new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" }, new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        platformDb.TenantPermissionRules.Add(new TenantPermissionRule
        {
            TenantId = TenantA, SubjectType = TenantPermissionSubjectType.Role, SubjectRole = "TenantUser",
            PermissionCode = "erp.purchase-requests.read", Effect = TenantPermissionEffect.Allow, ResourceType = "erp.purchase-requests",
            AttributeName = "resource.ownerUserId", AttributeOperator = TenantPermissionConditionOperator.Equals, AttributeValue = currentUserId.ToString("D")
        });
        await platformDb.SaveChangesAsync();
        await db.SaveChangesAsync();
        return app;
    }
}

internal sealed class ReportTestAuthenticationHandler(
    IOptionsMonitor<AuthenticationSchemeOptions> options,
    ILoggerFactory logger,
    UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Guid.TryParse(Request.Headers["X-Test-Tenant"], out var tenantId))
            return Task.FromResult(AuthenticateResult.NoResult());

        var claims = new[]
        {
            new Claim("tenant_id", tenantId.ToString()),
            new Claim("sub", Guid.TryParse(Request.Headers["X-Test-User"], out var userId)
                ? userId.ToString() : Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa").ToString()),
            new Claim("role", Request.Headers["X-Test-Role"].FirstOrDefault() ?? "TenantAdmin")
        };
        var identity = new ClaimsIdentity(claims, Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
