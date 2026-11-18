import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDesignerModal } from "./designerModals";
import "./page-designer-extras.css";

type NavItem = { index: number; label: string };

/**
 * Seçili bileşenin "Tüm ayarlar" penceresi. Özellikler panelinin Gelişmiş bölümleri (`children`) açıkken aynen bu
 * pencereye taşınır (React portalı): her değişiklik tuvale hemen işlenir, geri al/yinele aynıdır; Kapat yeterlidir.
 * Kapalıyken `children` panelde yerinde çizilir (`hidden` ise hiç çizilmez: Basit kip).
 */
export function SettingsHost({ open, hidden, title, extra, onClose, children }: { open: boolean; hidden?: boolean; title: string; extra?: ReactNode; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [nav, setNav] = useState<NavItem[]>([]);
  useDesignerModal("settings", open, ref, onClose);
  useLayoutEffect(() => {
    if (!open || !contentRef.current) return;
    const sections = [...contentRef.current.querySelectorAll<HTMLElement>("[data-settings-section], .pd-inspector-section")];
    const next = sections.map((section, index) => {
      section.dataset.navIndex = String(index);
      return { index, label: section.dataset.settingsSection ?? section.querySelector(".pd-inspector-section-toggle span")?.textContent ?? `Bölüm ${index + 1}` };
    });
    if (JSON.stringify(next) !== JSON.stringify(nav)) setNav(next);
  });
  if (!open) return hidden ? null : <>{children}</>;
  const jump = (index: number) => contentRef.current?.querySelector<HTMLElement>(`[data-nav-index="${index}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  return <>
    <p className="pd-settings-inline-note">Tüm ayarlar pencerede açık.</p>
    {createPortal(<div className="pd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={ref} className="pd-modal pd-settings-modal" role="dialog" aria-modal="true" aria-label={title} data-pd-modal="settings" tabIndex={-1}>
        <header className="pd-modal-head"><b>{title}</b><button type="button" className="pd-icon-button" aria-label="Kapat" onClick={onClose}><X size={15}/></button></header>
        <div className="pd-settings-layout">
          <nav className="pd-settings-nav" aria-label="Ayar bölümleri">{nav.map((item) => <button type="button" key={item.index} onClick={() => jump(item.index)}>{item.label}</button>)}</nav>
          <div className="pd-settings-content" ref={contentRef}>{extra}{children}</div>
        </div>
        <footer className="pd-modal-foot"><small className="pd-modal-foot-note">Değişiklikler tuvale hemen uygulanır; Ctrl+Z ile geri alabilirsiniz.</small><button type="button" className="pd-button small primary" data-autofocus onClick={onClose}>Kapat</button></footer>
      </section>
    </div>, document.body)}
  </>;
}
