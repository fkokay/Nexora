import { RefreshCw, Search } from "lucide-react";
import { ListChipGroup } from "../../list-page/ListToolbar";
import { DetailTabs } from "../../document-detail/DocumentDetailLayout";
import SalesRowActionsMenu from "../../sales/components/SalesRowActionsMenu";
import {
  dateLabel,
  type Contract,
  type ContractStatus,
  type ContractType,
  type Detail,
  type Translate,
} from "../types";

export type ContractTab = "summary" | "history";

export const contractStatuses: ContractStatus[] = [
  "Draft",
  "Active",
  "Suspended",
  "Completed",
  "Terminated",
  "Cancelled",
];

/** Status changes the API accepts from each status (unchanged from the former detail modal). */
export function availableTransitions(status: ContractStatus): ContractStatus[] {
  return status === "Draft"
    ? ["Active", "Cancelled"]
    : status === "Active"
      ? ["Suspended", "Completed", "Terminated"]
      : status === "Suspended"
        ? ["Active", "Completed", "Terminated"]
        : [];
}

/** Terminating and cancelling are kept out of the visible buttons, in the "…" menu. */
const isMenuTransition = (status: ContractStatus) =>
  status === "Terminated" || status === "Cancelled";

const isOpenStatus = (status: ContractStatus) =>
  status === "Draft" || status === "Active" || status === "Suspended";

const ENDING_SOON_DAYS = 30;

const day = (value: string) => value.slice(0, 10);

/** Whole calendar days between two yyyy-mm-dd dates (b - a). */
function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(`${day(b)}T00:00:00Z`) - Date.parse(`${day(a)}T00:00:00Z`)) / 86_400_000,
  );
}

/** Share of the validity window that has elapsed today (0 before start, 1 after the end). */
function elapsedShare(contract: Contract, today: string) {
  const span = daysBetween(contract.effectiveFrom, contract.effectiveThrough) + 1;
  const elapsed = daysBetween(contract.effectiveFrom, today) + 1;
  return span > 0 ? Math.min(1, Math.max(0, elapsed / span)) : 1;
}

function stateClass(status: ContractStatus) {
  return status === "Active" ? " is-active" : status === "Suspended" ? " is-warning" : "";
}

type Props = {
  contracts: Contract[];
  visibleContracts: Contract[];
  selected: Contract | null;
  /** Detail of the selected contract; null while it is loading. */
  detail: Detail | null;
  detailLoading: boolean;
  loading: boolean;
  today: string;
  tab: ContractTab;
  search: string;
  typeFilter: ContractType | "";
  statusFilter: ContractStatus | "";
  labels: Record<ContractStatus, string>;
  en: boolean;
  canEdit: boolean;
  busy: boolean;
  tx: Translate;
  onSearchChange: (value: string) => void;
  onTypeFilterChange: (value: ContractType | "") => void;
  onStatusFilterChange: (value: ContractStatus | "") => void;
  onRefresh: () => void;
  onSelect: (contract: Contract) => void;
  onTabChange: (tab: ContractTab) => void;
  onTransition: (status: ContractStatus) => void;
  onClearFilters: () => void;
  onCreate: () => void;
};

