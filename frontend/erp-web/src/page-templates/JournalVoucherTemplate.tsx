import { createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CanvasAnchorContext } from "../designer-canvas/anchorContext";
import { ANCHOR_ATTRIBUTE } from "../designer-canvas/canvasProtocol";
import { EditableGrid, type GridPicker } from "../custom-page/EditableGrid";
import { LookupInput, type LookupOption } from "../custom-page/LookupInput";
import { emptyGridState, gridReducer, type GridAction, type GridColumn, type GridDraft, type GridState } from "../custom-page/gridState";
import { api } from "../erpApi";
import { openWorkspacePage, setPageParams } from "../pageNavigation";
import { PageShell, type ShellAction } from "./PageShell";
import { loadDocumentModel, type ActivityRow, type DocumentModel } from "./documentApi";
import { visibleColumns, type BelgeComponent, type BelgeLayout } from "./documentTemplateModel";
import "./page-templates.css";

// Belge kalıbıyla yevmiye fişi (`muhasebe.fis`): taslak yok, kayıtla birlikte işlenir ve değişmez. Satış belgelerinden ayrı çizilir:
// satır = hesap + açıklama + borç ya da alacak; toplamlar sunucudan değil satırlardan toplanır.

export const JOURNAL_VOUCHER_CODE = "muhasebe.fis";
export const VOUCHER_PREVIEW_BLOCKED = "Önizlemede fiş kaydedilmez.";
export const VOUCHER_ADMIN_ONLY = "Yevmiye fişini firma yöneticisi kaydeder.";
export const MAX_VOUCHER_LINES = 100;
const MIN_VOUCHER_LINES = 2;

type VoucherLine = { lineNumber: number; accountId: string; accountCode: string; accountName: string; description: string; debit: number; credit: number };
type VoucherEntry = { id: string; code: string; entryDate: string; description: string; accountingBasis: string; lines: VoucherLine[] };
type VoucherDocument = {
  entry: VoucherEntry; totalDebit: number; totalCredit: number; difference: number; allowedTransitions: string[];
  activity: ActivityRow[]; activityStartedLate: boolean;
};
type Account = { id: string; code: string; name: string; isActive: boolean };
type Header = { code: string; entryDate: string; accountingBasis: string; description: string };

const BASES = [["TDHP", "Türkiye · TDHP"], ["IFRS", "IFRS düzeltme fişi"]] as const;
const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number) => `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`;
/** Tutar metni (virgül ya da nokta); boş ya da geçersizse 0. */
const amount = (value: string | boolean | undefined) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const cents = (value: number) => Math.round(value * 100);

/** Oturum belirtecinin rolü; okunamazsa boş (yazma yetkisi verilmez, sunucu zaten denetler). */
export function roleOfToken(token: string | undefined): string {
  try {
    const payload = token?.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
    const claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "="))) as { role?: unknown };
    const role = Array.isArray(claims.role) ? claims.role[0] : claims.role;
    return typeof role === "string" ? role : "";
  } catch { return ""; }
}

const headerOf = (doc: VoucherDocument | null): Header => doc
  ? { code: doc.entry.code, entryDate: doc.entry.entryDate, accountingBasis: doc.entry.accountingBasis, description: doc.entry.description }
  : { code: "", entryDate: today(), accountingBasis: "TDHP", description: "" };

function rowsOf(doc: VoucherDocument | null): GridState {
  const state = emptyGridState();
  const filled: GridDraft[] = (doc?.entry.lines ?? []).map((line) => ({
    key: `satir-${line.lineNumber}`,
    cells: { accountId: line.accountId, description: line.description, debit: line.debit ? String(line.debit) : "", credit: line.credit ? String(line.credit) : "" },
    labels: { accountId: `${line.accountCode} · ${line.accountName}` },
  }));
  // Yeni fişte en az iki satır hazır gelir.
  const rows = filled.length > 0 ? filled
    : Array.from({ length: MIN_VOUCHER_LINES }, (_, i): GridDraft => ({ key: `satir-yeni-${i + 1}`, cells: {} }));
  return { ...state, rows, nextKey: rows.length + 1 };
}

