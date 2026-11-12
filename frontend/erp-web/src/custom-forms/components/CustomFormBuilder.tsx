import { Eye, GripVertical, Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { RecordFormGroup, RecordFormPage } from "../../record-form/RecordForm";
import "../../platform-record-forms.css";
import { fieldTypes, groupFieldsBySection, isFieldRequired, isFieldVisible, type Field, type Form } from "../types";

type Props = {
  selected: Form | null;
  name: string;
  code: string;
  description: string;
  fields: Field[];
  values: Record<string, string>;
  draggingFieldIndex: number | null;
  builderPreview: boolean;
  previewErrors: Record<string, string>;
  busy: boolean;
  onNameChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onPreviewChange: (value: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
  onAddField: (type: Field["dataType"]) => void;
  onUpdateField: (index: number, patch: Partial<Field>) => void;
  onMoveField: (from: number, to: number) => void;
  onRemoveField: (index: number) => void;
  onDraggingFieldIndexChange: (index: number | null) => void;
  onValueChange: (code: string, value: string) => void;
  onValidatePreview: () => void;
  control: (
    field: Field,
    value: string,
    onChange: (value: string) => void,
    required?: boolean,
  ) => ReactNode;
};

export function CustomFormBuilder(props: Props) {
  const {
    selected,
    name,
    code,
    description,
    fields,
    values,
    draggingFieldIndex,
    builderPreview,
    previewErrors,
    busy,
    onNameChange,
    onCodeChange,
    onDescriptionChange,
    onPreviewChange,
    onCancel,
    onSave,
    onAddField,
    onUpdateField,
    onMoveField,
    onRemoveField,
    onDraggingFieldIndexChange,
    onValueChange,
    onValidatePreview,
    control,
  } = props;
  const effectiveValues = Object.fromEntries(
    fields.map((field) => [field.code, values[field.code] ?? field.defaultValue ?? ""]),
  ) as Record<string, string>;
  const saveBlocked = !name.trim() || fields.length === 0;
  return (
    <section className="form-builder">
      <RecordFormPage
        variant="dialog"
        className="prf-flush prf-form-meta"
        title={selected ? "Taslağı düzenle" : "Form tasarla"}
        mode={selected ? "edit" : "create"}
        busy={busy}
        saveLabel="Taslağı kaydet"
        onSubmit={(event) => {
          event.preventDefault();
          if (saveBlocked) return;
          onSave();
        }}
        onCancel={onCancel}
        status={
          <>
            {selected && (
              <span>
                {selected.code} · v{selected.version}
              </span>
            )}
            {saveBlocked && (
              <span className="rf-status-warning">
                Taslağı kaydetmek için form adı ve en az bir alan gerekir.
              </span>
            )}
          </>
        }
      >
        <RecordFormGroup title="Form Kimliği" bodyClassName="rf-identity">
          <label>
            Form adı
            <input
              className="rf-must"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={120}
              placeholder="Örn. Masraf talebi"
            />
          </label>
          <label>
            Form kodu
            <input
              className="rf-mono"
              value={code}
              onChange={(event) => onCodeChange(event.target.value)}
              disabled={!!selected}
              maxLength={40}
              placeholder="masraf-talebi"
            />
          </label>
          <label className="wide">
            Açıklama
            <textarea
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
              maxLength={500}
              placeholder="Formun hangi süreçte kullanıldığını açıklayın"
            />
          </label>
        </RecordFormGroup>
      </RecordFormPage>
      <div className="prf-builder-switch">
        <div
          className="builder-view-switch"
          role="group"
          aria-label="Form oluşturucu görünümü"
        >
          <button
            type="button"
            className={!builderPreview ? "active" : ""}
            aria-pressed={!builderPreview}
            onClick={() => onPreviewChange(false)}
          >
            <GripVertical size={15} /> Tasarım
          </button>
          <button
            type="button"
            className={builderPreview ? "active" : ""}
            aria-pressed={builderPreview}
            onClick={() => onPreviewChange(true)}
          >
            <Eye size={15} /> Önizleme
          </button>
        </div>
      </div>
      {!builderPreview && (
        <>
          <div className="field-editor-heading">
            <div>
              <h3>Form alanları</h3>
              <p>
                Soldaki bileşenleri forma sürükleyin veya tıklayın. Tutamaktan
                sürükleyerek sıralayın. Ardışık alanlara aynı bölüm adını vererek gruplayın.
              </p>
            </div>
            <span className="field-count">{fields.length}/40 alan</span>
          </div>
          <div className="visual-form-designer">
            <aside className="field-palette">
              <b>Bileşenler</b>
              <small>Forma eklemek için sürükleyin</small>
              {fieldTypes.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  draggable
                  disabled={fields.length >= 40}
                  onClick={() => onAddField(item.type)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData(
                      "application/x-nexora-field-type",
                      item.type,
                    );
                  }}
                >
                  <item.icon size={16} />
                  <span>{item.label}</span>
                  <Plus size={14} />
                </button>
              ))}
            </aside>
            <div
              className="field-list"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const type = event.dataTransfer.getData(
                  "application/x-nexora-field-type",
                ) as Field["dataType"];
                if (fieldTypes.some((item) => item.type === type)) {
                  event.preventDefault();
                  onAddField(type);
                }
              }}
            >
              {fields.length === 0 && (
                <div className="field-drop-empty">
                  Bir bileşeni buraya sürükleyin veya soldan seçin.
                </div>
              )}
              {fields.map((field, index) => (
                <article
                  className={`field-editor${draggingFieldIndex === index ? " is-dragging" : ""}`}
                  key={`${index}-${field.code}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const type = event.dataTransfer.getData(
                      "application/x-nexora-field-type",
                    ) as Field["dataType"];
                    if (fieldTypes.some((item) => item.type === type))
                      onAddField(type);
                    else {
                      const from = Number(
                        event.dataTransfer.getData("text/plain"),
                      );
                      if (Number.isInteger(from)) onMoveField(from, index);
                    }
                    onDraggingFieldIndexChange(null);
                  }}
                  onDragEnd={() => onDraggingFieldIndexChange(null)}
                >
                  <button
                    type="button"
                    className="field-drag-handle"
                    draggable
                    aria-label={`${field.label} alanını sürükleyip sırala`}
                    aria-keyshortcuts="ArrowUp ArrowDown"
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" && index > 0) {
                        event.preventDefault();
                        onMoveField(index, index - 1);
                      } else if (
                        event.key === "ArrowDown" &&
                        index < fields.length - 1
                      ) {
                        event.preventDefault();
                        onMoveField(index, index + 1);
                      }
                    }}
                    onDragStart={(event) => {
                      onDraggingFieldIndexChange(index);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", String(index));
                    }}
                  >
                    <GripVertical size={16} />
                  </button>
                  <span className="field-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <label>
                    Etiket
                    <input
                      value={field.label}
                      onChange={(event) =>
                        onUpdateField(index, { label: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Alan kodu
                    <input
                      value={field.code}
                      onChange={(event) =>
                        onUpdateField(index, { code: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    Tür
                    <select
                      value={field.dataType}
                      onChange={(event) =>
                        onUpdateField(index, {
                          dataType: event.target.value as Field["dataType"],
                        })
                      }
                    >
                      <option>Text</option>
                      <option>Decimal</option>
                      <option>Date</option>
                      <option>Boolean</option>
                      <option>Choice</option>
                    </select>
                  </label>
                  <label className="field-section-config">
                    Bölüm adı
                    <input
                      maxLength={80}
                      value={field.sectionTitle ?? ""}
                      onChange={(event) => onUpdateField(index, {
                        sectionTitle: event.target.value || null,
                      })}
                      placeholder="Örn. İletişim bilgileri"
                    />
                  </label>
                  <label className="required-toggle">
                    <input
                      type="checkbox"
                      checked={field.isRequired}
                      onChange={(event) =>
                        onUpdateField(index, {
                          isRequired: event.target.checked,
                        })
                      }
                    />{" "}
                    Zorunlu
                  </label>
                  {field.dataType === "Text" && (
                    <>
                      <label>
                        Asgari karakter
                        <input
                          type="number"
                          step="1"
                          min="0"
                          max={field.maxLength ?? 250}
                          value={field.minLength ?? 0}
                          onChange={(event) =>
                            onUpdateField(index, { minLength: Number(event.target.value) })
                          }
                        />
                      </label>
                      <label>
                        Azami karakter
                        <input
                          type="number"
                          step="1"
                          min={field.minLength ?? 0}
                          max="1000"
                          value={field.maxLength ?? 250}
                          onChange={(event) =>
                            onUpdateField(index, {
                              maxLength: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <div className="field-text-presentation">
                        <label>
                          Biçim doğrulama
                          <select
                            value={field.textFormat ?? "None"}
                            onChange={(event) => {
                              const textFormat = event.target.value as NonNullable<Field["textFormat"]>;
                              onUpdateField(index, {
                                textFormat,
                                isMultiline: textFormat === "None" ? field.isMultiline ?? false : false,
                              });
                            }}
                          >
                            <option value="None">Yok</option>
                            <option value="Email">E-posta</option>
                            <option value="Url">Web adresi</option>
                            <option value="Phone">Telefon</option>
                          </select>
                        </label>
                        <label>
                          Yer tutucu metin
                          <input
                            maxLength={120}
                            value={field.placeholder ?? ""}
                            onChange={(event) => onUpdateField(index, { placeholder: event.target.value || null })}
                            placeholder="Örn. Talep nedenini yazın"
                          />
                        </label>
                        <label className="required-toggle">
                          <input
                            type="checkbox"
                            checked={field.isMultiline ?? false}
                            disabled={field.textFormat != null && field.textFormat !== "None"}
                            onChange={(event) => onUpdateField(index, { isMultiline: event.target.checked })}
                          />
                          Çok satırlı giriş
                        </label>
                      </div>
                    </>
                  )}
                  {field.dataType === "Decimal" && (
                    <div className="field-number-limits">
                      <label>
                        En düşük değer
                        <input
                          type="number"
                          step="any"
                          value={field.minValue ?? ""}
                          onChange={(event) => onUpdateField(index, {
                            minValue: event.target.value === "" ? null : Number(event.target.value),
                          })}
                          placeholder="Sınırsız"
                        />
                      </label>
                      <label>
                        En yüksek değer
                        <input
                          type="number"
                          step="any"
                          value={field.maxValue ?? ""}
                          onChange={(event) => onUpdateField(index, {
                            maxValue: event.target.value === "" ? null : Number(event.target.value),
                          })}
                          placeholder="Sınırsız"
                        />
                      </label>
                    </div>
                  )}
                  {field.dataType === "Date" && (
                    <div className="field-date-limits">
                      <label>
                        En erken tarih
                        <input
                          type="date"
                          max={field.maxDate ?? undefined}
                          value={field.minDate ?? ""}
                          onChange={(event) => onUpdateField(index, {
                            minDate: event.target.value || null,
                          })}
                        />
                      </label>
                      <label>
                        En geç tarih
                        <input
                          type="date"
                          min={field.minDate ?? undefined}
                          value={field.maxDate ?? ""}
                          onChange={(event) => onUpdateField(index, {
                            maxDate: event.target.value || null,
                          })}
                        />
                      </label>
                    </div>
                  )}
                  {field.dataType === "Choice" && (
                    <label className="options-field">
                      Seçenekler (virgülle ayırın)
                      <input
                        value={(field.options ?? []).join(", ")}
                        onChange={(event) =>
                          onUpdateField(index, {
                            options: event.target.value
                              .split(",")
                              .map((value) => value.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </label>
                  )}
                  <label className="field-help-config">
                    Yardım metni
                    <input
                      maxLength={240}
                      value={field.helpText ?? ""}
                      onChange={(event) => onUpdateField(index, { helpText: event.target.value || null })}
                      placeholder="Alanla ilgili kısa açıklama"
                    />
                  </label>
                  <label className="field-default-config">
                    Varsayılan değer
                    {control(field, field.defaultValue ?? "", (value) =>
                      onUpdateField(index, { defaultValue: value || null }), false)}
                  </label>
                  {index > 0 && (
                    <div className="field-visibility-condition">
                      <label>
                        Görünürlük koşulu
                        <select
                          value={field.visibleWhenFieldCode ?? ""}
                          onChange={(event) => {
                            const sourceCode = event.target.value;
                            const source = fields
                              .slice(0, index)
                              .find((item) => item.code === sourceCode);
                            onUpdateField(index, {
                              visibleWhenFieldCode: sourceCode || null,
                              visibleWhenValue: sourceCode
                                ? source?.dataType === "Boolean"
                                  ? "true"
                                  : source?.dataType === "Choice"
                                    ? source.options?.[0] ?? ""
                                    : ""
                                : null,
                            });
                          }}
                        >
                          <option value="">Her zaman göster</option>
                          {fields.slice(0, index).map((source) => (
                            <option key={source.code} value={source.code}>
                              {source.label || source.code}
                            </option>
                          ))}
                        </select>
                      </label>
                      {field.visibleWhenFieldCode && (() => {
                        const source = fields
                          .slice(0, index)
                          .find((item) => item.code === field.visibleWhenFieldCode);
                        if (!source) return null;
                        const choices = source.dataType === "Boolean"
                          ? [{ value: "true", label: "Evet" }, { value: "false", label: "Hayır" }]
                          : source.dataType === "Choice"
                            ? (source.options ?? []).map((value) => ({ value, label: value }))
                            : null;
                        return (
                          <label>
                            Yanıt şu olduğunda
                            {choices ? (
                              <select
                                value={field.visibleWhenValue ?? ""}
                                onChange={(event) =>
                                  onUpdateField(index, { visibleWhenValue: event.target.value })
                                }
                              >
                                <option value="">Değer seçin</option>
                                {choices.map((choice) => (
                                  <option key={choice.value} value={choice.value}>{choice.label}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                value={field.visibleWhenValue ?? ""}
                                onChange={(event) =>
                                  onUpdateField(index, { visibleWhenValue: event.target.value })
                                }
                                placeholder="Eşleşecek değeri yazın"
                              />
                            )}
                          </label>
                        );
                      })()}
                      <small>Koşullu alanlar, kaynak alan yanıtı eşleşince görünür.</small>
                    </div>
                  )}
                  {index > 0 && (
                    <div className="field-visibility-condition">
                      <label>
                        Zorunluluk koşulu
                        <select
                          value={field.requiredWhenFieldCode ?? ""}
                          onChange={(event) => {
                            const sourceCode = event.target.value;
                            const source = fields.slice(0, index).find((item) => item.code === sourceCode);
                            onUpdateField(index, {
                              requiredWhenFieldCode: sourceCode || null,
                              requiredWhenValue: sourceCode
                                ? source?.dataType === "Boolean"
                                  ? "true"
                                  : source?.dataType === "Choice"
                                    ? source.options?.[0] ?? ""
                                    : ""
                                : null,
                            });
                          }}
                        >
                          <option value="">Ek koşul yok</option>
                          {fields.slice(0, index).map((source) => (
                            <option key={source.code} value={source.code}>{source.label || source.code}</option>
                          ))}
                        </select>
                      </label>
                      {field.requiredWhenFieldCode && (() => {
                        const source = fields.slice(0, index).find((item) => item.code === field.requiredWhenFieldCode);
                        if (!source) return null;
                        const choices = source.dataType === "Boolean"
                          ? [{ value: "true", label: "Evet" }, { value: "false", label: "Hayır" }]
                          : source.dataType === "Choice"
                            ? (source.options ?? []).map((value) => ({ value, label: value }))
                            : null;
                        return (
                          <label>
                            Yanıt şu olduğunda zorunlu
                            {choices ? (
                              <select
                                value={field.requiredWhenValue ?? ""}
                                onChange={(event) => onUpdateField(index, { requiredWhenValue: event.target.value })}
                              >
                                <option value="">Değer seçin</option>
                                {choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                              </select>
                            ) : (
                              <input
                                type={source.dataType === "Decimal" ? "number" : source.dataType === "Date" ? "date" : "text"}
                                step={source.dataType === "Decimal" ? "any" : undefined}
                                value={field.requiredWhenValue ?? ""}
                                onChange={(event) => onUpdateField(index, { requiredWhenValue: event.target.value })}
                                placeholder="Eşleşecek değeri yazın"
                              />
                            )}
                          </label>
                        );
                      })()}
                      <small>Koşul eşleştiğinde alan doldurulmalıdır. Alan gizliyse zorunlu tutulmaz.</small>
                    </div>
                  )}
                  <button
                    type="button"
                    className="icon-danger"
                    title="Alanı sil"
                    onClick={() => onRemoveField(index)}
                  >
                    <Trash2 size={16} />
                  </button>
                </article>
              ))}
            </div>
          </div>
          <div className="preview-card">
            <div className="preview-heading">
              <Eye size={17} />
              <b>Canlı önizleme</b>
              <span>Kullanıcıların göreceği form</span>
            </div>
            <h3>{name || "Form başlığı"}</h3>
            <p>{description || "Form açıklaması burada görünür."}</p>
            {groupFieldsBySection(fields.filter((field) => isFieldVisible(field, effectiveValues, fields))).map((group, groupIndex) => (
              <section className="form-field-section" key={`${group.title ?? "general"}-${groupIndex}`}>
                {group.title && <h4>{group.title}</h4>}
                <div className="submission-fields">
                  {group.fields.map((field) => (
                    <label key={field.code}>
                      {field.label}
                      {isFieldRequired(field, effectiveValues, fields) && <i>*</i>}
                      {field.helpText && <small className="field-help-text">{field.helpText}</small>}
                      {control(field, effectiveValues[field.code] ?? "", (value) =>
                        onValueChange(field.code, value),
                        isFieldRequired(field, effectiveValues, fields),
                      )}
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
      {builderPreview && (
        <div className="preview-card builder-preview-card">
          <div className="preview-heading">
            <Eye size={17} />
            <b>Form önizlemesi</b>
            <span>{fields.length} alan · taslak</span>
          </div>
          <h3>{name || "Form başlığı"}</h3>
          <p>{description || "Form açıklaması burada görünür."}</p>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              onValidatePreview();
            }}
          >
            <section
              className="preview-form-section"
              aria-label="Form alanları"
            >
              <div className="preview-section-heading">
                <b>Form alanları</b>
                <span>{fields.length} alan</span>
              </div>
              {fields.length === 0 ? (
                <p className="empty-state compact">Önizlenecek alan yok.</p>
              ) : (
                groupFieldsBySection(fields.filter((field) => isFieldVisible(field, effectiveValues, fields))).map((group, groupIndex) => (
                  <section className="form-field-section" key={`${group.title ?? "general"}-${groupIndex}`}>
                    {group.title && <h4>{group.title}</h4>}
                    <div className="submission-fields">
                      {group.fields.map((field) => (
                        <label key={field.code}>
                          {field.label}
                          {isFieldRequired(field, effectiveValues, fields) && <i aria-label="Zorunlu">*</i>}
                          {field.helpText && <small className="field-help-text">{field.helpText}</small>}
                          {control(field, effectiveValues[field.code] ?? "", (value) =>
                            onValueChange(field.code, value),
                          )}
                          {previewErrors[field.code] && (
                            <small className="preview-field-error" role="alert">
                              {previewErrors[field.code]}
                            </small>
                          )}
                          <small className="preview-field-hint">
                            {field.dataType === "Text"
                              ? `Metin · ${field.minLength ?? 0}–${field.maxLength ?? 250} karakter${field.textFormat && field.textFormat !== "None" ? ` · ${field.textFormat === "Email" ? "E-posta" : field.textFormat === "Url" ? "Web adresi" : "Telefon"}` : ""}`
                              : field.dataType === "Decimal"
                                ? `Sayı${field.minValue != null ? ` · en az ${field.minValue}` : ""}${field.maxValue != null ? ` · en çok ${field.maxValue}` : ""}`
                                : field.dataType === "Date"
                                  ? `Tarih${field.minDate ? ` · en erken ${field.minDate}` : ""}${field.maxDate ? ` · en geç ${field.maxDate}` : ""}`
                                  : field.dataType === "Boolean"
                                    ? "Evet / Hayır"
                                    : `Seçim · ${(field.options ?? []).length} seçenek`}
                          {field.isRequired ? " · Zorunlu" : field.requiredWhenFieldCode ? " · Koşula bağlı zorunlu" : ""}
                          </small>
                        </label>
                      ))}
                    </div>
                  </section>
                ))
              )}
            </section>
            <div className="preview-validation-footer">
              <span>Önizlemede girilen değerler kaydedilmez.</span>
              <button
                type="submit"
                className="secondary"
                disabled={fields.length === 0}
              >
                Doğrulamayı dene
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
