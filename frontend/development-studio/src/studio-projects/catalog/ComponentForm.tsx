import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { WorkspaceCodeEditor } from "../../WorkspaceCodeEditor";
import { componentPaths, type ComponentCatalogEntry } from "./catalogFiles";
import { saveEntry, useDirtyTracking, type WriteCatalogFiles } from "./catalogFormModel";
import {
  COMPONENT_CODE_PATTERN, DEFAULT_HEIGHT, MAX_JAVASCRIPT, MAX_SETTINGS, SETTING_TYPES, SETTING_TYPE_LABELS, addSetting, componentProblems,
  hasExternalCss, moveSetting, readSettings, removeSetting, setSetting, settingsJson, type SettingRow, type SettingType,
} from "./componentFormModel";
import { ComponentPreview } from "./ComponentPreview";

export type ComponentFormProps = {
  root: string;
  /** null: yeni bileşen */
  entry: ComponentCatalogEntry | null;
  existingCodes: string[];
  canEdit: boolean;
  writeFiles: WriteCatalogFiles;
  /** Dosya yolu → sha256; form açıldığında kopyalanır ve kayıtta beklenen sha olarak gönderilir. */
  fileShas?: Record<string, string>;
  onSaved?: (code: string) => void;
  /** Kaydedilmemiş değişiklik durumu değişince çağrılır (formu yeniden kuracak işlemler önce sorar). */
  onDirtyChange?: (dirty: boolean) => void;
};

const OWN_KEYS = ["code", "label", "description", "height", "settings", "css", "javascript"];

