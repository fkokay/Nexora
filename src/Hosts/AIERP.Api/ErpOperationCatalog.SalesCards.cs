using AIERP.Platform.Application;

namespace AIERP.Api;

/// <summary>
/// Satış Aşama B: the document cards (new / edit quote and order, standalone invoice) with their writes, the side-effect free
/// previews that compute the amounts on the server (same calculator as the writes) and the option sources the cards need.
/// Built inside <see cref="BuildSales"/> so the sales label block applies.
/// </summary>
internal static partial class ErpOperationCatalog
{
    /// <summary>
    /// Meta of a preview result: the document totals next to the previewed lines (or taxes). A property, not a static field:
    /// Operations = Build() in another part of this class runs before this file's field initializers.
    /// </summary>
    private static string[] SalesPreviewMeta =>
        ["currencyCode", "accountingProfileCode", "lineCount", "subtotal", "discountTotal", "taxableTotal", "taxTotal", "grossTotal", "withholdingTotal", "grandTotal"];

    /// <summary>
    /// A preview is a read with a POST body (like the report operations): the same body as the write plus a <c>rowKey</c> per line,
    /// echoed by each result line so the page matches lines by key, never by position.
    /// </summary>
    private static ErpOperation SalesPreview(string name, string label, string route, IReadOnlyList<ErpOperationParameter> parameters, bool taxes) =>
        new(name, label, SalesModule, "read", "read", "POST", route, parameters,
            taxes ? List(Columns<SalesDocumentPreviewTax>(), "taxes") with { MetaPaths = SalesPreviewMeta }
                : List(Columns<SalesDocumentPreviewLine>(), "lines") with { MetaPaths = SalesPreviewMeta },
            null, null, Since);

