import { createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CanvasAnchorContext } from "../designer-canvas/anchorContext";
import { ANCHOR_ATTRIBUTE } from "../designer-canvas/canvasProtocol";
import { confirmDialog, promptDialog } from "../confirmDialog";
import { EditableGrid, type GridPicker } from "../custom-page/EditableGrid";
import { LookupInput, type LookupOption } from "../custom-page/LookupInput";
import { emptyGridState, gridReducer, type GridAction, type GridColumn, type GridDraft, type GridState } from "../custom-page/gridState";
import { PageShell, type ShellAction } from "./PageShell";
import { approveSalesOrder, decideSalesOrder, warningsText } from "../sales/orderApproval";
import {
  bindingOf, DOCUMENT_BINDINGS, fillLine, loadCustomFieldDefinitions, loadDocument, loadDocumentModel, loadSampleDocument, lookupLabel, runTransition,
  saveDocument, searchOptions, type BelgeDocument, type CustomFieldDefinition, type DocumentBinding, type DocumentModel, type OrderPreview,
  type PreviewLineRequest,
} from "./documentApi";
import { fieldEditable, isEditable, visibleColumns, type BelgeComponent, type BelgeLayout } from "./documentTemplateModel";
import { useDocumentCalculation } from "./useDocumentCalculation";
import "./page-templates.css";

export const PREVIEW_WRITE_BLOCKED = "Önizlemede belge kaydedilmez ve durumu değişmez.";

type Header = {
  code: string; customerId: string; customerLabel: string; prospectCustomerName: string;
  salespersonEmployeeId: string; salespersonLabel: string; currencyCode: string;
  /** Tarih ve metin başlık alanları (modelin alan koduyla; bağın `dateFields` ve `textFields` kodları). */
  values: Record<string, string>; customFields: Record<string, string>;
};

const money = (value: number | undefined, currency: string) =>
  value === undefined ? "—" : `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === "TRY" ? "₺" : currency}`;
const num = (value: string | boolean | undefined) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : NaN;
};

function headerOf(binding: DocumentBinding, document: BelgeDocument | null): Header {
  const doc = document?.doc;
  return {
    code: doc?.code ?? "", customerId: doc?.customerId ?? "", customerLabel: doc?.customerName ?? "", prospectCustomerName: doc?.prospectCustomerName ?? "",
    salespersonEmployeeId: doc?.salespersonEmployeeId ?? "", salespersonLabel: "", currencyCode: doc?.currencyCode ?? "",
    values: doc?.values ?? binding.newValues(),
    customFields: Object.fromEntries((doc?.customFields ?? []).map((f) => [f.code, f.value ?? ""])),
  };
}

function rowsOf(document: BelgeDocument | null): GridState {
  const state = emptyGridState();
  const currency = document?.doc.currencyCode ?? "";
  const rows: GridDraft[] = (document?.doc.lines ?? []).map((line) => ({
    key: `satir-${line.lineNumber}`,
    cells: {
      stockItemId: line.stockItemId, quantity: String(line.quantity), unitCode: line.enteredUnitCode ?? line.unitCode,
      unitPrice: String(line.enteredUnitPrice ?? line.unitPrice ?? ""), currencyCode: line.enteredCurrencyCode ?? currency,
      discountPercent: String(line.discountPercent ?? ""), vatPercent: String(line.vatPercent ?? ""), isVatIncluded: !!line.isVatIncluded,
      ...(line.deliveredQuantity !== undefined ? { deliveredQuantity: `${line.deliveredQuantity} / ${line.quantity}` } : {}),
      // Dövizli satırın kayıtlı kuru (hücre olarak çizilmez); stok ya da döviz değişince silinir.
      ...((line.enteredCurrencyCode ?? currency) !== currency && line.exchangeRate ? { exchangeRate: String(line.exchangeRate) } : {}),
      // Satış talebi bağı (hücre olarak çizilmez): teklif kaydı satır bağını korur.
      ...(line.salesRequestLineNumber ? { salesRequestLineNumber: String(line.salesRequestLineNumber) } : {}),
      // İrsaliye satırı: bedelsiz işareti, izleme ve raf bilgisi Belge'de görünmez; kayıt PUT'u bunları silmesin diye geri gönderilir.
      ...(line.isFreeOfCharge ? { isFreeOfCharge: true } : {}),
      ...(line.trackingCode ? { trackingCode: line.trackingCode } : {}),
      ...(line.expiryDate ? { expiryDate: line.expiryDate } : {}),
      ...(line.storageLocationId ? { storageLocationId: line.storageLocationId } : {}),
    },
    labels: { stockItemId: `${line.stockCode} · ${line.stockName}` },
  }));
  return { ...state, rows, nextKey: rows.length + 1 };
}

