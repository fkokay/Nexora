import { useEffect, useMemo, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { COLUMN_FORMATS, TONES, parseColumnFormats, type ColumnFormat, type Tone } from "./cellFormat";
import { dropOnto, filterColumns, moveVisible, orderedColumns, rangeCodes, selectableColumns, setColumnFormat, setVisible, showAll, toggleTotal, totalable, visibleCodes, type ColumnsResult, type SourceColumn } from "./columnEditing";
import {
  MAX_CODE_LENGTH, MAX_LABEL_LENGTH, orphanEntries, pairMapOf, renameTone, setPair, setTone, setValueLabel, valueLabelsAllowed, valueRowsFor, withoutEntry,
  type EntriesResult, type ValueRow,
} from "./gridColumnSettings";
import "./page-designer-extras.css";

const formatLabels: Record<ColumnFormat, string> = { text: "Metin", code: "Kod", number: "Sayı", money: "Tutar", date: "Tarih", datetime: "Tarih ve saat", status: "Durum etiketi" };
export const toneLabels: Record<Tone, string> = { success: "Olumlu", warning: "Dikkat", danger: "Hata", info: "Bilgi" };
const toneOrder: Tone[] = ["success", "warning", "danger", "info"];
const ROW_HEIGHT = 38;
const DETAIL_HEIGHT = 232;
/** Sanal liste için ekranın en az bu kadarı çizilir; liste pencereyi doldurur (yüksekliği CSS belirler). */
const VIEW_HEIGHT = 900;
const OVERSCAN = 8;

type Patch = Record<string, string[] | undefined>;
const orUndefined = (entries: string[]) => entries.length > 0 ? entries : undefined;

/**
 * Izgaranın "Sütunlar" sekmesi: sonuç sütunu başına bir satır (göster, başlık, kaynak, biçim, birim, toplam); ▸ ile
 * açılan ayrıntıda değer → etiket → renk listesi. Yüzlerce sütunda akıcı kalsın diye yalnız görünen satırlar çizilir.
 * Kayıt biçimi değişmez: `columns`, `columnLabels`, `columnFormats`, `columnUnits`, `totals`, `valueLabels`, `toneMap`.
 */
export function ColumnsEditor({ available, selected, formats, totals, totalsAllowed, labels, units, valueLabels, toneMap, disabled, onPatch }: {
  available: SourceColumn[]; selected: string[]; formats: string[]; totals: string[]; totalsAllowed: boolean;
  labels: string[]; units: string[]; valueLabels: string[]; toneMap: string[]; disabled?: boolean; onPatch: (patch: Patch) => void;
}) {
  const [term, setTerm] = useState("");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [dropCode, setDropCode] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const columns = useMemo(() => selectableColumns(available), [available]);
  const codes = useMemo(() => columns.map((column) => column.code), [columns]);
  const visible = useMemo(() => visibleCodes(selected, columns), [selected, columns]);
  const visibleSet = useMemo(() => new Set(visible), [visible]);
  const formatMap = useMemo(() => parseColumnFormats(formats), [formats]);
  const labelMap = useMemo(() => pairMapOf(labels), [labels]);
  const unitMap = useMemo(() => pairMapOf(units), [units]);
  const rows = useMemo(() => filterColumns(orderedColumns(columns, selected, true, (code) => ({ code, label: code })), term), [columns, selected, term]);
  const order = useMemo(() => rows.map((row) => row.code), [rows]);
  const orphans = useMemo(() => orphanEntries({ columnLabels: labels, columnUnits: units, valueLabels }, codes), [labels, units, valueLabels, codes]);
  const canDrag = !disabled && term.trim() === "";

  const apply = (result: ColumnsResult) => {
    if (!result.ok) { setProblem(result.error); return; }
    setProblem("");
    onPatch({ columns: result.columns });
  };
  const write = (prop: string, result: EntriesResult, extra: Patch = {}) => {
    if (!result.ok) { setProblem(result.error); return false; }
    setProblem("");
    onPatch({ [prop]: orUndefined(result.entries), ...extra });
    return true;
  };
  const toggleShown = (code: string, on: boolean, event: MouseEvent) => {
    if (event.shiftKey && anchor && anchor !== code) apply(setVisible(selected, columns, rangeCodes(order, anchor, code), on));
    else apply(setVisible(selected, columns, [code], on));
    setAnchor(code);
  };
  const setFormat = (code: string, format: ColumnFormat | "") => {
    const result = setColumnFormat(formats, code, format);
    if (!result.ok) { setProblem(result.error); return; }
    setProblem("");
    onPatch({ columnFormats: orUndefined(result.entries), ...(result.entries.some((entry) => entry.endsWith("=status")) ? {} : { toneMap: undefined }) });
  };
  const setTotal = (code: string, on: boolean) => {
    const result = toggleTotal(totals, code, on);
    if (!result.ok) { setProblem(result.error); return; }
    setProblem("");
    onPatch({ totals: orUndefined(result.totals) });
  };
  const onDrop = (event: DragEvent, target: string) => {
    event.preventDefault();
    if (dragCode) { const rect = event.currentTarget.getBoundingClientRect(); apply(dropOnto(selected, columns, dragCode, target, event.clientY > rect.top + rect.height / 2)); }
    setDragCode(null); setDropCode(null);
  };
  const gripKeys = (event: KeyboardEvent, code: string, position: number) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    apply(moveVisible(selected, columns, code, position + (event.key === "ArrowUp" ? -1 : 1)));
  };

  // Açık ayrıntı satırı kendinden sonraki satırları DETAIL_HEIGHT kadar aşağı iter.
  const expandedIndex = expanded ? order.indexOf(expanded) : -1;
  const topOf = (index: number) => index * ROW_HEIGHT + (expandedIndex >= 0 && index > expandedIndex ? DETAIL_HEIGHT : 0);
  const indexAt = (y: number) => expandedIndex >= 0 && y > (expandedIndex + 1) * ROW_HEIGHT + DETAIL_HEIGHT ? Math.floor((y - DETAIL_HEIGHT) / ROW_HEIGHT) : Math.floor(y / ROW_HEIGHT);
  const start = Math.max(0, indexAt(scrollTop) - OVERSCAN);
  const end = Math.min(rows.length, indexAt(scrollTop + VIEW_HEIGHT) + 1 + OVERSCAN);
  const totalHeight = rows.length * ROW_HEIGHT + (expandedIndex >= 0 ? DETAIL_HEIGHT : 0);
  if (columns.length === 0) return <p className="pd-binding-note">Sütunlar sorgunun örnek verisi gelince listelenir. Sorgular sekmesinde “Çalıştır ve önizle”yi kullanın.</p>;
  return <div className="pd-coled">
    <div className="pd-coled-tools">
      <input type="search" value={term} placeholder="Sütun ara" aria-label="Sütun ara" onChange={(event) => { setTerm(event.target.value); setScrollTop(0); }}/>
      <button type="button" className="pd-button small" disabled={disabled} onClick={() => apply(showAll(selected, columns, term.trim() ? order : undefined))}>Tümünü göster</button>
      <button type="button" className="pd-button small" disabled={disabled} onClick={() => apply(setVisible(selected, columns, order, false))}>Tümünü gizle</button>
      <small className="pd-coled-count">{visible.length.toLocaleString("tr-TR")} / {columns.length.toLocaleString("tr-TR")} sütun görünür{selected.length === 0 ? " · tümü (sorgu sırası)" : ""} · sırayı sürükleyerek değiştirin</small>
    </div>
    <small className="pd-coled-hint">Shift ile “Göster” kutusuna tıklayarak aralığı birlikte gösterin ya da gizleyin. Tutamaçta ↑/↓ ile de taşınır.{!canDrag && term.trim() !== "" ? " Arama açıkken sürükleme kapalıdır." : ""}</small>
    {problem && <small className="pd-query-warning" role="alert">{problem}</small>}
    <div className="pd-coled-scroll" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} role="table" aria-label="Sütunlar" aria-rowcount={rows.length + 1}>
      <div className="pd-coled-row is-head" role="row">
        <span/><span role="columnheader">Göster</span><span role="columnheader">Başlık</span><span role="columnheader">Kaynak</span><span role="columnheader">Biçim</span><span role="columnheader">Birim</span><span role="columnheader">Toplam</span><span/>
      </div>
      <div style={{ height: totalHeight, position: "relative" }}>
        {rows.slice(start, end).map((column, offset) => {
          const index = start + offset;
          const code = column.code;
          const shown = visibleSet.has(code);
          const position = visible.indexOf(code);
          const format = formatMap[code];
          const canTotal = totalsAllowed && (totals.includes(code) || totalable(format, column.dataType));
          const open = expanded === code;
          const defaultLabel = column.label && column.label !== code ? column.label : code;
          const unit = unitMap[code] ?? "";
          const draggable = canDrag && shown;
          return <div key={code} style={{ position: "absolute", top: topOf(index), left: 0, right: 0 }}>
            <div role="row" aria-rowindex={index + 2}
              className={`pd-coled-row${shown ? "" : " is-hidden"}${dropCode === code ? " is-drop" : ""}${open ? " is-open" : ""}`}
              onDragOver={(event) => { if (dragCode && shown) { event.preventDefault(); if (dropCode !== code) setDropCode(code); } }}
              onDrop={(event) => onDrop(event, code)}>
              <span className="pd-coled-handle" role="button" tabIndex={draggable ? 0 : -1} aria-label={`${defaultLabel} sütununu taşı`} title={draggable ? "Sürükleyerek ya da ↑/↓ ile taşıyın" : undefined}
                draggable={draggable} aria-disabled={!draggable}
                onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", code); setDragCode(code); }}
                onDragEnd={() => { setDragCode(null); setDropCode(null); }}
                onKeyDown={(event) => { if (draggable) gripKeys(event, code, position); }}>{draggable ? "⋮⋮" : ""}</span>
              <input type="checkbox" aria-label={`${defaultLabel} göster`} checked={shown} disabled={disabled} onChange={() => undefined} onClick={(event) => toggleShown(code, !shown, event)}/>
              <input className="pd-coled-title" value={labelMap[code] ?? ""} placeholder={defaultLabel} maxLength={MAX_LABEL_LENGTH} disabled={disabled} aria-label={`${code} başlığı`}
                title="Boşsa sorgunun sütun adı kullanılır."
                onChange={(event) => write("columnLabels", setPair(labels, code, event.target.value.replace(/=/g, "").trim() === "" ? undefined : event.target.value.replace(/=/g, ""), { what: "sütun başlığı" }))}/>
              <span className="pd-coled-code" title={`${code}${column.dataType ? ` · ${column.dataType}` : ""}`}>{code}</span>
              <select value={format ?? ""} disabled={disabled} aria-label={`${code} biçimi`} onChange={(event) => setFormat(code, event.target.value as ColumnFormat | "")}>
                <option value="">Otomatik</option>{COLUMN_FORMATS.map((item) => <option key={item} value={item}>{formatLabels[item]}</option>)}
              </select>
              <UnitSelect code={code} value={unit} codes={codes} disabled={disabled || code.includes("=")}
                onChange={(next) => write("columnUnits", setPair(units, code, next || undefined, { maxValue: MAX_CODE_LENGTH, what: "sütun birimi" }))}/>
              <input type="checkbox" aria-label={`${code} toplamı`} checked={totals.includes(code)} disabled={disabled || !canTotal}
                title={!totalsAllowed ? "Toplam satırı yalnız sorguya bağlı ızgarada kullanılır." : !canTotal ? "Toplam yalnız sayı ve tutar sütunlarında alınır." : "Toplam satırında göster"}
                onChange={(event) => setTotal(code, event.target.checked)}/>
              <button type="button" className="pd-coled-chev" aria-expanded={open} aria-label={`${code} değerleri ve renkleri`} title="Değerler ve renkleri"
                onClick={() => setExpanded(open ? null : code)}>{open ? "▾" : "▸"}</button>
            </div>
            {open && <ValueRowsDetail code={code} isStatus={format === "status"} valueLabels={valueLabels} toneMap={toneMap} disabled={disabled} write={write}/>}
          </div>;
        })}
      </div>
    </div>
    {orphans.length > 0 && <details className="pd-coled-orphans">
      <summary>Sorguda olmayan sütunlara ait {orphans.length} ayar</summary>
      <small>Sorgu değiştiyse bu ayarlar artık kullanılmaz ama sınırı (20 başlık, 20 birim, 40 değer etiketi) doldurur.</small>
      <ul>{orphans.map((orphan, index) => <li key={`${orphan.prop}-${index}`}>
        <code>{orphan.entry}</code><small>{orphan.prop === "columnLabels" ? "başlık" : orphan.prop === "columnUnits" ? "birim" : "değer etiketi"}{orphan.code === null ? " · bozuk" : ""}</small>
        <button type="button" className="pd-button small" disabled={disabled}
          onClick={() => onPatch({ [orphan.prop]: withoutEntry(orphan.prop === "columnLabels" ? labels : orphan.prop === "columnUnits" ? units : valueLabels, orphan.entry) })}>Sil</button>
      </li>)}</ul>
    </details>}
  </div>;
}

