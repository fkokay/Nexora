import type { CSSProperties, ReactNode } from "react";
import { formatCell, toneFor, type ColumnFormat, type Tone } from "./cellFormat";
import type { QueryState } from "./usePageQueries";

export type CompactVariant = "bars" | "list";

type Cell = (row: Record<string, unknown>, code: string) => string;

/**
 * Dar panellerde (ör. eski Stok Kartları detay paneli) veri listesinin sıkı görünümleri:
 * - `bars`: ilk sütun etiket, ikinci sütun değer; değerin en büyüğe oranı kadar çubuk (eski "Depo dağılımı").
 * - `list`: ilk sütun ana metin, aradaki sütunlar " · " ile alt satır, son sütun sağda değer. Ara sütunlardan biri
 *   `toneMap` ile tonlanırsa değer o tonu alır (olumlu "+", hata "−" önekiyle; eski "Son hareketler"); ana metin boşsa
 *   tonlanan etiket yazılır.
 */
export function CompactList({ variant, state, columns, title, emptyText, limit, cell, toneMap, style }: {
  variant: CompactVariant; state: QueryState; columns: string[]; title: string; emptyText: string; limit?: number;
  cell: Cell; toneMap: { key: string; tone: Tone }[]; style: CSSProperties;
}) {
  const rows = limit ? state.rows.slice(0, limit) : state.rows;
  let body: ReactNode;
  if (state.loading && state.rows.length === 0) body = <p className="tenant-page-compact-note" role="status">Yükleniyor…</p>;
  else if (state.error) body = <p className="tenant-page-compact-note is-error" role="alert">{state.error}</p>;
  else if (rows.length === 0) body = <p className="tenant-page-compact-note">{emptyText || "Kayıt yok."}</p>;
  else if (variant === "bars") body = <BarRows rows={rows} columns={columns} cell={cell} />;
  else body = <ListRows rows={rows} columns={columns} cell={cell} toneMap={toneMap} />;
  return <section className={`tenant-page-compact is-${variant}`} style={style}>
    {title && <div className="tenant-page-compact-title">{title}</div>}
    {body}
  </section>;
}

const numeric = (value: unknown) => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
};

function BarRows({ rows, columns, cell }: { rows: Record<string, unknown>[]; columns: string[]; cell: Cell }) {
  const [labelCode, valueCode] = columns;
  const max = Math.max(0, ...rows.map((row) => numeric(row[valueCode]) ?? 0));
  return <>{rows.map((row, index) => {
    const value = numeric(row[valueCode]);
    const label = cell(row, labelCode);
    const width = max > 0 && value ? Math.max(0, (value / max) * 100) : 0;
    return <div key={index} className="tenant-page-compact-bar-row">
      <span title={label}>{label}</span>
      <span className="tenant-page-compact-bar" aria-hidden="true"><i style={{ width: `${width}%` }} /></span>
      <b>{value === null ? "—" : cell(row, valueCode)}</b>
    </div>;
  })}</>;
}

function ListRows({ rows, columns, cell, toneMap }: { rows: Record<string, unknown>[]; columns: string[]; cell: Cell; toneMap: { key: string; tone: Tone }[] }) {
  const [mainCode, ...rest] = columns;
  const valueCode = rest.length > 0 ? rest[rest.length - 1] : undefined;
  const metaCodes = rest.slice(0, -1);
  return <ul className="tenant-page-compact-items">{rows.map((row, index) => {
    const meta = metaCodes.map((code) => ({ code, text: cell(row, code) })).filter((item) => item.text && item.text !== "—");
    const toned = meta.map((item) => ({ ...item, tone: toneFor(item.text, toneMap) })).find((item) => item.tone);
    const main = cell(row, mainCode);
    const mainText = main && main !== "—" ? main : toned?.text ?? "—";
    // Tonlanan sütun (ör. Giriş/Çıkış) değerin işaretini ve rengini verir; alt satıra yazılmaz.
    const plain = meta.filter((item) => !toned || item.code !== toned.code);
    const sign = toned?.tone === "success" ? "+" : toned?.tone === "danger" ? "−" : "";
    return <li key={index}>
      <span className="tenant-page-compact-main"><span>{mainText}</span>{plain.length > 0 && <small>{plain.map((item) => item.text).join(" · ")}</small>}</span>
      {valueCode && <b className={toned?.tone ? `tone-${toned.tone}` : undefined}>{sign}{cell(row, valueCode)}</b>}
    </li>;
  })}</ul>;
}

/** Hücre metni: değer etiketi, biçim ve aynı satırdaki birim (`columnUnits`). */
export function compactCell(labels: Record<string, Record<string, string>>, formats: Record<string, ColumnFormat>, units: Record<string, string>,
  displayText: (value: unknown) => string): Cell {
  return (row, code) => {
    const own = labels[code];
    const raw = row[code];
    const key = raw == null ? "" : typeof raw === "object" ? null : String(raw);
    const value = own && key !== null && Object.prototype.hasOwnProperty.call(own, key) ? own[key] : formatCell(raw, formats[code]);
    const unit = units[code] ? displayText(row[units[code]]) : "";
    return unit && value !== "—" ? `${value} ${unit}` : value;
  };
}
