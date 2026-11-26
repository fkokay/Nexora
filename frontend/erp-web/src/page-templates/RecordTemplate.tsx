import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { PageShell, type ShellAction } from "./PageShell";
import type { Component } from "./listTemplateModel";
import { recordTemplateLevel, type RecordLayout } from "./recordTemplateModel";

/** Bölüm kolonları, bölümün kendi kutusuna göre: > 720 px seçilen sayı, ≤ 720 px en çok 2, ≤ 480 px 1. CSS'teki `@container` kurallarıyla aynı. */
export function sectionColumns(chosen: 1 | 2 | 3, width: number): 1 | 2 | 3 {
  if (width <= 480) return 1;
  if (width <= 720) return chosen === 3 ? 2 : chosen;
  return chosen;
}

/** Öğenin içerik genişliği (`ResizeObserver`); bilinmiyorsa `null`. */
function useBoxWidth(ref: RefObject<HTMLElement | null>): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[entries.length - 1]?.contentRect.width;
      if (typeof next === "number") setWidth(next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

const SKELETON_ROW_HEIGHT = 58;

/**
 * Kayıt kartının bölüm kutusu: `container-type: inline-size` taşır ve kendi genişliğini ölçer (`data-cols`, CSS kuralları
 * aynı eşikleri `@container` ile uygular). Kayıt sorgusu yüklenirken bölümün yerinde, alan sayısı ve kolonla boyu kestirilen
 * iskelet görünür; bölüm çizilmeye devam eder ama görünmez, yüklenince sayfa zıplamaz.
 */
export function RecordSection({ columns, fieldCount, loading, children }: {
  columns: 1 | 2 | 3; fieldCount: number; loading: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useBoxWidth(ref);
  const shown = width === null ? columns : sectionColumns(columns, width);
  const rows = Math.max(1, Math.ceil(fieldCount / shown));
  return <div ref={ref} className={`record-section${loading ? " is-loading" : ""}`} data-cols={shown} aria-busy={loading || undefined}>
    {loading && <div className="record-skeleton" role="status" style={{ minHeight: 40 + rows * SKELETON_ROW_HEIGHT }}>
      <span className="list-skeleton-text">Kayıt yükleniyor…</span>
      {Array.from({ length: rows }, (_, index) => <div key={index} className="record-skeleton-row" />)}
    </div>}
    <div className="record-section-body" hidden={loading}>{children}</div>
  </div>;
}

/** Satır tablosu: tam satır, kendi kutusunda yatay kayar. Yeni kayıt kipinde tablo çizilmez, yerinde bilgi yazar. */
export function RecordLines({ title, isNew, render }: { title: string; isNew: boolean; render: () => ReactNode }) {
  return <div className="record-lines">
    {isNew
      ? <section className="tenant-page-block record-lines-placeholder" aria-label={title || undefined}>
        {title && <h3>{title}</h3>}
        <p>Kayıt kaydedilince burada görünür.</p>
      </section>
      : render()}
  </div>;
}

/** Özetin dar kutu eşiği: ≤ 480 px'te değerler başlığın altına iner (taslak 08, telefon). CSS'teki `@container` kuralıyla aynı. */
export const SUMMARY_NARROW = 480;

/** Kayıt özeti kutusu: kendi genişliğini ölçer, dar kutuda `data-narrow` taşır (CSS `@container record-summary` ile birlikte). */
function RecordSummary({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useBoxWidth(ref);
  return <div ref={ref} className="record-template-summary" data-narrow={width !== null && width <= SUMMARY_NARROW ? "" : undefined}>{children}</div>;
}

/**
 * Kayıt kartı kalıbı: ortak kabuk içinde başlık ve konum satırı → `above` → özet → işlem çubuğu → sekmeler → `below` →
 * alt bilgi. Bileşenleri çizen `render` sayfanın kendi çizicisidir (tuval işaretleri onunla gelir); bölüm, satır tablosu ve
 * notlar sekme bileşeninin içinde çizilir. Yeni kayıt kipinde silme düğmesi gösterilmez.
 */
export function RecordTemplate<C extends Component>({ layout, render, title, crumbs, actions, isNew, notices }: {
  layout: RecordLayout<C>; render: (component: C) => ReactNode; title: string; crumbs: string[];
  actions: ShellAction[]; isNew: boolean; notices?: ReactNode;
}) {
  const shown = isNew ? actions.filter((action) => action.kind !== "danger") : actions;
  const head = <>
    {layout.above.length > 0 && <div className="record-template-above">{layout.above.map(render)}</div>}
    {layout.summary && <RecordSummary>{render(layout.summary)}</RecordSummary>}
  </>;
  return <div className="record-template" data-level={recordTemplateLevel(layout)} data-record-mode={isNew ? "new" : "existing"}>
    <PageShell variant="record" title={title} crumbs={crumbs} actions={shown} head={head} footer={isNew ? "Yeni kayıt" : undefined}>
      {notices}
      {layout.tabs && <div className="record-template-tabs">{render(layout.tabs)}</div>}
      {layout.below.length > 0 && <div className="record-template-below">{layout.below.map(render)}</div>}
    </PageShell>
  </div>;
}
