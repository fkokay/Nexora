import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { ActionBarSlot, useSlotBreadcrumb } from "../action-bar/ActionBarSlot";
import type { RecordNav } from "../record-form/RecordForm";
import { isInScrollableRegion, isTextEntry, openDialogs, useWindowKeyDown } from "../record-form/recordFormKeys";
import "./document-page.css";

export type DocumentStatusTone = "neutral" | "info" | "warning" | "success" | "danger";
export type DocumentStatus = { label: string; tone: DocumentStatusTone };

/**
 * The context panel opens when the document surface itself (not the viewport) is at least ASIDE_ROOM wide and closes
 * below ASIDE_CLOSE; the gap keeps a scrollbar or a resize near the edge from toggling it (same as the record form).
 */
const ASIDE_ROOM = 1100;
const ASIDE_CLOSE = 1060;

export type DocumentSurfaceProps = {
  /** Belge türü, tekil: "Satış teklifi", "Alış faturası". */
  title: string;
  /** Belge numarası; yüklenirken boş bırakılabilir. */
  code?: string;
  /** Numaranın yanında duran cari (müşteri / tedarikçi) adı ya da kısa bilgi. */
  subtitle?: ReactNode;
  status?: DocumentStatus;
  /** Künye satırında durum etiketinin ardından gelen kısa bilgiler ("5 satır", "Oluşturan …"). */
  meta?: ReactNode;
  /** Başlığın ortasındaki durum akış şeridi (`DocumentStatusFlow`). */
  statusFlow?: ReactNode;
  /** Kaydedilmemiş değişiklik: sayı "N değişiklik kaydedilmedi", `true` genel bir not gösterir. */
  dirty?: boolean | number;
  /** Açıldığı listedeki konum; PgUp / PgDn önceki / sonraki belge. */
  recordNav?: RecordNav;
  /** Verilirse başlığın sağında Vazgeç düğmesi çizilir. */
  onCancel?: () => void;
  onClose: () => void;
  /** Geri düğmesinin erişilebilir adı; varsayılan "Listeye dön". */
  closeLabel?: string;
  /**
   * Eski başlık düğmeleri. İş akışı işlemleri İşlem Çubuğu'nun İşlemler menüsüne taşınana kadar bu nötr yuvada
   * kalır; yeni ekranlar kullanmaz.
   */
  actions?: ReactNode;
  /** Sağ bağlam paneli (belge zinciri, cari özeti, aktif satırın stoku). Yüzey 1100px'ten genişken açık; Ctrl+. açar / kapatır. */
  aside?: ReactNode;
  /** Alt bilgi satırının solundaki sayfaya özgü kısayollar ("Ctrl+Shift+Enter satır ekle"). */
  hints?: string[];
  /** Alt bilgi satırının sağı: belge özeti ("5 satır · Matrah … · Genel toplam …"). */
  footerStatus?: ReactNode;
  /** Kök öğeye eklenir; eski pencere arka planına bağlı stiller için. */
  className?: string;
  /** Gövdeye eklenir; eski pencere kutusuna bağlı stiller için ("ledger-modal sales-detail-modal" gibi). */
  bodyClassName?: string;
  /**
   * "detail": yeniden tasarlanan belge gövdesi (document-detail/DocumentDetailLayout.tsx): çerçevesiz akış, kartlar
   * tek katman. "legacy": pencereden taşınan gövde kutusu korunur. Başlık iki görünümde de aynıdır.
   */
  variant?: "legacy" | "detail";
  /** Başlığın üst satırı (belge türü); verilmezse `title`. Örn. "Satış teklifi · Revizyon 2". */
  eyebrow?: ReactNode;
  children: ReactNode;
};

/** Whether this surface takes the document keys: visible, topmost of its stack, not under a dialog or a focused form. */
function ownsDocumentKeys(root: HTMLElement | null): boolean {
  if (!root || root.closest("[hidden]")) return false;
  for (let next = root.nextElementSibling; next; next = next.nextElementSibling) if (next.classList.contains("doc-surface")) return false;
  const dialogs = openDialogs();
  const topmost = dialogs[dialogs.length - 1];
  if (topmost && (topmost === root ? false : !topmost.contains(root))) return false;
  const active = document.activeElement;
  // A record form inside the document (a drawer, an inline form) answers its own keys while it has the focus.
  if (active && root.contains(active) && active.closest(".record-form")) return false;
  return true;
}

