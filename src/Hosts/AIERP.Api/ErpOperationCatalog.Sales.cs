using AIERP.Platform.Application;

namespace AIERP.Api;

/// <summary>
/// Satış (Aşama A): quotes, orders, deliveries and invoices as lists, read-only document details and their status /
/// workflow actions. Creation and edit cards stay on the legacy screens. Kept in its own file so other modules' catalog
/// additions do not conflict; the label block (SalesLabelMap) applies to the sales operations only and a code the shared dictionary already defines fails startup.
/// </summary>
internal static partial class ErpOperationCatalog
{
    private const string SalesModule = "Satış";

    /// <summary>Sales label codes (only codes the shared dictionary does not already define; other modules may label them differently).</summary>
    private static KeyValuePair<string, string>[] SalesLabels() =>
    [
        new("customerId", "Cari kimliği"), new("customerCode", "Cari kodu"), new("customerName", "Müşteri"),
        new("customerTaxNumber", "Müşteri vergi no"),
        new("quoteId", "Teklif kimliği"), new("quoteCode", "Kaynak teklif"), new("quoteDate", "Teklif tarihi"),
        new("validUntil", "Geçerlilik"), new("hasSalesOrder", "Siparişi var"), new("revisionGroupId", "Revizyon grubu"),
        new("revisionNumber", "Revizyon"), new("salespersonEmployeeId", "Plasiyer kimliği"), new("salespersonName", "Plasiyer"),
        new("salesOrderId", "Sipariş kimliği"), new("salesOrderCode", "Sipariş no"), new("salesRequestId", "Satış talebi kimliği"),
        new("salesRequestCode", "Satış talebi"), new("deliveryTerms", "Teslimat koşulları"), new("notes", "Not"),
        new("subtotal", "Ara toplam"), new("discountTotal", "Toplam iskonto"), new("taxTotal", "Toplam KDV"),
        new("grandTotal", "Genel toplam"),
        new("lineNumber", "Satır no"), new("stockCode", "Stok kodu"), new("stockName", "Stok adı"), new("unitPrice", "Birim fiyat"),
        new("discountPercent", "İskonto %"), new("vatPercent", "KDV %"), new("lineSubtotal", "Satır ara toplamı"),
        new("discountAmount", "İskonto tutarı"), new("taxAmount", "KDV tutarı"), new("lineTotal", "Satır toplamı"),
        new("enteredCurrencyCode", "Girilen döviz"), new("enteredUnitPrice", "Girilen birim fiyat"),
        new("exchangeRateToQuoteCurrency", "Teklif dövizine kur"), new("exchangeRateToOrderCurrency", "Sipariş dövizine kur"),
        new("isVatIncluded", "KDV dahil"),
        new("orderId", "Sipariş kimliği"), new("orderCode", "Sipariş no"), new("orderDate", "Sipariş tarihi"),
        new("requestedDeliveryDate", "İstenen teslim tarihi"), new("deliveredQuantity", "Teslim edilen"),
        new("remainingQuantity", "Kalan miktar"), new("reservationId", "Rezervasyon kimliği"),
        new("reservationWarehouseId", "Rezervasyon deposu kimliği"), new("reservationWarehouseName", "Rezervasyon deposu"),
        new("orderLineNumber", "Sipariş satırı"), new("fulfilledQuantity", "Karşılanan miktar"),
        new("remainingReservedQuantity", "Kalan rezerve"), new("releasedAt", "Bırakılma"),
        new("deliveryId", "İrsaliye kimliği"), new("deliveryCode", "İrsaliye no"), new("deliveryDate", "Sevk tarihi"),
        new("hasSalesInvoice", "Faturalı"), new("invoiceId", "Fatura kimliği"), new("invoiceCode", "Fatura no"),
        new("invoiceStatus", "Fatura durumu"), new("isStandalone", "Siparişe bağlı olmayan irsaliye"), new("salesDeliveryId", "Satış irsaliyesi kimliği"),
        new("invoiceDate", "Fatura tarihi"), new("invoiceType", "Fatura türü"), new("ledgerEntryId", "Cari hareket kimliği"),
        new("paidAmount", "Tahsil edilen"), new("returnedAmount", "İade edilen"), new("outstandingAmount", "Açık bakiye"),
        new("accountingProfileCode", "Vergi mevzuatı profili"), new("taxBreakdownJson", "Vergi dökümü"),
        new("eDocumentScenario", "E-belge senaryosu"), new("eDocumentTypeCode", "E-belge tür kodu"),
        new("eDocumentRecipientAlias", "E-belge alıcı etiketi"), new("eCommercePurchaseUrl", "Satın alma adresi"),
        new("eCommercePaymentTaxId", "Ödeme aracısı VKN"), new("eCommercePaymentTitle", "Ödeme aracısı unvanı"),
        new("eCommercePaymentAlias", "Ödeme aracısı etiketi"), new("eCommercePaymentAgentName", "Ödeme aracısı"),
        new("eCommercePaymentType", "Ödeme türü"), new("eCommercePaymentDate", "Ödeme tarihi"),
        new("eCommercePaymentDueDate", "Son ödeme tarihi"), new("eCommercePaymentMeans", "Ödeme yöntemi (e-ticaret)"),
        new("eCommercePaymentInstructionNote", "Ödeme notu"), new("eCommerceIntermediaryCountry", "Aracı firma ülkesi"),
        new("eCommerceIntermediaryCountryCode", "Aracı firma ülke kodu"), new("eCommerceIntermediaryCity", "Aracı firma ili"),
        new("eCommerceIntermediaryDistrict", "Aracı firma ilçesi"), new("deliveryCarrierTaxId", "Taşıyıcı VKN"),
        new("deliveryCarrierName", "Taşıyıcı adı"), new("deliveryCarrierSurname", "Taşıyıcı soyadı"),
        new("deliverySentAt", "Sevk tarihi (e-belge)"),
        new("collectionDate", "Tahsilat tarihi"), new("paymentMethod", "Ödeme yöntemi"), new("reference", "Referans"),
        new("financialAccountId", "Kasa / banka hesabı kimliği"), new("financialAccountName", "Kasa / banka hesabı"),
        new("salesInvoiceId", "Fatura kimliği"), new("returnDate", "İade tarihi"),
        new("transactionCount", "Hareket sayısı"),
        // Aşama B: belge kartları, önizleme (hesapla / onizle) ve kurlar (plasiyer ve vergi profili seçenekleri İK ve Satınalma işlemlerinden).
        new("rowKey", "Satır anahtarı"), new("exchangeRate", "Kur"), new("taxableAmount", "Matrah"),
        new("withholdingAmount", "Tevkifat tutarı"), new("rate", "Oran"), new("treatment", "Uygulama"), new("rateDate", "Kur tarihi"),
        new("prospectCustomerName", "Teklif alıcısı"), new("revisesQuoteId", "Revize edilen teklif")
    ];

