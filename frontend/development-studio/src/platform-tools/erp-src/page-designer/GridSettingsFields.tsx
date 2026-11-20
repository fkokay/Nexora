import { useState } from "react";
import type { BindingSuggestion } from "./BindingInput";
import { ConditionFields } from "./ConditionFields";
import { joinConditionTerms, parseWidthWhen, splitConditionTerms, widthWhenText, WIDTH_WHEN, type ConditionTerm } from "./gridColumnSettings";

type Component = { id: string; type: string; name?: string; props: Record<string, unknown> };
const WIDTHS = [3, 4, 6, 8, 9, 12];

/**
 * Izgaranın "Daralma kuralı" (`widthWhen` = "genişlik=koşul"): "Şu durumda genişlik N olsun: <koşul>" formu. Koşul hazır
 * terimlerden (pencere açık, listede satır seçili, giriş dolu) "ve" ile kurulur. Kayıtlı ifade bu terimlerle
 * yazılmamışsa form yalnız gösterir; ifade Gelişmiş'teki ham alandan düzenlenir ve hiçbir zaman yeniden yazılmaz.
 */
export function WidthWhenField({ value, terms, disabled, onChange }: { value: unknown; terms: ConditionTerm[]; disabled?: boolean; onChange: (next: string | undefined) => void }) {
  const parsed = parseWidthWhen(value);
  const parts = parsed ? splitConditionTerms(parsed.condition, terms) : [];
  const [draftWidth, setDraftWidth] = useState(8);
  const width = parsed?.width ?? draftWidth;
  const labelOf = (expression: string) => terms.find((term) => term.expression === expression)?.label ?? expression;
  const present = typeof value === "string" && value !== "";
  if (present && parts === null) return <div className="pd-field">Daralma kuralı
    <div className="pd-rule is-raw"><small>Kural ham ifadeyle yazılmış:</small> <code>{String(value)}</code></div>
    <small>Bu ifade hazır seçimlerle gösterilemiyor; “Gelişmiş” bölümündeki ham koşul alanından düzenleyin.</small>
  </div>;
  const current = parts ?? [];
  const write = (nextWidth: number, nextParts: string[]) => onChange(nextParts.length > 0 ? widthWhenText(nextWidth, joinConditionTerms(nextParts)) : undefined);
  const available = terms.filter((term) => !current.includes(term.expression));
  return <div className="pd-field">Daralma kuralı
    <div className="pd-rule">
      <span>Şu durumda genişlik</span>
      <select value={width} disabled={disabled} aria-label="Koşullu genişlik" onChange={(event) => { const next = Number(event.target.value); setDraftWidth(next); if (current.length > 0) write(next, current); }}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <span>olsun:</span>
      {current.map((expression, index) => <span key={expression} className="pd-rule-term">{index > 0 && <em>ve</em>}{labelOf(expression)}
        <button type="button" aria-label={`${labelOf(expression)} koşulunu kaldır`} disabled={disabled} onClick={() => write(width, current.filter((item) => item !== expression))}>✕</button></span>)}
      {available.length > 0 ? <select value="" disabled={disabled} aria-label="Koşul ekle" onChange={(event) => { if (event.target.value) write(width, [...current, event.target.value]); }}>
        <option value="">{current.length > 0 ? "＋ ve…" : "＋ Koşul seçin"}</option>
        {available.map((term) => <option key={term.expression} value={term.expression}>{term.label}</option>)}
      </select> : current.length === 0 && <small>Hazır koşul için sayfaya adlı bir pencere, liste ya da giriş ekleyin; ya da Gelişmiş'ten ham ifade yazın.</small>}
    </div>
    <small>Örn. sağda panel açılınca liste daralır. Koşul yoksa liste her zaman yukarıdaki genişlikte çizilir.</small>
  </div>;
}

/** Gelişmiş: ham `widthWhen` ("genişlik=koşul") alanı. */
export function RawWidthWhenField({ value, disabled, onChange }: { value: unknown; disabled?: boolean; onChange: (next: string | undefined) => void }) {
  const text = typeof value === "string" ? value : "";
  return <label className="pd-field">Ham koşullu genişlik<small>“genişlik=koşul” yazın; koşul tutunca bileşen bu genişlikte çizilir (ör. <code>{"8=liste.seciliSatir.id != null"}</code>).</small>
    <input value={text} maxLength={300} spellCheck={false} disabled={disabled} placeholder="8=liste.seciliSatir.id != null"
      onChange={(event) => onChange(event.target.value.trim() ? event.target.value : undefined)}/>
    {text !== "" && !WIDTH_WHEN.test(text) && <small className="pd-query-warning">'widthWhen' genişlik=koşul biçiminde olmalıdır (genişlik 1–12).</small>}</label>;
}

/** Genişlik seçimi (3/4/6/8/9/12; başka bir kayıtlı değer de etkin gösterilir). */
export function WidthSegment({ span, disabled, onChange }: { span: number; disabled?: boolean; onChange: (width: number) => void }) {
  return <div className="pd-field">Genişlik<small>Tuvalde bloğun sağ kenarını sürükleyerek de değiştirebilirsiniz.</small><div className="pd-segment">
    {WIDTHS.map((width) => <button type="button" key={width} disabled={disabled} className={span === width ? "active" : ""} onClick={() => onChange(width)}>{width}</button>)}
    {!WIDTHS.includes(span) && <button type="button" className="active">{span}</button>}
  </div></div>;
}

/** Görünürlük: "Her zaman" (`visibleWhen` yok) ya da "Koşula bağlı" (koşul alanı). */
export function VisibilityField({ props, pageNames, suggestions, disabled, onSet }: {
  props: Record<string, unknown>; pageNames: string[]; suggestions: BindingSuggestion[]; disabled?: boolean;
  onSet: (key: "visibleWhen" | "disabledWhen" | "disabledReason", value: string | undefined) => void;
}) {
  const stored = typeof props.visibleWhen === "string" && props.visibleWhen !== "";
  const [conditional, setConditional] = useState(stored);
  const on = stored || conditional;
  return <>
    <div className="pd-field">Görünürlük<div className="pd-segment" role="group" aria-label="Görünürlük">
      <button type="button" disabled={disabled} aria-pressed={!on} className={!on ? "active" : ""} onClick={() => { setConditional(false); if (stored) onSet("visibleWhen", undefined); }}>Her zaman</button>
      <button type="button" disabled={disabled} aria-pressed={on} className={on ? "active" : ""} onClick={() => setConditional(true)}>Koşula bağlı</button>
    </div></div>
    {on && <ConditionFields props={props} allowDisabled={false} pageNames={pageNames} suggestions={suggestions} disabled={disabled} onSet={onSet}/>}
  </>;
}

/**
 * Satıra çift tıklama / Enter: ERP'de sayfanın İşlem Çubuğu "Aç" komutunu çalıştırır (`openButton` ya da kayıt
 * penceresi `formDialog`). Izgaranın kendi özelliği yoktur; seçim İşlem Çubuğu'na yazılır.
 */
export function OpenRowField({ table, components, labelOf, disabled, onPatchBar }: {
  table: Component; components: Component[]; labelOf: (component: Component) => string; disabled?: boolean;
  onPatchBar: (barId: string, patch: Record<string, string | undefined>) => void;
}) {
  const bar = components.find((component) => component.type === "actionBar");
  const head = <span className="pd-rowact-kind">Çift tıklama / Enter</span>;
  if (!bar) return <div className="pd-rowact-item">{head}<small>Sayfada İşlem Çubuğu yok: çift tıklama ve Enter satırı yalnız seçer. Açmak için İşlem Çubuğu ekleyip “Aç” komutunu bir düğmeye bağlayın.</small></div>;
  const dialogId = typeof bar.props.formDialog === "string" ? bar.props.formDialog : "";
  if (dialogId) {
    const dialog = components.find((component) => component.id === dialogId);
    return <div className="pd-rowact-item">{head}<small>Kayıt penceresi açılır: <b>{dialog ? labelOf(dialog) : dialogId}</b> (İşlem Çubuğu’ndaki “Kayıt penceresi”).</small></div>;
  }
  const openId = typeof bar.props.openButton === "string" ? bar.props.openButton : "";
  const buttons = components.filter((component) => component.type === "button");
  const button = buttons.find((item) => item.id === openId);
  const usesTable = !!button && !!table.name && new RegExp(`\\{\\{\\s*${table.name}\\.seciliSatir\\b`).test(JSON.stringify(button.props));
  return <div className="pd-rowact-item">{head}
    <select value={openId} disabled={disabled} aria-label="Çift tıklama / Enter düğmesi" onChange={(event) => onPatchBar(bar.id, { openButton: event.target.value || undefined })}>
      <option value="">Yok (yalnız seçer)</option>
      {buttons.map((item) => <option key={item.id} value={item.id}>{labelOf(item)}{item.name ? ` (${item.name})` : ""}</option>)}
      {openId && !button && <option value={openId}>{openId}</option>}
    </select>
    <small>İşlem Çubuğu’nun “Aç” komutudur; sayfadaki tüm listelerde ortaktır.{button && !usesTable ? ` Seçilen düğme bu listenin seçili satırını (${table.name ? `{{${table.name}.seciliSatir…}}` : "liste adı yok"}) kullanmıyor; bu listede çift tıklama satırı yalnız seçer.` : ""}</small>
  </div>;
}

export const GRID_TOOLS = [
  ["showGridSearch", "Arama kutusu"], ["showColumnFilters", "Sütun süzgeçleri"], ["showColumnChooser", "Sütun seçici"],
  ["showExport", "Dışa aktarma (XLSX/CSV)"], ["showCsv", "CSV düğmesi"], ["showPivot", "Pivot görünümü"],
  // Eski listeler gibi: satır seçiliyken yüzen çubukta "Excel (seçilenler)" (dışa aktarma kapalıyken de çalışır).
  ["showSelectedExport", "Excel (seçilenler)"],
] as const;
export type GridToolKey = typeof GRID_TOOLS[number][0];

/** Açma/kapama yaması: kapalıysa `false` yazılır, açılınca özellik silinir (yoksa açık; kayıt sade kalır). */
export const gridToolPatch = (key: GridToolKey, on: boolean): Partial<Record<GridToolKey, false | undefined>> => ({ [key]: on ? undefined : false });

/** "Tablo araçları": ızgara üst çubuğundaki araçlar (yoksa hepsi açık). */
export function GridToolsField({ props, disabled, onPatch }: { props: Record<string, unknown>; disabled?: boolean; onPatch: (patch: Partial<Record<GridToolKey, false | undefined>>) => void }) {
  return <div className="pd-field">Tablo araçları<small>ERP'de listenin üst çubuğunda gösterilir; kapatılan araç çizilmez.</small>
    <div className="pd-grid-tools">{GRID_TOOLS.map(([key, label]) => <label key={key} className="pd-check pd-switch">
      <input type="checkbox" role="switch" checked={props[key] !== false} disabled={disabled || (key === "showCsv" && props.showExport === false)} onChange={(event) => onPatch(gridToolPatch(key, event.target.checked))}/>{label}</label>)}</div>
  </div>;
}
