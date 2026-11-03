import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock3,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Save,
  Send,
} from "lucide-react";
import type { EditorState, LayoutField } from "../types";
import { useMemo, useState } from "react";

const screensWithResizableColumns = new Set([
  "customers",
  "sales-returns",
  "finance-accounts",
  "finance-account-transactions",
  "finance-balance-sheet",
  "finance-cash-flow-report",
  "finance-fx-exposure",
  "finance-fx-revaluation-lines",
  "finance-fx-revaluations",
  "finance-income-statement",
  "finance-journals",
  "finance-ledger-accounts",
  "finance-ledger-mappings",
  "finance-maturities",
  "finance-maturity-aging",
  "finance-statement-lines",
  "finance-statement-unmatched-book",
  "finance-statements",
  "finance-transfer-sources",
  "finance-trial-balance",
  "hr-attendance",
  "hr-employee-calendar-overrides",
  "hr-employees",
  "hr-leave-requests",
  "hr-workplace-assignments",
  "hr-workplace-calendars",
]);

function supportsColumnWidth(screenKey: string) {
  return screensWithResizableColumns.has(screenKey);
}

type Props = {
  en: boolean;
  busy: boolean;
  admin: boolean;
  state: EditorState;
  fields: LayoutField[];
  name: string;
  visibleCount: number;
  screenKey: string;
  onNameChange: (value: string) => void;
  onCreateDraft: () => void;
  onSaveDraft: () => void;
  onPublishDraft: () => void;
  onUpdateField: (key: string, update: Partial<LayoutField>) => void;
  onAddField: (key: string) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onReorder: (source: string, target: string) => void;
};

