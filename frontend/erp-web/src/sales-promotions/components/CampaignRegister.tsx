import type { FormEvent, ReactNode } from "react";
import { RefreshCw, Search } from "lucide-react";
import { ListChipGroup } from "../../list-page/ListToolbar";
import {
  DetailTabs,
  formatAmount,
  formatDate,
} from "../../document-detail/DocumentDetailLayout";
import SalesRowActionsMenu from "../../sales/components/SalesRowActionsMenu";
import type { Campaign, Performance, Quote } from "./types";

export type CampaignTab = "summary" | "performance" | "apply";
export type CampaignState = "current" | "planned" | "expired" | "inactive";

const stateLabels: Record<CampaignState, string> = {
  current: "Geçerli",
  planned: "Planlanan",
  expired: "Süresi doldu",
  inactive: "Pasif",
};

export const campaignStateLabel = (state: CampaignState) => stateLabels[state];

/** Whether the campaign is usable today: passive wins, then the date range decides. */
export function campaignState(campaign: Campaign, today: string): CampaignState {
  if (!campaign.isActive) return "inactive";
  if (campaign.effectiveFrom > today) return "planned";
  if (campaign.effectiveThrough < today) return "expired";
  return "current";
}

/** Whole calendar days between two yyyy-mm-dd dates (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Share of the validity window that has elapsed today (0 before start, 1 after the end). */
function elapsedShare(campaign: Campaign, today: string) {
  const span = daysBetween(campaign.effectiveFrom, campaign.effectiveThrough) + 1;
  const elapsed = daysBetween(campaign.effectiveFrom, today) + 1;
  return span > 0 ? Math.min(1, Math.max(0, elapsed / span)) : 1;
}

export const ENDING_SOON_DAYS = 7;

/** Amounts are listed per currency; they are never summed across currencies. */
function Totals({ rows }: { rows: { currencyCode: string; amount: number }[] }) {
  if (!rows.length) return <>—</>;
  return (
    <>
      {rows.map((row, index) => (
        <span key={row.currencyCode}>
          {index > 0 && " · "}
          {formatAmount(row.amount, row.currencyCode)}
        </span>
      ))}
    </>
  );
}

type Props = {
  campaigns: Campaign[];
  visibleCampaigns: Campaign[];
  selected: Campaign | null;
  performanceById: Map<string, Performance>;
  quotes: Quote[];
  today: string;
  tab: CampaignTab;
  search: string;
  stateFilter: CampaignState | "";
  admin: boolean;
  busy: boolean;
  quoteId: string;
  onSearchChange: (value: string) => void;
  onStateFilterChange: (value: CampaignState | "") => void;
  onRefresh: () => void;
  onSelect: (campaign: Campaign) => void;
  onTabChange: (tab: CampaignTab) => void;
  onEdit: (campaign: Campaign) => void;
  onToggleStatus: (campaign: Campaign) => void;
  onQuoteChange: (quoteId: string) => void;
  onApply: (event: FormEvent) => void;
  onClearFilters: () => void;
  onCreate: () => void;
};