/** ▸ ayrıntısı: sütunun değer → etiket listesi; durum sütununda her etikete renk (Olumlu/Dikkat/Hata/Bilgi). */
function ValueRowsDetail({ code, isStatus, valueLabels, toneMap, disabled, write }: {
  code: string; isStatus: boolean; valueLabels: string[]; toneMap: string[]; disabled?: boolean;
  write: (prop: string, result: EntriesResult, extra?: Patch) => boolean;
}) {
  const rows = valueRowsFor(code, valueLabels, toneMap, isStatus);
  const [draftValue, setDraftValue] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftTone, setDraftTone] = useState<Tone | "">("");
  const allowed = valueLabelsAllowed(code);
  const add = () => {
    const value = draftValue.replace(/=/g, "");
    const label = draftLabel.replace(/=/g, "").trim();
    if (label === "") {
      // Etiketsiz satır yalnız renk eşlemesidir (durum sütununda ham değere göre).
      if (!isStatus || !draftTone || !value.trim()) return;
      if (write("toneMap", setTone(toneMap, value, draftTone))) { setDraftValue(""); setDraftTone(""); }
      return;
    }
    const labelled = setValueLabel(valueLabels, code, value, label);
    if (!labelled.ok) { write("valueLabels", labelled); return; }
    const toned = isStatus && draftTone ? setTone(toneMap, label, draftTone) : { ok: true as const, entries: toneMap };
    if (!toned.ok) { write("toneMap", toned); return; }
    if (write("valueLabels", labelled, isStatus && draftTone ? { toneMap: toned.entries.length ? toned.entries : undefined } : {})) { setDraftValue(""); setDraftLabel(""); setDraftTone(""); }
  };
  return <div className="pd-coled-detail" style={{ height: DETAIL_HEIGHT }}>
    <b>Değerler ve renkleri</b><small>Hücrede ham değer yerine etiket görünür.{isStatus ? " Renkler etiketin metnine göre seçilir ve tüm durum sütunlarında ortaktır." : " Renk için sütunun biçimini “Durum etiketi” yapın."}{!allowed ? " Bu sütunun kodunda “:” olduğu için etiket verilemez." : ""}</small>
    <div className="pd-coled-values">
      {rows.length === 0 && <small className="pd-coled-empty">Henüz değer yok.</small>}
      {rows.map((row, index) => <ValueRowItem key={`${row.toneOnly ? "t" : "v"}${index}`} row={row} code={code} isStatus={isStatus} valueLabels={valueLabels} toneMap={toneMap} disabled={disabled || !allowed && !row.toneOnly} write={write}/>)}
    </div>
    <div className="pd-coled-add">
      <input value={draftValue} maxLength={MAX_LABEL_LENGTH} placeholder="Ham değer (ör. None)" aria-label={`${code} yeni değer`} disabled={disabled} onChange={(event) => setDraftValue(event.target.value)}/>
      <span aria-hidden="true">→</span>
      <input value={draftLabel} maxLength={MAX_LABEL_LENGTH} placeholder={isStatus ? "Etiket (boşsa yalnız renk)" : "Etiket"} aria-label={`${code} yeni etiket`} disabled={disabled || !allowed} onChange={(event) => setDraftLabel(event.target.value)}/>
      {isStatus && <ToneSelectInline value={draftTone || undefined} label={`${code} yeni renk`} disabled={disabled} allowNone onChange={(tone) => setDraftTone(tone ?? "")}/>}
      <button type="button" className="pd-button small" disabled={disabled || (draftLabel.trim() === "" ? !(isStatus && draftTone && draftValue.trim()) : !allowed)} onClick={add}>＋ Değer ekle</button>
    </div>
  </div>;
}