export default function ScreenViewEditor({
  en,
  busy,
  admin,
  state,
  fields,
  name,
  visibleCount,
  screenKey,
  onNameChange,
  onCreateDraft,
  onSaveDraft,
  onPublishDraft,
  onUpdateField,
  onAddField,
  onMove,
  onReorder,
}: Props) {
  const [fieldSearch, setFieldSearch] = useState("");
  const addableFields = useMemo(() => {
    const query = fieldSearch.trim().toLocaleLowerCase(en ? "en" : "tr");
    return fields
      .filter((field) => !field.visible && !field.fixed)
      .filter((field) => !query || `${field.label} ${field.key}`.toLocaleLowerCase(en ? "en" : "tr").includes(query))
      .sort((a, b) => a.label.localeCompare(b.label, en ? "en" : "tr"));
  }, [en, fieldSearch, fields]);
  const [selectedFieldKey, setSelectedFieldKey] = useState("");
  const selectedKey = addableFields.some((field) => field.key === selectedFieldKey)
    ? selectedFieldKey
    : addableFields[0]?.key ?? "";
  return (
    <section className="panel screen-view-editor">
      <div className="screen-view-panel-head">
        <div>
          <p className="eyebrow">{en ? "LAYOUT EDITOR" : "DÜZEN TASARIMI"}</p>
          <h2>{en ? "List fields" : "Liste alanları"}</h2>
          <p>
            {en
              ? "Change labels, visibility, and order. System actions stay available."
              : "Etiketleri, görünürlüğü ve sıralamayı değiştirin. Sistem işlemleri erişilebilir kalır."}
          </p>
        </div>
        {state.draft ? (
          <span className="screen-view-draft">
            <Clock3 size={14} />
            {en ? "Draft" : "Taslak"} · v{state.draft.revision}
          </span>
        ) : admin ? (
          <button
            className="secondary small-button"
            disabled={busy}
            onClick={onCreateDraft}
          >
            <Plus size={15} />
            {en ? "Create draft" : "Taslak oluştur"}
          </button>
        ) : (
          <span className="screen-view-readonly">
            {en ? "Read only" : "Salt okunur"}
          </span>
        )}
      </div>
      {state.draft && admin ? (
        <>
          <label className="screen-view-name">
            {en ? "Draft name" : "Taslak adı"}
            <input
              maxLength={120}
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </label>
          <div className="screen-view-fields-heading">
            <div>
              <strong>{en ? "Column settings" : "Sütun ayarları"}</strong>
              <span>{en ? "Show, hide or reorder fields" : "Alanları gösterin, gizleyin veya sıralayın"}</span>
            </div>
            <div className="screen-view-field-tools">
              <span className="screen-view-field-count">{visibleCount} / {fields.length} {en ? "visible" : "görünür"}</span>
              <div className="screen-view-add-field">
                <input
                  type="search"
                  aria-label={en ? "Search available fields" : "Kullanılabilir alanlarda ara"}
                  placeholder={en ? "Search fields…" : "Alanlarda ara…"}
                  value={fieldSearch}
                  onChange={(event) => setFieldSearch(event.target.value)}
                  disabled={busy || addableFields.length === 0 && !fieldSearch}
                />
                <select
                  aria-label={en ? "Field to add" : "Eklenecek alan"}
                  value={selectedKey}
                  disabled={busy || addableFields.length === 0}
                  onChange={(event) => setSelectedFieldKey(event.target.value)}
                >
                  {addableFields.length === 0 ? (
                    <option value="">{en ? "No available fields" : "Alan bulunamadı"}</option>
                  ) : addableFields.map((field) => (
                    <option key={field.key} value={field.key}>{field.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy || !selectedKey}
                  onClick={() => selectedKey && onAddField(selectedKey)}
                >
                  <Plus size={14} /> {en ? "Add field" : "Alan ekle"}
                </button>
              </div>
            </div>
          </div>
          <div className="screen-view-fields">
            {[...fields]
              .sort((a, b) => a.position - b.position)
              .map((field, index) => (
                <article
                  className={`screen-view-field${field.fixed ? " fixed" : ""}${!field.visible ? " is-hidden" : ""}${supportsColumnWidth(screenKey) && !field.fixed ? " screen-view-field-width" : ""}`}
                  key={field.key}
                  draggable={!field.fixed}
                  onDragStart={(event) =>
                    event.dataTransfer.setData("text/plain", field.key)
                  }
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    onReorder(
                      event.dataTransfer.getData("text/plain"),
                      field.key,
                    );
                  }}
                >
                  <GripVertical size={16} className="screen-view-grip" />
                  <label
                    className="screen-view-visible"
                    title={
                      en ? "Show or hide column" : "Sütunu göster veya gizle"
                    }
                  >
                    <input
                      type="checkbox"
                      aria-label={en ? `Show ${field.label}` : `${field.label} alanını göster`}
                      checked={field.visible}
                      disabled={field.fixed}
                      onChange={(event) =>
                        onUpdateField(field.key, {
                          visible: event.target.checked,
                        })
                      }
                    />
                    {field.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                  </label>
                  <label className="screen-view-field-label">
                    <span>{en ? "Column label" : "Sütun adı"}</span>
                    <input
                      aria-label={en ? `Column label for ${field.label}` : `${field.label} sütun adı`}
                      maxLength={80}
                      value={field.label}
                      onChange={(event) =>
                        onUpdateField(field.key, { label: event.target.value })
                      }
                    />
                    <code title={field.key}>{field.key.startsWith("custom:") ? (en ? "Custom field" : "Özel alan") : field.key}</code>
                  </label>
                  <label className="screen-view-section-label">
                    {en ? "Section" : "Bölüm"}
                    <input
                      aria-label={
                        en
                          ? `Section for ${field.label}`
                          : `${field.label} bölümü`
                      }
                      maxLength={40}
                      disabled={field.fixed}
                      value={field.section || ""}
                      placeholder={en ? "General" : "Genel"}
                      onChange={(event) =>
                        onUpdateField(field.key, {
                          section: event.target.value || null,
                        })
                      }
                    />
                  </label>
                  {supportsColumnWidth(screenKey) && !field.fixed && (
                    <label className="screen-view-width-label">
                      {en ? "Width (px)" : "Genişlik (px)"}
                      <input
                        aria-label={
                          en
                            ? `Width for ${field.label}`
                            : `${field.label} genişliği`
                        }
                        type="number"
                        min={80}
                        max={640}
                        step={10}
                        value={field.width ?? ""}
                        placeholder={en ? "Auto" : "Otomatik"}
                        onChange={(event) =>
                          onUpdateField(field.key, {
                            width: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      />
                    </label>
                  )}
                  <div className="screen-view-order" aria-label={en ? "Column order" : "Sütun sırası"}>
                    {field.fixed && <small>{en ? "Required" : "Zorunlu"}</small>}
                    <button
                      type="button"
                      aria-label={en ? `Move ${field.label} up` : `${field.label} alanını yukarı taşı`}
                      disabled={
                        index === 0 || field.fixed || fields[index - 1]?.fixed
                      }
                      onClick={() => onMove(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={en ? `Move ${field.label} down` : `${field.label} alanını aşağı taşı`}
                      disabled={
                        index === fields.length - 1 ||
                        field.fixed ||
                        fields[index + 1]?.fixed
                      }
                      onClick={() => onMove(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </article>
              ))}
          </div>
          <div className="screen-view-actions">
            <span>
              {visibleCount} {en ? "visible columns" : "görünür sütun"}
            </span>
            <button className="secondary" disabled={busy} onClick={onSaveDraft}>
              <Save size={15} />
              {en ? "Save draft" : "Taslağı kaydet"}
            </button>
            <button
              className="primary"
              disabled={busy || state.draft.revision < 1}
              onClick={onPublishDraft}
            >
              <Send size={15} />
              {en ? "Publish" : "Yayımla"}
            </button>
          </div>
        </>
      ) : (
        <div className="screen-view-empty">
          <Check size={18} />
          <span>
            {state.active.isPublished
              ? en
                ? "The published company layout is active."
                : "Yayımlanmış firma düzeni kullanımda."
              : en
                ? "ERP varsayılan düzeni kullanımda."
                : "ERP varsayılan düzeni kullanımda."}
          </span>
        </div>
      )}
    </section>
  );
}
