import { createContext, useContext, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Maximize2, X } from "lucide-react";
import { useDesignerModal } from "./designerModals";
import "./page-designer-extras.css";

type NavItem = { index: number; label: string };
export type SettingsTab = { key: string; label: string };

/** Sekmeli pencerede etkin sekme; pencere kapalıyken (panelde yerinde çizim) ya da sekmesiz pencerede null. */
const ActiveTabContext = createContext<string | null>(null);

/**
 * Sekmeli ayar penceresinde yalnız kendi sekmesi etkinken çizilir. Pencere kapalıyken (Gelişmiş panel) ya da pencere
 * sekmesizse içerik her zaman çizilir.
 */
export function SettingsPane({ tab, children }: { tab: string; children: ReactNode }) {
  const active = useContext(ActiveTabContext);
  return active === null || active === tab ? <>{children}</> : null;
}

/**
 * Seçili bileşenin "Tüm ayarlar" penceresi. Özellikler panelinin Gelişmiş bölümleri (`children`) açıkken aynen bu
 * pencereye taşınır (React portalı): her değişiklik tuvale hemen işlenir, geri al/yinele aynıdır; Kapat yeterlidir.
 * Kapalıyken `children` panelde yerinde çizilir (`hidden` ise hiç çizilmez: Basit kip).
 * `tabs` verilirse pencere sekmelidir: aynı anda tek sekme görünür (`SettingsPane`), sol bölüm listesi çizilmez.
 */
export function SettingsHost({ open, hidden, title, extra, tabs, tab, onTab, onClose, onOpen, panelExtra, children }: {
  open: boolean; hidden?: boolean; title: string; extra?: ReactNode; tabs?: SettingsTab[]; tab?: string; onTab?: (tab: string) => void; onClose: () => void;
  /** Panelde "Pencerede aç": aynı ayarları geniş pencerede açar. */
  onOpen?: () => void;
  /** Panelde `extra` yerine çizilen (dar panele sığmayan geniş düzenleyicinin kısa yolu). */
  panelExtra?: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [nav, setNav] = useState<NavItem[]>([]);
  const tabbed = !!tabs && tabs.length > 0;
  const active = tabbed ? (tabs.some((item) => item.key === tab) ? tab! : tabs[0].key) : null;
  useDesignerModal("settings", open, ref, onClose);
  useLayoutEffect(() => {
    if (!open || tabbed || !contentRef.current) return;
    const sections = [...contentRef.current.querySelectorAll<HTMLElement>("[data-settings-section], .pd-inspector-section")];
    const next = sections.map((section, index) => {
      section.dataset.navIndex = String(index);
      return { index, label: section.dataset.settingsSection ?? section.querySelector(".pd-inspector-section-toggle span")?.textContent ?? `Bölüm ${index + 1}` };
    });
    if (JSON.stringify(next) !== JSON.stringify(nav)) setNav(next);
  });
  // Panelde (pencere kapalı) de aynı sekmeler çizilir; aynı anda tek sekme görünür.
  if (!open) return hidden ? null : tabbed ? <div className="pd-panel-settings">
    <div className="pd-panel-tabs" role="tablist" aria-label="Ayar sekmeleri">
      {tabs.map((item) => <button type="button" role="tab" key={item.key} aria-selected={item.key === active} className={item.key === active ? "active" : ""} onClick={() => onTab?.(item.key)}>{item.label}</button>)}
      {onOpen && <button type="button" className="pd-icon-button pd-panel-expand" aria-label="Pencerede aç" title="Pencerede aç" onClick={onOpen}><Maximize2 size={13}/></button>}
    </div>
    <ActiveTabContext.Provider value={active}>{panelExtra}{children}</ActiveTabContext.Provider>
  </div> : <>{children}</>;
  const jump = (index: number) => contentRef.current?.querySelector<HTMLElement>(`[data-nav-index="${index}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  const tabKeys = (event: KeyboardEvent, index: number) => {
    if (!tabs || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const next = tabs[(index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onTab?.(next.key);
    ref.current?.querySelector<HTMLElement>(`[data-settings-tab="${next.key}"]`)?.focus();
  };
  return <>
    <p className="pd-settings-inline-note">Tüm ayarlar pencerede açık.</p>
    {createPortal(<div className="pd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={ref} className={`pd-modal pd-settings-modal${tabbed ? " is-tabbed" : ""}`} role="dialog" aria-modal="true" aria-label={title} data-pd-modal="settings" tabIndex={-1}>
        <header className="pd-modal-head"><b>{title}</b>
          {tabbed && <div className="pd-settings-tabs" role="tablist" aria-label="Ayar sekmeleri">{tabs.map((item, index) => <button type="button" role="tab" key={item.key} data-settings-tab={item.key}
            aria-selected={item.key === active} tabIndex={item.key === active ? 0 : -1} className={item.key === active ? "active" : ""}
            onClick={() => onTab?.(item.key)} onKeyDown={(event) => tabKeys(event, index)}>{item.label}</button>)}</div>}
          <button type="button" className="pd-icon-button" aria-label="Kapat" onClick={onClose}><X size={15}/></button></header>
        {tabbed
          ? <div className="pd-settings-content pd-settings-tabbed" ref={contentRef} role="tabpanel" aria-label={tabs.find((item) => item.key === active)?.label}>
            <ActiveTabContext.Provider value={active}>{extra}{children}</ActiveTabContext.Provider>
          </div>
          : <div className="pd-settings-layout">
            <nav className="pd-settings-nav" aria-label="Ayar bölümleri">{nav.map((item) => <button type="button" key={item.index} onClick={() => jump(item.index)}>{item.label}</button>)}</nav>
            <div className="pd-settings-content" ref={contentRef}>{extra}{children}</div>
          </div>}
        <footer className="pd-modal-foot"><button type="button" className="pd-button small primary" data-autofocus onClick={onClose}>Kapat</button></footer>
      </section>
    </div>, document.body)}
  </>;
}
