import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import type {
  BuiltInScreenLayoutField,
  CustomerAddressItem,
  CustomerBalance,
  CustomerItem,
} from "../../erp-types";
import { StatusTag } from "../../list-page/StatusTag";
import {
  SalesListDetailPanel,
  SalesPanelFacts,
  SalesPanelSection,
  SalesPanelStats,
} from "../../sales/components/SalesListDetailPanel";
import { customerTypeLabel, customerTypeTone, money2 } from "../customerLabels";

export type CustomerDetailTab = string;

type Props = {
  customer: CustomerItem;
  tab: CustomerDetailTab;
  /** Fields of the tenant's customer-details view; their sections become the tabs. */
  fields: BuiltInScreenLayoutField[];
  address: CustomerAddressItem | null;
  addressLoaded: boolean;
  /** `/balance` of this account (null while loading or after an error). */
  balance: CustomerBalance | null;
  balanceError: string;
  onTabChange: (tab: CustomerDetailTab) => void;
  /** Opens the card (bar Aç / Enter). */
  onOpen: () => void;
  onClose: () => void;
  takeFocus?: () => boolean;
  onInvoices: () => void;
  onPurchaseInvoices: () => void;
  onLedger: () => void;
  onAddresses: () => void;
  onFields: () => void;
};

const fallbackSection = (key: string) =>
  ["groupName", "taxNumber", "identityNumber"].includes(key)
    ? "Genel Bilgiler"
    : ["currencyCode", "paymentTermDays", "riskLimit"].includes(key)
      ? "Finans"
      : key === "taxOffice"
        ? "Diğer"
        : "Genel Bilgiler";

/** "186.242,00 TRY B": the balance as `/balance` returns it, with its side (B = borç, A = alacak). */
export function balanceText(balance: CustomerBalance): ReactNode {
  if (balance.balanceSide === "Balanced")
    return (
      <>
        <span>{`${money2(0)} ${balance.currencyCode}`}</span> <span>Dengede</span>
      </>
    );
  return (
    <>
      <span>{`${money2(Math.abs(balance.balance))} ${balance.currencyCode}`}</span>{" "}
      <span title={balance.balanceSide === "Debit" ? "Borç bakiyesi" : "Alacak bakiyesi"}>
        {balance.balanceSide === "Debit" ? "B" : "A"}
      </span>
    </>
  );
}

/**
 * Right-hand panel of Cari Hesaplar (mockup 08 ".det"): code and Aç, name, type / status / e-Fatura tags, the
 * tenant's detail sections and İletişim as tabs. Bakiye, risk limiti and limit kullanımı come from `/balance` of the
 * chosen account (the list itself has no balance); limit kullanımı = bakiye ÷ risk limiti, open orders and
 * deliveries are not included.
 */
