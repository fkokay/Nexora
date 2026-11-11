import { MapPin, Pencil, X } from "lucide-react";
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
        <div className="erp-record-heading">
          <div>
            <span className="erp-record-kind">
              {customer.type === "Customer"
                ? "MÜŞTERİ"
                : customer.type === "Supplier"
                  ? "TEDARİKÇİ"
                  : "MÜŞTERİ & TEDARİKÇİ"}
            </span>
            <h2 id="customer-detail-title">{customer.name}</h2>
            <small>
              <span>{customer.code}</span>
              <span
                className={`customer-status-pill${customer.isActive ? " is-active" : " is-inactive"}`}
              >
                {customer.isActive ? "Aktif" : "Pasif"}
              </span>
            </small>
            <span className={`customer-einvoice-summary${customer.isEInvoiceRegistered ? " is-registered" : ""}`}>
              {customer.isEInvoiceRegistered ? "E-Fatura mükellefi" : "E-Fatura mükellefi değil"}
              {customer.isEInvoiceRegistered && customer.eInvoiceRecipientAlias
                ? ` · ${customer.eInvoiceRecipientAlias}`
                : ""}
            </span>
          </div>
          <div className="customer-detail-header-actions">
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
        </div>
        <nav className="customer-detail-tabs" aria-label="Cari detay sekmeleri">
          {tabs.map((item) => (
            <button
              type="button"
              key={item.value}
              className={activeTab === item.value ? "active" : ""}
              aria-selected={activeTab === item.value}
              onClick={() => onTabChange(item.value)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <dl className="erp-record-facts customer-detail-facts">
          {visibleFields.map((field) => (
            <div key={field.key}>
              <dt>{field.label}</dt>
              <dd>{valueFor(field.key)}</dd>
            </div>
          ))}
        </dl>
        {activeTab === "contact" && (
          <section className="customer-default-address">
            <div className="customer-default-address-icon">
              <MapPin size={16} />
            </div>
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
        <div className="erp-record-actions">
          {customer.type !== "Supplier" && (
            <button className="secondary small-button" onClick={onInvoices}>
              Satış faturaları
            </button>
          )}
          <button className="secondary small-button" onClick={onLedger}>
            Cari Hesap Hareketleri
          </button>
          <button className="secondary small-button" onClick={onAddresses}>
            Adresler
          </button>
          <button className="secondary small-button" onClick={onFields}>
            Özel alanlar
          </button>
        </div>
        {["Customer", "Both", "Dealer"].includes(customer.type) && (
          <section className="customer-detail-quick-actions" aria-label="Cari işlemleri">
            <h3>Cari ile işlemler</h3>
            <div className="erp-record-actions">
              <button className="secondary small-button" onClick={onNewOrder}>Yeni sipariş</button>
              <button className="secondary small-button" onClick={onNewQuote}>Yeni teklif</button>
              <button className="secondary small-button" onClick={onNewDelivery}>Yeni irsaliye</button>
              <button className="secondary small-button" onClick={onNewInvoice}>Yeni fatura</button>
            </div>
          </section>
        )}
      </section>
    </aside>
  );
}
