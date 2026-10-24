using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using AIERP.Platform.Domain;
using AIERP.Platform.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace AIERP.Api.IntegrationTests;

public sealed class IntegrationQueueIntegrationTests
{
    private static readonly Guid TenantA = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid TenantB = Guid.Parse("22222222-2222-2222-2222-222222222222");

    [Fact]
    public async Task Integration_host_response_reader_rejects_oversized_stream_without_content_length()
    {
        using var content = new StreamContent(new RepeatingReadStream(1024 * 1024 + 1));

        var error = await Assert.ThrowsAsync<InvalidDataException>(() =>
            IntegrationOperationWorker.ReadBoundedResponseAsync(content, 1024 * 1024, CancellationToken.None));

        Assert.Contains("exceeded", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Integration_requests_are_encrypted_idempotent_and_tenant_scoped()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        client.DefaultRequestHeaders.Add("Idempotency-Key", "purchase-123-attempt-1");
        var payload = new { payload = new { supplierCode = "SUP-1", note = "private integration content" } };

        var accepted = await client.PostAsJsonAsync("/api/integrations/netsis/execute", payload);

        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);
        var acceptedBody = await accepted.Content.ReadFromJsonAsync<JsonElement>();
        var operationId = acceptedBody.GetProperty("operationId").GetGuid();
        Assert.Equal("Queued", acceptedBody.GetProperty("status").GetString());

        var repeated = await client.PostAsJsonAsync("/api/integrations/netsis/execute", payload);
        Assert.Equal(HttpStatusCode.Accepted, repeated.StatusCode);
        Assert.Equal(operationId, (await repeated.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operationId").GetGuid());
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/integrations/netsis/execute",
            new { payload = new { supplierCode = "SUP-2" } })).StatusCode);

        var status = await client.GetFromJsonAsync<JsonElement>($"/api/integrations/operations/{operationId:D}");
        Assert.Equal("Queued", status.GetProperty("status").GetString());

        client.DefaultRequestHeaders.Remove("X-Test-User");
        client.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/integrations/operations/{operationId:D}")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync("/api/integrations/netsis/execute", payload)).StatusCode);

