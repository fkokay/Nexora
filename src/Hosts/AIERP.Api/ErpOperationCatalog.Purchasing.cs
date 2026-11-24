using AIERP.Platform.Application;

namespace AIERP.Api;

// Satınalma Faz 1 system pages (taslak 21): purchase requests, supplier quotes, orders, delivery notes, receipts, receipt
// invoice entry, invoices and supplier returns. Kept in its own partial file so other modules' catalog changes do not collide.
// No static fields here: Build() runs during the main file's static initialization, and the initialization order of static
// fields across partial files is not something to rely on. Locals, constants and methods only.
internal static partial class ErpOperationCatalog
{
    /// <summary>
    /// Purchasing reads, one-button writes and the invoice entry preview. Several operations read the same endpoint with a
    /// different <c>rowsPath</c> (header record, lines, receipts, payments, returns). Writes keep every server rule: decisions
    /// and voids only send the route id (no body key exists), the payment carries the page-made requestId (a retry returns the
    /// existing payment), and the receipt invoice is idempotent on the same invoice data. Display members computed outside the
    /// record constructors (payment state, order progress, need-by days) are declared only here, so older operations keep their
    /// frozen columns.
    /// </summary>
    private static IEnumerable<ErpOperation> BuildPurchasing(IReadOnlyList<ErpOperationParameter> paging)
    {
        const string requests = "/api/purchasing/requests";
        const string request = requests + "/{id}";
        const string quotes = "/api/purchasing/supplier-quotes";
        const string orders = "/api/purchasing/orders";
        const string order = orders + "/{id}";
        const string deliveryNote = "/api/purchasing/delivery-notes/{id}";
        const string receipts = "/api/purchasing/receipts";
        const string receipt = receipts + "/{id}";
        const string invoices = "/api/purchasing/invoices";
        const string invoice = invoices + "/{id}";
        const string returns = "/api/purchasing/returns";
        const string preview = receipt + "/invoice-preview";
        var id = Route("id");
        var meta = new[] { "page", "pageSize", "totalCount" };
        ErpOperationResult Paged(IReadOnlyList<ErpOperationColumn> columns) => List(columns, "items") with { MetaPaths = meta };
        static IReadOnlyList<ErpOperationColumn> With(IReadOnlyList<ErpOperationColumn> columns, params string[] members) =>
            columns.Concat(members.Select(x => x.Split(':')).Select(x => new ErpOperationColumn(x[0], Label(x[0]), x[1]))).ToArray();
        static Dictionary<string, object?> Decision(bool approved) => new(StringComparer.Ordinal) { ["approved"] = approved };

        string[] needByMembers = ["neededByDays:int"];
        string[] orderProgressMembers = ["orderedQuantity:decimal", "receivedQuantity:decimal", "receivedPercent:decimal", "isOverdue:bool",
            "delayDays:int"];
        string[] paymentMembers = ["paymentState:text", "overdueDays:int", "displayOutstanding:decimal"];
        var invoiceSummaryColumns = With(Columns<PurchaseInvoiceSummary>(), paymentMembers);
        var flattenedInvoice = invoiceSummaryColumns.Select(x => x with { Code = "invoice." + x.Code }).ToArray();
        var fieldDefinitionColumns = Columns<PurchaseRequestCustomFieldDefinitionView>();

        // ---- Satınalma talepleri ----
        yield return Read(PurchasingModule, "satinalma.talep.listele", "Satınalma taleplerini listele", requests,
            [Query("search", "text"), Query("status", "text"), .. paging],
            Paged(With(Columns<PurchaseRequestSummary>(), ["quoteCount:int", .. needByMembers])));
        yield return Read(PurchasingModule, "satinalma.talep.getir", "Satınalma talebi getir", request, [id],
            Record(With(Columns<PurchaseRequestView>(), needByMembers)));
        yield return Read(PurchasingModule, "satinalma.talep.kalemleri", "Satınalma talebinin kalemleri", request, [id],
            List(Columns<PurchaseRequestLineView>(), "lines"));
        // Sorted by the base-currency comparable total: the first row is the best quote.
        yield return Read(PurchasingModule, "satinalma.talep.teklifleri", "Satınalma talebinin tedarikçi teklifleri", request + "/supplier-quotes",
            [id], List(Columns<PurchaseSupplierQuoteView>(), null));
        // POST …/decision resolves to erp.purchase-requests.execute; the handler itself only accepts TenantAdmin, rejects a
        // decision on one's own request (409) and requires a note to reject. approved is fixed, so a page cannot flip it.
        yield return Write(PurchasingModule, "satinalma.talep.onayla", "Satınalma talebini onayla", "update", "POST", request + "/decision",
            [id, .. BodyParameters<PurchaseRequestDecisionRequest>(sourceBacked: false, exclude: "approved")], None, null, Decision(true),
            requiresTenantAdmin: true);
        yield return Write(PurchasingModule, "satinalma.talep.reddet", "Satınalma talebini reddet", "update", "POST", request + "/decision",
            [id, .. BodyParameters<PurchaseRequestDecisionRequest>(sourceBacked: false, exclude: "approved")], None, null, Decision(false),
            requiresTenantAdmin: true);
        yield return Read(PurchasingModule, "satinalma.talep.ozelAlanTanimlari", "Satınalma talebi özel alan tanımları", requests + "/custom-fields", [],
            List(fieldDefinitionColumns, null));
        yield return Read(PurchasingModule, "satinalma.talep.ozelAlanDegerleri", "Satınalma talebi özel alan değerleri", request + "/custom-fields", [id],
            List(Columns<PurchaseRequestCustomFieldValueView>(), null));

        // ---- Tedarikçi teklifleri ----
        yield return Read(PurchasingModule, "satinalma.teklif.listele", "Tedarikçi tekliflerini listele", quotes,
            [Query("search", "text"), Query("status", "text"), .. paging], Paged(Columns<PurchaseSupplierQuoteSummary>()));
        yield return Read(PurchasingModule, "satinalma.teklif.getir", "Tedarikçi teklifi getir", quotes + "/{id}", [id],
            Record(Columns<PurchaseSupplierQuoteDetail>()));
        yield return Read(PurchasingModule, "satinalma.teklif.kalemleri", "Tedarikçi teklifinin kalemleri", quotes + "/{id}", [id],
            List(Columns<PurchaseSupplierQuoteLineView>(), "lines"));
        yield return Read(PurchasingModule, "satinalma.teklif.ozelAlanTanimlari", "Tedarikçi teklifi özel alan tanımları", quotes + "/custom-fields", [],
            List(Columns<PurchaseSupplierQuoteCustomFieldDefinitionView>(), null));

        // ---- Satınalma siparişleri ----
        // status and overdue are optional filters: without them the endpoint returns exactly what the legacy screen reads.
        yield return Read(PurchasingModule, "satinalma.siparis.listele", "Satınalma siparişlerini listele", orders,
            [Query("q", "text"), Query("status", "text"), Query("overdue", "bool"), .. paging],
            Paged(With(Columns<PurchaseOrderSummary>(), orderProgressMembers)));
        yield return Read(PurchasingModule, "satinalma.siparis.getir", "Satınalma siparişi getir", order, [id],
            Record(With(Columns<PurchaseOrderView>(), [.. orderProgressMembers, "postedReceiptCount:int", "invoicedReceiptCount:int"])));
        yield return Read(PurchasingModule, "satinalma.siparis.satirlari", "Satınalma siparişinin satırları", order, [id],
            List(Columns<PurchaseOrderLineView>(), "lines"));
        yield return Read(PurchasingModule, "satinalma.siparis.malKabulleri", "Satınalma siparişinin mal kabulleri", order, [id],
            List([.. Columns<PurchaseReceiptSummary>(), .. flattenedInvoice], "receipts") with { Flatten = ["invoice"] });
        yield return Read(PurchasingModule, "satinalma.siparis.ozelAlanTanimlari", "Satınalma siparişi özel alan tanımları", orders + "/custom-fields", [],
            List(Columns<PurchaseOrderCustomFieldDefinitionView>(), null));
        yield return Read(PurchasingModule, "satinalma.siparis.ozelAlanDegerleri", "Satınalma siparişi özel alan değerleri", order + "/custom-fields", [id],
            List(Columns<PurchaseOrderCustomFieldValueView>(), null));

        // ---- Tedarikçi irsaliyeleri (rows follow the caller's purchase order read rules on the server) ----
        yield return Read(PurchasingModule, "satinalma.irsaliye.listele", "Tedarikçi irsaliyelerini listele", "/api/purchasing/delivery-notes",
            [Query("q", "text"), .. paging], Paged(Columns<PurchaseDeliveryNoteView>()));
        yield return Read(PurchasingModule, "satinalma.irsaliye.getir", "Tedarikçi irsaliyesi getir", deliveryNote, [id],
            Record(Columns<PurchaseDeliveryNoteView>()));
        yield return Read(PurchasingModule, "satinalma.irsaliye.satirlari", "Tedarikçi irsaliyesinin satırları", deliveryNote, [id],
            List(Columns<PurchaseDeliveryNoteLineView>(), "lines"));

        // ---- Mal kabulleri (satinalma.malKabul.listele stays as inventory-cost uses it; this is its paged twin) ----
        yield return Read(PurchasingModule, "satinalma.malKabul.sayfaliListe", "Mal kabulleri listele (sayfalı)", receipts, paging,
            Paged(Columns<PurchaseReceiptSummary>()));
        yield return Read(PurchasingModule, "satinalma.malKabul.getir", "Mal kabul getir", receipt, [id],
            Record([.. Columns<PurchaseReceiptDetail>(), .. flattenedInvoice]) with { Flatten = ["invoice"] });
        yield return Read(PurchasingModule, "satinalma.malKabul.satirlari", "Mal kabulün satırları", receipt, [id],
            List(Columns<PurchaseReceiptLineView>(), "lines"));
        // POST …/void resolves to erp.purchase-receipts.execute; the handler refuses a voided, invoiced or delivery-note
        // linked receipt (409) and writes linked reversal movements.
        yield return Write(PurchasingModule, "satinalma.malKabul.iptal", "Mal kabulü iptal et", "update", "POST", receipt + "/void", [id],
            None, null, null);
        // Resolves to erp.purchase-receipts.create (approved decision 4: the catalog mirrors today's server). The same
        // invoice data again returns the existing invoice (200); different data for an invoiced receipt is a 409.
        yield return Write(PurchasingModule, "satinalma.malKabul.faturala", "Mal kabulden alış faturası oluştur", "insert", "POST", receipt + "/invoice",
            [id, .. BodyParameters<PurchaseInvoiceCreateRequest>(sourceBacked: false)], Record(invoiceSummaryColumns), null, null);
        yield return Read(PurchasingModule, "satinalma.malKabul.ozelAlanTanimlari", "Mal kabul özel alan tanımları", receipts + "/custom-fields", [],
            List(Columns<PurchaseReceiptCustomFieldDefinitionView>(), null));

        // ---- Mal kabul faturası girişi ----
        // The endpoint's page and pageSize have no defaults, so they are required here.
        yield return Read(PurchasingModule, "satinalma.faturaGirisi.malKabulleri", "Faturalanacak mal kabuller", invoices + "/entry/receipts",
            [Query("q", "text"), new ErpOperationParameter("page", "query", "int", true), new ErpOperationParameter("pageSize", "query", "int", true)],
            Paged(Columns<PurchaseInvoiceEntryReceiptView>()));
        // The invoice the receipt would produce, computed by the same code as satinalma.malKabul.faturala without writing.
        ErpOperationParameter[] previewParameters = [id, Query("invoiceDate", "date"), Query("accountingProfileCode", "text")];
        yield return Read(PurchasingModule, "satinalma.faturaGirisi.onizleme", "Mal kabul faturası önizlemesi", preview, previewParameters,
            Record(Columns<PurchaseInvoicePreview>()));
        yield return Read(PurchasingModule, "satinalma.faturaGirisi.onizlemeSatirlari", "Mal kabul faturası önizleme satırları", preview,
            previewParameters, List(Columns<PurchaseInvoicePreviewLine>(), "lines"));
        yield return Read(PurchasingModule, "satinalma.faturaGirisi.mevzuatProfilleri", "Mevzuat profilleri", "/api/finance/general-ledger/rule-profiles", [],
            List(With(Columns<AccountingRuleProfileView>().Where(x => x.Code != "parametersJson").ToArray(),
                "hasTaxRules:bool", "isDefaultForDocuments:bool"), null));

        // ---- Satınalma faturaları ----
        yield return Read(PurchasingModule, "satinalma.fatura.listele", "Alış faturalarını listele", invoices,
            [Query("q", "text"), Query("supplierId", "guid"), .. paging], Paged(invoiceSummaryColumns));
        yield return Read(PurchasingModule, "satinalma.fatura.getir", "Alış faturası getir", invoice, [id],
            Record(With(Columns<PurchaseInvoiceView>(), paymentMembers)));
        yield return Read(PurchasingModule, "satinalma.fatura.satirlari", "Alış faturasının satırları", invoice, [id],
            List(Columns<PurchaseInvoiceLineView>(), "lines"));
        yield return Read(PurchasingModule, "satinalma.fatura.odemeleri", "Alış faturasının ödemeleri", invoice, [id],
            List(Columns<SupplierPaymentSummary>(), "payments"));
        yield return Read(PurchasingModule, "satinalma.fatura.iadeleri", "Alış faturasının iadeleri", invoice, [id],
            List(Columns<SupplierReturnSummary>(), "returns"));
        yield return Write(PurchasingModule, "satinalma.fatura.iptal", "Alış faturasını iptal et", "update", "POST", invoice + "/void", [id],
            None, null, null);
        // Resolves to erp.supplier-payments.create (nested write). requestId makes a retry return the existing payment.
        yield return Write(PurchasingModule, "satinalma.fatura.odemeEkle", "Alış faturasına ödeme ekle", "insert", "POST", invoice + "/payments",
            [id, .. BodyParameters<SupplierPaymentWriteRequest>(sourceBacked: false)], Record(Columns<SupplierPaymentSummary>()), null, null);
        // The payment id: the server route is /api/purchasing/payments/{id}/void (erp.supplier-payments.execute).
        yield return Write(PurchasingModule, "satinalma.fatura.odemeIptal", "Tedarikçi ödemesini iptal et", "update", "POST",
            "/api/purchasing/payments/{id}/void", [id], None, null, null);
        // "type" is the cari type in the shared labels, so the account type column is declared with its own label.
        yield return Read(PurchasingModule, "satinalma.fatura.odemeHesaplari", "Ödeme hesapları (kasa ve banka)", "/api/finance/accounts", [],
            List(Columns<FinancialAccountSummary>().Select(x => x.Code == "type" ? x with { Label = "Hesap türü" } : x).ToArray(), null));

        // ---- Satınalma iadeleri ----
        yield return Read(PurchasingModule, "satinalma.iade.listele", "Alış iadelerini listele", returns, [Query("q", "text"), .. paging],
            Paged(Columns<SupplierReturnListItem>()));
        yield return Read(PurchasingModule, "satinalma.iade.getir", "Alış iadesi getir", returns + "/{id}", [id],
            Record(Columns<SupplierReturnDetail>()));
        yield return Read(PurchasingModule, "satinalma.iade.satirlari", "Alış iadesinin satırları", returns + "/{id}", [id],
            List(Columns<SupplierReturnLineView>(), "lines"));
        yield return Write(PurchasingModule, "satinalma.iade.iptal", "Alış iadesini iptal et", "update", "POST", returns + "/{id}/void", [id],
            None, null, null);

        foreach (var operation in BuildPurchasingLineDocuments()) yield return operation;
    }

