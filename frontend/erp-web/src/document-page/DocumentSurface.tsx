import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
import { ActionBarSlot } from "../action-bar/ActionBarSlot";
import "./document-page.css";

export type DocumentStatusTone = "neutral" | "info" | "warning" | "success" | "danger";
export type DocumentStatus = { label: string; tone: DocumentStatusTone };

export type DocumentSurfaceProps = {
  /** Belge türü, tekil: "Satış teklifi", "Alış faturası". */
  title: string;
  /** Belge numarası; yüklenirken boş bırakılabilir. */
  code?: string;
  /** Başlığın altındaki kısa bilgi: cari adı, tarih gibi. */
  subtitle?: ReactNode;
  status?: DocumentStatus;
  onClose: () => void;
  /** Geri düğmesinin erişilebilir adı; varsayılan "Listeye dön". */
  closeLabel?: string;
  /** Başlığın sağındaki işlem düğmeleri. Birincil işlem en sonda durur. */
  actions?: ReactNode;
  /** Kök öğeye eklenir; eski pencere arka planına bağlı stiller için. */
  className?: string;
  /** Gövdeye eklenir; eski pencere kutusuna bağlı stiller için ("ledger-modal sales-detail-modal" gibi). */
  bodyClassName?: string;
  /**
   * "detail": yeniden tasarlanan belge detayı (document-detail/DocumentDetailLayout.tsx). Başlıkta küçük
   * üst satır (`eyebrow`, verilmezse `title`), büyük belge numarası ve yanında durum etiketi, altında
   * cari bağlantısı (`subtitle`) yer alır; gövde çerçevesiz akar.
   */
  variant?: "legacy" | "detail";
  /** Yalnızca "detail" görünümünde: belge türü satırı ("Satış teklifi · Revizyon 2"). */
  eyebrow?: ReactNode;
  children: ReactNode;
};

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
  onClose,
  closeLabel = "Listeye dön",
  actions,
  className,
  bodyClassName,
  variant = "legacy",
  eyebrow,
  children,
}: DocumentSurfaceProps) {
  const detail = variant === "detail";
  const titleId = useId();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [floating, setFloating] = useState(false);

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

  const surface = (
    <section
      style={{ "--doc-sticky-top": `${stickyTop}px` } as CSSProperties}
      className={`doc-surface${detail ? " doc-detail" : ""}${floating ? " doc-surface-floating" : ""}${className ? ` ${className}` : ""}`}
      role={floating ? "dialog" : "region"}
      aria-modal={floating ? true : undefined}
      aria-labelledby={titleId}
    >
      <header className="doc-surface-head">
        <button type="button" className="doc-surface-back" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        {detail ? (
          <div className="doc-surface-title">
            <p className="doc-surface-eyebrow">{eyebrow ?? title}</p>
            <div className="doc-surface-code-row">
              <h1 id={titleId}>
                <span className="doc-surface-sr">{title} </span>
                <b>{code || "…"}</b>
              </h1>
              {status && <span className={`doc-surface-status is-${status.tone}`}>{status.label}</span>}
            </div>
            {subtitle && <div className="doc-surface-party">{subtitle}</div>}
          </div>
        ) : (
          <div className="doc-surface-title">
            <h1 id={titleId}>
              <span>{title}</span>
              {code && <b>{code}</b>}
            </h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
        )}
        {!detail && status && <span className={`doc-surface-status is-${status.tone}`}>{status.label}</span>}
        {actions && <div className="doc-surface-actions">{actions}</div>}
      </header>
      {/* The open document hides the list (and its header slot), so the action bar moves here, under the title row.
          Not when floating over another window: its backdrop covers the bar. */}
      {!floating && <ActionBarSlot />}
      <div className={`doc-surface-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div>
    </section>
  );

  return (
    <>
      <span ref={anchorRef} hidden />
      {host && createPortal(surface, host)}
    </>
  );
}
