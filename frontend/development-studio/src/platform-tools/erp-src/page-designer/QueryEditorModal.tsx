import type { ReactNode } from "react";
import { X } from "lucide-react";
import "./left-panel.css";

/**
 * Geçici sorgu düzenleme penceresi: mevcut Sorgular panelini (liste + düzenleyici) bir pencerede gösterir.
 * Ayrı bir QueryEditorDialog hazır olduğunda bu sarmalayıcı onunla değiştirilebilir.
 */
export default function QueryEditorModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="pd-lp-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="pd-lp-modal pd-lp-query-modal" role="dialog" aria-modal="true" aria-label={title}
      onKeyDown={(event) => { if (event.key === "Escape" && !(event.target as HTMLElement).closest(".monaco-editor")) { event.stopPropagation(); onClose(); } }}>
      <header className="pd-lp-modal-head"><b>{title}</b><button type="button" className="pd-icon-button" aria-label="Kapat" onClick={onClose} autoFocus><X size={15}/></button></header>
      <div className="pd-lp-modal-body">{children}</div>
    </section>
  </div>;
}
