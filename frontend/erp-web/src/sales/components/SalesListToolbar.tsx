import { Boxes, Filter, Search, ShieldCheck, X } from "lucide-react";

export type SalesListTab = "quotes" | "orders" | "invoices";

type SalesListToolbarProps = {
  activeTab: SalesListTab;
  total: number;
  quoteRows: Array<{ status: string; grandTotal: number; currencyCode: string }>;
  orderRows: Array<{ status: string }>;
  invoiceRows: Array<{ status: string; invoiceDate: string; lineCount: number }>;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  quoteStatus: string;
  onQuoteStatusChange: (value: string) => void;
  onApplyQuoteFilters: () => void;
  quoteDateFrom: string;
  onQuoteDateFromChange: (value: string) => void;
  quoteDateTo: string;
  onQuoteDateToChange: (value: string) => void;
};

const labels: Record<
  SalesListTab,
  { total: string; summary: string; placeholder: string; context: string }
> = {
  quotes: {
    total: "satış teklifi",
    summary: "Teklif para birimi seçilen müşteri kartından alınır",
    placeholder: "Teklif no veya müşteriyle ara",
    context: "",
  },
  orders: {
    total: "satış siparişi",
    summary: "Sevkiyat ve faturalama durumlarını izleyin.",
    placeholder: "Sipariş no veya müşteriyle ara",
    context: "Açık siparişler → sevkiyat",
  },
  invoices: {
    total: "satış faturası",
    summary: "Kesilen faturalar müşteri cari hareketlerine yansır.",
    placeholder: "Fatura no veya müşteriyle ara",
    context: "Faturalar → cari hareketi",
  },
};

