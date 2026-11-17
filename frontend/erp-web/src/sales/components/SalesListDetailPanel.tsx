import { useEffect, useRef, type ReactNode } from "react";
import { Maximize2, PanelRight, X } from "lucide-react";
import { StatusTag, type StatusTagTone } from "../../list-page/StatusTag";
import "../sales-list-v2.css";

/** Below this width the open panel is a drawer over the list (see sales-list-v2.css). */
const DRAWER_QUERY = "(max-width: 1099px)";
const isDrawer = () => typeof window.matchMedia === "function" && window.matchMedia(DRAWER_QUERY).matches;

export type SalesPanelTab = { id: string; label: string };

type Props = {
  /** Accessible name ("Satış faturası özeti"). */
  label: string;
  code: string;
  /** Party (customer / supplier) as the heading. */
  title: string;
  tags?: ReactNode;
  tabs: SalesPanelTab[];
  tab: string;
  onTabChange: (tab: string) => void;
  /** Opens the document (bar Aç / Enter). */
  onOpen: () => void;
  openDisabled?: boolean;
  onClose: () => void;
  /** True when the panel was just opened explicitly; the drawer then takes the focus. */
  takeFocus?: () => boolean;
  /** The current row's detail is still loading (the body shows `loadingText`). */
  loading?: boolean;
  error?: string;
  children?: ReactNode;
  /** Rare actions at the bottom (former row-menu items with no bar command). */
  foot?: ReactNode;
};

/**
 * Right-hand panel of a sales list (mockup 06 ".det"): document number and Aç, party, status tags, tabs, body.
 * The page passes the body (Özet / Satırlar / Tahsilat… from the current row's existing detail endpoint).
 */
export function SalesListDetailPanel({
  label,
  code,
  title,
  tags,
  tabs,
  tab,
  onTabChange,
  onOpen,
  openDisabled,
  onClose,
  takeFocus,
  loading,
  error,
  children,
  foot,
}: Props) {
  const rootRef = useRef<HTMLElement>(null);
  // As a drawer (< 1100px) the panel takes the focus when it is opened explicitly and gives it back when Esc closes
  // it; mounting because the current row changed leaves the focus in the list.
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!takeFocus?.() || !isDrawer()) return;
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    rootRef.current?.focus();
  }, []);
  return (
    <aside
      ref={rootRef}
      className="sales-ld"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !isDrawer() || event.defaultPrevented) return;
        event.preventDefault();
        event.stopPropagation();
        returnFocus.current?.focus();
        onClose();
      }}
    >
      <div className="sales-ld-head">
        <div className="sales-ld-top">
          <span className="nx-code">{code}</span>
          <span className="sales-ld-actions">
            <button type="button" className="sales-ld-open" onClick={onOpen} disabled={openDisabled}>
              <Maximize2 size={13} aria-hidden="true" />
              <span>Aç</span>
              <kbd>Enter</kbd>
            </button>
            <button type="button" className="sales-ld-close" aria-label="Detay panelini kapat" title="Detay panelini kapat (Ctrl+.)" onClick={onClose}>
              <X size={15} aria-hidden="true" />
            </button>
          </span>
        </div>
        <h3>{title || "—"}</h3>
        {tags && <div className="sales-ld-labels">{tags}</div>}
      </div>
      <div className="sales-ld-tabs" role="tablist" aria-label={label}>
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "is-active" : undefined}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="sales-ld-body" role="tabpanel">
        {error ? <p className="sales-ld-error">{error}</p> : loading ? <p className="sales-ld-muted">Yükleniyor…</p> : children}
      </div>
      {foot && <div className="sales-ld-foot">{foot}</div>}
    </aside>
  );
}

/** The panel while no row is current: it never shows a row the user did not choose. */
export function SalesListDetailEmpty({ label, text }: { label: string; text: string }) {
  return (
    <aside className="sales-ld is-empty" aria-label={label}>
      <p>{text}</p>
    </aside>
  );
}

/** Toolbar toggle of the panel (Ctrl+.). */
export function SalesListPanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="sales-ld-toggle" aria-pressed={open} title="Detay paneli (Ctrl+.)" onClick={onToggle}>
      <PanelRight size={15} aria-hidden="true" />
      <span>Detay paneli</span>
    </button>
  );
}