function ValueRowItem({ row, code, isStatus, valueLabels, toneMap, disabled, write }: {
  row: ValueRow; code: string; isStatus: boolean; valueLabels: string[]; toneMap: string[]; disabled?: boolean;
  write: (prop: string, result: EntriesResult, extra?: Patch) => boolean;
}) {
  // Etiket boş bırakılamaz: yazılırken yerel tutulur, geçerli olunca kaydedilir.
  const [label, setLabel] = useState(row.label);
  const [value, setValue] = useState(row.value);
  // Satırlar sıra numarasıyla anahtarlanır (yazarken odak kaybolmasın); dışarıdan gelen değişiklik yerel metni günceller.
  useEffect(() => setLabel(row.label), [row.label]);
  useEffect(() => setValue(row.value), [row.value]);
  const toneText = row.toneOnly ? row.value : row.label;
  const commitLabel = (next: string) => {
    setLabel(next);
    const clean = next.replace(/=/g, "").trim();
    if (clean === "" || row.toneOnly) return;
    const result = setValueLabel(valueLabels, code, row.value, clean);
    if (!result.ok) { write("valueLabels", result); return; }
    const renamed = row.tone ? renameTone(toneMap, row.label, clean) : toneMap;
    write("valueLabels", result, renamed !== toneMap ? { toneMap: renamed.length ? renamed : undefined } : {});
  };
  const commitValue = (next: string) => {
    setValue(next);
    const clean = next.replace(/=/g, "");
    if (row.toneOnly) {
      if (clean.trim() === "" || clean.length > MAX_LABEL_LENGTH) return;
      const renamed = renameTone(toneMap, row.value, clean);
      if (renamed.some((entry, index) => entry !== toneMap[index])) write("toneMap", { ok: true, entries: renamed });
      return;
    }
    if (clean === row.value) return;
    write("valueLabels", setValueLabel(valueLabels, code, clean, row.label, row.value));
  };
  const remove = () => {
    if (row.toneOnly) { write("toneMap", setTone(toneMap, row.value, undefined)); return; }
    const removed = setValueLabel(valueLabels, code, row.value, undefined);
    if (!removed.ok) return;
    // Aynı etiketi kullanan başka değer kalmadıysa rengi de kaldırılır.
    const stillUsed = removed.entries.some((entry) => entry.endsWith(`=${row.label}`));
    const toned = row.tone && !stillUsed ? setTone(toneMap, row.label, undefined) : null;
    write("valueLabels", removed, toned?.ok ? { toneMap: toned.entries.length ? toned.entries : undefined } : {});
  };
  return <div className="pd-coled-value">
    <input value={value} maxLength={MAX_LABEL_LENGTH} aria-label={`${code} değeri`} placeholder="(boş)" disabled={disabled} onChange={(event) => commitValue(event.target.value)}/>
    {!row.toneOnly && <><span aria-hidden="true">→</span>
      <input value={label} maxLength={MAX_LABEL_LENGTH} aria-label={`${code} · ${row.value} etiketi`} disabled={disabled} aria-invalid={label.trim() === "" ? true : undefined} onChange={(event) => commitLabel(event.target.value)}/></>}
    {row.toneOnly && <small className="pd-coled-tone-only">yalnız renk</small>}
    {isStatus && <ToneSelectInline value={row.tone} label={`${code} · ${toneText} rengi`} disabled={disabled} allowNone={!row.toneOnly}
      onChange={(tone) => write("toneMap", setTone(toneMap, toneText, tone))}/>}
    <button type="button" className="pd-icon-button" aria-label={`${row.value || "(boş)"} değerini sil`} disabled={disabled} onClick={remove}>✕</button>
  </div>;
}

