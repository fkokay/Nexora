import type { FormEvent, ReactNode } from "react";
import { formatAmount, formatDate } from "../../document-detail/DocumentDetailLayout";
import { RecordFieldChange, RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import { campaignState, campaignStateLabels, daysBetween } from "../campaignState";
import { CampaignStatusTag } from "./CampaignDefinitionList";
import type { Campaign, Performance, Quote } from "./types";
import "../../sales/sales-record-forms.css";

export type CampaignDraft = { code: string; name: string; percent: string; from: string; through: string };
export type CampaignDraftKey = keyof CampaignDraft;

/** Whether a draft field differs from the baseline (the percent compares as a number, the code upper-cased). */
export function campaignFieldChanged(key: CampaignDraftKey, draft: CampaignDraft, base: CampaignDraft) {
  if (key === "percent") return Number(draft.percent) !== Number(base.percent);
  if (key === "code") return draft.code.trim().toUpperCase() !== base.code.trim().toUpperCase();
  if (key === "name") return draft.name.trim() !== base.name.trim();
  return draft[key] !== base[key];
}

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
  mode: "create" | "edit";
  /** The open campaign (edit). */
  current?: Campaign;
  draft: CampaignDraft;
  /** Loaded values (edit): previous values of changed fields. */
  baseline: CampaignDraft | null;
  changedCount: number;
  /** TenantAdmin: the fields can be changed and saved. */
  admin: boolean;
  busy: boolean;
  error: string;
  saveDisabledReason?: string;
  formId: string;
  today: string;
  performance?: Performance;
  quotes: Quote[];
  quoteId: string;
  applySelectId: string;
  onDismissError: () => void;
  onChange: (draft: CampaignDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onQuoteChange: (quoteId: string) => void;
  onApply: () => void;
};

/** Right-hand form of the Kampanyalar definition screen: identity, discount and validity, then (edit) the results and Teklife uygula. */
export function CampaignDefinitionForm(p: Props) {
  const edit = p.mode === "edit";
  const c = p.current;
  const set = (patch: Partial<CampaignDraft>) => p.onChange({ ...p.draft, ...patch });
  const changed = (key: CampaignDraftKey) => !!p.baseline && campaignFieldChanged(key, p.draft, p.baseline);
  const wrap = (key: CampaignDraftKey, previous: ReactNode, control: ReactNode) =>
    edit ? (
      <RecordFieldChange changed={changed(key)} previous={previous}>
        {control}
      </RecordFieldChange>
    ) : (
      control
    );
  const readOnly = !p.admin;
  return (
    <section className="inv-rf-embedded kmp-rf-embedded">
      <RecordFormPage
        variant="dialog"
        className="sales-rf"
        title={edit && c ? c.name : "Kampanya oluştur"}
        subtitle={
          edit && c ? (
            <>
              <span className="rf-code">{c.code}</span>
              <CampaignStatusTag campaign={c} today={p.today} />
            </>
          ) : undefined
        }
        mode={p.mode}
        busy={p.busy}
        saveLabel={edit ? "Değişiklikleri kaydet" : "Kampanya oluştur"}
        formId={p.formId}
        saveDisabledReason={p.saveDisabledReason}
        dirty={edit ? p.changedCount : undefined}
        onSubmit={p.onSubmit}
        onCancel={p.onCancel}
        error={p.error}
        onDismissError={p.onDismissError}
        status={
          <>
            <span>İndirim tutarları sunucuda hesaplanır.</span>
            <span className="rf-status-end">Yönetim işlemleri firma yöneticisi yetkisi gerektirir.</span>
          </>
        }
      >
        <RecordFormGroup title="Kampanya Kimliği" bodyClassName="rf-identity sales-rf-identity-2">
          {wrap(
            "code",
            p.baseline?.code,
            <label>
              <span>
                Kampanya kodu <RequiredMark />
              </span>
              <input
                className="rf-must rf-mono"
                value={p.draft.code}
                onChange={(event) => set({ code: event.target.value.toUpperCase() })}
                required
                maxLength={40}
                disabled={readOnly}
              />
            </label>,
          )}
          {wrap(
            "name",
            p.baseline?.name,
            <label>
              <span>
                Kampanya adı <RequiredMark />
              </span>
              <input
                className="rf-must"
                value={p.draft.name}
                onChange={(event) => set({ name: event.target.value })}
                required
                maxLength={120}
                disabled={readOnly}
              />
            </label>,
          )}
        </RecordFormGroup>
        <RecordFormGroup title="İndirim ve Geçerlilik" bodyClassName="sales-rf-triple">
          {wrap(
            "percent",
            p.baseline ? `%${Number(p.baseline.percent).toLocaleString("tr-TR")}` : null,
            <label>
              <span>
                İndirim yüzdesi <RequiredMark />
              </span>
              <input
                className="rf-num"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={p.draft.percent}
                onChange={(event) => set({ percent: event.target.value })}
                required
                disabled={readOnly}
              />
            </label>,
          )}
          {wrap(
            "from",
            p.baseline ? formatDate(p.baseline.from) : null,
            <label>
              <span>
                Başlangıç tarihi <RequiredMark />
              </span>
              <input type="date" value={p.draft.from} onChange={(event) => set({ from: event.target.value })} required disabled={readOnly} />
            </label>,
          )}
          {wrap(
            "through",
            p.baseline ? formatDate(p.baseline.through) : null,
            <label>
              <span>
                Bitiş tarihi <RequiredMark />
              </span>
              <input
                type="date"
                value={p.draft.through}
                onChange={(event) => set({ through: event.target.value })}
                required
                disabled={readOnly}
              />
            </label>,
          )}
        </RecordFormGroup>
        {edit && c && <CampaignResults campaign={c} performance={p.performance} today={p.today} />}
        {edit && c && (
          <CampaignApply
            campaign={c}
            quotes={p.quotes}
            today={p.today}
            busy={p.busy}
            quoteId={p.quoteId}
            selectId={p.applySelectId}
            onQuoteChange={p.onQuoteChange}
            onApply={p.onApply}
          />
        )}
      </RecordFormPage>
    </section>
  );
}

/** The former Özet / Performans tabs: today's validity and the campaign's all-time results (read-only). */
function CampaignResults({ campaign: c, performance, today }: { campaign: Campaign; performance?: Performance; today: string }) {
  const state = campaignState(c, today);
  const daysLeft = daysBetween(today, c.effectiveThrough);
  const validity =
    state === "current"
      ? daysLeft === 0
        ? "bugün bitiyor"
        : `${daysLeft} gün kaldı`
      : state === "planned"
        ? `${daysBetween(today, c.effectiveFrom)} gün sonra başlıyor`
        : campaignStateLabels[state].toLocaleLowerCase("tr-TR");
  return (
    <RecordFormGroup title="Performans">
      <dl className="list-v2-facts kmp-facts">
        <div>
          <dt>Durum</dt>
          <dd>{validity}</dd>
        </div>
        <div>
          <dt>Uygulama</dt>
          <dd>{performance?.applications ?? c.applicationCount}</dd>
        </div>
        <div>
          <dt>Uygulanan teklif</dt>
          <dd>{performance?.appliedQuotes ?? 0}</dd>
        </div>
        <div>
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
    </RecordFormGroup>
  );
}

/**
 * The former Teklife uygula tab. It sits inside the campaign form, so it is not a form of its own (no nested form,
 * and an empty quote choice never blocks Kaydet): the button applies the chosen quote.
 */
function CampaignApply({
  campaign: c,
  quotes,
  today,
  busy,
  quoteId,
  selectId,
  onQuoteChange,
  onApply,
}: {
  campaign: Campaign;
  quotes: Quote[];
  today: string;
  busy: boolean;
  quoteId: string;
  selectId: string;
  onQuoteChange: (quoteId: string) => void;
  onApply: () => void;
}) {
  const state = campaignState(c, today);
  const eligible = quotes.filter((quote) => quote.quoteDate >= c.effectiveFrom && quote.quoteDate <= c.effectiveThrough);
  const hint =
    state === "current"
      ? `Uygun taslak teklif: ${eligible.length}. Teklif tarihi kampanya aralığında olmalı ve en az bir satır içermelidir.`
      : state === "planned"
        ? "Kampanya başlangıç tarihinden önce tekliflere uygulanamaz."
        : state === "expired"
          ? "Geçerlilik süresi dolduğu için kampanya yeni tekliflere uygulanamaz; geçmiş sonuçlar korunur."
          : "Pasif kampanya tekliflere uygulanamaz; etkinleştirildiğinde yeniden kullanılabilir.";
  return (
    <RecordFormGroup title="Teklife uygula" hint={state === "current" ? eligible.length : undefined}>
      {state !== "current" ? (
        <p className="kmp-hint">Yalnızca bugün geçerli ve etkin kampanyalar tekliflere uygulanabilir. {hint}</p>
      ) : eligible.length === 0 ? (
        <p className="kmp-hint">
          <strong>Uygun taslak teklif yok.</strong>{" "}
          {`Teklif tarihi ${formatDate(c.effectiveFrom)} – ${formatDate(c.effectiveThrough)} aralığında, taslak durumda ve en az bir satırlı olmalıdır.`}
        </p>
      ) : (
        <div className="kmp-apply">
          <label>
            <span>Taslak teklif</span>
            <select id={selectId} value={quoteId} onChange={(event) => onQuoteChange(event.target.value)}>
              <option value="">Teklif seçin</option>
              {eligible.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {quote.code} · {quote.customerName} · {formatDate(quote.quoteDate)} · {formatAmount(quote.grandTotal)}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary" disabled={busy || !quoteId} onClick={onApply}>
            {busy ? "Uygulanıyor…" : `%${c.discountPercent.toLocaleString("tr-TR")} indirimi uygula`}
          </button>
          <small>Kampanya aynı teklife bir kez uygulanabilir. {hint}</small>
        </div>
      )}
    </RecordFormGroup>
  );
}