/** 2×2 amounts at the top of Özet (mockup ".st4"). */
export function SalesPanelStats({ items }: { items: Array<{ label: string; value: ReactNode; tone?: "bad" }> }) {
  return (
    <div className="sales-ld-stats">
      {items.map((item) => (
        <div key={item.label}>
          <small>{item.label}</small>
          <b className={item.tone === "bad" ? "is-bad" : undefined}>{item.value}</b>
        </div>
      ))}
    </div>
  );
}

/** Label / value lines. */
export function SalesPanelFacts({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="sales-ld-facts">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SalesPanelSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="sales-ld-section" aria-label={title}>
      {/* Not a heading element: the shell styles every h4 (!important); the section's name is its aria-label. */}
      <div className="sales-ld-section-title">
        <span>{title}</span>
        {action}
      </div>
      {children}
    </section>
  );
}

export type SalesChainItem = {
  key: string;
  /** Document number; a linked document without one shows only its kind. */
  code?: string | null;
  label: string;
  current?: boolean;
  status?: { tone: StatusTagTone; label: string };
};

/** Belge zinciri: the documents before and after this one (from the row's own data). */
export function SalesPanelChain({ items }: { items: SalesChainItem[] }) {
  return (
    <SalesPanelSection title="Belge zinciri">
      <ol className="sales-ld-chain">
        {items.map((item) => (
          <li key={item.key} className={item.current ? "is-current" : undefined} aria-current={item.current ? "true" : undefined}>
            <span className="sales-ld-chain-text">
              {item.code && <span className="nx-code">{item.code}</span>} <span>{item.label}</span>
            </span>
            {item.status && (
              <>
                {" "}
                <StatusTag tone={item.status.tone}>{item.status.label}</StatusTag>
              </>
            )}
          </li>
        ))}
      </ol>
    </SalesPanelSection>
  );
}

/** Rows with a value on the right (document lines, collections). */
export function SalesPanelRows({ rows, empty }: { rows: Array<{ key: string; label: ReactNode; meta?: ReactNode; value: ReactNode }>; empty: string }) {
  if (!rows.length) return <p className="sales-ld-muted">{empty}</p>;
  return (
    <ul className="sales-ld-rows">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="sales-ld-row-main">
            <span>{row.label}</span>
            {row.meta && <small>{row.meta}</small>}
          </span>
          <b>{row.value}</b>
        </li>
      ))}
    </ul>
  );
}

const quantity = (value: number) => value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
export const panelMoney = (value: number, currency: string) =>
  `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

/** Document lines as panel rows: "Name" with "STK · 5 ADET" under it, the line total on the right. */
export function SalesPanelLines({
  lines,
  currency,
}: {
  lines: Array<{ key: string; stockCode: string; stockName: string; quantity: number; unitCode: string; lineTotal?: number | null }>;
  currency: string;
}) {
  return (
    <SalesPanelRows
      empty="Satır yok."
      rows={lines.map((line) => ({
        key: line.key,
        label: line.stockName,
        meta: (
          <>
            <span className="nx-code">{line.stockCode}</span> · <span>{quantity(line.quantity)}</span> <span>{line.unitCode}</span>
          </>
        ),
        value: line.lineTotal == null ? "—" : panelMoney(line.lineTotal, currency),
      }))}
    />
  );
}

/** The first lines in Özet (mockup "Satırlar tümü"): two lines, "+N satır", and "tümü" opens the Satırlar tab. */
export function SalesPanelLinesPreview({
  lines,
  currency,
  onShowAll,
}: {
  lines: Array<{ key: string; stockCode: string; stockName: string; quantity: number; unitCode: string; lineTotal?: number | null }>;
  currency: string;
  onShowAll: () => void;
}) {
  if (!lines.length) return null;
  const rest = lines.length - 2;
  return (
    <SalesPanelSection
      title="Satırlar"
      action={
        <button type="button" className="sales-ld-link" onClick={onShowAll}>
          tümü
        </button>
      }
    >
      <SalesPanelRows
        empty="Satır yok."
        rows={[
          ...lines.slice(0, 2).map((line) => ({
            key: line.key,
            label: (
              <>
                <span>{line.stockName}</span> · <span>{quantity(line.quantity)}</span> <span>{line.unitCode}</span>
              </>
            ),
            value: line.lineTotal == null ? "—" : panelMoney(line.lineTotal, currency),
          })),
          ...(rest > 0
            ? [
                {
                  key: "rest",
                  label: (
                    <span className="sales-ld-more">
                      <span>+{rest}</span> <span>satır</span>
                    </span>
                  ),
                  value: "",
                },
              ]
            : []),
        ]}
      />
    </SalesPanelSection>
  );
}
