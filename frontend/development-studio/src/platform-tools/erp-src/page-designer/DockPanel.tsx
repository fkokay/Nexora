import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Pin, PinOff, type LucideIcon } from "lucide-react";
import { DOCKS_STORAGE_KEY, parseDockState, type DockSide, type DockState } from "./leftPanelModel";
import "./left-panel.css";

/** Sol/sağ yuvanın sabitleme durumu (localStorage `nexora.studio.docks`); değişince tuval genişliği yeniden hesaplanır. */
export function useDocks() {
  const [pinned, setPinned] = useState<DockState>(() => { try { return parseDockState(localStorage.getItem(DOCKS_STORAGE_KEY)); } catch { return parseDockState(null); } });
  useEffect(() => {
    try { localStorage.setItem(DOCKS_STORAGE_KEY, JSON.stringify(pinned)); } catch { /* depolama kapalı olabilir */ }
    // Tuvalde genişliği pencere boyutundan ölçen önizlemeler de güncellensin.
    window.dispatchEvent(new Event("resize"));
  }, [pinned]);
  const toggle = useCallback((side: DockSide) => setPinned((current) => ({ ...current, [side]: !current[side] })), []);
  const workspaceClass = `${pinned.left ? "" : " pd-unpin-left"}${pinned.right ? "" : " pd-unpin-right"}`;
  return { pinned, toggle, workspaceClass };
}

export type RailItem = { label: string; icon: LucideIcon };

type Props = {
  side: DockSide;
  pinned: boolean;
  onTogglePin: () => void;
  rail: RailItem[];
  /** Sabitlenmemiş sağ yuvada değişince (ör. seçilen bileşen) raydaki rozet bir kez yanıp söner; yuva kendiliğinden açılmaz. */
  attentionKey?: string | null;
  children: ReactNode;
};

/**
 * Visual Studio'daki otomatik gizleme gibi yuva: sabitliyken bugünkü yerleşik panel; sabit değilken ince bir ray kalır,
 * üzerine gelince ya da tıklayınca panel tuvalin üstüne kayar; işaretçi ayrılınca, Esc'de ya da dışarı tıklanınca gizlenir.
 * Panel içeriği hep bağlı kalır (arama, açık bölümler gibi iç durum kaybolmaz).
 */
export default function DockPanel({ side, pinned, onTogglePin, rail, attentionKey, children }: Props) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const clearTimer = () => { if (timer.current !== undefined) { window.clearTimeout(timer.current); timer.current = undefined; } };
  const later = (fn: () => void, ms: number) => { clearTimer(); timer.current = window.setTimeout(() => { timer.current = undefined; fn(); }, ms); };
  useEffect(() => () => clearTimer(), []);
  useEffect(() => { if (pinned) setOpen(false); }, [pinned]);

  const showing = !pinned && open;
  useEffect(() => {
    if (!showing) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      // Panelden açılan pencereler (sorgu düzenleyici gibi) gövdeye eklenir; onlara tıklamak paneli kapatmaz.
      if (target && (rootRef.current?.contains(target) || (target as Element).closest?.("[role=dialog], .pd-lp-modal-backdrop, .custom-pages-form-popup"))) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey); document.removeEventListener("pointerdown", onDown, true); };
  }, [showing]);

  const lastAttention = useRef(attentionKey);
  useEffect(() => {
    if (attentionKey === lastAttention.current) return;
    lastAttention.current = attentionKey;
    if (pinned || open || !attentionKey) return;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 1300);
    return () => window.clearTimeout(id);
  }, [attentionKey, pinned, open]);

  const pinTitle = pinned ? "Sabitlemeyi kaldır" : "Sabitle";
  return <div ref={rootRef} className={`pd-dock pd-dock-${side}${pinned ? " is-pinned" : " is-unpinned"}${showing ? " is-open" : ""}`}
    onMouseEnter={() => { if (!pinned) { if (open) clearTimer(); } }}
    onMouseLeave={() => { if (!pinned) later(() => setOpen(false), 350); }}>
    {!pinned && <div className="pd-dock-rail" role="toolbar" aria-label={side === "left" ? "Sol panel" : "Sağ panel"} aria-orientation="vertical"
      onMouseEnter={() => { if (!open) later(() => setOpen(true), 160); }}>
      {rail.map((item) => {
        const Icon = item.icon;
        return <button type="button" key={item.label} className="pd-dock-rail-item" aria-expanded={showing} onClick={() => { clearTimer(); setOpen(true); }}>
          <Icon size={14}/><span>{item.label}</span>
        </button>;
      })}
      {pulse && <span className="pd-dock-badge" aria-hidden="true"/>}
    </div>}
    <div className="pd-dock-panel" hidden={!pinned && !open ? true : undefined}>
      <div className="pd-dock-bar">
        <button type="button" className="pd-dock-pin" aria-pressed={pinned} title={pinTitle} aria-label={pinTitle} onClick={() => { clearTimer(); onTogglePin(); }}>
          {pinned ? <Pin size={13}/> : <PinOff size={13}/>}
        </button>
      </div>
      {children}
    </div>
  </div>;
}
