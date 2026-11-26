import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { confirmDialog, promptDialog } from "../confirmDialog";
import { EditableGrid, type GridPicker } from "../custom-page/EditableGrid";
import { LookupInput, type LookupOption } from "../custom-page/LookupInput";
import { emptyGridState, gridReducer, type GridAction, type GridColumn, type GridDraft, type GridState } from "../custom-page/gridState";
import { PageShell, type ShellAction } from "./PageShell";
import {
  fillLine, loadCustomFieldDefinitions, loadDocumentModel, loadSalesOrderDocument, loadSampleDocument, lookupLabel, runTransition, saveOrder,
  searchOptions, type CustomFieldDefinition, type DocumentModel, type OrderPreview, type PreviewLineRequest, type SalesOrderDocument,
} from "./documentApi";
import { fieldEditable, isEditable, visibleColumns, type BelgeComponent, type BelgeLayout } from "./documentTemplateModel";
import { useDocumentCalculation } from "./useDocumentCalculation";
import "./page-templates.css";

export const PREVIEW_WRITE_BLOCKED = "Önizlemede belge kaydedilmez ve durumu değişmez.";
const MAX_LINES = 200;
const GRID_OPTIONS = { mode: "list" as const, maxRows: MAX_LINES };

type Header = {
  code: string; customerId: string; customerLabel: string; orderDate: string; requestedDeliveryDate: string;
  salespersonEmployeeId: string; salespersonLabel: string; currencyCode: string; customFields: Record<string, string>;
};

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: number | undefined, currency: string) =>
  value === undefined ? "—" : `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === "TRY" ? "₺" : currency}`;
const num = (value: string | boolean | undefined) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
};

function headerOf(document: SalesOrderDocument | null): Header {
  const order = document?.order;
  return {
    code: order?.code ?? "", customerId: order?.customerId ?? "", customerLabel: order?.customerName ?? "", orderDate: order?.orderDate ?? today(),
    requestedDeliveryDate: order?.requestedDeliveryDate ?? "", salespersonEmployeeId: order?.salespersonEmployeeId ?? "", salespersonLabel: "",
    currencyCode: order?.currencyCode ?? "",
    customFields: Object.fromEntries((order?.customFields ?? []).map((f) => [f.code, f.value ?? ""])),
  };
}

function rowsOf(document: SalesOrderDocument | null): GridState {
  const state = emptyGridState();
  const rows: GridDraft[] = (document?.order.lines ?? []).map((line) => ({
    key: `satir-${line.lineNumber}`,
    cells: {
      stockItemId: line.stockItemId, quantity: String(line.quantity), unitCode: line.enteredUnitCode ?? line.unitCode,
      unitPrice: String(line.enteredUnitPrice ?? line.unitPrice), currencyCode: line.enteredCurrencyCode ?? document!.order.currencyCode,
      discountPercent: String(line.discountPercent), vatPercent: String(line.vatPercent), isVatIncluded: !!line.isVatIncluded,
      deliveredQuantity: `${line.deliveredQuantity} / ${line.quantity}`,
    },
    labels: { stockItemId: `${line.stockCode} · ${line.stockName}` },
  }));
  return { ...state, rows, nextKey: rows.length + 1 };
}

/** Satırın sunucuya gidecek hâli; stok ya da miktar eksikse null (hesaba ve kayda girmez). */
function lineRequest(draft: GridDraft): PreviewLineRequest | null {
  const quantity = num(draft.cells.quantity), price = num(draft.cells.unitPrice);
  if (!draft.cells.stockItemId || !(quantity > 0) || !(price >= 0)) return null;
  const discount = num(draft.cells.discountPercent), vat = num(draft.cells.vatPercent);
  return {
    rowKey: draft.key, stockItemId: String(draft.cells.stockItemId), quantity, unitPrice: price,
    discountPercent: Number.isFinite(discount) ? discount : 0, vatPercent: Number.isFinite(vat) ? vat : 20,
    unitCode: draft.cells.unitCode ? String(draft.cells.unitCode) : undefined,
    currencyCode: draft.cells.currencyCode ? String(draft.cells.currencyCode) : undefined,
    isVatIncluded: draft.cells.isVatIncluded === true,
  };
}