function SettingsTable({ rows, disabled, onChange }: { rows: SettingRow[]; disabled: boolean; onChange: (rows: SettingRow[]) => void }) {
  const update = (index: number, patch: Partial<SettingRow>) => onChange(setSetting(rows, index, patch));
  return (
    <div className="sp-cw-card">
      <h3>Danışmanın dolduracağı ayarlar</h3>
      <p className="sp-cw-desc">En çok 10 ayar. Danışman yalnız bunları görür; kodu görmez.</p>
      <table className="sp-cw-table sp-cw-settings">
        <thead><tr><th>Ad</th><th>Etiket</th><th>Tür</th><th>Seçenekler</th><th>Varsayılan</th><th aria-label="İşlem" /></tr></thead>
        <tbody>
          {rows.map((row, index) => {
            const options = row.options.split(",").map(o => o.trim()).filter(Boolean);
            return (
              <tr key={index}>
                <td><input aria-label="Ayar adı" className="ns-mono" value={row.name} maxLength={32} disabled={disabled} onChange={e => update(index, { name: e.target.value })} /></td>
                <td><input aria-label="Ayar etiketi" value={row.label} maxLength={60} disabled={disabled} onChange={e => update(index, { label: e.target.value })} /></td>
                <td>
                  <select aria-label="Ayar türü" value={row.type} disabled={disabled} onChange={e => update(index, { type: e.target.value as SettingType })}>
                    {SETTING_TYPES.map(t => <option key={t} value={t}>{SETTING_TYPE_LABELS[t]}</option>)}
                  </select>
                </td>
                <td>
                  {row.type === "choice"
                    ? <input aria-label="Seçenekler" value={row.options} placeholder="virgülle" disabled={disabled} onChange={e => update(index, { options: e.target.value })} />
                    : <span className="sp-cw-hint">—</span>}
                </td>
                <td>
                  {row.type === "bool" ? (
                    <input type="checkbox" aria-label="Varsayılan" checked={row.def === true} disabled={disabled} onChange={e => update(index, { def: e.target.checked })} />
                  ) : row.type === "choice" ? (
                    <select aria-label="Varsayılan" value={typeof row.def === "string" ? row.def : ""} disabled={disabled} onChange={e => update(index, { def: e.target.value })}>
                      <option value="">(yok)</option>
                      {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input aria-label="Varsayılan" type={row.type === "number" ? "number" : "text"} value={typeof row.def === "string" ? row.def : ""} disabled={disabled} onChange={e => update(index, { def: e.target.value })} />
                  )}
                </td>
                <td className="sp-cw-row-actions">
                  <button type="button" className="ns-btn ns-btn-sm ns-btn-ghost" aria-label="Ayarı yukarı taşı" disabled={disabled || index === 0} onClick={() => onChange(moveSetting(rows, index, -1))}><ArrowUp size={14} /></button>
                  <button type="button" className="ns-btn ns-btn-sm ns-btn-ghost" aria-label="Ayarı aşağı taşı" disabled={disabled || index === rows.length - 1} onClick={() => onChange(moveSetting(rows, index, 1))}><ArrowDown size={14} /></button>
                  <button type="button" className="ns-btn ns-btn-sm ns-btn-ghost" aria-label="Ayarı sil" disabled={disabled} onClick={() => onChange(removeSetting(rows, index))}><Trash2 size={14} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button type="button" className="ns-btn ns-btn-sm" disabled={disabled || rows.length >= MAX_SETTINGS} onClick={() => onChange(addSetting(rows))}>
        <Plus size={14} /> Ayar ekle
      </button>
      <p className="sp-cw-hint">Kodda bir ayar <code>nexora.get("ayarlar.{rows[0]?.name || "ad"}")</code> ile okunur.</p>
    </div>
  );
}

export function ComponentForm({ root, entry, existingCodes, canEdit, writeFiles, onSaved, onDirtyChange, fileShas = {} }: ComponentFormProps) {
  const json = entry?.json ?? {};
  const [code, setCode] = useState(entry?.code ?? "");
  const [label, setLabel] = useState(typeof json.label === "string" ? json.label : "");
  const [description, setDescription] = useState(typeof json.description === "string" ? json.description : "");
  const [height, setHeight] = useState(json.height === undefined || json.height === null ? "" : String(json.height));
  const [settings, setSettings] = useState<SettingRow[]>(() => readSettings(json));
  const [css, setCss] = useState(entry?.css ?? "");
  const [javascript, setJavascript] = useState(entry?.javascript ?? "");
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const seededShas = useRef<Record<string, string>>({ ...fileShas });
  const isNew = entry === null;
  const locked = !canEdit || busy;

  function currentJson(): Record<string, unknown> {
    const next: Record<string, unknown> = { code, label: label.trim() };
    if (description.trim()) next.description = description.trim();
    if (height.trim()) next.height = Number(height.trim());
    next.settings = settingsJson(settings);
    // Formun bilmediği anahtarlar korunur; doğrulama onları bildirir.
    for (const key of Object.keys(json)) if (!OWN_KEYS.includes(key)) next[key] = json[key];
    return next;
  }

  function currentEntry(): ComponentCatalogEntry {
    const paths = componentPaths(root, code);
    return { kind: "component", code, jsonPath: paths.jsonPath, cssPath: paths.cssPath, jsPath: paths.jsPath, json: currentJson(), css, javascript };
  }

  const markSaved = useDirtyTracking(JSON.stringify(currentEntry()), onDirtyChange);

  async function save() {
    const saved = currentEntry();
    const problems = componentProblems(saved.json, css, javascript);
    if (isNew && existingCodes.some(c => c.toLowerCase() === code.toLowerCase())) problems.unshift("Bu kod katalogda zaten kullanılıyor.");
    if (problems.length) { setErrors(problems); setNotice(""); return; }
    setBusy(true); setErrors([]); setNotice("");
    try {
      const outcome = await saveEntry(root, saved, writeFiles, seededShas.current);
      if (outcome === "cancelled") return;
      if (outcome) { setErrors([outcome]); return; }
      markSaved(JSON.stringify(saved));
      setNotice("Kaydedildi. Yayınlamak için önce değişiklikleri commit edin.");
      onSaved?.(code);
    } finally {
      setBusy(false);
    }
  }

  const dir = componentPaths(root, code || "yeni").dir;
  const parsedHeight = /^\d+$/.test(height.trim()) ? Number(height.trim()) : DEFAULT_HEIGHT;

  return (
    <div className="sp-cw-comp">
      <div className="sp-cw-form">
        <div className="sp-cw-card">
          <h3>{label || (isNew ? "Yeni bileşen" : code)}</h3>
          <p className="sp-cw-desc">Bileşen · danışman bunu paletten “Yazılımcı bileşeni” olarak seçer.</p>
          {errors.length > 0 && <div className="alert" role="alert"><ul>{errors.map(item => <li key={item}>{item}</li>)}</ul></div>}
          {notice && <p className="sp-cw-notice" role="status">{notice}</p>}
          <div className="sp-cw-grid">
            <label className="ns-field">
              <span className="ns-field-label">Kod</span>
              <input aria-label="Kod" className="ns-mono" value={code} maxLength={40} disabled={!isNew || locked} onChange={e => setCode(e.target.value)} />
              {code !== "" && !COMPONENT_CODE_PATTERN.test(code) && (
                <span className="sp-cw-prob">Katalog bileşeni kodu harf ile başlamalı; harf ve rakamlardan oluşmalı.</span>
              )}
            </label>
            <label className="ns-field">
              <span className="ns-field-label">Danışmanın göreceği ad</span>
              <input aria-label="Görünen ad" value={label} maxLength={80} disabled={locked} onChange={e => setLabel(e.target.value)} />
            </label>
            <label className="ns-field">
              <span className="ns-field-label">Açıklama (isteğe bağlı)</span>
              <input aria-label="Açıklama" value={description} maxLength={200} disabled={locked} onChange={e => setDescription(e.target.value)} />
            </label>
            <label className="ns-field">
              <span className="ns-field-label">Başlangıç yüksekliği (px)</span>
              <input aria-label="Başlangıç yüksekliği" type="number" min={80} max={1200} step={1} placeholder={String(DEFAULT_HEIGHT)} value={height} disabled={locked} onChange={e => setHeight(e.target.value)} />
            </label>
          </div>
          <p className="sp-cw-hint">Bileşen gerekirse kendi yüksekliğini büyütebilir (en çok 2000 px).</p>
        </div>
        <SettingsTable rows={settings} disabled={locked} onChange={setSettings} />
        <div className="sp-cw-card">
          <h3>Görünüş (CSS)</h3>
          <p className="sp-cw-desc">Harici kaynak (yazı tipi, görsel adresi, CDN) yüklenemez.</p>
          <div className="sp-cw-editor sp-cw-editor-sm">
            <WorkspaceCodeEditor path={`${dir}/stil.css`} value={css} readOnly={locked} onChange={setCss} />
          </div>
          {hasExternalCss(css) && <span className="sp-cw-prob">CSS'te harici kaynak kullanılamaz.</span>}
        </div>
        <div className="sp-cw-card">
          <h3>Kod (JavaScript)</h3>
          <p className="sp-cw-desc">Yalıtılmış çerçevede çalışır; sayfa verisine yalnız köprüyle ulaşır (sayfanın sorguları ve ERP işlemleri, kullanıcının yetkisiyle).</p>
          <div className="sp-cw-editor">
            <WorkspaceCodeEditor path={`${dir}/kod.js`} value={javascript} readOnly={locked} onChange={setJavascript} />
          </div>
          <p className="sp-cw-hint">{javascript.length} / {MAX_JAVASCRIPT} karakter</p>
        </div>
        <p className="sp-cw-hint">Dosyalar: bilesenler/{code || "<kod>"}/bilesen.json · stil.css · kod.js — formdan ya da doğrudan dosyadan düzenlenebilir.</p>
        <div className="sp-cw-bar sp-cw-save">
          <button type="button" className="ns-btn ns-btn-primary" disabled={locked} onClick={() => void save()}>
            <Save size={14} /> Kaydet
          </button>
          {!canEdit && <span className="sp-cw-hint">Bu projede düzenleme yetkiniz yok.</span>}
        </div>
      </div>
      <aside className="sp-cw-comp-preview">
        <ComponentPreview css={css} javascript={javascript} height={parsedHeight} settings={settingsJson(settings)} />
      </aside>
    </div>
  );
}
