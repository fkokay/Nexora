import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import "./document-detail.css";

/*
 * Kayıtlı belge detayının gövde parçaları (taslak 02). Başlık, durum akışı, bağlam paneli yuvası ve alt bilgi
 * DocumentSurface'tedir; bu dosya gövdedeki özet kutucukları, başlık alanları ızgarası, alt çizgili sekmeler, satır
 * kartı başlığı, toplamlar, bağlam paneli bölümleri ve işlem formları için sağ paneli verir.
 * Sıra: (DetailTiles) → (DetailTabs) → DetailInfoGrid → DetailLinesHead + satır tablosu (.dd-lines) →
 * DetailLinesFooter / DocumentTotals → DetailSection…; bağlam paneli: DetailContext + DetailChain / DetailKeyValues / DetailMeterRows.
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

export type DetailInfoItem = {
  label: string;
  value: ReactNode;
  title?: string;
  /** React anahtarı; etiketler tekrar edebiliyorsa (kiracı alan düzeni) verilir, varsayılan `label`. */
  key?: string;
};

/** Salt okunur bilgi ızgarası: etiket / değer, giriş kutusu yok. Sütun sayısı kartın kendi genişliğine göre (container query). */
export function DetailInfoGrid({ items, label }: { items: DetailInfoItem[]; label?: string }) {
  return (
    <div className="dd-info-wrap">
      <dl className="dd-info" aria-label={label}>
        {items.map((item) => (
          <div key={item.key ?? item.label}>
            <dt>{item.label}</dt>
            <dd title={item.title}>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
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

export type DocumentTotalRow = {
  label: ReactNode;
  value: ReactNode;
  /**
   * "grand": vurgulu genel toplam; "negative": düşülen tutar (iskonto, tevkifat); "muted": soluk bilgi satırı;
   * "sub": bir üst satırın dökümü, girintili ve küçük (KDV oranlarına göre matrah / KDV); "strong": genel toplamdan
   * sonra gelen, onunla aynı tutardaki kalın satır (ör. tevkifat yokken Ödenecek tutar) — bloğun tek "grand" satırı kalır.
   */
  emphasis?: "grand" | "negative" | "muted" | "sub" | "strong";
  key?: string;
};
/** Eski ad; `DocumentTotalRow` ile aynıdır. */
export type DetailTotalLine = DocumentTotalRow;

/**
 * Belge toplamları bloğu (taslak 02, sağ alt): satırlar sayfadan gelir; KDV dökümünü oran başına `emphasis: "sub"`
 * satırlarıyla, genel toplamı `"grand"` ile verin. Yalnızca görünümdür, hesap yapmaz.
 */
export function DocumentTotals({ rows, label }: { rows: DocumentTotalRow[]; label?: string }) {
  return (
    <dl className="dd-totals" aria-label={label ?? "Belge toplamları"}>
      {rows.map((row, index) => (
        <div key={row.key ?? index} className={row.emphasis ? `is-${row.emphasis}` : undefined}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Satır tablosunun hemen altı: solda notlar / koşullar, sağda toplamlar. */
export function DetailLinesFooter({ aside, totals, label }: { aside?: ReactNode; totals: DocumentTotalRow[]; label?: string }) {
  return (
    <div className="dd-lines-footer">
      <div className="dd-lines-aside">{aside}</div>
      <DocumentTotals rows={totals} label={label} />
    </div>
  );
}

export type DetailLineHint = { keys: string; label: string };

/**
 * Satır kartının başlık satırı: "Satırlar", kısa özet ("5 satır · 1 uyarı · Fiyatlar KDV hariç") ve sağda satır
 * kısayolları. Yalnızca ekranda gerçekten çalışan tuşları verin.
 */
export function DetailLinesHead({ title, meta, hints }: { title: ReactNode; meta?: ReactNode; hints?: DetailLineHint[] }) {
  return (
    <div className="dd-lines-head">
      <div className="dd-lines-title">
        <h2>{title}</h2>
        {meta && <span className="dd-lines-meta">{meta}</span>}
      </div>
      {hints && hints.length > 0 && (
        <span className="dd-lines-keys">
          {hints.map((hint) => (
            <span key={hint.keys}>
              <kbd>{hint.keys}</kbd> {hint.label}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

/** Sağ bağlam panelinin bir bölümü (Belge zinciri, Cari özeti, Stok durumu): başlık, sağında kısa açıklama. */
export function DetailContext({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section className="dd-ctx" aria-labelledby={id}>
      <h3 className="dd-ctx-head">
        <span id={id}>{title}</span>
        {hint && <small>{hint}</small>}
      </h3>
      {children}
    </section>
  );
}

export type DetailChainItem = {
  key: string;
  /** Belge numarası; numarası bilinmeyen bağlı belge yalnızca türüyle gösterilir. */
  code?: string | null;
  /** Belge türü ("Satış siparişi") ya da açık belge için "Bu fatura". */
  label: string;
  /** İşaret harflerinin alındığı belge türü; `label` "Bu fatura" gibi olduğunda verilir ("Satış faturası" → SF). */
  kind?: string;
  /** Alt satır: tarih, satır sayısı. */
  meta?: ReactNode;
  status?: { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" };
  /** Açık olan belge. */
  current?: boolean;
  /** Verilirse belge numarası bu belgeyi açan bir düğmedir. */
  onOpen?: () => void;
};

/** Belge zinciri: sipariş → irsaliye → fatura; açık belge vurgulu, diğerleri tıklanınca açılır. */
export function DetailChain({ items, label }: { items: DetailChainItem[]; label?: string }) {
  return (
    <ol className="dd-chain" aria-label={label ?? "Belge zinciri"}>
      {items.map((item) => {
        const initials = (item.kind ?? item.label)
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => word.charAt(0).toLocaleUpperCase("tr-TR"))
          .join("");
        const body = (
          <>
            <span className="dd-chain-mark" aria-hidden="true">{initials}</span>
            <span className="dd-chain-text">
              <span>
                {item.code && (
                  <>
                    <span className="dd-chain-code">{item.code}</span>{" "}
                  </>
                )}
                {item.label}
              </span>
              {item.meta && <small>{item.meta}</small>}
            </span>
          </>
        );
        return (
          <li key={item.key} className={item.current ? "is-current" : undefined} aria-current={item.current ? "true" : undefined}>
            {item.onOpen && !item.current ? (
              <button type="button" className="dd-chain-open" onClick={item.onOpen}>
                {body}
              </button>
            ) : (
              <span className="dd-chain-open">{body}</span>
            )}
            {item.status && <span className={`doc-status is-${item.status.tone}`}>{item.status.label}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Kısa etiket / değer satırları (bağlam panelinde: bakiye, rezerve, son satış). */
export function DetailKeyValues({ items }: { items: { label: string; value: ReactNode; tone?: "danger" }[] }) {
  return (
    <dl className="dd-kv">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className={item.tone === "danger" ? "dd-danger-text" : undefined}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Oranı çubukla gösterilen satırlar (aktif satırın depolardaki stoku). `share` 0–1. */
export function DetailMeterRows({ rows }: { rows: { label: string; value: ReactNode; share: number }[] }) {
  return (
    <div className="dd-meter">
      {rows.map((row) => (
        <div key={row.label}>
          <span>{row.label}</span>
          <span className="dd-meter-bar" aria-hidden="true">
            <i style={{ width: `${Math.round(Math.min(1, Math.max(0, row.share)) * 100)}%` }} />
          </span>
          <b>{row.value}</b>
        </div>
      ))}
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
  /** Verilmezse yalnızca başlık (başlık, açıklama, işlemler) çizilir. */
  children?: ReactNode;
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