export default function SalesListToolbar({
  activeTab,
  total,
  quoteRows,
  orderRows,
  invoiceRows,
  loading,
  search,
  onSearchChange,
  quoteStatus,
  onQuoteStatusChange,
  onApplyQuoteFilters,
  quoteDateFrom,
  onQuoteDateFromChange,
  quoteDateTo,
  onQuoteDateToChange,
}: SalesListToolbarProps) {
  const copy = labels[activeTab];
  const countStatus = (status: string) => quoteRows.filter((quote) => quote.status === status).length;
  const invoiceMonth = new Date().toISOString().slice(0, 7);

  return (
    <>
      {activeTab === "quotes" ? (
      <div className="sales-quote-kpis">
        <article><small>Toplam teklif</small><b>{loading ? "…" : total.toLocaleString("tr-TR")}</b></article>
        <article><small>Taslak</small><b>{loading ? "…" : countStatus("Draft")}</b><span>Bu sayfada</span></article>
        <article><small>İletildi</small><b>{loading ? "…" : countStatus("Sent")}</b><span>Bu sayfada</span></article>
        <article><small>Kabul edildi</small><b>{loading ? "…" : countStatus("Accepted")}</b><span>Bu sayfada</span></article>
        <article><small>Süresi doldu</small><b>{loading ? "…" : countStatus("Expired")}</b><span>Bu sayfada</span></article>
      </div>
      ) : activeTab === "orders" ? (
        <div className="sales-quote-kpis sales-order-kpis" aria-label="Sipariş özeti">
          <article><small>Toplam sipariş</small><b>{loading ? "…" : total.toLocaleString("tr-TR")}</b><span>Firma genelinde</span></article>
          <article><small>Açık</small><b>{loading ? "…" : orderRows.filter((order) => order.status === "Open").length}</b><span>Sevkiyat bekliyor</span></article>
          <article><small>Tamamlandı</small><b>{loading ? "…" : orderRows.filter((order) => order.status === "Fulfilled").length}</b><span>Sevkiyatı tamamlanan</span></article>
          <article><small>İptal edildi</small><b>{loading ? "…" : orderRows.filter((order) => order.status === "Cancelled").length}</b><span>İptal edilen</span></article>
        </div>
      ) : activeTab === "invoices" ? (
        <div className="sales-invoice-kpis" aria-label="Satış faturası özeti">
          <article><span>Toplam fatura</span><b>{loading ? "…" : total.toLocaleString("tr-TR")}</b><small>Firma genelinde</small></article>
          <article><span>Bu ay kesilen</span><b>{loading ? "…" : invoiceRows.filter((invoice) => invoice.invoiceDate.startsWith(invoiceMonth)).length}</b><small>Görüntülenen kayıtlarda</small></article>
          <article><span>Kesildi</span><b>{loading ? "…" : invoiceRows.filter((invoice) => invoice.status === "Posted").length}</b><small>Görüntülenen kayıtlarda</small></article>
          <article><span>İptal edildi</span><b>{loading ? "…" : invoiceRows.filter((invoice) => invoice.status === "Voided").length}</b><small>Görüntülenen kayıtlarda</small></article>
          <article><span>Fatura satırı</span><b>{loading ? "…" : invoiceRows.reduce((sum, invoice) => sum + invoice.lineCount, 0).toLocaleString("tr-TR")}</b><small>Görüntülenen kayıtlarda</small></article>
        </div>
      ) : activeTab === "quotes" ? <div className="customer-summary">
        <div className="customer-summary-icon">
          <Boxes size={19} />
        </div>
        <div>
          <b>
            {total} {copy.total}
          </b>
          <small>{copy.summary}</small>
        </div>
        <span className="tenant-scope">
          <ShieldCheck size={14} />
          Firma kapsamlı belgeler · 25 kayıt/sayfa
        </span>
      </div> : null}
      <section className="panel sales-list-filter-card" aria-label="Satış listesi filtreleri">
      <div className="sales-list-filter-heading">
        <h2>Filtreler</h2>
        <p>{activeTab === "quotes" ? "Teklifleri müşteri, durum ve tarih aralığına göre daraltın." : activeTab === "orders" ? "Siparişleri numara veya müşteri bilgisine göre arayın." : "Faturaları numara veya müşteri bilgisine göre arayın."}</p>
      </div>
      <div className={`customer-toolbar${activeTab === "quotes" ? " sales-quote-toolbar" : activeTab === "orders" ? " sales-order-toolbar" : activeTab === "invoices" ? " sales-invoice-toolbar" : ""}`}>
        <div className="sales-search-group">
          <div className="customer-search sales-search-field">
            <Search size={16} />
            <input
              aria-label={copy.placeholder}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={copy.placeholder}
            />
            {activeTab === "quotes" && search && (
              <button
                className="sales-search-clear-icon"
                type="button"
                aria-label="Aramayı temizle"
                title="Aramayı temizle"
                onClick={() => onSearchChange("")}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {activeTab === "quotes" ? <>
          <label className="sales-quote-filter"><span>Durum</span><select value={quoteStatus} onChange={(event) => onQuoteStatusChange(event.target.value)}><option value="">Tüm durumlar</option><option value="Draft">Taslak</option><option value="Sent">İletildi</option><option value="Accepted">Kabul edildi</option><option value="Rejected">Reddedildi</option><option value="Expired">Süresi doldu</option></select></label>
          <label className="sales-quote-filter"><span>Başlangıç</span><input type="date" value={quoteDateFrom} onChange={(event) => onQuoteDateFromChange(event.target.value)} /></label>
          <label className="sales-quote-filter"><span>Bitiş</span><input type="date" value={quoteDateTo} onChange={(event) => onQuoteDateToChange(event.target.value)} /></label>
          <button className="secondary sales-quote-apply" type="button" onClick={onApplyQuoteFilters}><Filter size={14} />Filtrele</button>
        </> : null}
        {activeTab !== "invoices" && activeTab !== "quotes" && activeTab !== "orders" && <span className="date-pill">
          {loading ? "Yükleniyor…" : copy.context}
        </span>}
      </div>
      </section>
    </>
  );
}