        client.DefaultRequestHeaders.Remove("X-Test-Tenant");
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString("D"));
        var tenantBSubmission = await client.PostAsJsonAsync("/api/integrations/netsis/execute", payload);
        Assert.Equal(HttpStatusCode.Accepted, tenantBSubmission.StatusCode);
        var tenantBOperationId = (await tenantBSubmission.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operationId").GetGuid();
        Assert.NotEqual(operationId, tenantBOperationId);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/integrations/operations/{operationId:D}")).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var stored = await db.IntegrationOperations.SingleAsync(x => x.Id == operationId);
        Assert.Equal(2, await db.IntegrationOperations.CountAsync());
        Assert.DoesNotContain("private integration content", stored.EncryptedPayload, StringComparison.Ordinal);
        Assert.DoesNotContain("purchase-123-attempt-1", stored.IdempotencyKeyHash, StringComparison.Ordinal);
        Assert.Equal(TenantA, stored.TenantId);
        Assert.Equal("Queued", stored.Status);
    }

    [Fact]
    public async Task Tenant_admin_can_page_and_cancel_only_queued_operations_in_their_tenant()
    {
        await using var app = await StartApplicationAsync();
        using var admin = app.GetTestClient();
        admin.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        admin.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        admin.DefaultRequestHeaders.Add("Idempotency-Key", "queue-a-1");
        var firstResponse = await admin.PostAsJsonAsync("/api/integrations/netsis/execute", new { payload = new { value = 1 } });
        var firstId = (await firstResponse.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operationId").GetGuid();

        admin.DefaultRequestHeaders.Remove("Idempotency-Key");
        admin.DefaultRequestHeaders.Add("Idempotency-Key", "queue-a-2");
        await admin.PostAsJsonAsync("/api/integrations/stripe/execute", new { payload = new { value = 2 } });

        using var otherTenant = app.GetTestClient();
        otherTenant.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString("D"));
        otherTenant.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        otherTenant.DefaultRequestHeaders.Add("Idempotency-Key", "queue-b-1");
        await otherTenant.PostAsJsonAsync("/api/integrations/netsis/execute", new { payload = new { value = 3 } });

        var page = await admin.GetFromJsonAsync<JsonElement>("/api/integrations/operations?page=1&pageSize=1&status=Queued");
        Assert.Equal(2, page.GetProperty("totalCount").GetInt32());
        Assert.Single(page.GetProperty("items").EnumerateArray());
        Assert.False(page.GetProperty("items")[0].TryGetProperty("encryptedPayload", out _));
        var filtered = await admin.GetFromJsonAsync<JsonElement>("/api/integrations/operations?integrationCode=netsis");
        Assert.Equal(1, filtered.GetProperty("totalCount").GetInt32());

        using var ordinaryUser = app.GetTestClient();
        ordinaryUser.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        ordinaryUser.DefaultRequestHeaders.Add("X-Test-Role", "TenantUser");
        Assert.Equal(HttpStatusCode.Forbidden, (await ordinaryUser.GetAsync("/api/integrations/operations")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await ordinaryUser.PostAsync($"/api/integrations/operations/{firstId:D}/cancel", null)).StatusCode);

        var cancelled = await admin.PostAsJsonAsync($"/api/integrations/operations/{firstId:D}/cancel", new { });
        Assert.Equal(HttpStatusCode.OK, cancelled.StatusCode);
        Assert.Equal("Cancelled", (await cancelled.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.NotFound, (await otherTenant.PostAsync($"/api/integrations/operations/{firstId:D}/cancel", null)).StatusCode);

        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        var stored = await db.IntegrationOperations.SingleAsync(x => x.Id == firstId);
        Assert.Equal("Cancelled", stored.Status);
        Assert.Empty(stored.EncryptedPayload);
        Assert.Contains(await db.AuditEvents.ToListAsync(), audit => audit.Action == "integration.operation.cancelled");
    }

    [Fact]
    public async Task Integration_queue_admin_query_rejects_invalid_filters_and_running_work_cannot_be_cancelled()
    {
        await using var app = await StartApplicationAsync();
        using var client = app.GetTestClient();
        client.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        client.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        client.DefaultRequestHeaders.Add("Idempotency-Key", "queue-running-1");
        var submitted = await client.PostAsJsonAsync("/api/integrations/netsis/execute", new { payload = new { value = 1 } });
        var operationId = (await submitted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operationId").GetGuid();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var operation = await db.IntegrationOperations.SingleAsync(x => x.Id == operationId);
            operation.Status = "Running";
            await db.SaveChangesAsync();
        }

        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/integrations/operations?status=Anything")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/integrations/operations?pageSize=101")).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync("/api/integrations/operations?page=10001")).StatusCode);
        var cancel = await client.PostAsync($"/api/integrations/operations/{operationId:D}/cancel", null);
        Assert.Equal(HttpStatusCode.Conflict, cancel.StatusCode);
        Assert.Equal("Running", (await cancel.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("status").GetString());
    }

    [Fact]
    public async Task E_document_draft_is_built_from_a_posted_tenant_invoice_and_requires_another_admin()
    {
        await using var app = await StartApplicationAsync();
        var invoiceId = Guid.NewGuid();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tenant = await db.Tenants.SingleAsync(x => x.Id == TenantA);
            var customer = new CustomerAccount { TenantId = TenantA, Tenant = tenant, Code = "C-1", Name = "Contoso", TaxNumber = "1234567890" };
            var quote = new SalesQuote { TenantId = TenantA, Tenant = tenant, Customer = customer, Code = "Q-1", QuoteDate = new DateOnly(2026, 10, 1), ValidUntil = new DateOnly(2026, 10, 31) };
            var order = new SalesOrder { TenantId = TenantA, Tenant = tenant, Customer = customer, Quote = quote, Code = "SO-1", OrderDate = new DateOnly(2026, 10, 2), CurrencyCode = "TRY" };
            var warehouse = new Warehouse { TenantId = TenantA, Tenant = tenant, Code = "WH-1", Name = "Main" };
            var delivery = new SalesDelivery { TenantId = TenantA, Order = order, Warehouse = warehouse, Code = "DN-1", DeliveryDate = new DateOnly(2026, 10, 3) };
            var invoice = new SalesInvoice { Id = invoiceId, TenantId = TenantA, Tenant = tenant, Customer = customer, Order = order, Delivery = delivery, Code = "INV-1", InvoiceDate = new DateOnly(2026, 10, 4), CurrencyCode = "TRY", GrandTotal = 120m, Subtotal = 100m, TaxTotal = 20m };
            invoice.Lines.Add(new SalesInvoiceLine { TenantId = TenantA, Invoice = invoice, OrderLineNumber = 1, StockCode = "ITEM-1", StockName = "Widget", UnitCode = "EA", Quantity = 2, UnitPrice = 50m, VatPercent = 20m, LineSubtotal = 100m, TaxAmount = 20m, LineTotal = 120m });
            db.SalesInvoices.Add(invoice);
            await db.SaveChangesAsync();
        }

        using var creator = app.GetTestClient();
        creator.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        creator.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        creator.DefaultRequestHeaders.Add("Idempotency-Key", "invoice-prepare-1");
        var sources = await creator.GetFromJsonAsync<JsonElement>("/api/e-documents/source-documents?documentType=e-invoice");
        Assert.Equal("INV-1", sources[0].GetProperty("number").GetString());
        var preview = await creator.GetFromJsonAsync<JsonElement>($"/api/e-documents/source-documents/e-invoice/{invoiceId:D}/preview");
        Assert.Equal("INV-1", preview.GetProperty("documentNumber").GetString());
        Assert.Equal("Contoso", preview.GetProperty("document").GetProperty("customer").GetProperty("name").GetString());
        Assert.Equal("ITEM-1", preview.GetProperty("document").GetProperty("lines")[0].GetProperty("stockCode").GetString());
        var response = await creator.PostAsJsonAsync("/api/e-documents/submissions", new { documentType = "e-invoice", documentId = invoiceId });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var operationId = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operationId").GetGuid();

        using var sameUser = app.GetTestClient();
        sameUser.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        sameUser.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        Assert.Equal(HttpStatusCode.Conflict, (await sameUser.PostAsync($"/api/e-documents/submissions/{operationId:D}/approve", null)).StatusCode);

        using var otherAdmin = app.GetTestClient();
        otherAdmin.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        otherAdmin.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        otherAdmin.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        var detail = await otherAdmin.GetFromJsonAsync<JsonElement>($"/api/e-documents/submissions/{operationId:D}");
        Assert.Equal("INV-1", detail.GetProperty("documentNumber").GetString());
        Assert.Equal("Widget", detail.GetProperty("document").GetProperty("lines")[0].GetProperty("stockName").GetString());
        Assert.Equal(HttpStatusCode.Accepted, (await otherAdmin.PostAsync($"/api/e-documents/submissions/{operationId:D}/approve", null)).StatusCode);

        using var anotherTenant = app.GetTestClient();
        anotherTenant.DefaultRequestHeaders.Add("X-Test-Tenant", TenantB.ToString("D"));
        anotherTenant.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        Assert.Equal(HttpStatusCode.NotFound, (await anotherTenant.PostAsJsonAsync("/api/e-documents/submissions", new { documentType = "e-invoice", documentId = invoiceId })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anotherTenant.GetAsync($"/api/e-documents/submissions/{operationId:D}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await anotherTenant.GetAsync($"/api/e-documents/source-documents/e-invoice/{invoiceId:D}/preview")).StatusCode);
    }

    [Fact]
    public async Task E_dispatch_draft_is_built_from_a_posted_tenant_delivery_and_requires_another_admin()
    {
        await using var app = await StartApplicationAsync();
        var deliveryId = Guid.NewGuid();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            var tenant = await db.Tenants.SingleAsync(x => x.Id == TenantA);
            var customer = new CustomerAccount { TenantId = TenantA, Tenant = tenant, Code = "C-DISP-1", Name = "Synthetic Buyer", TaxNumber = "1111111111" };
            var quote = new SalesQuote { TenantId = TenantA, Tenant = tenant, Customer = customer, Code = "Q-DISP-1", QuoteDate = new DateOnly(2026, 10, 1), ValidUntil = new DateOnly(2026, 10, 31) };
            var order = new SalesOrder { TenantId = TenantA, Tenant = tenant, Customer = customer, Quote = quote, Code = "SO-DISP-1", OrderDate = new DateOnly(2026, 10, 2), CurrencyCode = "TRY" };
            var orderLine = new SalesOrderLine { TenantId = TenantA, Order = order, LineNumber = 1, StockCode = "SYN-ITEM-1", StockName = "Synthetic Item", UnitCode = "EA", Quantity = 2 };
            order.Lines.Add(orderLine);
            var warehouse = new Warehouse { TenantId = TenantA, Tenant = tenant, Code = "WH-DISP-1", Name = "Synthetic Warehouse" };
            var delivery = new SalesDelivery { Id = deliveryId, TenantId = TenantA, Order = order, Warehouse = warehouse, Code = "DN-DISP-1", DeliveryDate = new DateOnly(2026, 10, 3) };
            delivery.Lines.Add(new SalesDeliveryLine
            {
                TenantId = TenantA, Delivery = delivery, OrderLine = orderLine, OrderLineNumber = 1,
                StockCode = "SYN-ITEM-1", StockName = "Synthetic Item", UnitCode = "EA", Quantity = 2
            });
            db.SalesDeliveries.Add(delivery);
            await db.SaveChangesAsync();
        }

        using var creator = app.GetTestClient();
        creator.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        creator.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        creator.DefaultRequestHeaders.Add("Idempotency-Key", "dispatch-prepare-synthetic-1");
        var sources = await creator.GetFromJsonAsync<JsonElement>("/api/e-documents/source-documents?documentType=e-dispatch");
        Assert.Equal("DN-DISP-1", sources[0].GetProperty("number").GetString());
        var preview = await creator.GetFromJsonAsync<JsonElement>($"/api/e-documents/source-documents/e-dispatch/{deliveryId:D}/preview");
        Assert.Equal("e-dispatch", preview.GetProperty("documentType").GetString());
        Assert.Equal("Synthetic Buyer", preview.GetProperty("document").GetProperty("customer").GetProperty("name").GetString());
        Assert.Equal("SYN-ITEM-1", preview.GetProperty("document").GetProperty("lines")[0].GetProperty("stockCode").GetString());
        var response = await creator.PostAsJsonAsync("/api/e-documents/submissions", new { documentType = "e-dispatch", documentId = deliveryId });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        var operationId = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("operationId").GetGuid();
        await using (var scope = app.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
            Assert.Equal("AwaitingApproval", (await db.IntegrationOperations.SingleAsync(x => x.Id == operationId)).Status);
        }

        Assert.Equal(HttpStatusCode.Conflict, (await creator.PostAsync($"/api/e-documents/submissions/{operationId:D}/approve", null)).StatusCode);
        using var otherAdmin = app.GetTestClient();
        otherAdmin.DefaultRequestHeaders.Add("X-Test-Tenant", TenantA.ToString("D"));
        otherAdmin.DefaultRequestHeaders.Add("X-Test-Role", "TenantAdmin");
        otherAdmin.DefaultRequestHeaders.Add("X-Test-User", Guid.NewGuid().ToString("D"));
        Assert.Equal("DN-DISP-1", (await otherAdmin.GetFromJsonAsync<JsonElement>($"/api/e-documents/submissions/{operationId:D}")).GetProperty("documentNumber").GetString());
        Assert.Equal(HttpStatusCode.Accepted, (await otherAdmin.PostAsync($"/api/e-documents/submissions/{operationId:D}/approve", null)).StatusCode);
    }

    private static async Task<WebApplication> StartApplicationAsync()
    {
        var databaseName = $"integration-queue-{Guid.NewGuid():N}";
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["IntegrationQueue:EncryptionKey"] = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        });
        builder.Services.AddDbContext<PlatformDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddDbContext<TenantDbContext>(options => options.UseInMemoryDatabase(databaseName));
        builder.Services.AddAuthentication("report-test")
            .AddScheme<AuthenticationSchemeOptions, ReportTestAuthenticationHandler>("report-test", _ => { });
        builder.Services.AddAuthorization();
        builder.Services.AddRateLimiter(options => options.AddFixedWindowLimiter("integration-execute", limiter =>
        {
            limiter.PermitLimit = 6;
            limiter.Window = TimeSpan.FromSeconds(10);
            limiter.QueueLimit = 0;
        }));

        var app = builder.Build();
        app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapIntegrationExecutionApi();
        await app.StartAsync();
        await using var scope = app.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<PlatformDbContext>();
        await db.Database.EnsureCreatedAsync();
        db.Tenants.AddRange(
            new Tenant { Id = TenantA, Name = "Tenant A", Slug = "tenant-a" },
            new Tenant { Id = TenantB, Name = "Tenant B", Slug = "tenant-b" });
        await db.SaveChangesAsync();
        return app;
    }

    private sealed class RepeatingReadStream(long length) : Stream
    {
        private long position;
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => length;
        public override long Position { get => position; set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var read = (int)Math.Min(buffer.Length, length - position);
            buffer.Span[..read].Fill((byte)'x');
            position += read;
            return ValueTask.FromResult(read);
        }
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override void Flush() { }
    }
}
