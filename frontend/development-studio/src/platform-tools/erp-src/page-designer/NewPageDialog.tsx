import { useState } from "react";
import { X } from "lucide-react";
import { PAGE_CODE_MAX, pageCodeFromName, sanitizePageCode, uniquePageCode } from "./leftPanelModel";
import "./left-panel.css";

export type TemplateChoice = { id: string; label: string; description: string };
export type NewPageResult = { name: string; code: string; templateId: string };

type Props = {
  /** "create": Yeni özel sayfa (ad, kod, şablon); "template": boş sayfaya yalnız şablon seçimi. */
  mode: "create" | "template";
  templates: TemplateChoice[];
  /** Başka sayfalarda kullanılan kodlar (benzersizlik denetimi). */
  takenCodes: string[];
  onCancel: () => void;
  onConfirm: (result: NewPageResult) => void;
};

const CODE_PATTERN = /^[a-z0-9_-]+$/;

/** "Yeni özel sayfa" penceresi: Sayfa adı, Sayfa kodu (addan önerilir, düzenlenebilir) ve şablon kartları. */
export default function NewPageDialog({ mode, templates, takenCodes, onCancel, onConfirm }: Props) {
  const create = mode === "create";
  const taken = (value: string) => takenCodes.includes(value);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [codeEdited, setCodeEdited] = useState(false);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "blank");
  const changeName = (value: string) => {
    setName(value);
    if (!codeEdited) setCode(uniquePageCode(pageCodeFromName(value), taken));
  };
  const codeProblem = !create || !code ? null
    : !CODE_PATTERN.test(code) ? "Kod yalnız küçük harf, rakam, - ve _ içerebilir."
    : taken(code) ? "Bu kod başka bir sayfada kullanılıyor; farklı bir kod yazın." : null;
  const ready = !create || (name.trim() !== "" && code !== "" && !codeProblem);
  const title = create ? "Yeni özel sayfa" : "Şablonla başla";
  const confirm = () => { if (ready) onConfirm({ name: name.trim(), code, templateId }); };

  return <div className="pd-lp-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section className="pd-lp-modal pd-np-modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); onCancel(); } }}>
      <header className="pd-lp-modal-head"><b>{title}</b><button type="button" className="pd-icon-button" aria-label="Kapat" onClick={onCancel}><X size={15}/></button></header>
      <form className="pd-lp-modal-body" onSubmit={(event) => { event.preventDefault(); confirm(); }}>
        {create && <div className="pd-np-grid2">
          <label className="pd-field">Sayfa adı<input autoFocus maxLength={120} value={name} onChange={(event) => changeName(event.target.value)} placeholder="Masraf merkezleri"/></label>
          <label className="pd-field">Sayfa kodu<input maxLength={PAGE_CODE_MAX} value={code} spellCheck={false} placeholder="masraf-merkezleri"
            onChange={(event) => { setCodeEdited(true); setCode(sanitizePageCode(event.target.value)); }}/>
            {codeProblem ? <small className="pd-np-problem" role="alert">{codeProblem}</small> : <small>Adres olarak kullanılır; kaydedildikten sonra değiştirilemez.</small>}</label>
        </div>}
        <div className="pd-field">Şablon
          <div className="pd-np-templates" role="radiogroup" aria-label="Şablon">
            {templates.map((template) => <button type="button" role="radio" aria-checked={templateId === template.id} key={template.id} className={`pd-np-template${templateId === template.id ? " is-on" : ""}`}
              onClick={() => setTemplateId(template.id)} onDoubleClick={() => { setTemplateId(template.id); if (ready) onConfirm({ name: name.trim(), code, templateId: template.id }); }}>
              <span className="pd-np-preview" aria-hidden="true"/><b>{template.label}</b><small>{template.description}</small>
            </button>)}
          </div>
        </div>
        <footer className="pd-lp-modal-foot">
          <button type="button" className="pd-button" onClick={onCancel}>Vazgeç</button>
          <button type="submit" className="pd-button primary" disabled={!ready}>{create ? "Oluştur ve tasarla" : "Şablonu uygula"}</button>
        </footer>
      </form>
    </section>
  </div>;
}