/**
 * Tam sayfa belge yüzeyi. Açıldığında, içinde bulunduğu çalışma alanı görünümünün
 * (`.workspace-view`) tek görünen içeriği olur; liste gizlenir ama bellekte kalır,
 * kapatılınca filtreleri ve kaydırma konumuyla geri gelir. Bir çalışma alanı görünümünün
 * dışında (örneğin başka bir pencerenin içinde) açılırsa tüm ekranı kaplar.
 */
export function DocumentSurface({
  title,
  code,
  subtitle,
  status,
  meta,
  statusFlow,
  dirty,
  recordNav,
  onCancel,
  onClose,
  closeLabel = "Listeye dön",
  actions,
  aside,
  hints,
  footerStatus,
  className,
  bodyClassName,
  variant = "legacy",
  eyebrow,
  children,
}: DocumentSurfaceProps) {
  const detail = variant === "detail";
  const titleId = useId();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [floating, setFloating] = useState(false);
  const { slotRef, breadcrumb } = useSlotBreadcrumb();

  useLayoutEffect(() => {
    const view = anchorRef.current?.closest<HTMLElement>(".workspace-view") ?? null;
    setHost(view ?? document.body);
    setFloating(!view);
  }, []);

  // Açılırken sayfanın başına gidilir; kapanınca listedeki eski konuma dönülür.
  useEffect(() => {
    if (!host || floating) return;
    const previous = window.scrollY;
    window.scrollTo({ top: 0 });
    return () => window.scrollTo({ top: previous });
  }, [host, floating]);

  // Başlık çubuğu, uygulamanın üstte sabit duran çubuklarının (üst menü, açık ekran sekmeleri) hemen altına yapışır.
  const [stickyTop, setStickyTop] = useState(0);
  useEffect(() => {
    if (!host || floating) return;
    const measure = () => {
      const bars = document.querySelectorAll<HTMLElement>(".topbar, .workspace-tabs");
      let bottom = 0;
      bars.forEach((bar) => {
        if (getComputedStyle(bar).position === "sticky") bottom = Math.max(bottom, bar.offsetHeight + (parseFloat(getComputedStyle(bar).top) || 0));
      });
      setStickyTop(bottom);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [host, floating]);

  // PgUp / PgDn: previous / next document of the list; not in a text field or a scrollable region (a wide line table).
  useWindowKeyDown(!!recordNav, (event) => {
    if (event.key !== "PageUp" && event.key !== "PageDown") return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.defaultPrevented) return;
    if (isTextEntry(event.target) || isInScrollableRegion(event.target, rootRef.current)) return;
    if (!ownsDocumentKeys(rootRef.current)) return;
    const run = event.key === "PageUp" ? recordNav?.onPrev : recordNav?.onNext;
    if (!run) return;
    event.preventDefault();
    run();
  });

  // Context panel: open while the surface itself has room; Ctrl+. overrides until it crosses that width again.
  const hasAside = aside != null && aside !== false;
  const [roomy, setRoomy] = useState(false);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!hasAside || !root) return;
    // A hidden keep-alive view measures 0 wide; the last state stays.
    const measure = () => {
      const width = root.getBoundingClientRect().width;
      if (width > 0) setRoomy((open) => (width >= ASIDE_ROOM ? true : width < ASIDE_CLOSE ? false : open));
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [hasAside, host]);
  const [asideOverride, setAsideOverride] = useState<boolean | null>(null);
  useEffect(() => setAsideOverride(null), [roomy]);
  const asideOpen = asideOverride ?? roomy;
  useWindowKeyDown(hasAside, (event) => {
    if (event.key !== "." || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.defaultPrevented) return;
    if (!ownsDocumentKeys(rootRef.current)) return;
    event.preventDefault();
    setAsideOverride((current) => !(current ?? roomy));
  });

  const dirtyText =
    typeof dirty === "number" ? (dirty > 0 ? `${dirty} değişiklik kaydedilmedi` : null) : dirty ? "Kaydedilmemiş değişiklik var" : null;
  const footHints = [
    ...(hints ?? []),
    recordNav ? "PgUp/PgDn önceki/sonraki belge" : null,
    hasAside ? "Ctrl+. bağlam paneli" : null,
  ].filter((hint): hint is string => !!hint);
  const showBreadcrumb = !floating && !!breadcrumb;

  const surface = (
    <section
      ref={rootRef}
      style={{ "--doc-sticky-top": `${stickyTop}px` } as CSSProperties}
      className={`doc-surface${detail ? " doc-detail" : ""}${floating ? " doc-surface-floating" : ""}${hasAside && asideOpen ? " has-aside" : ""}${className ? ` ${className}` : ""}`}
      role={floating ? "dialog" : "region"}
      aria-modal={floating ? true : undefined}
      aria-labelledby={titleId}
    >
      <header className="doc-surface-head">
        <button type="button" className="doc-surface-back" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="doc-surface-title">
          <div className="doc-surface-eyebrow">
            {showBreadcrumb && <span className="doc-surface-crumb">{breadcrumb}</span>}
            <span>{eyebrow ?? title}</span>
          </div>
          <div className="doc-surface-code-row">
            <h1 id={titleId}>
              <span className="doc-surface-sr">{title} </span>
              <b>{code || "…"}</b>
            </h1>
            {subtitle && (
              <>
                <span className="doc-surface-sep" aria-hidden="true">·</span>
                <div className="doc-surface-party">{subtitle}</div>
              </>
            )}
          </div>
          {(status || meta) && (
            <div className="doc-surface-meta">
              {status && <span className={`doc-surface-status is-${status.tone}`}>{status.label}</span>}
              {meta}
            </div>
          )}
        </div>
        {statusFlow && <div className="doc-surface-flow">{statusFlow}</div>}
        <div className="doc-surface-side">
          {dirtyText && (
            <span className="doc-surface-dirty">
              <i aria-hidden="true" />
              {dirtyText}
            </span>
          )}
          {recordNav && (
            <div className="doc-surface-rnav" role="group" aria-label="Belgeler arası gezinme">
              <button
                type="button"
                aria-label="Önceki belge"
                disabled={!recordNav.onPrev}
                title={!recordNav.onPrev ? recordNav.prevDisabledReason : undefined}
                onClick={recordNav.onPrev}
              >
                ‹ <kbd>PgUp</kbd>
              </button>
              <span>{`${recordNav.index} / ${recordNav.total}`}</span>
              <button
                type="button"
                aria-label="Sonraki belge"
                disabled={!recordNav.onNext}
                title={!recordNav.onNext ? recordNav.nextDisabledReason : undefined}
                onClick={recordNav.onNext}
              >
                <kbd>PgDn</kbd> ›
              </button>
            </div>
          )}
          {actions && <div className="doc-surface-actions">{actions}</div>}
          {onCancel && (
            <button type="button" className="doc-surface-cancel" onClick={onCancel}>
              <X size={16} aria-hidden="true" />
              Vazgeç
            </button>
          )}
        </div>
      </header>
      {/* The open document hides the list (and its header slot), so the action bar moves here, under the title row.
          Not when floating over another window: its backdrop covers the bar. */}
      {!floating && <ActionBarSlot slotRef={slotRef} />}
      <div className={`doc-surface-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
      {hasAside && (
        <aside className="doc-surface-aside" aria-label="Bağlam paneli" hidden={!asideOpen}>
          {aside}
        </aside>
      )}
      {(footHints.length > 0 || footerStatus) && (
        <footer className="doc-surface-foot">
          {footHints.length > 0 && (
            <span className="doc-surface-keys">
              {footHints.map((hint) => (
                <span key={hint}>{hint}</span>
              ))}
            </span>
          )}
          {footerStatus && (
            <div className="doc-surface-foot-status" aria-live="polite">
              {footerStatus}
            </div>
          )}
        </footer>
      )}
    </section>
  );

  return (
    <>
      <span ref={anchorRef} hidden />
      {host && createPortal(surface, host)}
    </>
  );
}
