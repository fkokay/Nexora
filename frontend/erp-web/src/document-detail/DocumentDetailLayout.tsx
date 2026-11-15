import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import "./document-detail.css";

/*
 * Kayıtlı belge detayının gövde parçaları. Başlık çubuğu DocumentSurface'tir
 * (variant="detail", eyebrow, actions); bu dosya gövdedeki özet kutucukları, bilgi ızgarası,
 * alt çizgili sekmeler, satır altı toplamlar ve işlem formları için sağ paneli verir.
 * Sıra: DetailTiles → (DetailTabs) → DetailInfoGrid → satır tablosu (.dd-lines) → DetailLinesFooter → DetailSection…
 */

export type DetailTone = "default" | "warning" | "danger" | "success" | "muted";

export type DetailTile = {
  label: string;
  value: ReactNode;
  /** Değerin altındaki kısa açıklama ("12 gün kaldı"). */
  hint?: ReactNode;
  tone?: DetailTone;
  /** 0–1 arası doluluk; verildiğinde değerin altında ince bir ilerleme çubuğu çizilir. */
  progress?: number;
  progressLabel?: string;
};

export function DetailTiles({ items, label }: { items: DetailTile[]; label?: string }) {
  return (
    <section className="dd-tiles" aria-label={label ?? "Belge özeti"}>
      {items.map((item) => (
        <div key={item.label} className={`dd-tile${item.tone && item.tone !== "default" ? ` is-${item.tone}` : ""}`}>
          <span className="dd-tile-label">{item.label}</span>
          <strong className="dd-tile-value">{item.value}</strong>
          {item.progress !== undefined && (
            <span
              className="dd-progress"
              role="progressbar"
              aria-label={item.progressLabel ?? item.label}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(Math.min(1, Math.max(0, item.progress)) * 100)}
            >
              <i style={{ width: `${Math.min(1, Math.max(0, item.progress)) * 100}%` }} />
            </span>
          )}
          {item.hint && <span className="dd-tile-hint">{item.hint}</span>}
        </div>
      ))}
    </section>
  );
}

export type DetailInfoItem = { label: string; value: ReactNode; title?: string };

/** Salt okunur bilgi ızgarası: etiket / değer, giriş kutusu yok. */
export function DetailInfoGrid({ items, label }: { items: DetailInfoItem[]; label?: string }) {
  return (
    <dl className="dd-info" aria-label={label}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd title={item.title}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type DetailTab<K extends string> = { key: K; label: string; count?: number };

/** Alt çizgili sekmeler; ok tuşlarıyla gezilir. */
export function DetailTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: DetailTab<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const id = useId();
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const index = tabs.findIndex((tab) => tab.key === value);
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    event.preventDefault();
    onChange(next.key);
    document.getElementById(`${id}-${next.key}`)?.focus();
  }
  return (
    <div className="dd-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          id={`${id}-${tab.key}`}
          type="button"
          role="tab"
          aria-selected={tab.key === value}
          tabIndex={tab.key === value ? 0 : -1}
          className={`dd-tab${tab.key === value ? " is-active" : ""}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="dd-tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export type DetailTotalLine = {
  label: ReactNode;
  value: ReactNode;
  /** "grand": kalın genel toplam satırı; "negative": düşülen tutar (tevkifat gibi). */
  emphasis?: "grand" | "negative" | "muted";
  key?: string;
};

/** Satır tablosunun hemen altı: solda notlar / koşullar, sağda toplamlar. */
export function DetailLinesFooter({ aside, totals, label }: { aside?: ReactNode; totals: DetailTotalLine[]; label?: string }) {
  return (
    <div className="dd-lines-footer">
      <div className="dd-lines-aside">{aside}</div>
      <dl className="dd-totals" aria-label={label ?? "Belge toplamları"}>
        {totals.map((line, index) => (
          <div key={line.key ?? index} className={line.emphasis ? `is-${line.emphasis}` : undefined}>
            <dt>{line.label}</dt>
            <dd>{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Koşul / açıklama blokları; boş olanlar soluk "Belirtilmedi" gösterir. */
export function DetailNotes({ items }: { items: { label: string; value?: string | null }[] }) {
  return (
    <div className="dd-notes">
      {items.map((item) => (
        <section key={item.label}>
          <h3>{item.label}</h3>
          {item.value?.trim() ? <p>{item.value}</p> : <p className="dd-muted">Belirtilmedi</p>}
        </section>
      ))}
    </div>
  );
}

export function DetailSection({
  title,
  count,
  description,
  actions,
  children,
}: {
  title: string;
  count?: number;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="dd-section" aria-labelledby={id}>
      <header className="dd-section-head">
        <div>
          <h2 id={id}>
            {title}
            {count !== undefined && <span className="dd-section-count">{count}</span>}
          </h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="dd-section-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

const focusableSelector =
  'button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]):not([tabindex="-1"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Belgenin içinden açılan işlem formları (ödeme, iade) için sağdan kayan panel. Sayfa
 * kaymaz; Escape kapatır, Tab panelin içinde döner, kapanınca odak açan düğmeye döner.
 * Panel, kayıt formu stilleri korunsun diye belge yüzeyinin içinde (portal olmadan) çizilir.
 */
export function DetailDrawer({
  open,
  label,
  onClose,
  className,
  children,
}: {
  open: boolean;
  label: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      const field = root.querySelector<HTMLElement>(
        '.rf-form input:not([type="hidden"]):not([tabindex="-1"]):not(:disabled), .rf-form select:not(:disabled), .rf-form textarea:not(:disabled), .rf-form button:not(:disabled)',
      );
      (field ?? root.querySelector<HTMLElement>(focusableSelector) ?? root).focus({ preventScroll: true });
    });
    const onKeyDown = (event: KeyboardEvent) => {
      const root = ref.current;
      if (!root) return;
      // Panelin üstünde açılan bir seçim penceresi (kayıt seçici) klavyeyi kendisi yönetir.
      const overlay = Array.from(document.querySelectorAll(".modal-backdrop")).some((item) => !root.contains(item));
      if (overlay) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !root.contains(document.activeElement)) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture phase: runs before a picker's own Escape handler removes its backdrop.
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown, true);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div className="dd-drawer-scrim" aria-hidden="true" onMouseDown={() => onCloseRef.current()} />
      <div
        ref={ref}
        className={`dd-drawer${className ? ` ${className}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </>
  );
}

/* Biçim yardımcıları */

export function formatAmount(value: number, currency?: string, digits = 2) {
  const text = value.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: Math.max(digits, 2) });
  return currency ? `${text} ${currency}` : text;
}

export function formatQuantity(value: number) {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
}

/** "2026-11-15" → "15.11.2026". */
export function formatDate(value?: string | null) {
  if (!value) return "—";
  return value.slice(0, 10).split("-").reverse().join(".");
}

/** Bugünden verilen tarihe kalan gün sayısı (geçmiş tarih için negatif). */
export function daysFromToday(value: string, today = new Date()) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target - base) / 86_400_000);
}

/** Uzun belge kodlarını ortadan kısaltır: "GR-20261114-ABCDEF12345678" → "GR-…12345678". */
export function shortenMiddle(code: string, tail = 8) {
  if (code.length <= tail + 6) return code;
  const dash = code.indexOf("-");
  const head = dash > 0 && dash <= 6 ? code.slice(0, dash + 1) : code.slice(0, 3);
  return `${head}…${code.slice(-tail)}`;
}
