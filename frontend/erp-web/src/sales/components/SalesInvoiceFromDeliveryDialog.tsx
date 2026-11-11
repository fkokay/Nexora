import { Plus, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api, localDateString } from "../../erpApi";
import type {
  SalesCustomer,
  SalesDeliverySummary,
  SalesInvoiceCustomFieldDefinition,
  SalesInvoiceSummary,
  SalesOrderDetail,
  SalesOrderSummary,
  StockItem,
  Warehouse,
} from "../../erp-types";
import SearchableRecordPicker from "../../SearchableRecordPicker";

type Props = {
  deliveries: SalesDeliverySummary[];
  orders: SalesOrderSummary[];
  customers: SalesCustomer[];
  stockItems: StockItem[];
  warehouses: Warehouse[];
  token: string;
  initialMode?: "delivery" | "order" | "standalone";
  initialCustomerId?: string;
  fullPage?: boolean;
  total: number;
  page: number;
  search: string;
  loading: boolean;
  busyDeliveryId: string | null;
  error: string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onCreateInvoice: (delivery: SalesDeliverySummary, eDocument?: Record<string, string | null>, accountingProfileCode?: string, invoiceType?: "Wholesale" | "Retail") => void;
  onInvoiceCreated: (id: string) => Promise<void>;
};

type AccountingRuleProfile = {
  profileCode: string; name: string; jurisdictionCode: string; reportingStandard: string;
  effectiveFrom: string; effectiveTo: string | null; parametersJson: string; isActive: boolean;
};