/**
 * Birim sütunu seçimi. Yüzlerce sütunda her görünen satır tüm seçenekleri çizmesin diye liste yalnız odaklanınca
 * (fare ya da klavye) doldurulur; o zamana kadar yalnız seçili değer vardır.
 */
function UnitSelect({ code, value, codes, disabled, onChange }: { code: string; value: string; codes: string[]; disabled?: boolean; onChange: (next: string) => void }) {
  const [armed, setArmed] = useState(false);
  return <select value={value} disabled={disabled} aria-label={`${code} birimi`} title="Değerin ardına aynı satırdaki bu sütunun değeri yazılır (ör. 5 EA)."
    onFocus={() => setArmed(true)} onMouseDown={() => setArmed(true)} onChange={(event) => onChange(event.target.value)}>
    <option value="">—</option>
    {armed ? codes.filter((other) => other !== code).map((other) => <option key={other} value={other}>{other}</option>) : value && codes.includes(value) && <option value={value}>{value}</option>}
    {value && !codes.includes(value) && <option value={value}>{value} (sorguda yok)</option>}
  </select>;
}

function ToneSelectInline({ value, label, disabled, allowNone, onChange }: { value: Tone | undefined; label: string; disabled?: boolean; allowNone?: boolean; onChange: (tone: Tone | undefined) => void }) {
  return <select className={`pd-coled-tone${value ? ` tone-${value}` : ""}`} value={value ?? ""} aria-label={label} disabled={disabled} onChange={(event) => onChange(TONES.includes(event.target.value as Tone) ? event.target.value as Tone : undefined)}>
    {(allowNone || !value) && <option value="">Renk yok</option>}
    {toneOrder.map((tone) => <option key={tone} value={tone}>{toneLabels[tone]}</option>)}
  </select>;
}
