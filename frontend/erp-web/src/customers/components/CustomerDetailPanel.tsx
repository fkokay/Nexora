import { ChevronRight, MapPin, Pencil, X } from "lucide-react";
import type {
  BuiltInScreenLayoutField,
  CustomerAddressItem,
  CustomerItem,
} from "../../erp-types";

export type CustomerDetailTab = string;

type Props = {
  customer: CustomerItem | null;
  isSmallScreen: boolean;
  tab: CustomerDetailTab;
  fields: BuiltInScreenLayoutField[];
  address: CustomerAddressItem | null;
  addressLoaded: boolean;
  onTabChange: (tab: CustomerDetailTab) => void;
  onClose: () => void;
  onEdit: () => void;
  onInvoices: () => void;
  onLedger: () => void;
  onNewOrder: () => void;
  onNewQuote: () => void;
  onNewDelivery: () => void;
  onNewInvoice: () => void;
  onAddresses: () => void;
  onFields: () => void;
  onPurchaseInvoices: () => void;
  onToggleActive: () => void;
  /** True while a save is running; disables the activate/deactivate action. */
  busy: boolean;
  onBackdropClose: () => void;
};

export function CustomerDetailPanel({
  customer,
  isSmallScreen,
  tab,
  fields,
  address,
  addressLoaded,
  onTabChange,
  onClose,
  onEdit,
  onInvoices,
  onLedger,
  onNewOrder,
  onNewQuote,
  onNewDelivery,
  onNewInvoice,
  onAddresses,
  onFields,
  onPurchaseInvoices,
  onToggleActive,
  busy,
  onBackdropClose,
}: Props) {
  if (!customer) return null;
  const fallbackSection = (key: string) =>
    ["groupName", "taxNumber", "identityNumber"].includes(key) ? "Genel Bilgiler"
      : ["currencyCode", "paymentTermDays", "riskLimit"].includes(key) ? "Finans"
        : key === "taxOffice" ? "Diğer" : "Genel Bilgiler";
  const detailSections = [...new Set(fields.map((field) => field.section?.trim() || fallbackSection(field.key)))];
  const tabs = [...detailSections.map((section) => ({ label: section, value: `section:${section}` })), { label: "İletişim", value: "contact" }];
  const activeTab = tab === "contact" ? "contact"
    : tabs.some((item) => item.value === tab) ? tab
      : tabs.find((item) => item.value.startsWith("section:"))?.value ?? "contact";
  const activeSection = activeTab.startsWith("section:") ? activeTab.slice("section:".length) : null;
  const visibleFields = fields.filter((field) => activeSection !== null
    && (field.section?.trim() || fallbackSection(field.key)) === activeSection);
  const valueFor = (key: string) =>
    key === "groupName"
      ? customer.groupName || "Atanmamış"
      : key === "taxNumber"
        ? customer.taxNumber || "—"
        : key === "identityNumber"
          ? customer.identityNumber || "—"
          : key === "taxOffice"
            ? customer.taxOffice || "—"
            : key === "currencyCode"
              ? customer.currencyCode
              : key === "paymentTermDays"
                ? `${customer.paymentTermDays} gün`
                : key === "riskLimit"
                  ? customer.riskLimit == null
                    ? "Belirtilmedi"
                    : `${customer.riskLimit.toLocaleString("tr-TR")} ${customer.currencyCode}`
                  : "—";
  const kindLabel =
    customer.type === "Customer" ? "MÜŞTERİ"
      : customer.type === "Supplier" ? "TEDARİKÇİ"
        : customer.type === "Dealer" ? "BAYİ"
          : customer.type === "Employee" ? "PERSONEL"
            : "MÜŞTERİ & TEDARİKÇİ";
  return (
    <aside
      className={`customer-detail-backdrop${isSmallScreen ? " is-popup" : ""}`}
      onMouseDown={(event) => {
        if (isSmallScreen && event.target === event.currentTarget)
          onBackdropClose();
      }}
    >
      <section
        className="customer-detail-modal"
        role={isSmallScreen ? "dialog" : undefined}
        aria-modal={isSmallScreen ? "true" : undefined}
        aria-labelledby="customer-detail-title"
      >
        <header className="list-v2-detail-head">
          <div>
            <span className={`list-v2-kind is-${customer.type.toLowerCase()}`}>
              {kindLabel}
            </span>
            <h2 id="customer-detail-title">{customer.name}</h2>
          </div>
          <div className="list-v2-detail-head-actions">
            <button className="secondary small-button" onClick={onEdit}>
              <Pencil size={14} /> Düzenle
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Cari detayını kapat"
              onClick={onClose}
            >
              <X size={19} />
            </button>
          </div>
        </header>
        <div className="list-v2-detail-meta">
          <span className="list-v2-detail-code">{customer.code}</span>
          <span className={`list-v2-status${customer.isActive ? " is-active" : ""}`}>
            <i aria-hidden="true" />
            {customer.isActive ? "Aktif" : "Pasif"}
          </span>
          <span className={`list-v2-einvoice${customer.isEInvoiceRegistered ? " is-registered" : ""}`}>
            {customer.isEInvoiceRegistered ? "E-Fatura mükellefi" : "E-Fatura mükellefi değil"}
            {customer.isEInvoiceRegistered && customer.eInvoiceRecipientAlias
              ? ` · ${customer.eInvoiceRecipientAlias}`
              : ""}
          </span>
        </div>
        {["Customer", "Both", "Dealer"].includes(customer.type) && (
          <section className="list-v2-quick" aria-label="Cari işlemleri">
            <h3>Cari ile işlemler</h3>
            <div>
              <button className="primary small-button" onClick={onNewOrder}>Yeni sipariş</button>
              <button className="secondary small-button" onClick={onNewQuote}>Yeni teklif</button>
              <button className="secondary small-button" onClick={onNewDelivery}>Yeni irsaliye</button>
              <button className="secondary small-button" onClick={onNewInvoice}>Yeni fatura</button>
            </div>
          </section>
        )}
        <nav className="list-v2-tabs" aria-label="Cari detay sekmeleri">
          {tabs.map((item) => (
            <button
              type="button"
              key={item.value}
              className={activeTab === item.value ? "is-active" : ""}
              aria-pressed={activeTab === item.value}
              onClick={() => onTabChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        {visibleFields.length > 0 && (
          <dl className="list-v2-facts">
            {visibleFields.map((field) => (
              <div key={field.key}>
                <dt>{field.label}</dt>
                <dd>{valueFor(field.key)}</dd>
              </div>
            ))}
          </dl>
        )}
        {activeTab === "contact" && (
          <section className="list-v2-address">
            <MapPin size={18} aria-hidden="true" />
            <div>
              <span>Varsayılan adres</span>
              {!addressLoaded ? (
                <strong>Yükleniyor…</strong>
              ) : address ? (
                <>
                  <strong>{address.label}</strong>
                  <small>
                    {address.addressLine}
                    {address.district ? `, ${address.district}` : ""},{" "}
                    {address.city}
                    {address.postalCode
                      ? ` · ${address.postalCode}`
                      : ""} · {address.countryCode}
                  </small>
                  {address.latitude !== null && address.longitude !== null && (
                    <small>
                      Harita konumu: {address.latitude.toFixed(6)},{" "}
                      {address.longitude.toFixed(6)}
                    </small>
                  )}
                </>
              ) : (
                <small>Varsayılan adres tanımlanmamış.</small>
              )}
              <button className="secondary small-button" onClick={onAddresses}>
                Adresleri yönet
              </button>
            </div>
          </section>
        )}
        {tab === "other" && (
          <section className="customer-company-hierarchy">
            <div>
              <span>Şirket hiyerarşisi</span>
              {customer.parentCompanyName ? (
                <strong>Ana firma: {customer.parentCompanyName}</strong>
              ) : (
                <strong>Bağımsız firma</strong>
              )}
            </div>
            {(customer.subsidiaryCount || 0) > 0 && (
              <small>{customer.subsidiaryCount} alt firma bağlı</small>
            )}
          </section>
        )}
        <section className="list-v2-related" aria-labelledby="customer-detail-related">
          <h3 id="customer-detail-related">İlgili kayıtlar</h3>
          {customer.type !== "Supplier" && (
            <button type="button" onClick={onInvoices}>
              <span>Satış faturaları</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}
          {customer.type !== "Customer" && (
            <button type="button" onClick={onPurchaseInvoices}>
              <span>Alış faturaları</span>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={onLedger}>
            <span>Cari Hesap Hareketleri</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={onAddresses}>
            <span>Adresler</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={onFields}>
            <span>Özel alanlar</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </section>
        <div className="list-v2-detail-foot">
          <button
            type="button"
            className={customer.isActive ? "is-danger" : ""}
            disabled={busy}
            onClick={onToggleActive}
          >
            {customer.isActive ? "Pasife al" : "Etkinleştir"}
          </button>
        </div>
      </section>
    </aside>
  );
}
