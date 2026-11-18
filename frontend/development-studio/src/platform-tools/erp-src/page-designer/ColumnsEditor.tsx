import { useMemo, useState, type DragEvent, type MouseEvent } from "react";
import { COLUMN_FORMATS, parseColumnFormats, type ColumnFormat } from "./cellFormat";
import { alignmentFor, dropOnto, filterColumns, moveVisible, orderedColumns, rangeCodes, selectableColumns, setColumnFormat, setVisible, showAll, showOnly, toggleTotal, totalable, visibleCodes, type ColumnsResult, type SourceColumn } from "./columnEditing";
import "./page-designer-extras.css";

const formatLabels: Record<ColumnFormat, string> = { text: "Metin", code: "Kod", number: "Sayı", money: "Para", date: "Tarih", status: "Durum" };
const ROW_HEIGHT = 36;
const VIEW_HEIGHT = 420;
const OVERSCAN = 8;

type Patch = Record<string, string[] | undefined>;

/**
 * Izgaranın "Sütunlar" düzenleyicisi (Tüm ayarlar penceresi): sonuç sütunu başına bir satır. Yüzlerce sütunda da akıcı
 * kalsın diye yalnız görünen satırlar çizilir. Kayıt biçimi değişmez: `columns`, `columnFormats`, `totals`.
 */
