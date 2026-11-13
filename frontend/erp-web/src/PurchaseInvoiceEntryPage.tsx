import AdvancedDataGrid from "./AdvancedDataGrid";
import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "./authApi";
import { FilePlus2, X } from "lucide-react";
import { ListPageHeader } from "./list-page/ListPageHeader";
import { ListToolbar } from "./list-page/ListToolbar";
import ScreenViewGroupHeader from "./ScreenViewGroupHeader";
import "./purchase-invoice-entry.css";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "./record-form/RecordForm";
import "./purchasing-record-forms.css";
import "./purchase-list-v2/purchase-list-v2.css";

type ReceiptOption = {
  id: string;
  receiptCode: string;
  purchaseOrderId: string;
  purchaseOrderCode: string;
  supplierId: string;
  supplierName: string;
  receiptDate: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  lineCount: number;
  currencyCode: string;
  purchaseOrderTotal: number;
};
type ReceiptPage = {
  items: ReceiptOption[];
  page: number;
  pageSize: number;
  totalCount: number;
};
type CreatedInvoice = {
  id: string;
  code: string;
  grandTotal: number;
  currencyCode: string;
};
type AccountingRuleProfile = {
  profileCode: string; name: string; jurisdictionCode: string; reportingStandard: string;
  isActive: boolean; parametersJson: string;
};
type ReceiptScreenField = {
  key: string;
  label: string;
  visible: boolean;
  position: number;
  section?: string | null;
  fixed?: boolean;
};
const defaultReceiptFields: ReceiptScreenField[] = [
  { key: "receipt", label: "Mal kabul / sipariş", visible: true, position: 0 },
  { key: "supplier", label: "Tedarikçi", visible: true, position: 1 },
  { key: "receiptDate", label: "Kabul tarihi", visible: true, position: 2 },
  { key: "warehouse", label: "Depo", visible: true, position: 3 },
  { key: "lineCount", label: "Satır", visible: true, position: 4 },
  {
    key: "purchaseOrderTotal",
    label: "Sipariş toplamı",
    visible: true,
    position: 5,
  },
  {
    key: "actions",
    label: "Fatura işlemi",
    visible: true,
    position: 6,
    fixed: true,
  },
];

export type PurchaseInvoiceEntryPageProps = {
  token: string;
  role: string;
  onInvoiceCreated?: (invoiceId: string) => void;
};