function gridColumn(code: string, label: string, type: string, calculated: boolean, required: boolean): GridColumn {
  const rules = { required, unique: false, upperCase: false, readOnly: calculated, ...(type === "number" ? { min: 0 } : {}) };
  if (calculated) return { code, label, inputType: "calc", rules: { ...rules, required: false }, calc: { query: "hesap", field: code } };
  if (type === "lookup") return { code, label, inputType: "lookup", rules, lookup: { query: "secim", valueColumn: "id", labelColumn: "name", descriptionColumn: "" } };
  return { code, label, inputType: type === "checkbox" ? "checkbox" : type === "number" ? "number" : "text", rules };
}

type Picker = { options: LookupOption[]; loading: boolean; error?: string };

/**
 * Belge kalıbı (belge kuralları PR 2, taslak 08): başlık, durum çizgisi, geçiş düğmeleri, başlık alanları, satırlar, toplamlar,
 * KDV dökümü ve işlem günlüğü. Veri sayfa sorgularından değil, belge modelinin uçlarından gelir; tasarımcı ayarı yoktur.
 * `previewState` verilirse (Studio tuvali) modelden örnek belge çizilir. `isPreview`: kayıt ve geçişler gönderilmez.
 */
export function DocumentTemplate<C extends BelgeComponent>({ document: documentCode, layout, token, orderId, isPreview, previewState, title,
  onSaved, renderExtra }: {
  document: string; layout: BelgeLayout<C>; token?: string; orderId: string | null; isPreview: boolean; previewState?: string | null;
  title: string; onSaved?: (id: string) => void; renderExtra?: (components: C[]) => ReactNode;
}) {
  const [model, setModel] = useState<DocumentModel | null>(null);
  const [doc, setDoc] = useState<SalesOrderDocument | null>(null);
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState<Header>(() => headerOf(null));
  const [grid, setGrid] = useState<GridState>(() => emptyGridState());
  const [available, setAvailable] = useState<Record<string, string>>({});
  const [pickers, setPickers] = useState<Record<string, Picker>>({});
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const sample = previewState != null;

  useEffect(() => {
    let alive = true;
    setLoading(true); setLoadError("");
    const documentLoad = sample ? loadSampleDocument(documentCode, previewState!, token)
      : orderId ? loadSalesOrderDocument(orderId, token) : Promise.resolve(null);
    Promise.all([loadDocumentModel(documentCode, token), documentLoad, sample ? Promise.resolve([]) : loadCustomFieldDefinitions(token).catch(() => [])])
      .then(([loadedModel, loadedDoc, loadedDefinitions]) => {
        if (!alive) return;
        setModel(loadedModel); setDoc(loadedDoc); setDefinitions(loadedDefinitions.filter((d) => d.isActive !== false));
        setHeader(headerOf(loadedDoc)); setGrid(rowsOf(loadedDoc)); setAvailable({});
      })
      .catch((failure: unknown) => {
        if (!alive) return;
        const status = (failure as { status?: number }).status;
        setLoadError(status === 404 ? "Belge bulunamadı." : failure instanceof Error ? failure.message : "Belge yüklenemedi.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [documentCode, orderId, previewState, sample, token, reload]);

  const status = doc?.order.status ?? "Draft";
  const editable = isEditable(status) && !loading && !busy;
  const dispatch = useCallback((action: GridAction) => setGrid((state) => gridReducer(state, action, GRID_OPTIONS)), []);

  const lines = useMemo(() => grid.rows.map(lineRequest), [grid.rows]);
  const calculationInput = header.customerId && lines.some(Boolean)
    ? { customerId: header.customerId, orderDate: header.orderDate, currencyCode: header.currencyCode || undefined,
      lines: lines.filter((x): x is PreviewLineRequest => !!x) }
    : null;
  // Kaydedilmiş belge açılınca tutarlar kayıttan gelir; kullanıcı bir şey değiştirince sunucu yeniden hesaplar.
  const [dirty, setDirty] = useState(false);
  const calculation = useDocumentCalculation(calculationInput, token, editable && dirty && !sample);
  const preview: OrderPreview | null = dirty ? calculation.result : null;
  const lineAmounts = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    if (preview) for (const line of preview.lines) if (line.rowKey) map[line.rowKey] = line as unknown as Record<string, number>;
    else for (const [i, line] of (doc?.order.lines ?? []).entries()) map[`satir-${i + 1}`] = line as unknown as Record<string, number>;
    return map;
  }, [preview, doc]);

  const currency = preview?.currencyCode ?? doc?.amounts.currencyCode ?? (header.currencyCode || "TRY");
  const totals = preview
    ? { subtotal: preview.subtotal, discountTotal: preview.discountTotal, taxTotal: preview.taxTotal, grandTotal: preview.grandTotal,
      vat: preview.taxes.filter((t) => t.code === "VAT").sort((a, b) => a.rate - b.rate).map((t) => ({ rate: t.rate, taxableAmount: t.taxableAmount, amount: t.amount })) }
    : doc?.amounts ?? null;

  const edit = (key: string, code: string, value: string | boolean, label?: string) => { setDirty(true); dispatch({ type: "edit", key, code, value, label }); };

  const search = (id: string, operation: string, text: string) => {
    setPickers((p) => ({ ...p, [id]: { ...(p[id] ?? { options: [] }), loading: true, error: undefined } }));
    searchOptions(operation, text, token)
      .then((rows) => setPickers((p) => ({ ...p, [id]: { loading: false, options: rows.map((row) => ({
        value: row.id, label: lookupLabel(row), description: "", row: row as unknown as Record<string, unknown> })) } })))
      .catch((failure: unknown) => setPickers((p) => ({ ...p, [id]: { options: [], loading: false, error: failure instanceof Error ? failure.message : "Arama yapılamadı." } })));
  };

  /** Stok seçilince modelin "dolanlar" listesi sunucudan doldurulur (birim, fiyat, KDV, iskonto, döviz, kullanılabilir). */
  const pickStock = (draft: GridDraft, value: string, label: string) => {
    edit(draft.key, "stockItemId", value, label);
    if (!value || !model) return;
    const fills = model.fills.stockItemId ?? [];
    fillLine(documentCode, "stockItemId", value, token).then(({ values }) => {
      for (const code of fills) {
        if (!(code in values) || values[code] == null) continue;
        if (code === "availableQuantity") setAvailable((a) => ({ ...a, [draft.key]: String(values[code]) }));
        else dispatch({ type: "edit", key: draft.key, code, value: String(values[code]) });
      }
      if (!draft.cells.quantity) dispatch({ type: "edit", key: draft.key, code: "quantity", value: "1" });
    }).catch((failure: unknown) => setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Stok bilgisi alınamadı." }));
  };

  const columns = model ? visibleColumns(model, layout.columns, status) : [];
  const gridColumns = columns.map((c) => gridColumn(c.code, layout.columnLabels[c.code] ?? c.label, c.type, c.calculated, c.required));
  const pickerFor = (column: GridColumn, draft: GridDraft): GridPicker => {
    const operation = model?.lineColumns.find((c) => c.code === column.code)?.optionsOperation ?? "";
    const id = `${draft.key}:${column.code}`;
    const picker = pickers[id] ?? { options: [], loading: false };
    const value = String(draft.cells[column.code] ?? "");
    return {
      ...picker, selected: value ? { value, label: draft.labels?.[column.code] ?? value } : null,
      onSearch: (text) => operation && search(id, operation, text),
      onChange: (next, _row, label) => (column.code === "stockItemId" ? pickStock(draft, next, label) : edit(draft.key, column.code, next, label)),
    };
  };
  const calcText = (column: GridColumn, draft: GridDraft) => {
    if (column.code === "availableQuantity") return available[draft.key] ?? "—";
    if (column.code === "deliveredQuantity") return String(draft.cells.deliveredQuantity ?? "—");
    const value = lineAmounts[draft.key]?.[column.code];
    return typeof value === "number" ? money(value, currency) : "—";
  };

  const save = async () => {
    if (isPreview) { setMessage({ tone: "info", text: PREVIEW_WRITE_BLOCKED }); return; }
    const sent = lines.filter((x): x is PreviewLineRequest => !!x);
    if (!header.customerId) { setMessage({ tone: "error", text: "Müşteri seçin." }); return; }
    if (sent.length === 0) { setMessage({ tone: "error", text: "Sipariş 1–200 stok satırı içermelidir." }); return; }
    setBusy(true); setMessage(null);
    try {
      const saved = await saveOrder(doc?.order.id ?? null, {
        code: header.code, customerId: header.customerId, orderDate: header.orderDate, requestedDeliveryDate: header.requestedDeliveryDate || null,
        currencyCode: header.currencyCode || currency, salespersonEmployeeId: header.salespersonEmployeeId || null,
        customFields: Object.fromEntries(definitions.map((d) => [d.code, header.customFields[d.code] || null])),
        lines: sent.map(({ rowKey: _rowKey, ...line }) => line),
      }, token);
      setDirty(false);
      setMessage({ tone: "info", text: "Taslak kaydedildi." });
      if (!doc && saved?.id) onSaved?.(saved.id); else setReload((n) => n + 1);
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Belge kaydedilemedi." });
    } finally { setBusy(false); }
  };

  const transition = async (code: string) => {
    if (isPreview) { setMessage({ tone: "info", text: PREVIEW_WRITE_BLOCKED }); return; }
    const definition = model?.transitions.find((t) => t.code === code);
    if (!doc || !definition) return;
    if (dirty && !(await confirmDialog({ title: "Kaydedilmemiş değişiklikler var", message: "Önce Kaydet'e basın; yoksa değişiklikler bu işleme girmez.", confirmLabel: "Yine de devam et" }))) return;
    let reason: string | null = null;
    if (definition.requiresReason) {
      reason = await promptDialog({ title: `${doc.order.code}: ${definition.label}`, label: "Sebep", required: true, maxLength: 500, tone: "danger", confirmLabel: definition.label });
      if (reason === null) return;
    }
    setBusy(true); setMessage(null);
    try {
      await runTransition(doc.order.id, code, reason, token);
      setDirty(false);
      setReload((n) => n + 1);
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "İşlem yapılamadı." });
    } finally { setBusy(false); }
  };

  if (loading && !model) return <div className="tenant-custom-page-state" role="status">Belge yükleniyor…</div>;
  if (loadError || !model) return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert">{loadError || "Belge yüklenemedi."}</div>;

  const stateLabel = (code: string) => model.states.find((s) => s.code === code)?.label ?? code;
  const actions: ShellAction[] = [];
  if (isEditable(status)) actions.push({ id: "kaydet", label: "Kaydet", kind: "primary", disabled: busy, run: () => void save() });
  for (const code of doc ? doc.allowedTransitions : []) {
    const definition = model.transitions.find((t) => t.code === code);
    if (!definition) continue;
    actions.push({ id: code, label: definition.label, kind: definition.requiresReason ? "danger" : isEditable(status) ? "normal" : "primary",
      disabled: busy, run: () => void transition(code) });
  }
  const chain = model.states.filter((s) => !s.terminal);
  const at = chain.findIndex((s) => s.code === status);

  const head = <div className="belge-head">
    <div className="belge-title"><h2>{doc ? doc.order.code : "Yeni sipariş"}</h2>
      <span className={`belge-badge is-${status}`} data-testid="belge-durum">{stateLabel(status)}</span></div>
    <ol className="belge-chain" aria-label="Durum">
      {chain.map((s, i) => <li key={s.code} className={i < at ? "is-done" : i === at ? "is-current" : ""} aria-current={i === at ? "step" : undefined}>{s.label}</li>)}
    </ol>
    {renderExtra && layout.actions.length > 0 && <div className="belge-extra-actions">{renderExtra(layout.actions)}</div>}
  </div>;

  const field = (code: string) => {
    const definition = model.fields.find((f) => f.code === code);
    if (!definition) return null;
    const label = layout.fieldLabels[code] ?? definition.label;
    const canEdit = fieldEditable(model, code, status) && !busy;
    const id = `belge-alan-${code}`;
    const set = (patch: Partial<Header>) => { setDirty(true); setHeader((h) => ({ ...h, ...patch })); };
    let control: ReactNode;
    if (code === "code") control = <input id={id} value={header.code || (doc ? "" : "Kayıtta verilir")} readOnly />;
    else if (definition.type === "date") {
      const key = code as "orderDate" | "requestedDeliveryDate";
      control = <input id={id} type="date" value={header[key]} disabled={!canEdit} onChange={(e) => set({ [key]: e.target.value } as Partial<Header>)} />;
    } else if (definition.type === "lookup" && definition.optionsOperation) {
      const isCustomer = code === "customerId";
      const value = isCustomer ? header.customerId : header.salespersonEmployeeId;
      const shown = isCustomer ? header.customerLabel : header.salespersonLabel;
      const picker = pickers[code] ?? { options: [], loading: false };
      control = <LookupInput inputId={id} label={label} raw={value} options={picker.options} loading={picker.loading} error={picker.error}
        allowClear={!definition.required} disabled={!canEdit} placeholder="Ara…" selected={value ? { value, label: shown || value } : null}
        onSearch={(text) => search(code, definition.optionsOperation!, text)}
        onChange={(next, row, nextLabel) => set(isCustomer
          ? { customerId: next, customerLabel: nextLabel, currencyCode: typeof row?.currencyCode === "string" ? row.currencyCode : "" }
          : { salespersonEmployeeId: next, salespersonLabel: nextLabel })} />;
    } else control = <input id={id} value={String((header as unknown as Record<string, unknown>)[code] ?? "")} disabled={!canEdit} readOnly />;
    return <div className="belge-field" key={code}><label htmlFor={id}>{label}{definition.required && canEdit ? " *" : ""}</label>{control}</div>;
  };

  return <div className={`belge-template-page is-${layout.density}`} data-belge-status={status}>
    <PageShell title={title} crumbs={[model.label]} actions={actions} head={head}>
      {message && <div className={`belge-message is-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div>}
      {renderExtra && layout.above.length > 0 && renderExtra(layout.above)}
      <section className="belge-fields" aria-label="Başlık alanları">{layout.fields.map(field)}</section>
      {definitions.length > 0 && <section className="belge-fields belge-custom-fields" aria-label="Özel alanlar">
        {definitions.map((d) => {
          const id = `belge-ozel-${d.code}`;
          return <div className="belge-field" key={d.code}><label htmlFor={id}>{d.label}{d.isRequired ? " *" : ""}</label>
            <input id={id} maxLength={d.maxLength || undefined} value={header.customFields[d.code] ?? ""} disabled={!isEditable(status) || busy}
              type={d.dataType === "Date" ? "date" : d.dataType === "Number" || d.dataType === "Decimal" ? "number" : "text"}
              onChange={(e) => { setDirty(true); const value = e.target.value; setHeader((h) => ({ ...h, customFields: { ...h.customFields, [d.code]: value } })); }} /></div>;
        })}
      </section>}
      <EditableGrid id="belge-satirlar" title="Satırlar" mode="list" columns={gridColumns} state={grid} sourceRows={[]} rowKey="lineNumber"
        dispatch={(action) => { if (action.type !== "add") setDirty(true); dispatch(action); }} errors={{}} fixedRowLabel="" addLabel="Satır ekle"
        maxRows={editable ? MAX_LINES : grid.rows.length} disabled={!editable} disabledReason={isEditable(status) ? "" : `${stateLabel(status)} belgenin satırları değişmez.`}
        loading={false} error={calculation.error || undefined} style={{}} pickerFor={pickerFor}
        pickerLabel={(column, value, draft) => draft?.labels?.[column.code] ?? value} calcText={calcText} />
      <div className="belge-bottom">
        {layout.activity && <section className="belge-activity" aria-label="İşlem günlüğü"><h3>İşlem günlüğü</h3>
          {doc?.activityStartedLate && <p className="belge-note">Bu sipariş günlük tutulmaya başlamadan önce oluşturuldu.</p>}
          {(doc?.activity ?? []).length === 0 && !doc?.activityStartedLate && <p className="belge-note">Henüz işlem yok.</p>}
          <ul>{(doc?.activity ?? []).map((a, i) => <li key={i}><strong>{a.step}</strong>{a.message ? <span> — {a.message}</span> : null}
            <time>{new Date(a.createdAt).toLocaleString("tr-TR")}</time></li>)}</ul>
        </section>}
        <section className="belge-totals" aria-label="Toplamlar" aria-busy={calculation.pending || undefined}><h3>Toplamlar</h3>
          <dl>
            <div><dt>Ara toplam</dt><dd data-testid="belge-ara-toplam">{money(totals?.subtotal, currency)}</dd></div>
            <div><dt>İskonto</dt><dd>{money(totals?.discountTotal, currency)}</dd></div>
            {layout.vatBreakdown
              ? (totals?.vat ?? []).map((v) => <div key={v.rate} className="is-vat"><dt>KDV %{v.rate} (matrah {money(v.taxableAmount, currency)})</dt><dd>{money(v.amount, currency)}</dd></div>)
              : <div className="is-vat"><dt>KDV</dt><dd>{money(totals?.taxTotal, currency)}</dd></div>}
            <div className="is-grand"><dt>Genel toplam</dt><dd data-testid="belge-genel-toplam">{money(totals?.grandTotal, currency)}</dd></div>
          </dl>
        </section>
      </div>
      {renderExtra && layout.below.length > 0 && renderExtra(layout.below)}
    </PageShell>
  </div>;
}

/** Studio tuvalinin kullandığı durum seçeneği; DesignerCanvasHost bu değeri `previewState` mesajından alır. */
export const DEFAULT_PREVIEW_STATE = "Draft";