    /// <summary>
    /// Satınalma Faz 2: line document writes (request, quote, order, receipt, delivery note, return, standalone invoice draft)
    /// and the reads that prefill their line grids with the remaining quantities. Lines are one-level <c>list</c> parameters
    /// whose item fields are the write record's scalars; nested arrays (receipt lot/serial tracking) are not offered. Writes
    /// whose body has a requestId (receipt, return, draft) are retry-safe with the page-made key; the others rely on the
    /// server's duplicate code / state checks (409).
    /// </summary>
    private static IEnumerable<ErpOperation> BuildPurchasingLineDocuments()
    {
        const string requests = "/api/purchasing/requests";
        const string request = requests + "/{id}";
        const string orders = "/api/purchasing/orders";
        const string order = orders + "/{id}";
        const string deliveryNotes = "/api/purchasing/delivery-notes";
        const string orderNotes = deliveryNotes + "/orders/{orderId}";
        const string invoice = "/api/purchasing/invoices/{id}";
        const string drafts = "/api/purchasing/standalone-invoices";
        const string draft = drafts + "/{id}";
        var id = Route("id");
        var orderId = Route("orderId");
        var customFields = MapParameter("customFields");
        var meta = new[] { "page", "pageSize", "totalCount" };
        ErpOperationParameter[] requiredPaging = [new("page", "query", "int", true), new("pageSize", "query", "int", true)];
        static IReadOnlyList<ErpOperationColumn> With(IReadOnlyList<ErpOperationColumn> columns, params string[] members) =>
            columns.Concat(members.Select(x => x.Split(':')).Select(x => new ErpOperationColumn(x[0], Label(x[0]), x[1]))).ToArray();
        // A lines parameter with only the named item fields of T (in T's order); the others are never labelled or offered.
        static ErpOperationParameter Lines<T>(params string[] only) =>
            new("lines", "body", "list", false)
            {
                Items = ScalarMembers<T>(includeMaps: true).Where(x => only.Length == 0 || only.Contains(x.Name, StringComparer.Ordinal))
                    .Select(x => new ErpOperationParameterItem(x.Name, Label(x.Name), x.Type, x.Required)).ToArray()
            };

        // ---- Satınalma talebi oluştur ----
        // A blank code is numbered by the server, so the code is optional; there is no request key, so a double submit of a
        // blank-code request writes two requests (the page's busy lock is the only guard).
        yield return Write(PurchasingModule, "satinalma.talep.olustur", "Satınalma talebi oluştur", "insert", "POST", requests,
            [.. BodyParameters<PurchaseRequestWriteRequest>(sourceBacked: false).Select(x => x.Name == "code" ? x with { Required = false } : x),
                Lines<PurchaseRequestLineWriteRequest>(), customFields],
            Record(With(Columns<PurchaseRequestSummary>(), "neededByDays:int")), null, null);
        // Both handlers accept TenantAdmin only, the request must be Approved and every request line needs exactly one price
        // (no remaining quantity: fill from satinalma.talep.kalemleri, never skip rows). A quote code is unique per supplier.
        yield return Write(PurchasingModule, "satinalma.talep.teklifKaydet", "Satınalma talebine tedarikçi teklifi kaydet", "insert", "POST",
            request + "/supplier-quotes", [id, .. BodyParameters<PurchaseSupplierQuoteWriteRequest>(sourceBacked: false),
                Lines<PurchaseSupplierQuoteLineWriteRequest>(), customFields],
            Record(Columns<PurchaseSupplierQuoteView>()), null, null, requiresTenantAdmin: true);
        // With supplierQuoteId the prices must equal that quote's lines (409); a second call finds the request Ordered (409).
        yield return Write(PurchasingModule, "satinalma.talep.siparisOlustur", "Satınalma talebinden sipariş oluştur", "insert", "POST",
            request + "/order", [id, .. BodyParameters<PurchaseRequestOrderWriteRequest>(sourceBacked: false),
                Lines<PurchaseRequestOrderLineRequest>(), customFields],
            Record(Columns<PurchaseOrderSummary>()), null, null, requiresTenantAdmin: true);

        // ---- Satınalma siparişi oluştur ----
        // The line record is the sales quote line; only the fields the legacy order form sends are offered. The currency must
        // be the supplier's; the order code is unique (409).
        yield return Write(PurchasingModule, "satinalma.siparis.olustur", "Satınalma siparişi oluştur", "insert", "POST", orders,
            [.. BodyParameters<PurchaseOrderWriteRequest>(sourceBacked: false),
                Lines<SalesQuoteLineWriteRequest>("stockItemId", "quantity", "unitPrice", "discountPercent", "vatPercent", "unitCode"), customFields],
            Record(Columns<PurchaseOrderSummary>()), null, null);

        // ---- Mal kabul (siparişten) ----
        // Resolves to erp.purchase-orders.create (nested route). requestId is page-made: a retry returns the existing receipt.
        yield return Write(PurchasingModule, "satinalma.malKabul.olustur", "Siparişten mal kabul oluştur", "insert", "POST", order + "/receipts",
            [id, .. BodyParameters<PurchaseReceiptWriteRequest>(sourceBacked: false), Lines<PurchaseReceiptLineWriteRequest>(), customFields],
            Record(Columns<PurchaseReceiptSummary>()), null, null);
        // The receipt grid's fill source: the order lines with what is still to receive (posted receipts), the line number under
        // the receipt line's field name and the stock card's tracking mode (lot/serial lines stay on the legacy screen).
        yield return Read(PurchasingModule, "satinalma.malKabul.siparisSatirlari", "Mal kabul için sipariş satırları (kalan miktar)", order, [id],
            List(With(Columns<PurchaseOrderLineView>(), "orderLineNumber:int", "trackingMode:text"), "lines"));

        // ---- Tedarikçi irsaliyesi ----
        // The note number is unique per order (409); quantities are in the order line's base unit.
        yield return Write(PurchasingModule, "satinalma.irsaliye.olustur", "Siparişe tedarikçi irsaliyesi kaydet", "insert", "POST", orderNotes,
            [orderId, .. BodyParameters<PurchaseDeliveryNoteWriteRequest>(sourceBacked: false), Lines<PurchaseDeliveryNoteWriteLine>()],
            Record(Columns<PurchaseDeliveryNoteView>()), null, null);
        yield return Read(PurchasingModule, "satinalma.irsaliye.siparisIrsaliyeleri", "Siparişin tedarikçi irsaliyeleri", orderNotes, [orderId],
            List(Columns<PurchaseDeliveryNoteView>(), null));
        // Remaining = ordered minus every recorded note of the order (the delivery note rule, not the receipt one).
        yield return Read(PurchasingModule, "satinalma.irsaliye.siparisSatirlari", "İrsaliye için sipariş satırları (kalan miktar)", orderNotes + "/lines",
            [orderId], List(Columns<PurchaseDeliveryNoteOrderLineView>(), null));
        // link / unlink resolve to erp.purchase-delivery-notes.update; both answer 204.
        yield return Write(PurchasingModule, "satinalma.irsaliye.malKabulBagla", "Tedarikçi irsaliyesini mal kabule bağla", "update", "POST",
            deliveryNotes + "/{id}/link-receipt", [id, .. BodyParameters<PurchaseDeliveryNoteLinkReceiptRequest>(sourceBacked: false)], None, null, null);
        yield return Write(PurchasingModule, "satinalma.irsaliye.malKabulBaglantisiKaldir", "Tedarikçi irsaliyesinin mal kabul bağlantısını kaldır",
            "update", "POST", deliveryNotes + "/{id}/unlink-receipt", [id], None, null, null);

        // ---- Alış iadesi ----
        // Resolves to erp.supplier-returns.create (nested write). requestId: the same content returns the existing return,
        // different content is a 409.
        yield return Write(PurchasingModule, "satinalma.iade.olustur", "Alış faturasından iade oluştur", "insert", "POST", invoice + "/returns",
            [id, .. BodyParameters<SupplierReturnWriteRequest>(sourceBacked: false), Lines<SupplierReturnLineWriteRequest>()],
            Record(Columns<SupplierReturnSummary>()), null, null);
        // Returnable = invoiced minus posted returns, per invoice line (the return handler's rule).
        yield return Read(PurchasingModule, "satinalma.fatura.iadeEdilebilirSatirlar", "Alış faturasının iade edilebilir satırları",
            invoice + "/returnable-lines", [id], List(Columns<PurchaseInvoiceReturnableLineView>(), null));

        // ---- Bağımsız alış faturası taslakları ----
        // page and pageSize have no defaults on these endpoints, so they are required here.
        var draftColumns = Columns<StandaloneSupplierInvoiceDraftDetail>();
        yield return Read(PurchasingModule, "satinalma.faturaTaslagi.listele", "Bağımsız alış faturası taslaklarını listele", drafts,
            [Query("q", "text"), .. requiredPaging], List(Columns<StandaloneSupplierInvoiceDraftSummary>(), "items") with { MetaPaths = meta });
        yield return Read(PurchasingModule, "satinalma.faturaTaslagi.getir", "Bağımsız alış faturası taslağı getir", draft, [id], Record(draftColumns));
        yield return Read(PurchasingModule, "satinalma.faturaTaslagi.satirlari", "Bağımsız alış faturası taslağının satırları", draft, [id],
            List(Columns<StandaloneSupplierInvoiceDraftLineView>(), "lines"));
        // requestId is page-made: the same content returns the existing draft, different content is a 409.
        yield return Write(PurchasingModule, "satinalma.faturaTaslagi.olustur", "Bağımsız alış faturası taslağı oluştur", "insert", "POST", drafts,
            [.. BodyParameters<StandaloneSupplierInvoiceDraftCreateRequest>(sourceBacked: false), Lines<StandaloneSupplierInvoiceDraftLineCreateRequest>()],
            Record(draftColumns), null, null);
        // Not source-backed: the read returns rowVersion, the body needs expectedRowVersion, so the page binds it from
        // satinalma.faturaTaslagi.getir. The PUT replaces every line.
        yield return Write(PurchasingModule, "satinalma.faturaTaslagi.guncelle", "Bağımsız alış faturası taslağını güncelle", "update", "PUT", draft,
            [id, .. BodyParameters<StandaloneSupplierInvoiceDraftUpdateRequest>(sourceBacked: false), Lines<StandaloneSupplierInvoiceDraftLineCreateRequest>()],
            Record(draftColumns), null, null);
        // Resolves to erp.purchase-invoices.execute; the handler also filters the draft by the create rules. A posted draft
        // answers with its existing posting.
        yield return Write(PurchasingModule, "satinalma.faturaTaslagi.muhasebelestir", "Bağımsız alış faturası taslağını muhasebeleştir", "update", "POST",
            draft + "/post", [id], Record(Columns<StandaloneSupplierInvoiceDraftPostingResult>()), null, null);
        yield return Read(PurchasingModule, "satinalma.faturaTaslagi.tedarikciler", "Fatura taslağı tedarikçi seçenekleri", drafts + "/suppliers",
            [Query("q", "text"), .. requiredPaging], List(Columns<StandaloneSupplierInvoiceDraftSupplierOption>(), "items") with { MetaPaths = meta });
        // Active expense accounts only, filtered by the server (optional query filters of the chart of accounts list).
        yield return Read(PurchasingModule, "satinalma.faturaTaslagi.giderHesaplari", "Gider hesapları", "/api/finance/general-ledger/accounts", [],
            List(With([], "id:guid", "code:text", "name:text", "isActive:bool", "statementSection:text", "currencyCode:text"), null))
            with { FixedQuery = new Dictionary<string, object?>(StringComparer.Ordinal) { ["statementSection"] = "Expense", ["activeOnly"] = true } };
        // Uninvoiced lines of the supplier's posted standalone receipts up to the invoice date (quantity = still to invoice).
        yield return Read(PurchasingModule, "satinalma.faturaTaslagi.malKabulSatirlari", "Fatura taslağı için siparişsiz mal kabul satırları",
            drafts + "/receipts",
            [new ErpOperationParameter("supplierId", "query", "guid", true), new ErpOperationParameter("invoiceDate", "query", "date", true),
                Query("draftId", "guid")],
            List(Columns<StandaloneSupplierInvoiceDraftReceiptOption>(), null));
    }