export function CampaignRegister(props: Props) {
  const { campaigns, visibleCampaigns, selected, today } = props;
  const counts = { current: 0, planned: 0, expired: 0, inactive: 0 } as Record<CampaignState, number>;
  for (const campaign of campaigns) counts[campaignState(campaign, today)] += 1;
  return (
    <div className="cf-layout kmp-layout">
      <aside className="cf-list-column" aria-label="Kampanyalar">
        <div className="cf-filters">
          <div className="cf-search-row">
            <label className="cf-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                value={props.search}
                onChange={(event) => props.onSearchChange(event.target.value)}
                placeholder="Kod veya kampanya adı"
                aria-label="Kampanya ara"
              />
            </label>
            <button
              type="button"
              className="list-v2-icon-button"
              onClick={props.onRefresh}
              aria-label="Kampanyaları yenile"
              title="Yenile"
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <ListChipGroup
            label="Durum"
            value={props.stateFilter}
            allowClear
            onChange={(value) => props.onStateFilterChange(value as CampaignState | "")}
            options={(Object.keys(stateLabels) as CampaignState[]).map((state) => ({
              value: state,
              label: stateLabels[state],
              count: counts[state],
            }))}
          />
        </div>
        {campaigns.length === 0 ? (
          <div className="cf-empty">
            <strong>Henüz kampanya tanımlanmadı.</strong>
            <span>
              {props.admin
                ? "İlk kampanyayı tarih aralığı ve indirim oranıyla oluşturun."
                : "Kampanyalar firma yöneticisi tarafından tanımlanır."}
            </span>
            {props.admin && (
              <button type="button" className="secondary small-button" onClick={props.onCreate}>
                Kampanya oluştur
              </button>
            )}
          </div>
        ) : visibleCampaigns.length === 0 ? (
          <div className="cf-empty">
            <strong>Filtrelerle eşleşen kampanya yok.</strong>
            <button type="button" className="secondary small-button" onClick={props.onClearFilters}>
              Filtreleri temizle
            </button>
          </div>
        ) : (
          <ul className="cf-items">
            {visibleCampaigns.map((campaign) => {
              const state = campaignState(campaign, today);
              const daysLeft = daysBetween(today, campaign.effectiveThrough);
              const endingSoon = state === "current" && daysLeft <= ENDING_SOON_DAYS;
              return (
                <li key={campaign.id}>
                  <button
                    type="button"
                    className={`cf-item kmp-item${selected?.id === campaign.id ? " is-selected" : ""}${state === "current" ? "" : " is-closed"}`}
                    aria-pressed={selected?.id === campaign.id}
                    onClick={() => props.onSelect(campaign)}
                  >
                    <span className="cf-item-top">
                      <b>{campaign.name}</b>
                      <span className="kmp-percent">%{campaign.discountPercent.toLocaleString("tr-TR")}</span>
                    </span>
                    <span className="cf-item-meta">
                      {campaign.code} · {formatDate(campaign.effectiveFrom)} – {formatDate(campaign.effectiveThrough)}
                    </span>
                    <span className="cf-item-usage">
                      <StateBadge state={state} endingSoonDays={endingSoon ? daysLeft : null} />
                      <span>{`${campaign.applicationCount} uygulama`}</span>
                    </span>
                    <span className={`cf-bar${endingSoon ? " is-warning" : ""}`} aria-hidden="true">
                      <i style={{ width: `${elapsedShare(campaign, today) * 100}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      {selected ? (
        <section className="cf-detail" aria-labelledby={`campaign-${selected.id}`}>
          <CampaignDetail {...props} campaign={selected} />
        </section>
      ) : (
        <section className="cf-detail">
          <p className="fh-empty">Ayrıntıları görmek için soldan bir kampanya seçin.</p>
        </section>
      )}
    </div>
  );
}

function StateBadge({ state, endingSoonDays }: { state: CampaignState; endingSoonDays: number | null }) {
  if (endingSoonDays !== null)
    return (
      <span className="cf-state is-warning">
        {endingSoonDays === 0 ? "Bugün bitiyor" : `${endingSoonDays} gün kaldı`}
      </span>
    );
  return <span className={`cf-state${state === "current" ? " is-active" : ""}`}>{stateLabels[state]}</span>;
}

function CampaignDetail({
  campaign: c,
  performanceById,
  quotes,
  today,
  tab,
  admin,
  busy,
  quoteId,
  onTabChange,
  onEdit,
  onToggleStatus,
  onQuoteChange,
  onApply,
}: Props & { campaign: Campaign }) {
  const state = campaignState(c, today);
  const daysLeft = daysBetween(today, c.effectiveThrough);
  const performance = performanceById.get(c.id);
  const eligibleQuotes = quotes.filter(
    (quote) => quote.quoteDate >= c.effectiveFrom && quote.quoteDate <= c.effectiveThrough,
  );
  const validity: ReactNode =
    state === "current"
      ? daysLeft === 0
        ? "bugün bitiyor"
        : `${daysLeft} gün kaldı`
      : state === "planned"
        ? `${daysBetween(today, c.effectiveFrom)} gün sonra başlıyor`
        : stateLabels[state].toLocaleLowerCase("tr-TR");
  return (
    <>
      <header className="cf-detail-head">
        <div className="cf-detail-title">
          <h2 id={`campaign-${c.id}`}>{c.code}</h2>
          <StateBadge
            state={state}
            endingSoonDays={state === "current" && daysLeft <= ENDING_SOON_DAYS ? daysLeft : null}
          />
        </div>
        <p className="cf-detail-sub">
          {c.name} · %{c.discountPercent.toLocaleString("tr-TR")} indirim
        </p>
        <div className="cf-detail-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy || state !== "current"}
            title={state === "current" ? undefined : "Yalnızca bugün geçerli kampanyalar uygulanabilir."}
            onClick={() => onTabChange("apply")}
          >
            Teklife uygula
          </button>
          {admin && (
            <>
              <button type="button" className="secondary" disabled={busy} onClick={() => onEdit(c)}>
                Düzenle
              </button>
              <SalesRowActionsMenu label={c.code}>
                <button
                  type="button"
                  role="menuitem"
                  className={`sales-row-menu-item${c.isActive ? " danger-action" : ""}`}
                  disabled={busy}
                  onClick={() => onToggleStatus(c)}
                >
                  {c.isActive ? "Pasifleştir" : "Etkinleştir"}
                </button>
              </SalesRowActionsMenu>
            </>
          )}
        </div>
      </header>
      <DetailTabs<CampaignTab>
        label="Kampanya ayrıntıları"
        value={tab}
        onChange={onTabChange}
        tabs={[
          { key: "summary", label: "Özet" },
          { key: "performance", label: "Performans", count: performance?.appliedQuotes ?? c.applicationCount },
          { key: "apply", label: "Teklife uygula", count: state === "current" ? eligibleQuotes.length : 0 },
        ]}
      />
      <div className="cf-tabbody" role="tabpanel">
        {tab === "summary" && (
          <>
            <dl className="cf-info">
              <div className="is-emphasis">
                <dt>İndirim</dt>
                <dd>%{c.discountPercent.toLocaleString("tr-TR")}</dd>
              </div>
              <div>
                <dt>Geçerlilik</dt>
                <dd>
                  {formatDate(c.effectiveFrom)} – {formatDate(c.effectiveThrough)}
                </dd>
              </div>
              <div>
                <dt>Durum</dt>
                <dd>{validity}</dd>
              </div>
              <div>
                <dt>Uygulama</dt>
                <dd>{c.applicationCount}</dd>
              </div>
              <div>
                <dt>Verilen indirim</dt>
                <dd>
                  <Totals rows={performance?.discountTotals ?? []} />
                </dd>
              </div>
              <div>
                <dt>Bağlantılı sipariş</dt>
                <dd>
                  {performance?.linkedOrders ?? 0}
                  {performance?.linkedOrderTotals.length ? (
                    <>
                      {" · "}
                      <Totals rows={performance.linkedOrderTotals} />
                    </>
                  ) : null}
                </dd>
              </div>
            </dl>
            <p className="kmp-hint">
              {state === "current"
                ? `Uygun taslak teklif: ${eligibleQuotes.length}. Teklif tarihi kampanya aralığında olmalı ve en az bir satır içermelidir.`
                : state === "planned"
                  ? "Kampanya başlangıç tarihinden önce tekliflere uygulanamaz."
                  : state === "expired"
                    ? "Geçerlilik süresi dolduğu için kampanya yeni tekliflere uygulanamaz; geçmiş sonuçlar korunur."
                    : "Pasif kampanya tekliflere uygulanamaz; etkinleştirildiğinde yeniden kullanılabilir."}
            </p>
          </>
        )}
        {tab === "performance" && (
          <dl className="cf-info">
            <div>
              <dt>Uygulama</dt>
              <dd>{performance?.applications ?? c.applicationCount}</dd>
            </div>
            <div>
              <dt>Uygulanan teklif</dt>
              <dd>{performance?.appliedQuotes ?? 0}</dd>
            </div>
            <div className="is-emphasis">
              <dt>Verilen indirim</dt>
              <dd>
                <Totals rows={performance?.discountTotals ?? []} />
              </dd>
            </div>
            <div>
              <dt>Bağlantılı sipariş</dt>
              <dd>{performance?.linkedOrders ?? 0}</dd>
            </div>
            <div>
              <dt>Sipariş toplamı</dt>
              <dd>
                <Totals rows={performance?.linkedOrderTotals ?? []} />
              </dd>
            </div>
            <div>
              <dt>Dönüşüm</dt>
              <dd>
                {performance && performance.appliedQuotes > 0
                  ? `%${((performance.linkedOrders / performance.appliedQuotes) * 100).toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
                  : "—"}
              </dd>
            </div>
          </dl>
        )}
        {tab === "apply" &&
          (state !== "current" ? (
            <p className="kmp-hint">
              Yalnızca bugün geçerli ve etkin kampanyalar tekliflere uygulanabilir.
            </p>
          ) : eligibleQuotes.length === 0 ? (
            <div className="cf-empty">
              <strong>Uygun taslak teklif yok.</strong>
              <span>
                {`Teklif tarihi ${formatDate(c.effectiveFrom)} – ${formatDate(c.effectiveThrough)} aralığında, taslak durumda ve en az bir satırlı olmalıdır.`}
              </span>
            </div>
          ) : (
            <form className="kmp-apply" onSubmit={onApply}>
              <label>
                <span>Taslak teklif</span>
                <select value={quoteId} onChange={(event) => onQuoteChange(event.target.value)} required>
                  <option value="">Teklif seçin</option>
                  {eligibleQuotes.map((quote) => (
                    <option key={quote.id} value={quote.id}>
                      {quote.code} · {quote.customerName} · {formatDate(quote.quoteDate)} ·{" "}
                      {formatAmount(quote.grandTotal)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="primary" disabled={busy || !quoteId}>
                {busy ? "Uygulanıyor…" : `%${c.discountPercent.toLocaleString("tr-TR")} indirimi uygula`}
              </button>
              <small>Kampanya aynı teklife bir kez uygulanabilir.</small>
            </form>
          ))}
      </div>
    </>
  );
}