export function ColumnsEditor({ available, selected, formats, totals, totalsAllowed, disabled, onPatch }: {
  available: SourceColumn[]; selected: string[]; formats: string[]; totals: string[]; totalsAllowed: boolean; disabled?: boolean; onPatch: (patch: Patch) => void;
}) {
  const [term, setTerm] = useState("");
  const [visibleFirst, setVisibleFirst] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [dragCode, setDragCode] = useState<string | null>(null);
  const [dropCode, setDropCode] = useState<string | null>(null);
  const [problem, setProblem] = useState("");
  const columns = useMemo(() => selectableColumns(available), [available]);
  const visible = useMemo(() => visibleCodes(selected, columns), [selected, columns]);
  const visibleSet = useMemo(() => new Set(visible), [visible]);
  const formatMap = useMemo(() => parseColumnFormats(formats), [formats]);
  const rows = useMemo(() => filterColumns(orderedColumns(columns, selected, visibleFirst, (code) => ({ code, label: code })), term), [columns, selected, visibleFirst, term]);
  const order = useMemo(() => rows.map((row) => row.code), [rows]);
  const canDrag = !disabled && visibleFirst && term.trim() === "";

  const apply = (result: ColumnsResult) => {
    if (!result.ok) { setProblem(result.error); return; }
    setProblem("");
    onPatch({ columns: result.columns });
  };
  const pick = (code: string, event: MouseEvent) => {
    if (event.shiftKey && anchor) {
      const range = rangeCodes(order, anchor, code);
      setPicked((current) => [...new Set([...current, ...range])]);
      return;
    }
    setAnchor(code);
    setPicked((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code]);
  };
  const setFormat = (code: string, format: ColumnFormat | "") => {
    const result = setColumnFormat(formats, code, format);
    if (!result.ok) { setProblem(result.error); return; }
    setProblem("");
    onPatch({ columnFormats: result.entries.length ? result.entries : undefined, ...(result.entries.some((entry) => entry.endsWith("=status")) ? {} : { toneMap: undefined }) });
  };
  const setTotal = (code: string, on: boolean) => {
    const result = toggleTotal(totals, code, on);
    if (!result.ok) { setProblem(result.error); return; }
    setProblem("");
    onPatch({ totals: result.totals.length ? result.totals : undefined });
  };
  const onDrop = (event: DragEvent, target: string) => {
    event.preventDefault();
    if (dragCode) { const rect = event.currentTarget.getBoundingClientRect(); apply(dropOnto(selected, columns, dragCode, target, event.clientY > rect.top + rect.height / 2)); }
    setDragCode(null); setDropCode(null);
  };

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + VIEW_HEIGHT) / ROW_HEIGHT) + OVERSCAN);
  const filtered = order;
  if (columns.length === 0) return <p className="pd-binding-note">Sütunlar sorgunun örnek verisi gelince listelenir.</p>;
  return <div className="pd-coled">
    <div className="pd-coled-tools">
      <input type="search" value={term} placeholder="Sütun ara (kod ya da etiket)" aria-label="Sütun ara" onChange={(event) => { setTerm(event.target.value); setScrollTop(0); }}/>
      <button type="button" className="pd-button small" disabled={disabled} onClick={() => apply(showAll(selected, columns, term.trim() ? filtered : undefined))}>Tümünü göster</button>
      <button type="button" className="pd-button small" disabled={disabled} onClick={() => apply(setVisible(selected, columns, filtered, false))}>Tümünü gizle</button>
      <button type="button" className="pd-button small" disabled={disabled || picked.length === 0} onClick={() => apply(showOnly(selected, columns, picked))}>Yalnız seçilileri göster</button>
      <label className="pd-check"><input type="checkbox" checked={visibleFirst} onChange={(event) => setVisibleFirst(event.target.checked)}/>Görünenler önce</label>
    </div>
    <small>{visible.length.toLocaleString("tr-TR")} / {columns.length.toLocaleString("tr-TR")} sütun görünür{picked.length ? ` · ${picked.length} seçili` : ""}{selected.length === 0 ? " · tümü (sorgu sırası)" : ""}. Shift ile tıklayarak aralık seçin; sırayı sürükleyerek ya da oklarla değiştirin.{!canDrag ? " Sürükleme “Görünenler önce” açıkken ve arama boşken çalışır." : ""}</small>
    {problem && <small className="pd-query-warning" role="alert">{problem}</small>}
    <div className="pd-coled-scroll" style={{ maxHeight: VIEW_HEIGHT }} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} role="table" aria-label="Sütunlar" aria-rowcount={rows.length + 1}>
      <div className="pd-coled-row is-head" role="row">
        <span/><span role="columnheader">Seç</span><span role="columnheader">Görünür</span><span role="columnheader">Etiket</span><span role="columnheader">Biçim</span><span role="columnheader">Hizalama</span><span role="columnheader">Genişlik</span><span role="columnheader">Toplam</span><span role="columnheader">Sıra</span>
      </div>
      <div style={{ height: rows.length * ROW_HEIGHT, position: "relative" }}>
        {rows.slice(start, end).map((column, offset) => {
          const index = start + offset;
          const shown = visibleSet.has(column.code);
          const position = visible.indexOf(column.code);
          const format = formatMap[column.code];
          const canTotal = totalsAllowed && (totals.includes(column.code) || totalable(format, column.dataType));
          return <div key={column.code} role="row" aria-rowindex={index + 2} style={{ position: "absolute", top: index * ROW_HEIGHT, left: 0, right: 0 }}
            className={`pd-coled-row${picked.includes(column.code) ? " is-picked" : ""}${shown ? "" : " is-hidden"}${dropCode === column.code ? " is-drop" : ""}`}
            draggable={canDrag && shown} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", column.code); setDragCode(column.code); }}
            onDragEnd={() => { setDragCode(null); setDropCode(null); }}
            onDragOver={(event) => { if (dragCode && shown) { event.preventDefault(); if (dropCode !== column.code) setDropCode(column.code); } }}
            onDrop={(event) => onDrop(event, column.code)}>
            <span className="pd-coled-handle" aria-hidden="true" title={canDrag && shown ? "Sürükleyerek taşıyın" : undefined}>{canDrag && shown ? "⋮⋮" : ""}</span>
            <input type="checkbox" aria-label={`${column.label || column.code} seç`} checked={picked.includes(column.code)} onChange={() => undefined} onClick={(event) => pick(column.code, event)}/>
            <input type="checkbox" aria-label={`${column.label || column.code} görünür`} checked={shown} disabled={disabled} onChange={(event) => apply(setVisible(selected, columns, [column.code], event.target.checked))}/>
            <span className="pd-coled-name" title={`${column.label || column.code} · ${column.code}`}>{column.label || column.code}<small>{column.code}{column.dataType ? ` · ${column.dataType}` : ""}</small></span>
            <select value={format ?? ""} disabled={disabled} aria-label={`${column.code} biçimi`} onChange={(event) => setFormat(column.code, event.target.value as ColumnFormat | "")}>
              <option value="">Otomatik</option>{COLUMN_FORMATS.map((item) => <option key={item} value={item}>{formatLabels[item]}</option>)}
            </select>
            <span title="Biçimden gelir: sayı ve para sağa hizalanır.">{alignmentFor(format, column.dataType)}</span>
            <span title="ERP sütun genişliğini içeriğe göre ayarlar; kayıtlı tanımda ayrı genişlik yoktur.">Otomatik</span>
            <input type="checkbox" aria-label={`${column.code} toplamı`} checked={totals.includes(column.code)} disabled={disabled || !canTotal} title={!totalsAllowed ? "Toplam satırı yalnız sorguya bağlı ızgarada kullanılır." : !canTotal ? "Toplam yalnız sayı ve para sütunlarında alınır." : undefined}
              onChange={(event) => setTotal(column.code, event.target.checked)}/>
            <span className="pd-coled-moves">{shown && <>
              <button type="button" aria-label={`${column.code} başa al`} title="Başa al" disabled={disabled || position === 0} onClick={() => apply(moveVisible(selected, columns, column.code, "start"))}>⤒</button>
              <button type="button" aria-label={`${column.code} yukarı`} title="Yukarı" disabled={disabled || position === 0} onClick={() => apply(moveVisible(selected, columns, column.code, position - 1))}>↑</button>
              <button type="button" aria-label={`${column.code} aşağı`} title="Aşağı" disabled={disabled || position === visible.length - 1} onClick={() => apply(moveVisible(selected, columns, column.code, position + 1))}>↓</button>
              <button type="button" aria-label={`${column.code} sona al`} title="Sona al" disabled={disabled || position === visible.length - 1} onClick={() => apply(moveVisible(selected, columns, column.code, "end"))}>⤓</button>
            </>}</span>
          </div>;
        })}
      </div>
    </div>
  </div>;
}