    /// <summary>Labels of purchasing-only codes; null for an unknown code. The main <c>Labels</c> dictionary wins on shared codes.</summary>
    private static string? PurchasingLabel(string code) => code switch
    {
        // Talep
        "requestDate" => "Talep tarihi", "neededByDate" => "İhtiyaç tarihi", "neededByDays" => "İhtiyaca kalan gün",
        "requestedByUserId" => "Talep eden kimliği", "requestedByName" => "Talep eden", "reviewedByUserId" => "Karar veren kimliği",
        "reviewedByName" => "Karar veren", "reviewNote" => "Karar notu", "reviewedAt" => "Karar zamanı", "quoteCount" => "Teklif sayısı",
        "lineNumber" => "Satır no", "requestLineNumber" => "Talep satır no",
        // Teklif
        "purchaseRequestId" => "Satınalma talebi kimliği", "requestCode" => "Satınalma talebi", "requestStatus" => "Talep durumu",
        "supplierId" => "Tedarikçi kimliği", "supplierName" => "Tedarikçi", "quoteDate" => "Teklif tarihi", "validUntil" => "Geçerlilik tarihi",
        "comparableGrandTotal" => "Karşılaştırma tutarı (ana para)", "appliedExchangeRate" => "Uygulanan kur", "appliedRateDate" => "Kur tarihi",
        // Belge tutarları ve satırlar
        "stockCode" => "Stok kodu", "stockName" => "Stok adı", "unitPrice" => "Birim fiyat", "discountPercent" => "İskonto %",
        "vatPercent" => "KDV %", "lineSubtotal" => "Satır tutarı", "discountAmount" => "İskonto tutarı", "taxAmount" => "Vergi tutarı",
        "lineTotal" => "Satır toplamı", "subtotal" => "Ara toplam", "discountTotal" => "İskonto toplamı", "taxTotal" => "Vergi toplamı",
        "grandTotal" => "Genel toplam", "notes" => "Notlar", "taxBreakdownJson" => "Vergi dökümü",
        // Sipariş
        "orderDate" => "Sipariş tarihi", "expectedReceiptDate" => "Beklenen teslim tarihi", "targetWarehouseId" => "Hedef depo kimliği",
        "receivedQuantity" => "Teslim alınan", "remainingQuantity" => "Kalan", "orderedQuantity" => "Sipariş miktarı",
        "receivedPercent" => "Teslim alınan %", "isOverdue" => "Gecikmiş", "delayDays" => "Gecikme (gün)",
        "postedReceiptCount" => "Mal kabul sayısı", "invoicedReceiptCount" => "Faturalanan mal kabul",
        // İrsaliye ve mal kabul
        "documentNumber" => "İrsaliye no", "documentDate" => "İrsaliye tarihi", "purchaseReceiptCode" => "Mal kabul",
        "orderLineNumber" => "Sipariş satır no", "receiptCode" => "Mal kabul", "purchaseOrderTotal" => "Sipariş toplamı",
        // Fatura
        "invoiceDate" => "Fatura tarihi", "dueDate" => "Vade tarihi", "paidAmount" => "Ödenen", "outstandingAmount" => "Kalan",
        "displayOutstanding" => "Kalan (iptal hariç)", "paymentState" => "Ödeme durumu", "overdueDays" => "Gecikme (gün)",
        "providerInvoiceUuid" => "e-Fatura ETTN", "providerScenario" => "e-Fatura senaryosu", "providerInvoiceTypeCode" => "e-Fatura tipi",
        "providerSenderAlias" => "Gönderici etiketi", "accountingProfileCode" => "Mevzuat profili", "purchaseReceiptLineId" => "Mal kabul satırı kimliği",
        "purchaseInvoiceId" => "Alış faturası kimliği", "invoiceCode" => "Alış faturası", "invoiceStatus" => "Fatura durumu",
        "paymentDate" => "Ödeme tarihi", "paymentMethod" => "Ödeme yöntemi", "reference" => "Referans",
        "financialAccountId" => "Finans hesabı kimliği", "financialAccountName" => "Finans hesabı", "transactionCount" => "Hareket sayısı",
        // Mevzuat profili
        "profileCode" => "Profil kodu", "jurisdictionCode" => "Ülke / bölge", "reportingStandard" => "Raporlama standardı",
        "fiscalYearStartMonth" => "Mali yıl başlangıç ayı", "effectiveFrom" => "Geçerlilik başlangıcı", "effectiveTo" => "Geçerlilik sonu",
        "officialSourceUrl" => "Resmî kaynak", "parametersJson" => "Profil parametreleri", "hasTaxRules" => "Vergi kuralı var", "isDefaultForDocuments" => "Belgelerde varsayılan",
        // İade
        "returnDate" => "İade tarihi", "purchaseInvoiceLineId" => "Fatura satırı kimliği",
        // Faz 2: satır kaynakları (kalan miktarlar) ve bağımsız fatura taslakları
        "notedQuantity" => "İrsaliyelenen", "invoicedQuantity" => "Faturalanan miktar", "returnedQuantity" => "İade edilen",
        "invoiceNumber" => "Tedarikçi fatura no", "total" => "Toplam", "expenseAccountId" => "Gider hesabı",
        "vatRate" => "KDV oranı (belge)", "standalonePurchaseReceiptLineId" => "Mal kabul satırı", "lineId" => "Satır kimliği",
        "receiptId" => "Mal kabul kimliği", "draftId" => "Taslak kimliği", "journalEntryId" => "Yevmiye fişi kimliği",
        "ledgerEntryId" => "Cari hareket kimliği", "statementSection" => "Finansal tablo sınıfı",
        _ => null
    };
}