const isBlank = (draft: GridDraft) => !draft.cells.accountId && !draft.cells.description && !amount(draft.cells.debit) && !amount(draft.cells.credit);

/** Satırın sunucuya gidecek hâli; hesap yoksa ya da yalnız bir tarafta tutar yoksa null. */
function lineRequest(draft: GridDraft) {
  const debit = amount(draft.cells.debit), credit = amount(draft.cells.credit);
  if (!draft.cells.accountId || (debit > 0) === (credit > 0) || debit < 0 || credit < 0) return null;
  return { accountId: String(draft.cells.accountId), description: String(draft.cells.description ?? "").trim() || null, debit, credit };
}

function gridColumn(code: string, label: string, type: string, required: boolean): GridColumn {
  const rules = { required, unique: false, upperCase: false, readOnly: false, ...(type === "money" ? { min: 0 } : {}) };
  if (type === "lookup") return { code, label, inputType: "lookup", rules, lookup: { query: "secim", valueColumn: "id", labelColumn: "name", descriptionColumn: "" } };
  return { code, label, inputType: type === "money" ? "number" : "text", rules };
}

/** Studio tuvalinde parçanın önüne seçim işaretçisi; normal sayfada hiçbir şey çizmez. */
function Mark({ id }: { id: string | null }) {
  const canvas = useContext(CanvasAnchorContext);
  return canvas && id ? createElement("template", { [ANCHOR_ATTRIBUTE]: id }) : null;
}