export function CustomerDetailPanel({
  customer,
  tab,
  fields,
  address,
  addressLoaded,
  balance,
  balanceError,
  onTabChange,
  onOpen,
  onClose,
  takeFocus,
  onInvoices,
  onPurchaseInvoices,
  onLedger,
  onAddresses,
  onFields,
}: Props) {
  const sections = [...new Set(fields.map((field) => field.section?.trim() || fallbackSection(field.key)))];
  const tabs = [
    ...sections.map((section) => ({ id: `section:${section}`, label: section })),
    { id: "contact", label: "İletişim" },
  ];
  const activeTab = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;
  const activeSection = activeTab.startsWith("section:") ? activeTab.slice("section:".length) : null;
  const sectionFields = fields.filter(
    (field) => activeSection !== null && (field.section?.trim() || fallbackSection(field.key)) === activeSection,
  );
  const valueFor = (key: string): ReactNode => {
    switch (key) {
      case "groupName":
        return customer.groupName || "Atanmamış";
      case "taxNumber":
        return customer.taxNumber || "—";
      case "identityNumber":
        return customer.identityNumber || "—";
      case "taxOffice":
        return customer.taxOffice || "—";
      case "currencyCode":
        return customer.currencyCode;
      case "paymentTermDays":
        return (
          <>
            <span>{customer.paymentTermDays}</span> <span>gün</span>
          </>
        );
      case "riskLimit":
        return customer.riskLimit == null ? "Belirtilmedi" : `${money2(customer.riskLimit)} ${customer.currencyCode}`;
      default:
        return "—";
    }
  };

  // Limit kullanımı only for a debit balance against a defined limit (the API's risk limit).
  const limit = balance?.riskLimit ?? null;
  const usage =
    balance && limit && limit > 0 ? (balance.balanceSide === "Debit" ? (Math.abs(balance.balance) / limit) * 100 : 0) : null;

  return (
    <SalesListDetailPanel
      label="Cari özeti"
      code={customer.code}
      title={customer.name}
      tags={
        <>
          <StatusTag tone={customerTypeTone(customer.type)}>{customerTypeLabel(customer.type)}</StatusTag>
          <StatusTag tone={customer.isActive ? "ok" : "off"}>{customer.isActive ? "Aktif" : "Pasif"}</StatusTag>
          {customer.isEInvoiceRegistered && <StatusTag tone="ok">e-Fatura</StatusTag>}
        </>
      }
      tabs={tabs}
      tab={activeTab}
      onTabChange={onTabChange}
      onOpen={onOpen}
      onClose={onClose}
      takeFocus={takeFocus}
    >
      {balanceError ? (
        <p className="sales-ld-error">{balanceError}</p>
      ) : (
        <SalesPanelStats
          items={[
            { label: "Bakiye", value: balance ? balanceText(balance) : "—" },
            {
              label: "Risk limiti",
              value: balance ? (limit == null ? "—" : `${money2(limit)} ${balance.currencyCode}`) : "—",
            },
            {
              label: "Limit kullanımı",
              value: usage == null ? "—" : `%${usage.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`,
              tone: usage != null && usage > 100 ? "bad" : undefined,
            },
            {
              label: "Vade",
              value: (
                <>
                  <span>{customer.paymentTermDays}</span> <span>gün</span>
                </>
              ),
            },
          ]}
        />
      )}
      {activeTab === "contact" ? (
        <>
          <SalesPanelFacts
            items={[
              { label: "Telefon", value: customer.phone || "—" },
              { label: "Kurumsal e-posta", value: customer.email || "—" },
              { label: "Yetkili kişi", value: customer.contactName || "—" },
              { label: "Yetkili telefon", value: customer.contactPhone || "—" },
            ]}
          />
        </>
      ) : (
        sectionFields.length > 0 && (
          <SalesPanelFacts items={sectionFields.map((field) => ({ label: field.label, value: valueFor(field.key) }))} />
        )
      )}
      <SalesPanelSection
        title="Varsayılan adres"
        action={
          <button type="button" className="sales-ld-link" onClick={onAddresses}>
            Adresler
          </button>
        }
      >
        {!addressLoaded ? (
          <p className="sales-ld-muted">Yükleniyor…</p>
        ) : address ? (
          <p className="customer-ld-address">
            <span>{address.label}</span>
            <span>
              {address.addressLine}
              {address.district ? `, ${address.district}` : ""}
            </span>
            <span className="sales-ld-muted">
              {address.city}
              {address.postalCode ? ` · ${address.postalCode}` : ""} · {address.countryCode}
            </span>
          </p>
        ) : (
          <p className="sales-ld-muted">Varsayılan adres tanımlanmamış.</p>
        )}
      </SalesPanelSection>
      <SalesPanelSection title="İlgili kayıtlar">
        <div className="customer-ld-related">
          <button type="button" onClick={onLedger}>
            <span>Cari Hesap Hareketleri</span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          {customer.type !== "Supplier" && (
            <button type="button" onClick={onInvoices}>
              <span>Satış faturaları</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          )}
          {customer.type !== "Customer" && (
            <button type="button" onClick={onPurchaseInvoices}>
              <span>Alış faturaları</span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          )}
          <button type="button" onClick={onFields}>
            <span>Özel alanlar</span>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </SalesPanelSection>
      <p className="customer-ld-hint">
        <b>İşlemler</b> <span>(Alt+İ)</span> <span>— yeni sipariş, teklif, irsaliye, fatura ve pasife alma</span>
      </p>
    </SalesListDetailPanel>
  );
}