async function request<T>(
  url: string,
  token: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(url, token, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    let message = `İstek başarısız (${response.status}).`;
    try {
      const body = await response.json();
      message = body.error || body.title || message;
    } catch {
      /* preserve the status message */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function PurchaseInvoiceEntryPage({
  token,
  onInvoiceCreated,
}: PurchaseInvoiceEntryPageProps) {
  const [items, setItems] = useState<ReceiptOption[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  // Search text that is applied to the query (set shortly after typing stops).
  const [query, setQuery] = useState("");
  const [gridToolsSlot, setGridToolsSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<ReceiptOption | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptOption | null>(
    null,
  );
  const [invoiceCode, setInvoiceCode] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(localDate());
  const [providerInvoiceUuid, setProviderInvoiceUuid] = useState("");
  const [providerScenario, setProviderScenario] = useState("");
  const [providerTypeCode, setProviderTypeCode] = useState("");
  const [providerSenderAlias, setProviderSenderAlias] = useState("");
  const [accountingProfiles, setAccountingProfiles] = useState<AccountingRuleProfile[]>([]);
  const [accountingProfileCode, setAccountingProfileCode] = useState("");
  const [screenFields, setScreenFields] =
    useState<ReceiptScreenField[]>(defaultReceiptFields);
  const pageSize = 25;

  useEffect(() => {
    let cancelled = false;
    void request<{ fields?: ReceiptScreenField[] }>(
      "/api/screen-views/purchase-invoice-receipt-selection/active",
      token,
    )
      .then((view) => {
        if (cancelled || !Array.isArray(view.fields)) return;
        const allowed = new Set(defaultReceiptFields.map((field) => field.key));
        const fields = view.fields
          .filter((field) => allowed.has(field.key))
          .map((field) => ({ ...field, fixed: field.key === "actions" }));
        if (!fields.some((field) => field.key === "actions"))
          fields.push({
            key: "actions",
            label: "Fatura işlemi",
            visible: true,
            position: fields.length,
            fixed: true,
          });
        setScreenFields(fields.sort((a, b) => a.position - b.position));
      })
      .catch(() => {
        /* Keep the standard layout if Studio is unavailable. */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void request<AccountingRuleProfile[]>("/api/finance/general-ledger/rule-profiles", token)
      .then((profiles) => {
        if (cancelled) return;
        const configured = profiles.filter((profile) => {
          if (!profile.isActive) return false;
          try { const rules = JSON.parse(profile.parametersJson)?.taxRules; return Array.isArray(rules) && rules.length > 0; }
          catch { return false; }
        });
        setAccountingProfiles(configured);
        const defaultProfile = configured.find((profile) => {
          try { return JSON.parse(profile.parametersJson)?.defaultForDocuments === true; }
          catch { return false; }
        });
        setAccountingProfileCode(defaultProfile?.profileCode || configured.find((profile) => profile.profileCode === "TR-LOCAL")?.profileCode || configured[0]?.profileCode || "");
      })
      .catch(() => { if (!cancelled) setAccountingProfiles([]); });
    return () => { cancelled = true; };
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request<ReceiptPage>(
        `/api/purchasing/invoices/entry/receipts?page=${page}&pageSize=${pageSize}&q=${encodeURIComponent(query.trim())}`,
        token,
      );
      setItems(result.items);
      setTotal(result.totalCount);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, query, token]);
  useEffect(() => {
    void load();
  }, [load]);

  async function createInvoice(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const invoice = await request<CreatedInvoice>(
        `/api/purchasing/receipts/${selected.id}/invoice`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ code: invoiceCode.trim(), invoiceDate,
            accountingProfileCode: accountingProfileCode || null,
            providerInvoiceUuid: providerInvoiceUuid || null, providerScenario: providerScenario || null,
            providerInvoiceTypeCode: providerTypeCode || null, providerSenderAlias: providerSenderAlias || null }),
        },
      );
      setSelected(null);
      setInvoiceCode("");
      setInvoiceDate(localDate());
      setProviderInvoiceUuid(""); setProviderScenario(""); setProviderTypeCode(""); setProviderSenderAlias("");
      setNotice(
        `${invoice.code} alış faturası kaydedildi. Tedarikçi borcu ${invoice.grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${invoice.currencyCode}.`,
      );
      onInvoiceCreated?.(invoice.id);
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / pageSize));
  // The invoice action lives in the detail panel, so the row action column is not shown.
  const visibleFields = screenFields.filter(
    (field) => (field.visible || field.fixed) && field.key !== "actions",
  );
  const fieldValue = (item: ReceiptOption, key: string) =>
    key === "receipt" ? (
      <>
        <b>{item.receiptCode}</b>
        <small>{item.purchaseOrderCode}</small>
      </>
    ) : key === "supplier" ? (
      <>
        <b>{item.supplierName}</b>
        <small>Sipariş {item.purchaseOrderCode}</small>
      </>
    ) : key === "receiptDate" ? (
      item.receiptDate.split("-").reverse().join(".")
    ) : key === "warehouse" ? (
      `${item.warehouseCode} · ${item.warehouseName}`
    ) : key === "lineCount" ? (
      item.lineCount
    ) : key === "purchaseOrderTotal" ? (
      `${item.purchaseOrderTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} ${item.currencyCode}`
    ) : null;
  return (
    <main className="purchase-invoice-entry list-v2 purchase-lv2-stack">
      <ListPageHeader
        title="Alış faturası girişi"
        description="İşlenmiş mal kabullerini seçin; fatura kaydı sipariş ve stok kabulüyle bağlantısını korusun."
        count={loading && total === 0 ? null : total}
      />
      <p className="pie-hint">
        Bu akış yalnızca sipariş ve işlenmiş mal kabul satırlarına bağlı stok
        faturalarını destekler. Sipariş/mal kabul bağlantısı olmayan hizmet veya
        masraf faturaları mevcut modelde yer almıyor; bunlar için ayrı bir
        domain ve hesap eşlemesi kararı gerekiyor.
      </p>
      {error && (
        <div className="pie-alert" role="alert">
          {error}
          <button onClick={() => setError("")}>Kapat</button>
        </div>
      )}
      {notice && (
        <div className="pie-notice" role="status">
          {notice}
          <button onClick={() => setNotice("")}>Kapat</button>
        </div>
      )}
      <ListToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchApply={() => {
          setPage(1);
          setQuery(search.trim());
        }}
        searchPlaceholder="Mal kabul, sipariş, tedarikçi veya depo ara"
        toolsSlotRef={setGridToolsSlot}
        onRefresh={() => {
          if (!loading) void load();
        }}
      />
      <div className="pie-workbench">
        <div className="pie-table-wrap list-v2-list">
          <AdvancedDataGrid
            gridId="purchase-invoice-receipt-selection"
            hideSearch
            externalPagination
            enableRowSelection={false}
            toolbarContainer={gridToolsSlot}
          >
            <thead>
              <ScreenViewGroupHeader fields={visibleFields} />
              <tr>
                {visibleFields.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleFields.length} className="pie-empty">
                    Mal kabuller yükleniyor…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={visibleFields.length} className="pie-empty">
                    {query
                      ? "Aramanızla eşleşen faturalanabilir mal kabul yok."
                      : "Faturalanabilir mal kabul yok. Önce satın alma siparişi üzerinden mal kabul kaydedin."}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    aria-selected={previewReceipt?.id === item.id}
                    onClick={() => setPreviewReceipt(item)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setPreviewReceipt(item);
                      }
                    }}
                  >
                    {visibleFields.map((field) => (
                      <td key={field.key}>{fieldValue(item, field.key)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </AdvancedDataGrid>
        </div>
        {previewReceipt && (
          <div
            className="pie-detail-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setPreviewReceipt(null);
            }}
          />
        )}
        <aside
          className={`pie-record-detail${previewReceipt ? " is-open" : ""}`}
          aria-label="Seçili mal kabul ayrıntıları"
        >
          {previewReceipt ? (
            <>
              <button
                type="button"
                className="pie-detail-close"
                aria-label="Mal kabul ayrıntısını kapat"
                onClick={() => setPreviewReceipt(null)}
              >
                <X size={18} />
              </button>
              <header className="list-v2-detail-head">
                <div>
                  <span className="list-v2-kind">SEÇİLİ MAL KABUL</span>
                  <h2>{previewReceipt.receiptCode}</h2>
                </div>
              </header>
              <div className="list-v2-detail-meta">
                <span>{previewReceipt.supplierName}</span>
                <span className="list-v2-detail-code">
                  {previewReceipt.purchaseOrderCode}
                </span>
              </div>
              <section className="list-v2-quick purchase-lv2-quick-single">
                <div>
                  <button
                    className="pie-primary"
                    onClick={() => {
                      setSelected(previewReceipt);
                      setInvoiceCode("");
                      setInvoiceDate(localDate());
                    }}
                  >
                    <FilePlus2 size={15} /> Bu mal kabul için fatura gir
                  </button>
                </div>
              </section>
              <dl className="list-v2-facts">
                <div>
                  <dt>Kabul tarihi</dt>
                  <dd>
                    {previewReceipt.receiptDate.split("-").reverse().join(".")}
                  </dd>
                </div>
                <div>
                  <dt>Depo</dt>
                  <dd>
                    {previewReceipt.warehouseCode} ·{" "}
                    {previewReceipt.warehouseName}
                  </dd>
                </div>
                <div>
                  <dt>Satır sayısı</dt>
                  <dd>{previewReceipt.lineCount}</dd>
                </div>
                <div>
                  <dt>Sipariş toplamı</dt>
                  <dd>
                    {previewReceipt.purchaseOrderTotal.toLocaleString("tr-TR", {
                      minimumFractionDigits: 2,
                    })}{" "}
                    {previewReceipt.currencyCode}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <div className="pie-record-empty">
              <b>Mal kabul seçin</b>
              <span>
                Seçili kabulün tedarikçi, depo ve fatura bilgileri burada
                görünür.
              </span>
            </div>
          )}
        </aside>
      </div>
      <footer className="pie-pagination">
        <span>
          Sayfa {page} / {pages}
        </span>
        <div>
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((x) => Math.max(1, x - 1))}
          >
            Önceki
          </button>
          <button
            disabled={page >= pages || loading}
            onClick={() => setPage((x) => x + 1)}
          >
            Sonraki
          </button>
        </div>
      </footer>
      {selected && (
        <div
          className="pie-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setSelected(null);
          }}
        >
          <section
            className="pie-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.receiptCode} için fatura gir`}
          >
            <RecordFormPage
              variant="dialog"
              className="prf-pie-form"
              title={`${selected.receiptCode} için fatura gir`}
              mode="create"
              busy={busy}
              saveLabel="Faturayı kaydet"
              onSubmit={createInvoice}
              onCancel={() => {
                if (!busy) setSelected(null);
              }}
              status={
                <>
                  <span>
                    {selected.supplierName} · {selected.purchaseOrderCode} ·{" "}
                    {selected.warehouseName}
                  </span>
                  <span>
                    Vade, tedarikçinin kayıtlı ödeme koşulundan hesaplanır.
                    Kaydetme, mal kabul satırlarını ve cari borç kaydını birlikte
                    oluşturur.
                  </span>
                </>
              }
            >
              <RecordFormGroup title="Fatura Kimliği" bodyClassName={`rf-identity ${accountingProfiles.length > 0 ? "prf-identity-3" : "prf-identity-2"}`}>
                <label>
                  <span>Tedarikçi fatura numarası <RequiredMark /></span>
                  <input
                    className="rf-must rf-mono"
                    value={invoiceCode}
                    onChange={(e) => setInvoiceCode(e.target.value)}
                    maxLength={64}
                    required
                    autoFocus
                  />
                </label>
                <label>
                  <span>Fatura tarihi <RequiredMark /></span>
                  <input
                    className="rf-must"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    required
                  />
                </label>
                {accountingProfiles.length > 0 && <label><span>Vergi mevzuatı profili <RequiredMark /></span><select className="rf-must" value={accountingProfileCode} onChange={(e) => setAccountingProfileCode(e.target.value)} required><option value="">Profil seçin</option>{accountingProfiles.map((profile) => <option key={profile.profileCode} value={profile.profileCode}>{profile.name} · {profile.jurisdictionCode} · {profile.reportingStandard}</option>)}</select></label>}
              </RecordFormGroup>
              <RecordFormGroup title="Gelen E-Belge Bilgileri">
                <div className="rf-pair">
                  <label>Belge UUID<input className="rf-mono" value={providerInvoiceUuid} onChange={(e) => setProviderInvoiceUuid(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></label>
                  <label>Belge senaryosu<input value={providerScenario} onChange={(e) => setProviderScenario(e.target.value)} placeholder="TEMELFATURA / TICARIFATURA / EARSIVFATURA" /></label>
                </div>
                <div className="rf-pair">
                  <label>Belge tür kodu<input value={providerTypeCode} onChange={(e) => setProviderTypeCode(e.target.value)} placeholder="SATIS / IADE / TEVKIFAT" /></label>
                  <label>Gönderen e-Fatura etiketi<input className="rf-mono" value={providerSenderAlias} onChange={(e) => setProviderSenderAlias(e.target.value)} /></label>
                </div>
              </RecordFormGroup>
            </RecordFormPage>
          </section>
        </div>
      )}
    </main>
  );
}
