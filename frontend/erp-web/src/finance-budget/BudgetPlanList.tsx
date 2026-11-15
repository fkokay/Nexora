import { RefreshCw } from "lucide-react";
import { ListChipGroup } from "../list-page/ListToolbar";
import type { Plan, PlanView } from "./types";

type Props = {
  plans: Plan[];
  /** "" (all), "Draft" or "Approved"; narrows the listed plans. */
  statusFilter?: string;
  onStatusFilterChange: (value: string) => void;
  selected: PlanView | null;
  editing: boolean;
  loading: boolean;
  loadError: string;
  controlsLocked: boolean;
  admin: boolean;
  baseCurrency: string;
  openingPlanId: string;
  onOpen: (plan: Plan) => void;
  onNew: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  money: (amount: number, currency?: string) => string;
};

/** Actual as a share of the plan; null when there is nothing planned or the currencies differ. */
export function budgetUsage(plan: Plan, baseCurrency: string) {
  if (plan.plannedTotal <= 0 || plan.currencyCode !== baseCurrency) return null;
  return plan.actualTotal / plan.plannedTotal;
}

/** Budget list column: status chips and one row per scenario with its plan/actual usage. */
export default function BudgetPlanList({
  plans,
  statusFilter = "",
  onStatusFilterChange,
  selected,
  editing,
  loading,
  loadError,
  controlsLocked,
  admin,
  baseCurrency,
  openingPlanId,
  onOpen,
  onNew,
  onRetry,
  onRefresh,
  money,
}: Props) {
  const visible = plans.filter(
    (plan) => !statusFilter || isApproved(plan.status) === (statusFilter === "Approved"),
  );
  return (
    <aside className="cf-list-column" aria-label="Bütçe senaryoları">
      <div className="cf-filters">
        <div className="cf-search-row">
          <ListChipGroup
            label="Durum"
            value={statusFilter}
            onChange={onStatusFilterChange}
            options={[
              { value: "", label: "Tümü", count: plans.length },
              { value: "Draft", label: "Taslak", count: plans.filter((plan) => !isApproved(plan.status)).length },
              { value: "Approved", label: "Onaylı", count: plans.filter((plan) => isApproved(plan.status)).length },
            ]}
          />
          <button
            type="button"
            className="list-v2-icon-button"
            onClick={() => {
              if (!controlsLocked) onRefresh();
            }}
            aria-label="Bütçeleri yenile"
            title="Yenile"
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      {loading && plans.length === 0 ? (
        <p className="fh-empty" role="status">
          Bütçe senaryoları yükleniyor…
        </p>
      ) : loadError ? (
        <div className="cf-empty" role="alert">
          <strong>Bütçe senaryoları yüklenemedi</strong>
          <span>{loadError}</span>
          <button type="button" className="secondary small-button" onClick={onRetry} disabled={controlsLocked}>
            Yeniden dene
          </button>
        </div>
      ) : plans.length === 0 ? (
        <div className="cf-empty">
          <strong>Henüz bütçe senaryosu yok</strong>
          <span>
            {admin
              ? "İlk bütçe taslağınızı oluşturarak başlayın."
              : "Firma yöneticisi bir bütçe senaryosu oluşturduğunda burada görünür."}
          </span>
          {admin && (
            <button type="button" className="secondary small-button" onClick={onNew} disabled={controlsLocked}>
              İlk bütçeyi oluştur
            </button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="cf-empty">
          <strong>Bu durumda bütçe yok.</strong>
          <button type="button" className="secondary small-button" onClick={() => onStatusFilterChange("")}>
            Tümünü göster
          </button>
        </div>
      ) : (
        <ul className="cf-items">
          {visible.map((plan) => {
            const active = selected?.plan.id === plan.id && !editing;
            const usage = budgetUsage(plan, baseCurrency);
            return (
              <li key={plan.id}>
                <button
                  type="button"
                  className={`cf-item${active ? " is-selected" : ""}`}
                  onClick={() => onOpen(plan)}
                  disabled={controlsLocked}
                  aria-pressed={active}
                >
                  <span className="cf-item-top">
                    <b>{plan.name}</b>
                    <span className={`cf-state${isApproved(plan.status) ? " is-active" : ""}`}>
                      {planStatus(plan.status)}
                    </span>
                  </span>
                  <span className="cf-item-meta">
                    {plan.fiscalYear} · {plan.currencyCode} · {plan.lineCount} satır
                  </span>
                  <span className="cf-item-usage">
                    <span>
                      {money(plan.actualTotal, baseCurrency)} / {money(plan.plannedTotal, plan.currencyCode)}
                    </span>
                    <b>
                      {usage === null
                        ? "—"
                        : `%${(usage * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`}
                    </b>
                  </span>
                  <span className="cf-bar" aria-hidden="true">
                    <i style={{ width: `${Math.min(1, Math.max(0, usage ?? 0)) * 100}%` }} />
                  </span>
                  {openingPlanId === plan.id && (
                    <span className="cf-item-meta" role="status">
                      Açılıyor…
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

export function isApproved(status: Plan["status"]) {
  return status === 2 || status === "Approved";
}
export function planStatus(status: Plan["status"]) {
  return isApproved(status) ? "Onaylı" : status === 1 || status === "Draft" ? "Taslak" : String(status);
}