/** Satırın sunucuya gidecek hâli; stok ya da miktar eksikse null (hesaba ve kayda girmez). */
function lineRequest(draft: GridDraft, unpriced = false): PreviewLineRequest | null {
  const quantity = num(draft.cells.quantity), price = num(draft.cells.unitPrice);
  const free = draft.cells.isFreeOfCharge === true;
  // İrsaliyede fiyat isteğe bağlıdır: bedelsiz ya da fiyatsız satır fiyat alanları boş gider.
  const noPrice = unpriced && (free || !(price >= 0));
  if (!draft.cells.stockItemId || !(quantity > 0) || (!noPrice && !(price >= 0))) return null;
  const discount = num(draft.cells.discountPercent), vat = num(draft.cells.vatPercent);
  return {
    rowKey: draft.key, stockItemId: String(draft.cells.stockItemId), quantity, unitPrice: noPrice ? (null as unknown as number) : price,
    discountPercent: noPrice ? (null as unknown as number) : Number.isFinite(discount) ? discount : 0,
    vatPercent: noPrice ? (null as unknown as number) : Number.isFinite(vat) ? vat : 20,
    ...(unpriced ? { isFreeOfCharge: free,
      ...(draft.cells.trackingCode ? { trackingCode: String(draft.cells.trackingCode) } : {}),
      ...(draft.cells.expiryDate ? { expiryDate: String(draft.cells.expiryDate) } : {}),
      ...(draft.cells.storageLocationId ? { storageLocationId: String(draft.cells.storageLocationId) } : {}) } : {}),
    unitCode: draft.cells.unitCode ? String(draft.cells.unitCode) : undefined,
    currencyCode: draft.cells.currencyCode ? String(draft.cells.currencyCode) : undefined,
    isVatIncluded: draft.cells.isVatIncluded === true,
    ...(num(draft.cells.exchangeRate) > 0 ? { exchangeRateToQuoteCurrency: num(draft.cells.exchangeRate) } : {}),
    ...(num(draft.cells.salesRequestLineNumber) > 0 ? { salesRequestLineNumber: num(draft.cells.salesRequestLineNumber) } : {}),
  };
}

function gridColumn(code: string, label: string, type: string, calculated: boolean, required: boolean): GridColumn {
  const rules = { required, unique: false, upperCase: false, readOnly: calculated, ...(type === "number" ? { min: 0 } : {}) };
  if (calculated) return { code, label, inputType: "calc", rules: { ...rules, required: false }, calc: { query: "hesap", field: code } };
  if (type === "lookup") return { code, label, inputType: "lookup", rules, lookup: { query: "secim", valueColumn: "id", labelColumn: "name", descriptionColumn: "" } };
  return { code, label, inputType: type === "checkbox" ? "checkbox" : type === "number" ? "number" : "text", rules };
}

type Picker = { options: LookupOption[]; loading: boolean; error?: string };