    private static IEnumerable<ErpOperation> BuildSalesCards()
    {
        var id = Route("id");
        var previewLines = ListParameter<SalesPreviewLineRequest>("lines");
        var writeLines = ListParameter<SalesQuoteLineWriteRequest>("lines");

        // ---- Fatura (sales-invoice-create): standalone invoice + delivery in one write ----
        const string invoicesRoute = "/api/sales/invoices";
        // requestId is page-made (autoId): a retry with the same content returns the invoice (200), other content 409.
        // The e-archive payment date and due date are DateTimeOffset: datetime parameters (ISO date and time with offset).
        yield return Write(SalesModule, "satis.fatura.olustur", "Siparişsiz satış faturası kes (irsaliyeli)", "insert", "POST", invoicesRoute,
            [.. BodyParameters<StandaloneSalesInvoiceWriteRequest>(sourceBacked: false), MapParameter("customFields"),
                .. NestedBodyParameters<SalesInvoiceEDocumentFields>("eDocument")
                    .Select(x => x.Name is "eDocument.paymentDate" or "eDocument.paymentDueDate" ? x with { Type = "datetime" } : x),
                writeLines],
            Record(Columns<SalesInvoiceSummary>()), null, null);
        ErpOperationParameter[] invoicePreview = [.. BodyParameters<SalesInvoicePreviewRequest>(sourceBacked: false), previewLines];
        yield return SalesPreview("satis.fatura.onizle", "Satış faturası önizlemesi (satırlar ve toplamlar)", invoicesRoute + "/preview", invoicePreview, taxes: false);
        yield return SalesPreview("satis.fatura.onizleVergileri", "Satış faturası önizlemesi (vergi dökümü)", invoicesRoute + "/preview", invoicePreview, taxes: true);

        // ---- Teklif (sales-quote-create): new, edit (quoteId), revision (revisesQuoteId), from a request (salesRequestId) ----
        const string quotesRoute = "/api/sales/quotes";
        const string quoteRoute = quotesRoute + "/{id}";
        var quoteSummary = Record(Columns<SalesQuoteSummary>());
        // An empty code takes the next number of the series.
        yield return Write(SalesModule, "satis.teklif.olustur", "Satış teklifi oluştur", "insert", "POST", quotesRoute,
            [.. BodyParameters<SalesQuoteWriteRequest>(sourceBacked: false), MapParameter("customFields"), writeLines], quoteSummary, null, null);
        // The PUT sends the full line list; revision and request links are fixed by the stored quote.
        yield return Write(SalesModule, "satis.teklif.guncelle", "Satış teklifini güncelle", "update", "PUT", quoteRoute,
            [id, .. BodyParameters<SalesQuoteWriteRequest>(sourceBacked: false, exclude: ["revisesQuoteId", "salesRequestId"]), MapParameter("customFields"), writeLines],
            quoteSummary, null, null);
        ErpOperationParameter[] quotePreview = [.. BodyParameters<SalesQuotePreviewRequest>(sourceBacked: false), previewLines];
        yield return SalesPreview("satis.teklif.hesapla", "Satış teklifi hesabı (satırlar ve toplamlar)", quotesRoute + "/preview", quotePreview, taxes: false);
        yield return SalesPreview("satis.teklif.hesaplaVergileri", "Satış teklifi hesabı (KDV dökümü)", quotesRoute + "/preview", quotePreview, taxes: true);
        var rates = List(Columns<SalesExchangeRateView>(), "rates") with { MetaPaths = ["baseCurrencyCode"] };
        yield return Read(SalesModule, "satis.kurlar", "Satış belgesi kurları", quotesRoute + "/exchange-rates", [Query("rateDate", "date")], rates);
        var quoteValues = Columns<SalesQuoteCustomFieldValueView>();
        yield return Read(SalesModule, "satis.teklif.ozelAlanTanimlari", "Satış teklifi özel alan tanımları", quotesRoute + "/custom-fields", [],
            List(Columns<SalesQuoteCustomFieldDefinitionView>(), null));
        yield return Read(SalesModule, "satis.teklif.ozelAlanDegerleri", "Satış teklifi özel alan değerleri", quoteRoute + "/custom-fields", [id],
            List(quoteValues, null));
        // values is a code → value map merged over the stored values (codes the page does not bind keep their value).
        yield return Write(SalesModule, "satis.teklif.ozelAlanKaydet", "Satış teklifi özel alanlarını kaydet", "update", "PUT", quoteRoute + "/custom-fields",
            [id, MapParameter("values")], List(quoteValues, null), null, null)
            with { BodyMap = new ErpOperationBodyMap("values", "satis.teklif.ozelAlanDegerleri", "code", "value") };

        // ---- Sipariş (sales-order-create): new, edit (orderId) and the order → delivery dialog ----
        const string ordersRoute = "/api/sales/orders";
        const string orderRoute = ordersRoute + "/{id}";
        var orderSummary = Record(Columns<SalesOrderSummary>());
        yield return Write(SalesModule, "satis.siparis.olustur", "Satış siparişi oluştur", "insert", "POST", ordersRoute,
            [.. BodyParameters<SalesOrderWriteRequest>(sourceBacked: false), MapParameter("customFields"), writeLines], orderSummary, null, null);
        // Only an open order without deliveries, invoices or reservations can be edited (the handler checks).
        yield return Write(SalesModule, "satis.siparis.guncelle", "Satış siparişini güncelle", "update", "PUT", orderRoute,
            [id, .. BodyParameters<SalesOrderWriteRequest>(sourceBacked: false), MapParameter("customFields"), writeLines], orderSummary, null, null);
        ErpOperationParameter[] orderPreview = [.. BodyParameters<SalesOrderPreviewRequest>(sourceBacked: false), previewLines];
        yield return SalesPreview("satis.siparis.hesapla", "Satış siparişi hesabı (satırlar ve toplamlar)", ordersRoute + "/preview", orderPreview, taxes: false);
        yield return SalesPreview("satis.siparis.hesaplaVergileri", "Satış siparişi hesabı (KDV dökümü)", ordersRoute + "/preview", orderPreview, taxes: true);
        // Resolves as erp.sales-orders.create; requestId is page-made (autoId), a retry with the same key returns the delivery.
        yield return Write(SalesModule, "satis.siparis.irsaliyeOlustur", "Satış siparişinden irsaliye oluştur", "insert", "POST", orderRoute + "/deliveries",
            [id, .. BodyParameters<SalesDeliveryWriteRequest>(sourceBacked: false), ListParameter<SalesDeliveryLineWriteRequest>("lines")],
            Record(Columns<SalesDeliverySummary>()), null, null);
        var orderValues = Columns<SalesOrderCustomFieldValueView>();
        yield return Read(SalesModule, "satis.siparis.ozelAlanTanimlari", "Satış siparişi özel alan tanımları", ordersRoute + "/custom-fields", [],
            List(Columns<SalesOrderCustomFieldDefinitionView>(), null));
        yield return Read(SalesModule, "satis.siparis.ozelAlanDegerleri", "Satış siparişi özel alan değerleri", orderRoute + "/custom-fields", [id],
            List(orderValues, null));
        yield return Write(SalesModule, "satis.siparis.ozelAlanKaydet", "Satış siparişi özel alanlarını kaydet", "update", "PUT", orderRoute + "/custom-fields",
            [id, MapParameter("values")], List(orderValues, null), null, null)
            with { BodyMap = new ErpOperationBodyMap("values", "satis.siparis.ozelAlanDegerleri", "code", "value") };
    }
}