export function JournalVoucherTemplate<C extends BelgeComponent>({ layout, token, orderId, isPreview, previewState, title, tabKey, renderExtra }: {
  document: string; layout: BelgeLayout<C>; token?: string; orderId: string | null; isPreview: boolean; previewState?: string | null;
  title: string; tabKey?: string; onSaved?: (id: string) => void; renderExtra?: (components: C[]) => ReactNode;
}) {
  const [model, setModel] = useState<DocumentModel | null>(null);
  const [doc, setDoc] = useState<VoucherDocument | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [header, setHeader] = useState<Header>(() => headerOf(null));
  const [grid, setGrid] = useState<GridState>(() => rowsOf(null));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const sample = previewState != null;
  const isAdmin = roleOfToken(token) === "TenantAdmin";
  const posted = doc !== null;

  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadError("");
    const documentLoad: Promise<VoucherDocument | null> = sample
      ? api<VoucherDocument>(`/api/document-models/${JOURNAL_VOUCHER_CODE}/sample?state=${encodeURIComponent(previewState!)}`, token)
      : orderId ? api<VoucherDocument>(`/api/finance/general-ledger/entries/${encodeURIComponent(orderId)}/document`, token) : Promise.resolve(null);
    // Hesap seçicide yalnız aktif hesaplar listelenir.
    const accountsLoad = sample || orderId ? Promise.resolve([] as Account[])
      : api<Account[]>("/api/finance/general-ledger/accounts?activeOnly=true", token);
    Promise.all([loadDocumentModel(JOURNAL_VOUCHER_CODE, token), documentLoad, accountsLoad])
      .then(([loadedModel, loadedDoc, loadedAccounts]) => {
        if (!alive) return;
        setModel(loadedModel); setDoc(loadedDoc); setAccounts(loadedAccounts.filter((a) => a.isActive !== false));
        setHeader(headerOf(loadedDoc)); setGrid(rowsOf(loadedDoc));
      })
      .catch((failure: unknown) => {
        if (!alive) return;
        const status = (failure as { status?: number }).status;
        setLoadError(status === 404 ? "Fiş bulunamadı." : failure instanceof Error ? failure.message : "Fiş yüklenemedi.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orderId, previewState, sample, token]);

  const editable = !posted && !sample && isAdmin && !loading && !busy;
  const gridOptions = useMemo(() => ({ mode: "list" as const, maxRows: MAX_VOUCHER_LINES }), []);
  const dispatch = useCallback((action: GridAction) => setGrid((state) => gridReducer(state, action, gridOptions)), [gridOptions]);

  // Toplamlar satırlardan toplanır (kuruş tamsayısıyla); kayıtlı fişte kayıttan gelir.
  const totals = useMemo(() => {
    const debit = posted ? cents(doc!.totalDebit) : grid.rows.reduce((sum, row) => sum + cents(amount(row.cells.debit)), 0);
    const credit = posted ? cents(doc!.totalCredit) : grid.rows.reduce((sum, row) => sum + cents(amount(row.cells.credit)), 0);
    return { debit: debit / 100, credit: credit / 100, difference: (debit - credit) / 100, balanced: debit > 0 && debit === credit };
  }, [doc, grid.rows, posted]);
  const filledRows = grid.rows.filter((row) => !isBlank(row));
  const lines = filledRows.map(lineRequest);
  const savable = editable && header.description.trim().length > 0 && !!header.entryDate && totals.balanced
    && lines.length >= MIN_VOUCHER_LINES && lines.every(Boolean) && lines.length <= MAX_VOUCHER_LINES;

  const save = async () => {
    if (isPreview) { setMessage({ tone: "info", text: VOUCHER_PREVIEW_BLOCKED }); return; }
    if (!isAdmin) { setMessage({ tone: "error", text: VOUCHER_ADMIN_ONLY }); return; }
    if (!savable) {
      setMessage({ tone: "error", text: totals.balanced ? "Her satırda hesap ve yalnız bir tarafta tutar olmalı; en az iki satır girin." : "Borç ve alacak toplamları eşit olmalı." });
      return;
    }
    setBusy(true); setMessage(null);
    try {
      await api<{ id: string }>("/api/finance/general-ledger/entries/manual", token, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryDate: header.entryDate, accountingBasis: header.accountingBasis, description: header.description.trim(), lines }) });
      // Kayıttan sonra Yevmiye Defterleri açılır (bu sekmenin yerine).
      openWorkspacePage({ page: "finance-journal-ledger", params: {}, replace: true, from: tabKey, refresh: true, notice: "Yevmiye fişi kaydedildi." });
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Fiş kaydedilemedi." });
    } finally { setBusy(false); }
  };

  if (loading && !model) return <div className="tenant-custom-page-state" role="status">Belge yükleniyor…</div>;
  if (loadError || !model) return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert">{loadError || "Belge yüklenemedi."}</div>;

  const actions: ShellAction[] = [];
  if (posted) {
    if (tabKey && !sample) actions.push({ id: "yeni", label: "Yeni fiş", kind: "primary", run: () => setPageParams(tabKey, {}) });
  } else {
    actions.push({ id: "kaydet", label: "Kaydet", kind: "primary", disabled: busy || !savable,
      disabledReason: !isAdmin ? VOUCHER_ADMIN_ONLY : !totals.balanced ? "Borç ve alacak toplamları eşit olmalı." : undefined, run: () => void save() });
  }

  const optionsOf = (): LookupOption[] => accounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, description: "", row: a as unknown as Record<string, unknown> }));
  const columns = visibleColumns(model, layout.columns, "Posted");
  const gridColumns = columns.map((c) => gridColumn(c.code, layout.columnLabels[c.code] ?? c.label, c.type, c.required));
  const pickerFor = (column: GridColumn, draft: GridDraft): GridPicker => {
    const value = String(draft.cells[column.code] ?? "");
    return {
      options: optionsOf(), loading: false, selected: value ? { value, label: draft.labels?.[column.code] ?? value } : null,
      onSearch: () => undefined, onChange: (next, _row, label) => dispatch({ type: "edit", key: draft.key, code: column.code, value: next, label }),
    };
  };

  const head = <div className="belge-head">
    <div className="belge-title"><h2>{posted ? doc.entry.code : "Yeni yevmiye fişi"}</h2>
      {posted && <span className="belge-badge is-Posted" data-testid="belge-durum">Kaydedildi</span>}</div>
    {renderExtra && layout.actions.length > 0 && <div className="belge-extra-actions">{renderExtra(layout.actions)}</div>}
  </div>;

  const field = (code: string) => {
    const definition = model.fields.find((f) => f.code === code);
    if (!definition) return null;
    const label = layout.fieldLabels[code] ?? definition.label;
    const id = `belge-alan-${code}`;
    const set = (patch: Partial<Header>) => setHeader((h) => ({ ...h, ...patch }));
    let control: ReactNode;
    if (code === "code") control = <input id={id} value={header.code || (posted ? "" : "Kayıtta verilir")} readOnly />;
    else if (definition.type === "date") control = <input id={id} type="date" value={header.entryDate} disabled={!editable} onChange={(e) => set({ entryDate: e.target.value })} />;
    else if (code === "accountingBasis") {
      control = <select id={id} value={header.accountingBasis} disabled={!editable} onChange={(e) => set({ accountingBasis: e.target.value })}>
        {[...BASES, ...(BASES.some(([value]) => value === header.accountingBasis) ? [] : [[header.accountingBasis, header.accountingBasis] as const])]
          .map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>;
    } else control = <input id={id} maxLength={240} value={header.description} disabled={!editable} onChange={(e) => set({ description: e.target.value })} />;
    return <div className="belge-field" key={code}><label htmlFor={id}>{label}{definition.required && editable ? " *" : ""}</label>{control}</div>;
  };

  return <div className={`belge-template-page is-${layout.density}`} data-belge-status={posted ? "Posted" : "New"}>
    <PageShell title={title} crumbs={[model.label]} actions={actions} head={head}>
      {message && <div className={`belge-message is-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div>}
      {renderExtra && layout.above.length > 0 && renderExtra(layout.above)}
      <Mark id={layout.ids.fields} />
      <section className="belge-fields" aria-label="Başlık alanları">{layout.fields.map(field)}</section>
      <Mark id={layout.ids.lines} />
      <EditableGrid id="belge-satirlar" title="Satırlar" mode="list" columns={gridColumns} state={grid} sourceRows={[]} rowKey="lineNumber"
        dispatch={dispatch} errors={{}} fixedRowLabel="" addLabel="Satır ekle" maxRows={editable ? MAX_VOUCHER_LINES : grid.rows.length}
        disabled={!editable} disabledReason={posted ? "Kaydedilen fişin satırları değişmez; düzeltme ters kayıtla yapılır." : isAdmin ? "" : VOUCHER_ADMIN_ONLY}
        loading={false} style={{}} pickerFor={pickerFor} pickerLabel={(column, value, draft) => draft?.labels?.[column.code] ?? value}
        totals={{ debit: totals.debit, credit: totals.credit }} />
      <div className="belge-bottom">
        {layout.activity && <section className="belge-activity" aria-label="İşlem günlüğü"><h3>İşlem günlüğü</h3>
          {doc?.activityStartedLate && <p className="belge-note">Bu fiş günlük tutulmaya başlamadan önce oluşturuldu.</p>}
          {(doc?.activity ?? []).length === 0 && !doc?.activityStartedLate && <p className="belge-note">Henüz işlem yok.</p>}
          <ul>{(doc?.activity ?? []).map((a, i) => <li key={i}><strong>{a.step}</strong>{a.message ? <span> — {a.message}</span> : null}
            <time>{new Date(a.createdAt).toLocaleString("tr-TR")}</time></li>)}</ul>
        </section>}
        <Mark id={layout.ids.summary} />
        <section className="belge-totals" aria-label="Toplamlar"><h3>Toplamlar</h3>
          <dl>
            <div><dt>Toplam borç</dt><dd data-testid="fis-toplam-borc">{money(totals.debit)}</dd></div>
            <div><dt>Toplam alacak</dt><dd data-testid="fis-toplam-alacak">{money(totals.credit)}</dd></div>
            <div className="is-grand"><dt>Fark</dt><dd data-testid="fis-fark">{money(totals.difference)}</dd></div>
          </dl>
          <span className={`belge-badge ${totals.balanced ? "is-Posted" : "is-Rejected"}`} data-testid="fis-denge" role="status">
            {totals.balanced ? "Dengeli" : "Dengede değil"}</span>
        </section>
      </div>
      {renderExtra && layout.below.length > 0 && renderExtra(layout.below)}
    </PageShell>
  </div>;
}