    /// <summary>
    /// Satış Aşama A. Every route parameter is the endpoint's own <c>{id}</c> (permission resolution matches the route pattern
    /// by name). Paged lists carry their page summary members ("bu sayfa": computed over the returned items only) in meta.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildSales(IReadOnlyList<ErpOperationParameter> paging)
    {
        var id = Route("id");
        string[] pageMeta = ["page", "pageSize", "totalCount"];
        string[] pageTotals = [.. pageMeta, "pageGrandTotal", "pageCurrencyCode", "pageMixedCurrencies"];

        // ---- Teklif ----
        const string quotesRoute = "/api/sales/quotes";
        const string quoteRoute = quotesRoute + "/{id}";
        var quoteSummary = Columns<SalesQuoteSummary>();
        // The single read also names the salesperson and the order made from the quote (members outside the constructor).
        var quoteColumns = Columns<SalesQuoteView>()
            .Append(new ErpOperationColumn("salespersonName", Label("salespersonName"), "text"))
            .Append(new ErpOperationColumn("salesOrderId", Label("salesOrderId"), "guid"))
            .Append(new ErpOperationColumn("salesOrderCode", Label("salesOrderCode"), "text"))
            // Aşama B: the unregistered recipient (null with a customer), for the quote edit card.
            .Append(new ErpOperationColumn("prospectCustomerName", Label("prospectCustomerName"), "text")).ToArray();
        yield return Read(SalesModule, "satis.teklif.listele", "Satış tekliflerini listele", quotesRoute,
            [Query("q", "text"), Query("status", "text"), Query("dateFrom", "date"), Query("dateTo", "date"), .. paging],
            List(quoteSummary, "items") with { MetaPaths = pageTotals });
        yield return Read(SalesModule, "satis.teklif.getir", "Satış teklifi getir", quoteRoute, [id], Record(quoteColumns));
        yield return Read(SalesModule, "satis.teklif.satirlari", "Satış teklifinin satırları", quoteRoute, [id],
            List(Columns<SalesQuoteLineView>(), "lines"));
        yield return Read(SalesModule, "satis.teklif.revizyonlari", "Satış teklifinin revizyonları", quoteRoute + "/revisions", [id],
            List(Columns<SalesQuoteRevisionSummary>(), null));
        // Status transitions resolve as erp.sales-quotes.execute (send / accept / reject / convert-to-order).
        yield return Write(SalesModule, "satis.teklif.ilet", "Satış teklifini iletildi yap", "update", "POST", quoteRoute + "/send",
            [id], Record(quoteSummary), null, null);
        yield return Write(SalesModule, "satis.teklif.kabulEt", "Satış teklifini kabul et", "update", "POST", quoteRoute + "/accept",
            [id], Record(quoteSummary), null, null);
        yield return Write(SalesModule, "satis.teklif.reddet", "Satış teklifini reddet", "update", "POST", quoteRoute + "/reject",
            [id], Record(quoteSummary), null, null);
        yield return Write(SalesModule, "satis.teklif.siparisOlustur", "Satış teklifinden sipariş oluştur", "insert", "POST",
            quoteRoute + "/convert-to-order", [id], Record(Columns<SalesOrderSummary>()), null, null);
        // The DELETE handler itself only accepts TenantAdmin (and only a draft without an order).
        yield return Write(SalesModule, "satis.teklif.sil", "Satış teklifini sil", "delete", "DELETE", quoteRoute, [id], None, null, null,
            requiresTenantAdmin: true);

        // ---- Sipariş ----
        const string ordersRoute = "/api/sales/orders";
        const string orderRoute = ordersRoute + "/{id}";
        var orderSummary = Columns<SalesOrderSummary>();
        yield return Read(SalesModule, "satis.siparis.listele", "Satış siparişlerini listele", ordersRoute, [Query("q", "text"), .. paging],
            List(orderSummary, "items") with { MetaPaths = pageTotals });
        yield return Read(SalesModule, "satis.siparis.getir", "Satış siparişi getir", orderRoute, [id], Record(Columns<SalesOrderView>()));
        yield return Read(SalesModule, "satis.siparis.kalemleri", "Satış siparişinin kalemleri", orderRoute, [id],
            List(Columns<SalesOrderLineView>(), "lines"));
        // The order filter is required, so a page never reads every delivery of the tenant through it.
        yield return Read(SalesModule, "satis.siparis.irsaliyeleri", "Satış siparişinin irsaliyeleri", "/api/sales/deliveries",
            [new ErpOperationParameter("orderId", "query", "guid", true), .. paging],
            List(Columns<SalesDeliverySummary>(), "items") with { MetaPaths = pageMeta });
        // The DELETE handler itself only accepts TenantAdmin.
        yield return Write(SalesModule, "satis.siparis.sil", "Satış siparişini sil", "delete", "DELETE", orderRoute, [id], None, null, null,
            requiresTenantAdmin: true);
        // requestId is page-made (autoId): a retry with the same key returns the earlier reservation.
        yield return Write(SalesModule, "satis.siparis.stokAyir", "Satış siparişi için stok ayır", "insert", "POST", orderRoute + "/reservations",
            [id, .. BodyParameters<SalesOrderReservationWriteRequest>(sourceBacked: false)], List(Columns<SalesOrderReservationSummary>(), null), null, null);
        // Release: the handler itself only accepts TenantAdmin; the reason is required and confirmation is fixed.
        yield return Write(SalesModule, "satis.siparis.rezervasyonBirak", "Satış siparişinin stok rezervasyonunu bırak", "update", "POST",
            orderRoute + "/reservations/release",
            [id, .. BodyParameters<SalesOrderReservationReleaseRequest>(sourceBacked: false, exclude: "confirmation")], None, null,
            new Dictionary<string, object?>(StringComparer.Ordinal) { ["confirmation"] = true }, requiresTenantAdmin: true);
        yield return Write(SalesModule, "satis.siparis.teslimTarihiKaydet", "Satış siparişinin teslim tarihini kaydet", "update", "PUT",
            orderRoute + "/delivery-date", [id, .. BodyParameters<SalesOrderDeliveryDateWriteRequest>(sourceBacked: false)], Record(orderSummary), null, null);

        // ---- İrsaliye ----
        const string deliveriesRoute = "/api/sales/deliveries";
        const string deliveryRoute = deliveriesRoute + "/{id}";
        // Order-based and standalone deliveries in one list; each kind is shown only if the caller may read its old list.
        yield return Read(SalesModule, "satis.irsaliye.listele", "Satış irsaliyelerini listele (siparişten irsaliyeler dahil)",
            SalesDeliveryListEndpoints.Route, [Query("q", "text"), Query("status", "text"), Query("unbilledOnly", "bool"), .. paging],
            List(Columns<SalesDeliveryListItem>(), "items") with { MetaPaths = pageMeta });
        // The {id} routes read SalesDeliveries only: a standalone (siparişsiz) delivery id is not found there.
        yield return Read(SalesModule, "satis.irsaliye.getir", "Satış irsaliyesi getir", deliveryRoute, [id], Record(Columns<SalesDeliveryView>()));
        yield return Read(SalesModule, "satis.irsaliye.kalemleri", "Satış irsaliyesinin kalemleri", deliveryRoute, [id],
            List(Columns<SalesDeliveryLineView>(), "lines"));
        // The void handler has no role check of its own (the legacy screen offers it to TenantAdmin only).
        yield return Write(SalesModule, "satis.irsaliye.iptal", "Satış irsaliyesini iptal et", "update", "POST", deliveryRoute + "/void",
            [id], None, null, null);
        // The DELETE handler itself only accepts TenantAdmin (and only a voided delivery).
        yield return Write(SalesModule, "satis.irsaliye.sil", "Satış irsaliyesini sil", "delete", "DELETE", deliveryRoute, [id], None, null, null,
            requiresTenantAdmin: true);
        // Order-based deliveries: prices come from the delivery lines (old rows: the order lines) and the invoice date is today,
        // so customerId and invoiceDate are not parameters; free / unpriced lines take their price from the lines body
        // (409 "Bedelsiz/fiyatsız satırların tutarını girin." otherwise). A delivery has one invoice: a repeat call returns it (no requestId).
        // The e-document fields are dotted body parameters nested into eDocument.
        yield return Write(SalesModule, "satis.irsaliye.faturalastir", "Siparişten irsaliyeyi faturalaştır", "insert", "POST",
            deliveryRoute + "/invoice",
            [id, .. BodyParameters<SalesDeliveryInvoiceWriteRequest>(sourceBacked: false, exclude: ["customerId", "invoiceDate"]),
                ListParameter<SalesDeliveryInvoiceLineWriteRequest>("lines"), MapParameter("customFields"), .. NestedBodyParameters<SalesInvoiceEDocumentFields>("eDocument")],
            Record(Columns<SalesInvoiceSummary>()), null, null);

        // ---- Fatura ----
        const string invoicesRoute = "/api/sales/invoices";
        const string invoiceRoute = invoicesRoute + "/{id}";
        yield return Read(SalesModule, "satis.fatura.listele", "Satış faturalarını listele", invoicesRoute,
            [Query("q", "text"), Query("customerId", "guid"), .. paging],
            List(Columns<SalesInvoiceSummary>(), "items") with { MetaPaths = [.. pageTotals, "pagePostedCount"] });
        yield return Read(SalesModule, "satis.fatura.getir", "Satış faturası getir", invoiceRoute, [id], Record(Columns<SalesInvoiceView>()));
        yield return Read(SalesModule, "satis.fatura.satirlari", "Satış faturasının satırları", invoiceRoute, [id],
            List(Columns<SalesInvoiceLineView>(), "lines"));
        yield return Read(SalesModule, "satis.fatura.tahsilatlari", "Satış faturasının tahsilatları", invoiceRoute, [id],
            List(Columns<CustomerCollectionSummary>(), "collections"));
        yield return Read(SalesModule, "satis.fatura.iadeleri", "Satış faturasının iadeleri", invoiceRoute, [id],
            List(Columns<SalesReturnSummary>(), "returns"));
        // The void handler has no role check of its own (the legacy list offers it to TenantAdmin only).
        yield return Write(SalesModule, "satis.fatura.iptal", "Satış faturasını iptal et", "update", "POST", invoiceRoute + "/void",
            [id], None, null, null);
        yield return Write(SalesModule, "satis.fatura.sil", "Satış faturasını sil", "delete", "DELETE", invoiceRoute, [id], None, null, null,
            requiresTenantAdmin: true);
        // Resolves as erp.customer-collections.create; requestId is page-made (autoId), kept until the save succeeds.
        yield return Write(SalesModule, "satis.fatura.tahsilatEkle", "Satış faturasına tahsilat ekle", "insert", "POST", invoiceRoute + "/collections",
            [id, .. BodyParameters<CustomerCollectionWriteRequest>(sourceBacked: false)], Record(Columns<CustomerCollectionSummary>()), null, null);
        // id is the collection's / the return's own id (the endpoints' route parameter name).
        yield return Write(SalesModule, "satis.fatura.tahsilatIptal", "Satış faturası tahsilatını iptal et", "update", "POST",
            "/api/customer-collections/{id}/void", [id], None, null, null);
        yield return Write(SalesModule, "satis.fatura.iadeIptal", "Satış iadesini iptal et", "update", "POST", "/api/sales/returns/{id}/void",
            [id], None, null, null);
        yield return Read(SalesModule, "satis.fatura.ozelAlanTanimlari", "Satış faturası özel alan tanımları", invoicesRoute + "/custom-fields", [],
            List(Columns<SalesInvoiceCustomFieldDefinitionView>(), null));

        foreach (var operation in BuildSalesCards()) yield return operation;
    }
}