export default function ContractRegister(props: Props) {
  const { contracts, visibleContracts, selected, today, tx, labels, en } = props;
  // Status counts follow the type and search filters, never the status filter itself.
  const normalizedSearch = props.search.trim().toLocaleLowerCase("tr-TR");
  const counts = Object.fromEntries(contractStatuses.map((status) => [status, 0])) as Record<
    ContractStatus,
    number
  >;
  for (const contract of contracts)
    if (
      (!props.typeFilter || contract.type === props.typeFilter) &&
      `${contract.code} ${contract.counterpartyName}`
        .toLocaleLowerCase("tr-TR")
        .includes(normalizedSearch)
    )
      counts[contract.status] += 1;
  return (
    <div className="cf-layout ctr-layout">
      <aside className="cf-list-column" aria-label={tx("Sözleşme listesi")}>
        <div className="cf-filters">
          <div className="cf-search-row">
            <label className="cf-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={props.search}
                onChange={(event) => props.onSearchChange(event.target.value)}
                placeholder={tx("Kod veya cari ara")}
                aria-label={tx("Sözleşme ara")}
              />
            </label>
            <button
              type="button"
              className="list-v2-icon-button"
              onClick={props.onRefresh}
              disabled={props.loading}
              aria-label={tx("Sözleşmeleri yenile")}
              title={tx("Yenile")}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <ListChipGroup
            label={tx("Tür filtresi")}
            value={props.typeFilter}
            onChange={(value) => props.onTypeFilterChange(value as ContractType | "")}
            options={[
              { value: "", label: tx("Tüm türler") },
              { value: "Sales", label: tx("Satış") },
              { value: "Purchase", label: tx("Satın alma") },
            ]}
          />
          <ListChipGroup
            label={tx("Durum filtresi")}
            value={props.statusFilter}
            allowClear
            onChange={(value) => props.onStatusFilterChange(value as ContractStatus | "")}
            options={contractStatuses.map((status) => ({
              value: status,
              label: labels[status],
              count: counts[status],
            }))}
          />
        </div>
        {props.loading && contracts.length === 0 ? (
          <div className="cf-empty" role="status" aria-live="polite">
            <span>{tx("Sözleşmeler yükleniyor…")}</span>
          </div>
        ) : contracts.length === 0 ? (
          <div className="cf-empty">
            <strong>{tx("Henüz sözleşme bulunmuyor.")}</strong>
            <span>
              {props.canEdit
                ? tx("İlk sözleşmeyi cari hesap ve geçerlilik tarihleriyle taslak olarak oluşturun.")
                : tx("Sözleşmeler firma yöneticisi tarafından oluşturulur.")}
            </span>
            {props.canEdit && (
              <button type="button" className="secondary small-button" onClick={props.onCreate}>
                {tx("Yeni sözleşme")}
              </button>
            )}
          </div>
        ) : visibleContracts.length === 0 ? (
          <div className="cf-empty" role="status">
            <strong>{tx("Seçili filtrelerle eşleşen sözleşme bulunamadı.")}</strong>
            <button type="button" className="secondary small-button" onClick={props.onClearFilters}>
              {tx("Filtreleri temizle")}
            </button>
          </div>
        ) : (
          <ul className="cf-items" aria-busy={props.loading}>
            {visibleContracts.map((contract) => {
              const open = isOpenStatus(contract.status);
              const daysLeft = daysBetween(today, contract.effectiveThrough);
              const endingSoon =
                contract.status === "Active" &&
                day(contract.effectiveFrom) <= today &&
                daysLeft >= 0 &&
                daysLeft <= ENDING_SOON_DAYS;
              const isSelected = selected?.id === contract.id;
              return (
                <li key={contract.id}>
                  <button
                    type="button"
                    className={`cf-item ctr-item${isSelected ? " is-selected" : ""}${open ? "" : " is-closed"}`}
                    aria-pressed={isSelected}
                    onClick={() => props.onSelect(contract)}
                  >
                    <span className="cf-item-top">
                      <b>{contract.code}</b>
                      <span className={`cf-state${stateClass(contract.status)}`}>
                        {labels[contract.status]}
                      </span>
                    </span>
                    <span className="cf-item-meta ctr-party">
                      {contract.type === "Sales" ? tx("Satış") : tx("Satın alma")} ·{" "}
                      {contract.counterpartyName}
                    </span>
                    <span className="cf-item-meta">
                      {dateLabel(contract.effectiveFrom, en)} – {dateLabel(contract.effectiveThrough, en)}
                      {open && (
                        <>
                          {" · "}
                          <span className={endingSoon ? "ctr-soon" : undefined}>
                            {validityText(contract, today, tx, en)}
                          </span>
                        </>
                      )}
                    </span>
                    <span
                      className={`cf-bar${endingSoon ? " is-warning" : ""}${open ? "" : " is-muted"}`}
                      aria-hidden="true"
                    >
                      <i style={{ width: `${elapsedShare(contract, today) * 100}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      {selected ? (
        <section className="cf-detail" aria-labelledby={`contract-${selected.id}`}>
          <ContractDetail {...props} contract={selected} />
        </section>
      ) : (
        <section className="cf-detail">
          <p className="ctr-placeholder">
            {tx("Ayrıntıları görmek için soldan bir sözleşme seçin.")}
          </p>
        </section>
      )}
    </div>
  );
}

/** "N gün kaldı" inside the validity window, otherwise when it starts or that it has ended. */
function validityText(contract: Contract, today: string, tx: Translate, en: boolean) {
  if (day(contract.effectiveFrom) > today) {
    const days = daysBetween(today, contract.effectiveFrom);
    return en ? `starts in ${days} days` : `${days} gün sonra başlıyor`;
  }
  const daysLeft = daysBetween(today, contract.effectiveThrough);
  if (daysLeft < 0) return tx("süresi doldu");
  if (daysLeft === 0) return tx("bugün bitiyor");
  return en ? `${daysLeft} days left` : `${daysLeft} gün kaldı`;
}

function transitionLabel(next: ContractStatus, current: ContractStatus, tx: Translate) {
  return next === "Active"
    ? current === "Suspended"
      ? tx("Yeniden etkinleştir")
      : tx("Etkinleştir")
    : next === "Suspended"
      ? tx("Askıya al")
      : next === "Completed"
        ? tx("Tamamlandı olarak işaretle")
        : next === "Terminated"
          ? tx("Feshet")
          : tx("İptal et");
}

function sourceLabel(contract: Contract, tx: Translate) {
  if (contract.salesQuoteId) return { kind: tx("Satış teklifi"), id: contract.salesQuoteId };
  if (contract.salesOrderId) return { kind: tx("Satış siparişi"), id: contract.salesOrderId };
  if (contract.purchaseSupplierQuoteId)
    return { kind: tx("Tedarikçi teklifi"), id: contract.purchaseSupplierQuoteId };
  if (contract.purchaseOrderId) return { kind: tx("Satın alma siparişi"), id: contract.purchaseOrderId };
  return null;
}

function ContractDetail({
  contract: listContract,
  detail,
  detailLoading,
  today,
  tab,
  labels,
  en,
  canEdit,
  busy,
  tx,
  onTabChange,
  onTransition,
}: Props & { contract: Contract }) {
  // The loaded detail is authoritative once it belongs to the selected contract.
  const ready = detail?.contract.id === listContract.id;
  const c = ready ? detail.contract : listContract;
  const transitions = ready ? detail.transitions : [];
  const next = availableTransitions(c.status);
  const buttons = next.filter((status) => !isMenuTransition(status));
  const menu = next.filter(isMenuTransition);
  const actionsDisabled = busy || !ready || detailLoading;
  const source = sourceLabel(c, tx);
  const open = isOpenStatus(c.status);
  return (
    <>
      <header className="cf-detail-head">
        <div className="cf-detail-title">
          <h2 id={`contract-${c.id}`}>{c.code}</h2>
          <span className={`cf-state ctr-state-lg${stateClass(c.status)}`}>
            {labels[c.status]} · v{c.revision}
          </span>
        </div>
        <p className="cf-detail-sub">
          {c.type === "Sales" ? tx("Satış sözleşmesi") : tx("Satın alma sözleşmesi")} · {c.currencyCode}
        </p>
        {canEdit && next.length > 0 && (
          <div className="cf-detail-actions">
            {buttons.map((status) => (
              <button
                type="button"
                key={status}
                className="secondary"
                disabled={actionsDisabled}
                onClick={() => onTransition(status)}
              >
                {transitionLabel(status, c.status, tx)}
              </button>
            ))}
            {menu.length > 0 && (
              <SalesRowActionsMenu label={c.code}>
                {menu.map((status) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={status}
                    className="sales-row-menu-item danger-action"
                    disabled={actionsDisabled}
                    onClick={() => onTransition(status)}
                  >
                    {transitionLabel(status, c.status, tx)}
                  </button>
                ))}
              </SalesRowActionsMenu>
            )}
          </div>
        )}
      </header>
      <DetailTabs<ContractTab>
        label={tx("Sözleşme ayrıntıları")}
        value={tab}
        onChange={onTabChange}
        tabs={[
          { key: "summary", label: tx("Özet") },
          {
            key: "history",
            label: tx("Durum geçmişi"),
            ...(ready ? { count: transitions.length } : {}),
          },
        ]}
      />
      <div className="cf-tabbody" role="tabpanel" aria-busy={detailLoading}>
        {tab === "summary" && (
          <>
            <dl className="cf-info">
              <div className="is-emphasis">
                <dt>{tx("Cari hesap")}</dt>
                <dd>{c.counterpartyName}</dd>
              </div>
              <div>
                <dt>{tx("Geçerlilik")}</dt>
                <dd>
                  {dateLabel(c.effectiveFrom, en)} – {dateLabel(c.effectiveThrough, en)}
                  {open && <small className="ctr-dd-note">{validityText(c, today, tx, en)}</small>}
                </dd>
              </div>
              <div>
                <dt>{tx("Para birimi")}</dt>
                <dd>{c.currencyCode}</dd>
              </div>
              <div>
                <dt>{tx("Sürüm")}</dt>
                <dd>v{c.revision}</dd>
              </div>
              <div>
                <dt>{tx("Kaynak belge")}</dt>
                <dd>
                  {source ? (
                    <>
                      {source.kind}
                      <small className="ctr-dd-note ctr-mono" title={source.id}>
                        {source.id}
                      </small>
                    </>
                  ) : (
                    tx("Bağlı teklif veya sipariş yok")
                  )}
                </dd>
              </div>
            </dl>
            {!canEdit && next.length > 0 && (
              <p className="ctr-hint">
                {tx("Oluşturma ve durum değiştirme işlemleri firma yöneticisine açıktır.")}
              </p>
            )}
          </>
        )}
        {tab === "history" &&
          (!ready ? (
            <p className="ctr-hint" role="status">
              {detailLoading ? tx("Kayıtlar alınıyor…") : tx("Durum geçmişi alınamadı.")}
            </p>
          ) : transitions.length === 0 ? (
            <p className="ctr-hint">{tx("Henüz durum değişikliği yapılmadı.")}</p>
          ) : (
            <ol className="ctr-history" aria-label={tx("Sözleşme durum değişiklikleri")}>
              {transitions.map((item) => (
                <li key={item.id}>
                  <span className="ctr-history-dot" aria-hidden="true" />
                  <div>
                    <b>
                      {labels[item.fromStatus as ContractStatus] || item.fromStatus} →{" "}
                      {labels[item.toStatus as ContractStatus] || item.toStatus}
                    </b>
                    <small>
                      <time dateTime={item.changedAt}>
                        {new Date(item.changedAt).toLocaleString(en ? "en-US" : "tr-TR")}
                      </time>
                      {item.reason ? ` · ${item.reason}` : ""}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          ))}
      </div>
    </>
  );
}
