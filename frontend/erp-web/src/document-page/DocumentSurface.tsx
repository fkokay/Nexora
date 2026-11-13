import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
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
  children,
}: DocumentSurfaceProps) {
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
      className={`doc-surface${floating ? " doc-surface-floating" : ""}${className ? ` ${className}` : ""}`}
      role={floating ? "dialog" : "region"}
      aria-modal={floating ? true : undefined}
      aria-labelledby={titleId}
    >
      <header className="doc-surface-head">
        <button type="button" className="doc-surface-back" onClick={onClose} aria-label={closeLabel} title={closeLabel}>
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
        <div className="doc-surface-title">
          <h1 id={titleId}>
            <span>{title}</span>
            {code && <b>{code}</b>}
          </h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {status && <span className={`doc-surface-status is-${status.tone}`}>{status.label}</span>}
        {actions && <div className="doc-surface-actions">{actions}</div>}
      </header>
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