export default function SalesInvoiceFromDeliveryDialog({
  deliveries,
  orders,
  customers,
  stockItems,
  warehouses,
  token,
  initialMode = "delivery",
  initialCustomerId = "",
  fullPage = false,
  total,
  page,
  search,
  loading,
  busyDeliveryId,
  error,
  onClose,
  onSearchChange,
  onPageChange,
  onCreateInvoice,
  onInvoiceCreated,
}: Props) {
  const [mode, setMode] = useState<"delivery" | "order" | "standalone">(
    fullPage ? "standalone" : initialMode,
  );
  const [invoiceType, setInvoiceType] = useState<"Wholesale" | "Retail">("Wholesale");
  const [orderId, setOrderId] = useState(""),
    [order, setOrder] = useState<SalesOrderDetail | null>(null),
    [orderLoading, setOrderLoading] = useState(false);
  const [warehouseId, setWarehouseId] = useState(""),
    [deliveryDate, setDeliveryDate] = useState(localDateString()),
    [orderBusy, setOrderBusy] = useState(false),
    [orderError, setOrderError] = useState("");
  const [standaloneCustomerId, setStandaloneCustomerId] = useState(initialCustomerId),
    [invoiceDate, setInvoiceDate] = useState(localDateString()),
    [standaloneBusy, setStandaloneBusy] = useState(false),
    [standaloneError, setStandaloneError] = useState("");
  useEffect(() => {
    if (initialCustomerId) setStandaloneCustomerId(initialCustomerId);
  }, [initialCustomerId]);
  const [eDocument, setEDocument] = useState({ scenario: "", typeCode: "SATIS", recipientAlias: "", purchaseUrl: "", paymentTaxId: "", paymentTitle: "", paymentAlias: "", paymentAgentName: "", paymentType: "", paymentDate: "", paymentDueDate: "", paymentMeans: "", paymentInstructionNote: "", intermediaryCountry: "", intermediaryCountryCode: "", intermediaryCity: "", intermediaryDistrict: "", carrierTaxId: "", carrierName: "", carrierSurname: "", sentAt: "" });
  function renderEDocumentFields() {
    const fields: [keyof typeof eDocument, string, string?][] = [
      ["scenario", "Belge senaryosu"], ["typeCode", "Belge tür kodu"],
    ];
    const optionalFields: [keyof typeof eDocument, string, string?][] = [];
    if (["TEMELFATURA", "TICARIFATURA", "KAMU"].includes(eDocument.scenario))
      optionalFields.push(["recipientAlias", "Alıcı e-Fatura etiketi"]);
    if (eDocument.scenario === "EARSIVFATURA") optionalFields.push(["purchaseUrl", "Satın alma URL’si"]);
    if (eDocument.scenario === "EARSIVFATURA") optionalFields.push(
      ["paymentTaxId", "Aracı firma VKN/TCKN"], ["paymentTitle", "Aracı firma ünvanı"],
      ["paymentAlias", "Aracı firma etiketi"], ["paymentAgentName", "Ödeme aracısı adı"],
      ["paymentType", "Ödeme türü"], ["paymentMeans", "Ödeme yöntemi"], ["paymentInstructionNote", "Ödeme notu"],
      ["intermediaryCountry", "Aracı firma ülkesi"], ["intermediaryCountryCode", "Aracı firma ülke kodu"],
      ["intermediaryCity", "Aracı firma şehri"], ["intermediaryDistrict", "Aracı firma ilçesi"],
    );
    if (eDocument.scenario) optionalFields.push(
      ["carrierTaxId", "Taşıyıcı VKN/TCKN"], ["carrierName", "Taşıyıcı adı/ünvanı"], ["carrierSurname", "Taşıyıcı soyadı"],
    );
    const renderField = ([key, label, placeholder]: [keyof typeof eDocument, string, string?]) => (
      <label key={key}>{label}{key === "scenario" ? <select value={eDocument[key]} onChange={(event) => setEDocument((value) => ({ ...value, [key]: event.target.value }))}><option value="">Senaryo seçin</option>{[["TEMELFATURA", "Temel e-Fatura"], ["TICARIFATURA", "Ticari e-Fatura"], ["EARSIVFATURA", "e-Arşiv Fatura"], ["IHRACAT", "İhracat"], ["YOLCUBERABERFATURA", "Yolcu beraber"], ["KAMU", "Kamu"], ["HKS", "Hal Kayıt Sistemi"], ["ENERJI", "Enerji"], ["ILAC_TIBBICIHAZ", "İlaç / tıbbi cihaz"]].map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select> : key === "typeCode" ? <select value={eDocument[key]} onChange={(event) => setEDocument((value) => ({ ...value, [key]: event.target.value }))}>{[["SATIS", "Satış"], ["IADE", "İade"], ["TEVKIFAT", "Tevkifat"], ["ISTISNA", "İstisna"], ["OZELMATRAH", "Özel matrah"], ["IHRACKAYITLI", "İhraç kayıtlı"], ["TEVKIFATIADE", "Tevkifat iade"], ["HKSSATIS", "Hal satış"], ["HKSKOMISYONCU", "Hal komisyoncu"]].map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select> : <input value={eDocument[key]} placeholder={placeholder} onChange={(event) => setEDocument((value) => ({ ...value, [key]: event.target.value }))} />}</label>
    );
    return (
      <section className="panel sales-invoice-edocument">
        <div className="panel-heading"><b>E-belge ve e-ticaret bilgileri</b><small>{eDocument.scenario ? "Seçilen senaryonun alanları" : "Devam etmek için belge senaryosunu seçin"}</small></div>
        <div className="form-two">{fields.map(renderField)}</div>
        {optionalFields.length > 0 && (
          <details className="sales-invoice-edocument-extra">
            <summary>Ek bilgiler <span>{optionalFields.length + (eDocument.scenario ? 1 : 0) + (eDocument.scenario === "EARSIVFATURA" ? 2 : 0)}</span></summary>
            <div className="form-two">
              {optionalFields.map(renderField)}
              {eDocument.scenario === "EARSIVFATURA" && <>
                <label>Ödeme tarihi<input type="datetime-local" value={eDocument.paymentDate ? eDocument.paymentDate.slice(0, 16) : ""} onChange={(event) => setEDocument((value) => ({ ...value, paymentDate: event.target.value ? new Date(event.target.value).toISOString() : "" }))} /></label>
                <label>Son ödeme tarihi<input type="datetime-local" value={eDocument.paymentDueDate ? eDocument.paymentDueDate.slice(0, 16) : ""} onChange={(event) => setEDocument((value) => ({ ...value, paymentDueDate: event.target.value ? new Date(event.target.value).toISOString() : "" }))} /></label>
              </>}
              {eDocument.scenario && <label>Sevk tarihi<input type="date" value={eDocument.sentAt} onChange={(event) => setEDocument((value) => ({ ...value, sentAt: event.target.value }))} /></label>}
            </div>
          </details>
        )}
      </section>
    );
  }
  const [standaloneLines, setStandaloneLines] = useState([
    {
      stockItemId: "",
      warehouseId: warehouses.find((warehouse) => warehouse.isActive)?.id || "",
      quantity: "1",
      unitPrice: "0",
      discountPercent: "0",
      vatPercent: "20",
    },
  ]);
  const [invoiceCustomFields, setInvoiceCustomFields] = useState<
      SalesInvoiceCustomFieldDefinition[]
    >([]),
    [invoiceCustomFieldValues, setInvoiceCustomFieldValues] = useState<
      Record<string, string>
    >({});
  const [accountingProfiles, setAccountingProfiles] = useState<AccountingRuleProfile[]>([]);
  const [accountingProfileCode, setAccountingProfileCode] = useState("");
  const pageCount = Math.max(1, Math.ceil(total / 25));
  const selectedOrder = orders.find((item) => item.id === orderId);
  useEffect(() => {
    let active = true;
    void api<SalesInvoiceCustomFieldDefinition[]>(
      "/api/sales/invoices/custom-fields",
      token,
    )
      .then((fields) => {
        if (active) setInvoiceCustomFields(fields);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    let active = true;
    void api<AccountingRuleProfile[]>("/api/finance/general-ledger/rule-profiles", token)
      .then((items) => {
        if (!active) return;
        const configured = items.filter((item) => {
          if (!item.isActive) return false;
          try { const rules = JSON.parse(item.parametersJson)?.taxRules; return Array.isArray(rules) && rules.length > 0; }
          catch { return false; }
        });
        setAccountingProfiles(configured);
        const defaultProfile = configured.find((item) => {
          try { return JSON.parse(item.parametersJson)?.defaultForDocuments === true; }
          catch { return false; }
        });
        setAccountingProfileCode(defaultProfile?.profileCode || configured.find((item) => item.profileCode === "TR-LOCAL")?.profileCode || configured[0]?.profileCode || "");
      })
      .catch(() => { if (active) setAccountingProfiles([]); });
    return () => { active = false; };
  }, [token]);
  function renderAccountingProfileSelect() {
    if (!accountingProfiles.length) return null;
    return <section className="panel"><div className="panel-heading"><b>Vergi mevzuatı profili</b><small>Fatura vergileri seçilen ülke profiline göre hesaplanır.</small></div><label>Hesap profili<select value={accountingProfileCode} onChange={(event) => setAccountingProfileCode(event.target.value)} required><option value="">Profil seçin</option>{accountingProfiles.map((item) => <option key={item.profileCode} value={item.profileCode}>{item.name} · {item.jurisdictionCode} · {item.reportingStandard}</option>)}</select></label></section>;
  }
  function renderInvoiceCustomFields() {
    return (
      invoiceCustomFields.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <b>Fatura özel alanları</b>
              <small>
                Fatura kaydı için tenant tarafından tanımlanan alanlar
              </small>
            </div>
          </div>
          <div className="form-two">
            {invoiceCustomFields.map((field) => (
              <label key={field.id}>
                {field.label}
                {field.isRequired ? " *" : ""}
                <small>
                  {field.code} · {field.dataType}
                </small>
                {field.dataType === "Boolean" ? (
                  <select
                    required={field.isRequired}
                    value={invoiceCustomFieldValues[field.code] || ""}
                    onChange={(event) =>
                      setInvoiceCustomFieldValues((values) => ({
                        ...values,
                        [field.code]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Seçin</option>
                    <option value="true">Evet</option>
                    <option value="false">Hayır</option>
                  </select>
                ) : (
                  <input
                    type={
                      field.dataType === "Decimal"
                        ? "number"
                        : field.dataType === "Date"
                          ? "date"
                          : "text"
                    }
                    step={field.dataType === "Decimal" ? "any" : undefined}
                    maxLength={
                      field.dataType === "Text" ? field.maxLength : undefined
                    }
                    required={field.isRequired}
                    value={invoiceCustomFieldValues[field.code] || ""}
                    onChange={(event) =>
                      setInvoiceCustomFieldValues((values) => ({
                        ...values,
                        [field.code]: event.target.value,
                      }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      )
    );
  }
  const customFieldsPayload = Object.fromEntries(
    invoiceCustomFields.map((field) => [
      field.code,
      invoiceCustomFieldValues[field.code] || "",
    ]),
  );
  const eDocumentPayload = { ...eDocument, sentAt: eDocument.sentAt || null,
    paymentDate: eDocument.paymentDate ? new Date(eDocument.paymentDate).toISOString() : null,
    paymentDueDate: eDocument.paymentDueDate ? new Date(eDocument.paymentDueDate).toISOString() : null };
  const reservedWarehouseIds = useMemo(
    () =>
      Array.from(
        new Set(
          order?.lines
            .filter(
              (line) =>
                line.remainingQuantity > 0 &&
                line.reservationId &&
                line.reservationWarehouseId,
            )
            .map((line) => line.reservationWarehouseId!) ?? [],
        ),
      ),
    [order],
  );
  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      return;
    }
    let active = true;
    setOrderLoading(true);
    setOrderError("");
    void api<SalesOrderDetail>(`/api/sales/orders/${orderId}`, token)
      .then((result) => {
        if (active) {
          setOrder(result);
          const reserved = Array.from(
            new Set(
              result.lines
                .filter(
                  (line) =>
                    line.remainingQuantity > 0 &&
                    line.reservationId &&
                    line.reservationWarehouseId,
                )
                .map((line) => line.reservationWarehouseId!),
            ),
          );
          setWarehouseId(
            reserved.length === 1 ? reserved[0] : warehouses[0]?.id || "",
          );
        }
      })
      .catch((error) => {
        if (active) {
          setOrder(null);
          setOrderError((error as Error).message);
        }
      })
      .finally(() => {
        if (active) setOrderLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderId, token, warehouses]);
  async function createInvoiceFromOrder() {
    if (!order || !warehouseId) return;
    setOrderBusy(true);
    setOrderError("");
    try {
      if (reservedWarehouseIds.length > 1)
        throw new Error(
          "Sipariş satırları farklı depolarda rezerve edilmiş. Önce rezervasyonları tek depoda birleştirin.",
        );
      const lines = order.lines
        .filter((line) => line.remainingQuantity > 0)
        .map((line) => ({
          orderLineNumber: line.lineNumber,
          quantity: line.remainingQuantity,
          unitCode: line.unitCode,
        }));
      if (!lines.length)
        throw new Error("Siparişin faturalanabilecek kalan miktarı yok.");
      const delivery = await api<SalesDeliverySummary>(
        `/api/sales/orders/${order.id}/deliveries`,
        token,
        {
          method: "POST",
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            warehouseId,
            deliveryDate,
            lines,
          }),
        },
      );
      try {
        const invoice = await api<SalesInvoiceSummary>(
          `/api/sales/deliveries/${delivery.id}/invoice`,
          token,
          {
            method: "POST",
            body: JSON.stringify({ customFields: customFieldsPayload, eDocument: eDocumentPayload, accountingProfileCode: accountingProfileCode || null, invoiceType }),
          },
        );
        onClose();
        await onInvoiceCreated(invoice.id);
      } catch (error) {
        throw new Error(
          `İrsaliye ${delivery.code} oluşturuldu ancak fatura kesilemedi: ${(error as Error).message} İrsaliyeler ekranından faturalaştırmayı tekrar deneyin.`,
        );
      }
    } catch (error) {
      setOrderError((error as Error).message);
    } finally {
      setOrderBusy(false);
    }
  }
  async function createStandaloneInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!standaloneCustomerId || standaloneLines.some((line) => !line.stockItemId || !line.warehouseId)) {
      setStandaloneError("Aktif müşteri, stok kartı ve her satır için depo seçin.");
      return;
    }
    setStandaloneBusy(true);
    setStandaloneError("");
    try {
      const invoice = await api<SalesInvoiceSummary>(
        "/api/sales/invoices/",
        token,
        {
          method: "POST",
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            customerId: standaloneCustomerId,
            warehouseId: standaloneLines[0].warehouseId,
            invoiceDate,
            accountingProfileCode: accountingProfileCode || null,
            customFields: customFieldsPayload,
            eDocument: eDocumentPayload,
            invoiceType,
            lines: standaloneLines.map((line) => ({
              stockItemId: line.stockItemId,
              quantity: Number(line.quantity),
              unitPrice: Number(line.unitPrice),
              discountPercent: Number(line.discountPercent),
              vatPercent: Number(line.vatPercent),
              isVatIncluded: invoiceType === "Retail",
              warehouseId: line.warehouseId,
            })),
          }),
        },
      );
      onClose();
      await onInvoiceCreated(invoice.id);
    } catch (error) {
      setStandaloneError((error as Error).message);
    } finally {
      setStandaloneBusy(false);
    }
  }
  const standaloneLineAmounts = (line: (typeof standaloneLines)[number]) => {
    const vatRate = Number(line.vatPercent || 0) / 100;
    const entered = Number(line.quantity || 0) * Number(line.unitPrice || 0);
    const subtotal = invoiceType === "Retail" && vatRate > 0 ? entered / (1 + vatRate) : entered;
    const discount = subtotal * Number(line.discountPercent || 0) / 100;
    const tax = (subtotal - discount) * vatRate;
    return { subtotal, discount, tax, total: subtotal - discount + tax };
  };
  const standaloneTotal = standaloneLines.reduce((sum, line) => sum + standaloneLineAmounts(line).total, 0);
  const standaloneSubtotal = standaloneLines.reduce((sum, line) => sum + standaloneLineAmounts(line).subtotal, 0);
  const standaloneDiscount = standaloneLines.reduce((sum, line) => sum + standaloneLineAmounts(line).discount, 0);
  const standaloneTax = standaloneTotal - (standaloneSubtotal - standaloneDiscount);
  const standaloneVatRows = Array.from(new Set(standaloneLines.map((line) => Number(line.vatPercent || 0))))
    .sort((left, right) => left - right)
    .map((rate) => ({
      rate,
      amount: standaloneLines.reduce((sum, line) => Number(line.vatPercent || 0) === rate
        ? sum + standaloneLineAmounts(line).tax
        : sum, 0),
    }));
  const standaloneTotals = [
    { label: "TOPLAM TUTAR", amount: standaloneSubtotal - standaloneDiscount, strong: false },
    ...standaloneVatRows.map((row) => ({ label: `KDV %${row.rate}`, amount: row.amount, strong: false })),
    { label: "KDV TOPLAMI", amount: standaloneTax, strong: false },
    { label: "GENEL TOPLAM", amount: standaloneTotal, strong: true },
    { label: "KDV TEVKİFAT TUTARI", amount: 0, strong: false },
    { label: "ÖDENECEK TUTAR", amount: standaloneTotal, strong: true },
  ];
  const formatMoneyParts = (amount: number) => {
    const centsTotal = Math.round((Number.isFinite(amount) ? amount : 0) * 100);
    return {
      whole: Math.floor(centsTotal / 100).toLocaleString("tr-TR"),
      fraction: String(Math.abs(centsTotal % 100)).padStart(2, "0"),
    };
  };
  const standaloneCurrencyCode = customers.find(
    (customer) => customer.id === standaloneCustomerId,
  )?.currencyCode || "TRY";

  return (
    <div
      className={fullPage ? "sales-invoice-entry-page" : "modal-backdrop"}
      onMouseDown={(event) => {
        if (!fullPage && event.target === event.currentTarget && !busyDeliveryId) onClose();
      }}
    >
      <section
        className={fullPage ? "sales-invoice-entry-card" : "modal sales-document-dialog sales-quote-detail-modal"}
        role={fullPage ? "region" : "dialog"}
        aria-modal={fullPage ? undefined : "true"}
        aria-labelledby="sales-invoice-create-title"
      >
        <div className="modal-head">
          <div>
            <p className="eyebrow">SATIŞ · FATURALAMA</p>
            {fullPage ? (
              <h1 id="sales-invoice-create-title">
                {mode === "order"
                  ? "Siparişten irsaliye ve fatura"
                  : "Yeni satış faturası"}
              </h1>
            ) : <h2 id="sales-invoice-create-title">
              {mode === "order"
                ? "Siparişten irsaliye ve fatura"
                : "Yeni satış faturası"}
            </h2>}
          </div>
          {fullPage && mode === "standalone" && <button type="submit" form="sales-invoice-standalone-form" className="primary" disabled={standaloneBusy || !standaloneCustomerId || standaloneLines.some((line) => !line.stockItemId || !line.warehouseId)}>İrsaliye ve faturayı oluştur</button>}
          <button
            type="button"
            className="icon-button"
            disabled={!!busyDeliveryId || standaloneBusy || orderBusy}
            aria-label="Pencereyi kapat"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <p className="muted">
          {mode === "order"
            ? "Açık siparişin kalan miktarından stok çıkışlı irsaliye ve fatura oluşturun."
            : mode === "standalone"
              ? "Sipariş seçmeden fatura oluşturun. Seçilen depodan stok çıkışı ve faturaya bağlı irsaliye otomatik kaydedilir."
              : "Kaydedilmiş ve faturalanmamış irsaliyeyi seçerek faturayı oluşturun."}
        </p>
        {!fullPage && <nav
          className="sales-quote-detail-tabs invoice-create-tabs"
          aria-label="Fatura oluşturma yöntemi"
        >
          <button
            type="button"
            className={mode === "delivery" ? "active" : ""}
            onClick={() => setMode("delivery")}
          >
            Mevcut irsaliyeden
          </button>
          <button
            type="button"
            className={mode === "order" ? "active" : ""}
            onClick={() => setMode("order")}
          >
            Siparişten irsaliye oluştur
          </button>
          <button
            type="button"
            className={mode === "standalone" ? "active" : ""}
            onClick={() => setMode("standalone")}
          >
            Siparişsiz fatura + irsaliye
          </button>
        </nav>}
        <div className="form-two sales-invoice-type-field">
          <label>
            Fatura türü
            <select value={invoiceType} onChange={(event) => setInvoiceType(event.target.value as "Wholesale" | "Retail")}>
              <option value="Retail">Perakende satış · KDV dâhil</option>
              <option value="Wholesale">Toptan satış · KDV hariç</option>
            </select>
          </label>
        </div>
        {mode === "delivery" && (
          <>
            {renderEDocumentFields()}
            {renderAccountingProfileSelect()}
            <label className="customer-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="İrsaliye no, sipariş no veya müşteriyle ara"
              />
            </label>
            {error && (
              <div className="alert inline-alert" role="alert">
                {error}
              </div>
            )}
            <div
              className="requests-list"
              style={{
                maxHeight: "min(48vh,420px)",
                overflowY: "auto",
                marginTop: 12,
              }}
            >
              {loading ? (
                <div className="empty-small" role="status">
                  İrsaliyeler yükleniyor…
                </div>
              ) : (
                deliveries.map((item) => (
                  <article className="request-row" key={item.id}>
                    <div className="request-info">
                      <b>
                        {item.code} · {item.orderCode}
                      </b>
                      <small>
                        {item.deliveryDate.split("-").reverse().join(".")} ·{" "}
                        {item.lineCount} satır · {item.warehouseName}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="row-action"
                      disabled={!!busyDeliveryId}
                      onClick={() => onCreateInvoice(item, eDocumentPayload, accountingProfileCode || undefined, invoiceType)}
                    >
                      {busyDeliveryId === item.id
                        ? "Oluşturuluyor…"
                        : "Fatura kes"}
                    </button>
                  </article>
                ))
              )}
              {!loading && deliveries.length === 0 && !error && (
                <div className="empty-small">
                  {search
                    ? "Aramanızla eşleşen faturalanmamış irsaliye yok."
                    : "Faturalanmamış, kaydedilmiş irsaliye bulunmuyor."}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <span>
                {total} faturalanmamış irsaliye · Sayfa {page} / {pageCount}
              </span>
              <div>
                <button
                  type="button"
                  className="secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                >
                  Önceki
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={page >= pageCount || loading}
                  onClick={() => onPageChange(page + 1)}
                >
                  Sonraki
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!!busyDeliveryId}
                  onClick={onClose}
                >
                  Kapat
                </button>
              </div>
            </div>
          </>
        )}
        {mode === "order" && (
          <div className="sales-invoice-from-order">
            <label>
              Açık satış siparişi
              <select
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
              >
                <option value="">Sipariş seçin</option>
                {orders
                  .filter((item) => item.status === "Open")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.customerName} · {item.currencyCode}{" "}
                      {item.grandTotal.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </option>
                  ))}
              </select>
            </label>
            {orderLoading && (
              <div className="empty-small" role="status">
                Sipariş satırları yükleniyor…
              </div>
            )}
            {order && (
              <>
                <div className="form-two">
                  <label>
                    Sevk deposu
                    <select
                      value={warehouseId}
                      onChange={(event) => setWarehouseId(event.target.value)}
                      disabled={reservedWarehouseIds.length === 1}
                    >
                      <option value="">Depo seçin</option>
                      {warehouses
                        .filter(
                          (item) =>
                            !reservedWarehouseIds.length ||
                            reservedWarehouseIds.includes(item.id),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.code} · {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    İrsaliye tarihi
                    <input
                      type="date"
                      value={deliveryDate}
                      onChange={(event) => setDeliveryDate(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <div className="requests-list">
                  {order.lines
                    .filter((line) => line.remainingQuantity > 0)
                    .map((line) => (
                      <article className="request-row" key={line.lineNumber}>
                        <div className="request-info">
                          <b>
                            {line.stockCode} · {line.stockName}
                          </b>
                          <small>
                            Faturalanacak kalan miktar:{" "}
                            {line.remainingQuantity.toLocaleString("tr-TR", {
                              maximumFractionDigits: 4,
                            })}{" "}
                            {line.unitCode}
                          </small>
                        </div>
                      </article>
                    ))}
                  {order.lines.every((line) => line.remainingQuantity <= 0) && (
                    <div className="empty-small">
                      Bu siparişte sevk edilebilir miktar kalmamış.
                    </div>
                  )}
                </div>
                {renderInvoiceCustomFields()}
                {renderEDocumentFields()}
                {renderAccountingProfileSelect()}
                <p className="muted">
                  İşlem, siparişin kalan miktarları için stok çıkışlı bir
                  irsaliye oluşturur ve ardından faturayı keserek cari borcunu
                  kaydeder.
                </p>
              </>
            )}
            {(orderError || error) && (
              <div className="alert inline-alert" role="alert">
                {orderError || error}
              </div>
            )}
            <div className="modal-foot">
              <span>
                {selectedOrder
                  ? `Sipariş ${selectedOrder.code}`
                  : "Sipariş seçilmedi"}
              </span>
              <div>
                <button
                  type="button"
                  className="secondary"
                  disabled={orderBusy}
                  onClick={onClose}
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={
                    !order ||
                    !warehouseId ||
                    orderLoading ||
                    orderBusy ||
                    reservedWarehouseIds.length > 1 ||
                    order.lines.every((line) => line.remainingQuantity <= 0)
                  }
                  onClick={() => void createInvoiceFromOrder()}
                >
                  {orderBusy
                    ? "İrsaliye ve fatura oluşturuluyor…"
                    : "İrsaliye ve faturayı oluştur"}
                </button>
              </div>
            </div>
          </div>
        )}
        {mode === "standalone" && (
          <form
            id="sales-invoice-standalone-form"
            className="sales-invoice-standalone"
            onSubmit={(event) => void createStandaloneInvoice(event)}
          >
            <div className="form-two">
              <label className="invoice-customer-field">
                Müşteri
                <SearchableRecordPicker
                  options={customers
                    .filter(
                      (customer) =>
                        customer.isActive && customer.type !== "Supplier",
                    )
                    .map((customer) => ({
                      id: customer.id,
                      label: `${customer.code} · ${customer.name}`,
                      description: customer.currencyCode,
                    }))}
                  selectedId={standaloneCustomerId}
                  onSelect={(id) => setStandaloneCustomerId(id)}
                  title="Müşteri seçin"
                  placeholder="Müşteri seçin"
                  searchPlaceholder="Müşteri kodu veya unvanıyla ara"
                  emptyMessage="Eşleşen aktif müşteri yok."
                  required
                />
              </label>
              <label className="invoice-date-field">
                Fatura tarihi
                <input
                  type="date"
                  value={invoiceDate}
                  onChange={(event) => setInvoiceDate(event.target.value)}
                  required
                />
              </label>
            </div>
            {standaloneError && (
              <div className="alert inline-alert" role="alert">
                {standaloneError}
              </div>
            )}
            {renderEDocumentFields()}
            <div className="sales-invoice-standalone-lines">
              <div className="sales-invoice-standalone-heading">
                <b>Fatura satırları</b>
                <button
                  type="button"
                  className="secondary"
                  data-line-add-shortcut
                  title="Ctrl+Shift+Enter ile satır ekle"
                  onClick={() =>
                    setStandaloneLines((lines) => [
                      ...lines,
                      {
                        stockItemId: "",
                        warehouseId: warehouses.find((warehouse) => warehouse.isActive)?.id || "",
                        quantity: "1",
                        unitPrice: "0",
                        discountPercent: "0",
                        vatPercent: "20",
                      },
                    ])
                  }
                >
                  <Plus size={15} /> Satır ekle
                </button>
              </div>
              {standaloneLines.map((line, index) => (
                <div className="sales-invoice-standalone-line" key={index}>
                  <label className="standalone-stock">
                    Stok
                    <SearchableRecordPicker
                      options={stockItems
                        .filter((item) => item.isActive)
                        .map((item) => ({
                          id: item.id,
                          label: `${item.code} · ${item.name}`,
                          description: item.unitCode,
                        }))}
                      selectedId={line.stockItemId}
                      onSelect={(id) =>
                        setStandaloneLines((lines) =>
                          lines.map((item, i) =>
                            i === index ? { ...item, stockItemId: id } : item,
                          ),
                        )
                      }
                      title="Stok seçin"
                      placeholder="Stok kartı seçin"
                      searchPlaceholder="Stok kodu veya adıyla ara"
                      emptyMessage="Eşleşen aktif stok kartı yok."
                      required
                    />
                  </label>
                  <label className="standalone-warehouse">
                    Depo
                    <SearchableRecordPicker
                      options={warehouses
                        .filter((warehouse) => warehouse.isActive)
                        .map((warehouse) => ({
                          id: warehouse.id,
                          label: `${warehouse.code} · ${warehouse.name}`,
                          description: "Bu satırın stok çıkışı bu depodan yapılır",
                        }))}
                      selectedId={line.warehouseId}
                      onSelect={(id) =>
                        setStandaloneLines((lines) =>
                          lines.map((item, i) =>
                            i === index ? { ...item, warehouseId: id } : item,
                          ),
                        )
                      }
                      title="Depo seçin"
                      placeholder="Depo seçin"
                      searchPlaceholder="Depo kodu veya adıyla ara"
                      emptyMessage="Aktif depo bulunamadı."
                      required
                    />
                  </label>
                  <label>
                    Miktar
                    <input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={line.quantity}
                      onChange={(event) =>
                        setStandaloneLines((lines) =>
                          lines.map((item, i) =>
                            i === index
                              ? { ...item, quantity: event.target.value }
                              : item,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    Birim fiyat ({standaloneCurrencyCode})
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={line.unitPrice}
                      onChange={(event) =>
                        setStandaloneLines((lines) =>
                          lines.map((item, i) =>
                            i === index
                              ? { ...item, unitPrice: event.target.value }
                              : item,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    İskonto %
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={line.discountPercent}
                      onChange={(event) =>
                        setStandaloneLines((lines) =>
                          lines.map((item, i) =>
                            i === index
                              ? { ...item, discountPercent: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    KDV %
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={line.vatPercent}
                      onChange={(event) =>
                        setStandaloneLines((lines) =>
                          lines.map((item, i) =>
                            i === index
                              ? { ...item, vatPercent: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-button standalone-remove"
                    aria-label={`Satır ${index + 1} sil`}
                    disabled={standaloneLines.length === 1}
                    onClick={() =>
                      setStandaloneLines((lines) =>
                        lines.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <section className="sales-invoice-total-panel" aria-label="Fatura toplamları">
              {standaloneTotals.map((row) => {
                const parts = formatMoneyParts(row.amount);
                return <div className={row.strong ? "total-row strong" : "total-row"} key={row.label}>
                  <span>{row.label}</span>
                  <output aria-label={`${row.label} ${parts.whole},${parts.fraction} ${standaloneCurrencyCode}`}>
                    <b>{parts.whole}</b><i>,</i><b className="cents">{parts.fraction}</b><small>{standaloneCurrencyCode === "TRY" ? "TL" : standaloneCurrencyCode}</small>
                  </output>
                </div>;
              })}
            </section>
            {renderInvoiceCustomFields()}
            {renderAccountingProfileSelect()}
            <div className="modal-foot">
              <span>
                İrsaliye ve stok çıkışı oluşturulur · Fatura toplamı{" "}
                {standaloneTotal.toLocaleString("tr-TR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                {customers.find(
                  (customer) => customer.id === standaloneCustomerId,
                )?.currencyCode || ""}
              </span>
              <div>
                <button
                  type="button"
                  className="secondary"
                  disabled={standaloneBusy}
                  onClick={onClose}
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  className="primary"
                  disabled={
                    standaloneBusy || !standaloneCustomerId || standaloneLines.some((line) => !line.stockItemId || !line.warehouseId)
                  }
                >
                  {standaloneBusy
                    ? "İrsaliye ve fatura kaydediliyor…"
                    : "İrsaliye ve faturayı oluştur"}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