/** Studio tuvalinde parçanın önüne seçim işaretçisi (`<template data-cp-anchor>`); normal sayfada hiçbir şey çizmez. */
function Mark({ id }: { id: string | null }) {
  const canvas = useContext(CanvasAnchorContext);
  return canvas && id ? createElement("template", { [ANCHOR_ATTRIBUTE]: id }) : null;
}

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
  const known = bindingOf(documentCode);
  // Bilinmeyen model yükleme hatasıyla biter; sipariş bağı yalnız kancaların boş kalmaması için tutulur.
  const binding = known ?? DOCUMENT_BINDINGS["satis.siparis"];
  const maxLines = binding.maxLines;
  const gridOptions = useMemo(() => ({ mode: "list" as const, maxRows: maxLines }), [maxLines]);
  const [doc, setDoc] = useState<BelgeDocument | null>(null);
  const [definitions, setDefinitions] = useState<CustomFieldDefinition[]>([]);
  // Özel alan tanımları okunamadıysa kayıt engellenir: sunucu gönderilmeyen değerleri siler.
  const [definitionsFailed, setDefinitionsFailed] = useState(false);
  // Satır anahtarı → son istenen stok: geç gelen doldurma yanıtı yeni seçimin üstüne yazmaz.
  const fillFor = useRef<Record<string, string>>({});
  // Kaydedilmiş belge açılınca tutarlar kayıttan gelir; kullanıcı bir şey değiştirince sunucu yeniden hesaplar.
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [header, setHeader] = useState<Header>(() => headerOf(binding, null));
  const [grid, setGrid] = useState<GridState>(() => emptyGridState());
  const [available, setAvailable] = useState<Record<string, string>>({});
  const [pickers, setPickers] = useState<Record<string, Picker>>({});
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  // Tek yazmayla kesilen belgede (fatura) isteğin tekrar deneme anahtarı: içerik değişince yenilenir, yoksa sunucu "farklı içerik" diye reddeder.
  const requestId = useRef(crypto.randomUUID());
  const sample = previewState != null;

  useEffect(() => {
    let alive = true;
    if (!known) { setLoadError(`Bilinmeyen belge modeli: ${documentCode}`); setLoading(false); return () => { alive = false; }; }
    setLoading(true); setLoadError("");
    const documentLoad = sample ? loadSampleDocument(binding, previewState!, token)
      : orderId ? loadDocument(binding, orderId, token) : Promise.resolve(null);
    let failedDefinitions = false;
    const definitionsLoad = sample ? Promise.resolve([] as CustomFieldDefinition[])
      : loadCustomFieldDefinitions(binding, token).catch(() => { failedDefinitions = true; return [] as CustomFieldDefinition[]; });
    Promise.all([loadDocumentModel(documentCode, token), documentLoad, definitionsLoad])
      .then(([loadedModel, loadedDoc, loadedDefinitions]) => {
        if (!alive) return;
        setDefinitionsFailed(failedDefinitions); setDirty(false); fillFor.current = {};
        setModel(loadedModel); setDoc(loadedDoc); setDefinitions(loadedDefinitions.filter((d) => d.isActive !== false));
        setHeader(headerOf(binding, loadedDoc)); setGrid(rowsOf(loadedDoc)); setAvailable({});
      })
      .catch((failure: unknown) => {
        if (!alive) return;
        const status = (failure as { status?: number }).status;
        setLoadError(status === 404 ? "Belge bulunamadı." : failure instanceof Error ? failure.message : "Belge yüklenemedi.");
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [binding, documentCode, known, orderId, previewState, sample, token, reload]);

  const status = doc?.doc.status ?? "Draft";
  const editable = isEditable(status) && !loading && !busy;
  const dispatch = useCallback((action: GridAction) => setGrid((state) => gridReducer(state, action, gridOptions)), [gridOptions]);

  const unpricedLines = binding.unpricedLines === true;
  const lines = useMemo(() => grid.rows.map((row) => lineRequest(row, unpricedLines)), [grid.rows, unpricedLines]);
  const headerValues = { code: header.code, customerId: header.customerId, salespersonEmployeeId: header.salespersonEmployeeId,
    currencyCode: header.currencyCode, values: header.values, prospectCustomerName: header.prospectCustomerName, requestId: requestId.current };
  const calculationInput = lines.some(Boolean) ? binding.previewBody(headerValues, lines.filter((x): x is PreviewLineRequest => !!x)) : null;
  const calculation = useDocumentCalculation(binding, calculationInput, token, editable && dirty && !sample);
  const preview: OrderPreview | null = dirty ? calculation.result : null;
  // Değişiklik yoksa tutarlar kayıttan, değişiklik varsa yalnız sunucu hesabından gelir (hesap gelene kadar "—").
  const lineAmounts = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    if (dirty) {
      for (const line of preview?.lines ?? []) if (line.rowKey) map[line.rowKey] = line as unknown as Record<string, number>;
    } else {
      for (const line of doc?.doc.lines ?? []) map[`satir-${line.lineNumber}`] = line as unknown as Record<string, number>;
    }
    return map;
  }, [dirty, preview, doc]);

  const currency = preview?.currencyCode ?? doc?.amounts.currencyCode ?? (header.currencyCode || "TRY");
  const totals = preview
    ? { subtotal: preview.subtotal, discountTotal: preview.discountTotal, taxTotal: preview.taxTotal, grandTotal: preview.grandTotal,
      vat: preview.taxes.filter((t) => t.code === "VAT").sort((a, b) => a.rate - b.rate).map((t) => ({ rate: t.rate, taxableAmount: t.taxableAmount, amount: t.amount })) }
    : dirty ? null : doc?.amounts ?? null;

  const edit = (key: string, code: string, value: string | boolean, label?: string) => { setDirty(true); requestId.current = crypto.randomUUID(); dispatch({ type: "edit", key, code, value, label }); };

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
    dispatch({ type: "edit", key: draft.key, code: "exchangeRate", value: "" });
    fillFor.current[draft.key] = value;
    if (!value || !model) return;
    const fills = model.fills.stockItemId ?? [];
    fillLine(documentCode, "stockItemId", value, token).then(({ values }) => {
      if (fillFor.current[draft.key] !== value) return;
      for (const code of fills) {
        if (!(code in values) || values[code] == null) continue;
        if (code === "availableQuantity") setAvailable((a) => ({ ...a, [draft.key]: String(values[code]) }));
        else dispatch({ type: "edit", key: draft.key, code, value: String(values[code]) });
      }
      if (!draft.cells.quantity) dispatch({ type: "edit", key: draft.key, code: "quantity", value: "1" });
    }).catch((failure: unknown) => {
      if (fillFor.current[draft.key] === value) setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Stok bilgisi alınamadı." });
    });
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
      onChange: (next, _row, label) => {
        if (column.code === "stockItemId") { pickStock(draft, next, label); return; }
        edit(draft.key, column.code, next, label);
        if (column.code === "currencyCode") dispatch({ type: "edit", key: draft.key, code: "exchangeRate", value: "" });
      },
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
    if (!header.customerId && !header.prospectCustomerName) { setMessage({ tone: "error", text: "Müşteri seçin." }); return; }
    for (const required of model?.fields.filter((f) => f.required && f.type === "lookup" && f.code !== "customerId") ?? []) {
      if (!header.values[required.code]) { setMessage({ tone: "error", text: `${layout.fieldLabels[required.code] ?? required.label} seçin.` }); return; }
    }
    if (sent.length === 0) { setMessage({ tone: "error", text: `${binding.noun[0].toLocaleUpperCase("tr-TR")}${binding.noun.slice(1)} 1–${binding.maxLines} stok satırı içermelidir.` }); return; }
    if (definitionsFailed) { setMessage({ tone: "error", text: "Özel alanlar okunamadı; değerleri silinmesin diye kaydedilmedi. Sayfayı yenileyip yeniden deneyin." }); return; }
    setBusy(true); setMessage(null);
    try {
      const saved = await saveDocument(binding, doc?.doc.id ?? null, binding.writeBody({ ...headerValues, currencyCode: header.currencyCode || currency },
        sent.map(({ rowKey: _rowKey, ...line }) => line),
        // Tanımı pasif olsa da kayıtlı değer korunur: sunucu gönderilmeyen değeri siler.
        Object.fromEntries([...new Set([...definitions.map((d) => d.code), ...(doc?.doc.customFields ?? []).map((f) => f.code)])]
          .map((code) => [code, header.customFields[code] || null]))), token);
      setDirty(false);
      setMessage({ tone: "info", text: binding.savedMessage ?? "Taslak kaydedildi." });
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
      reason = await promptDialog({ title: `${doc.doc.code}: ${definition.label}`, label: "Sebep", required: true, maxLength: 500, tone: "danger", confirmLabel: definition.label });
      if (reason === null) return;
    }
    setBusy(true); setMessage(null);
    try {
      if (code === "onayla") {
        const outcome = await approveSalesOrder(doc.doc.id, token, (warnings) => confirmDialog({
          title: "Kurallar uyarı veriyor", message: warningsText(warnings), tone: "warning", confirmLabel: "Yine de onayla" }));
        if (!outcome) return;
        if (outcome.status === "PendingApproval") setMessage({ tone: "info", text: "Sipariş onay bekliyor; kuraldaki kişilerden biri karar verecek." });
      } else await runTransition(binding, doc.doc.id, code, reason, token);
      setDirty(false);
      setReload((n) => n + 1);
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "İşlem yapılamadı." });
    } finally { setBusy(false); }
  };

  /** Onay bekleyen siparişte kuraldaki kişinin kararı: Onayla ya da gerekçeyle Reddet. */
  const decide = async (decision: "Approved" | "Rejected") => {
    if (isPreview) { setMessage({ tone: "info", text: PREVIEW_WRITE_BLOCKED }); return; }
    const approval = doc?.approval;
    if (!doc || !approval) return;
    let comment: string | null = null;
    if (decision === "Rejected") {
      comment = await promptDialog({ title: `${doc.doc.code}: Reddet`, label: "Gerekçe", required: true, maxLength: 500, tone: "danger", confirmLabel: "Reddet" });
      if (comment === null) return;
    }
    setBusy(true); setMessage(null);
    try {
      await decideSalesOrder(approval.instanceId, decision, comment, token);
      setReload((n) => n + 1);
    } catch (failure) {
      setMessage({ tone: "error", text: failure instanceof Error ? failure.message : "Karar kaydedilemedi." });
    } finally { setBusy(false); }
  };

  if (loading && !model) return <div className="tenant-custom-page-state" role="status">Belge yükleniyor…</div>;
  if (loadError || !model) return <div className="tenant-custom-page-state tenant-custom-page-error" role="alert">{loadError || "Belge yüklenemedi."}</div>;

  const stateLabel = (code: string) => model.states.find((s) => s.code === code)?.label ?? code;
  const actions: ShellAction[] = [];
  if (isEditable(status)) actions.push({ id: "kaydet", label: !doc && binding.saveLabel ? binding.saveLabel : "Kaydet", kind: "primary", disabled: busy, run: () => void save() });
  if (doc?.approval?.canDecide) {
    actions.push({ id: "karar-onayla", label: "Onayla", kind: "primary", disabled: busy, run: () => void decide("Approved") });
    actions.push({ id: "karar-reddet", label: "Reddet", kind: "normal", disabled: busy, run: () => void decide("Rejected") });
  }
  for (const code of doc ? doc.allowedTransitions : []) {
    const definition = model.transitions.find((t) => t.code === code);
    if (!definition) continue;
    actions.push({ id: code, label: definition.label, kind: definition.requiresReason ? "danger" : isEditable(status) ? "normal" : "primary",
      disabled: busy, run: () => void transition(code) });
  }
  const chain = model.states.filter((s) => !s.terminal);
  const at = chain.findIndex((s) => s.code === status);

  const head = <div className="belge-head">
    <div className="belge-title"><h2>{doc ? doc.doc.code : binding.newTitle}</h2>
      <span className={`belge-badge is-${status}`} data-testid="belge-durum">{stateLabel(status)}</span></div>
    <ol className="belge-chain" aria-label="Durum">
      {chain.map((s, i) => <li key={s.code} className={i < at ? "is-done" : i === at ? "is-current" : ""} aria-current={i === at ? "step" : undefined}>{s.label}</li>)}
    </ol>
    {doc?.approval && <p className="belge-approval" role="status" data-testid="belge-onay">
      Onay bekliyor · karar: {doc.approval.approvers.join(" veya ") || "—"}{doc.approval.canDecide ? " · sıra sizde" : ""}</p>}
    {renderExtra && layout.actions.length > 0 && <div className="belge-extra-actions">{renderExtra(layout.actions)}</div>}
  </div>;

  const field = (code: string) => {
    const definition = model.fields.find((f) => f.code === code);
    if (!definition) return null;
    const label = layout.fieldLabels[code] ?? definition.label;
    const canEdit = fieldEditable(model, code, status) && !busy;
    const id = `belge-alan-${code}`;
    const set = (patch: Partial<Header>) => { setDirty(true); requestId.current = crypto.randomUUID(); setHeader((h) => ({ ...h, ...patch })); };
    let control: ReactNode;
    if (code === "code" && definition.readOnly) control = <input id={id} value={header.code || (doc ? "" : "Kayıtta verilir")} readOnly />;
    else if (definition.type === "date") {
      control = <input id={id} type="date" value={header.values[code] ?? ""} disabled={!canEdit}
        onChange={(e) => set({ values: { ...header.values, [code]: e.target.value } })} />;
    } else if (definition.type === "text" && binding.textFields.includes(code)) {
      control = <input id={id} maxLength={1000} value={header.values[code] ?? ""} disabled={!canEdit}
        onChange={(e) => set({ values: { ...header.values, [code]: e.target.value } })} />;
    } else if (definition.type === "select") {
      control = <select id={id} value={header.values[code] ?? ""} disabled={!canEdit}
        onChange={(e) => set({ values: { ...header.values, [code]: e.target.value } })}>
        {(definition.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>;
    } else if (definition.type === "lookup" && definition.optionsOperation) {
      const isCustomer = code === "customerId";
      // Müşteri ve plasiyer başlığın kendi alanlarında; diğer seçimler (depo, vergi profili) `values[kod]` ve `values[kod + "Label"]` içinde.
      const own = isCustomer || code === "salespersonEmployeeId";
      const value = isCustomer ? header.customerId : own ? header.salespersonEmployeeId : header.values[code] ?? "";
      const shown = isCustomer ? header.customerLabel : own ? header.salespersonLabel : header.values[`${code}Label`] ?? "";
      const picker = pickers[code] ?? { options: [], loading: false };
      control = <LookupInput inputId={id} label={label} raw={value} options={picker.options} loading={picker.loading} error={picker.error}
        allowClear={!definition.required} disabled={!canEdit} placeholder="Ara…" selected={value ? { value, label: shown || value } : null}
        onSearch={(text) => search(code, definition.optionsOperation!, text)}
        onChange={(next, row, nextLabel) => set(isCustomer
          ? { customerId: next, customerLabel: nextLabel, currencyCode: typeof row?.currencyCode === "string" ? row.currencyCode : "" }
          : own ? { salespersonEmployeeId: next, salespersonLabel: nextLabel }
            : { values: { ...header.values, [code]: next, [`${code}Label`]: nextLabel } })} />;
    } else control = <input id={id} value={String((header as unknown as Record<string, unknown>)[code] ?? "")} disabled={!canEdit} readOnly />;
    return <div className="belge-field" key={code}><label htmlFor={id}>{label}{definition.required && canEdit ? " *" : ""}</label>{control}</div>;
  };

  return <div className={`belge-template-page is-${layout.density}`} data-belge-status={status}>
    <PageShell title={title} crumbs={[model.label]} actions={actions} head={head}>
      {message && <div className={`belge-message is-${message.tone}`} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div>}
      {renderExtra && layout.above.length > 0 && renderExtra(layout.above)}
      <Mark id={layout.ids.fields} />
      <section className="belge-fields" aria-label="Başlık alanları">{layout.fields.map(field)}</section>
      {definitions.length > 0 && <section className="belge-fields belge-custom-fields" aria-label="Özel alanlar">
        {definitions.map((d) => {
          const id = `belge-ozel-${d.code}`;
          return <div className="belge-field" key={d.code}><label htmlFor={id}>{d.label}{d.isRequired ? " *" : ""}</label>
            <input id={id} maxLength={d.maxLength || undefined} value={header.customFields[d.code] ?? ""} disabled={!isEditable(status) || busy}
              type={d.dataType === "Date" ? "date" : d.dataType === "Number" || d.dataType === "Decimal" ? "number" : "text"}
              onChange={(e) => { setDirty(true); requestId.current = crypto.randomUUID(); const value = e.target.value; setHeader((h) => ({ ...h, customFields: { ...h.customFields, [d.code]: value } })); }} /></div>;
        })}
      </section>}
      <Mark id={layout.ids.lines} />
      <EditableGrid id="belge-satirlar" title="Satırlar" mode="list" columns={gridColumns} state={grid} sourceRows={[]} rowKey="lineNumber"
        dispatch={(action) => { if (action.type !== "add") { setDirty(true); requestId.current = crypto.randomUUID(); } dispatch(action); }} errors={{}} fixedRowLabel="" addLabel="Satır ekle"
        maxRows={editable ? maxLines : grid.rows.length} disabled={!editable} disabledReason={isEditable(status) ? "" : `${stateLabel(status)} belgenin satırları değişmez.`}
        loading={false} error={calculation.error || undefined} style={{}} pickerFor={pickerFor}
        pickerLabel={(column, value, draft) => draft?.labels?.[column.code] ?? value} calcText={calcText} />
      <div className="belge-bottom">
        {layout.activity && <section className="belge-activity" aria-label="İşlem günlüğü"><h3>İşlem günlüğü</h3>
          {doc?.activityStartedLate && <p className="belge-note">Bu {binding.noun} günlük tutulmaya başlamadan önce oluşturuldu.</p>}
          {(doc?.activity ?? []).length === 0 && !doc?.activityStartedLate && <p className="belge-note">Henüz işlem yok.</p>}
          <ul>{(doc?.activity ?? []).map((a, i) => <li key={i}><strong>{a.step}</strong>{a.message ? <span> — {a.message}</span> : null}
            <time>{new Date(a.createdAt).toLocaleString("tr-TR")}</time></li>)}</ul>
        </section>}
        <Mark id={layout.ids.summary} />
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

