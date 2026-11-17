import { Fragment, type FormEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import type { Warehouse, WarehouseLocationOption } from "../../erp-types";
import { StatusTag } from "../../list-page/StatusTag";
import { RecordFieldChange, RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";

/** A warehouse custom field as the form needs it (create: the active definitions; edit: the warehouse's values). */
export type WarehouseFormField = {
  code: string;
  label: string;
  dataType: "Text" | "Decimal" | "Date" | "Boolean";
  maxLength: number;
  isRequired: boolean;
  version: number;
};

export type WarehouseDraft = { code: string; name: string; custom: Record<string, string> };

type Props = {
  mode: "create" | "edit";
  /** The open warehouse (edit). */
  current?: Warehouse;
  draft: WarehouseDraft;
  /** Loaded values (edit): previous values of changed fields. */
  baseline: WarehouseDraft | null;
  fields: WarehouseFormField[];
  fieldsLoading: boolean;
  changedCount: number;
  busy: boolean;
  error: string;
  notice: string;
  saveDisabledReason?: string;
  formId: string;
  onDismissError: () => void;
  onChange: (draft: WarehouseDraft) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onSaveIntent?: (stayForNext: boolean) => void;
  onReset?: () => void;
  /** Lokasyonlar card (edit only). */
  locations: WarehouseLocationOption[];
  locationsLoading: boolean;
  locationsError: string;
  onAddLocation?: () => void;
  onManageLocations?: () => void;
};

const booleanText = (value: string) => (value === "true" ? "Evet" : value === "false" ? "Hayır" : value);
const previousText = (value: string | undefined) => (value ? value : "—");

/** Locations in tree order: each parent followed by its children (the API sorts by code). */
function locationTree(rows: WarehouseLocationOption[]) {
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<string, WarehouseLocationOption[]>();
  for (const row of rows) {
    const parent = row.parentLocationId && ids.has(row.parentLocationId) ? row.parentLocationId : "";
    children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  const out: Array<{ row: WarehouseLocationOption; depth: number }> = [];
  const visit = (parent: string, depth: number) => {
    for (const row of children.get(parent) ?? []) {
      if (out.some((item) => item.row.id === row.id)) continue;
      out.push({ row, depth });
      visit(row.id, depth + 1);
    }
  };
  visit("", 0);
  // Rows left in a parent cycle are still listed.
  for (const row of rows) if (!out.some((item) => item.row.id === row.id)) out.push({ row, depth: 0 });
  return out;
}

/** Right-hand form of the Depolar definition screen: identity, custom fields and (edit) the warehouse's locations. */
export function WarehouseDefinitionForm(p: Props) {
  const edit = p.mode === "edit";
  const readOnlyCustom = edit && p.current?.isActive === false;
  const set = (patch: Partial<WarehouseDraft>) => p.onChange({ ...p.draft, ...patch });
  // Create sends the custom values with the new warehouse (the browser checks required ones). In edit, a required
  // custom field must not block a rename: the page checks it only when custom values are saved.
  const required = (field: WarehouseFormField) => !edit && field.isRequired;
  const setCustom = (code: string, value: string) => set({ custom: { ...p.draft.custom, [code]: value } });
  const changed = (key: "code" | "name") =>
    !!p.baseline && (key === "code" ? p.draft.code.trim().toUpperCase() !== p.baseline.code : p.draft.name.trim() !== p.baseline.name);
  const customChanged = (code: string) => !!p.baseline && (p.draft.custom[code] ?? "") !== (p.baseline.custom[code] ?? "");
  const wrap = (isChanged: boolean, previous: ReactNode, control: ReactNode) =>
    edit ? (
      <RecordFieldChange changed={isChanged} previous={previous}>
        {control}
      </RecordFieldChange>
    ) : (
      control
    );
  return (
    <section className="inv-rf-embedded">
      <RecordFormPage
        variant="dialog"
        title={edit && p.current ? p.current.name : "Yeni depo"}
        subtitle={
          edit && p.current ? (
            <>
              <span className="rf-code">{p.current.code}</span>
              <StatusTag tone={p.current.isActive ? "ok" : "off"}>{p.current.isActive ? "Aktif" : "Pasif"}</StatusTag>
            </>
          ) : undefined
        }
        mode={p.mode}
        busy={p.busy}
        saveLabel={edit ? "Değişiklikleri kaydet" : "Depo oluştur"}
        formId={p.formId}
        saveDisabledReason={p.saveDisabledReason}
        dirty={edit ? p.changedCount : undefined}
        onSubmit={p.onSubmit}
        onCancel={p.onCancel}
        onSaveIntent={p.onSaveIntent}
        onReset={p.onReset}
        error={p.error}
        onDismissError={p.onDismissError}
        status={
          <>
            <span>{edit ? "Geçmiş API üzerinden korunur." : "Firmaya özel depo"}</span>
            {readOnlyCustom && <span className="rf-status-warning">Devre dışı depoda değerler kaydedilemez.</span>}
            {p.notice && <span className="rf-status-notice">{p.notice}</span>}
          </>
        }
      >
        <RecordFormGroup title="Depo Kimliği" bodyClassName="rf-pair">
          {wrap(
            changed("code"),
            p.baseline?.code,
            <label>
              <span>
                Depo kodu <RequiredMark />
              </span>
              <input className="rf-must rf-mono" value={p.draft.code} onChange={(e) => set({ code: e.target.value })} required maxLength={40} />
            </label>,
          )}
          {wrap(
            changed("name"),
            p.baseline?.name,
            <label>
              <span>
                Depo adı <RequiredMark />
              </span>
              <input className="rf-must" value={p.draft.name} onChange={(e) => set({ name: e.target.value })} required maxLength={120} />
            </label>,
          )}
        </RecordFormGroup>
        {(p.fields.length > 0 || (edit && !p.fieldsLoading)) && (
          <RecordFormGroup title="Depo Özel Alanları">
            <small>
              {edit
                ? "Depo özel alanı değerleri tenant kapsamında doğrulanır ve her değişiklik için geçmiş kaydı tutulur."
                : "Zorunlu alanlar yeni depo ile birlikte kaydedilir."}
            </small>
            <div className="rf-custom-grid">
              {p.fields.map((field) => {
                const value = p.draft.custom[field.code] ?? "";
                const control =
                  field.dataType === "Boolean" ? (
                    <select required={required(field)} disabled={readOnlyCustom} value={value} onChange={(e) => setCustom(field.code, e.target.value)}>
                      <option value="">Seçin</option>
                      <option value="true">Evet</option>
                      <option value="false">Hayır</option>
                    </select>
                  ) : (
                    <input
                      type={field.dataType === "Decimal" ? "number" : field.dataType === "Date" ? "date" : "text"}
                      step={field.dataType === "Decimal" ? "any" : undefined}
                      maxLength={field.dataType === "Text" ? field.maxLength : undefined}
                      required={required(field)}
                      disabled={readOnlyCustom}
                      value={value}
                      onChange={(e) => setCustom(field.code, e.target.value)}
                    />
                  );
                return (
                  <Fragment key={field.code}>
                    {wrap(
                      customChanged(field.code),
                      previousText(booleanText(p.baseline?.custom[field.code] ?? "")),
                      <label>
                        <span>
                          {field.label}
                          {field.isRequired && <RequiredMark />}
                        </span>
                        {control}
                        <small>
                          {edit ? (
                            <>
                              ({field.code} · {field.dataType} · v{field.version}
                              {field.isRequired ? " · zorunlu" : ""})
                            </>
                          ) : (
                            <>
                              {field.code} · {field.dataType}
                            </>
                          )}
                        </small>
                      </label>,
                    )}
                  </Fragment>
                );
              })}
            </div>
            {p.fields.length === 0 && <div className="empty-small">Henüz depo özel alanı tanımlanmadı.</div>}
          </RecordFormGroup>
        )}
        {edit && p.fieldsLoading && <small className="inv-def-loading">Özel alanlar yükleniyor…</small>}
        {edit && (
          <RecordFormGroup
            title="Lokasyonlar"
            hint={
              p.onManageLocations ? (
                <button type="button" className="nx-def-link" onClick={p.onManageLocations}>
                  <span>{p.locations.length}</span> · <span>Tümünü yönet ›</span>
                </button>
              ) : (
                <span>{p.locations.length}</span>
              )
            }
          >
            {p.locationsError ? (
              <div className="empty-small" role="alert">
                {p.locationsError}
              </div>
            ) : p.locationsLoading ? (
              <div className="empty-small" role="status">
                Konumlar yükleniyor…
              </div>
            ) : p.locations.length === 0 ? (
              <div className="empty-small">Bu depoda henüz konum yok.</div>
            ) : (
              <table className="nx-def-subtable">
                <thead>
                  <tr>
                    <th>Kod</th>
                    <th>Ad</th>
                    <th>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {locationTree(p.locations).map(({ row, depth }) => (
                    <tr key={row.id}>
                      <td className="nx-code">
                        {depth ? <span style={{ paddingLeft: (depth - 1) * 12 }}>{`└ ${row.code}`}</span> : row.code}
                      </td>
                      <td>{row.name}</td>
                      <td>
                        <StatusTag tone={row.isActive ? "ok" : "off"}>{row.isActive ? "Aktif" : "Pasif"}</StatusTag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {p.onAddLocation && (
              <div className="nx-def-subtable-foot">
                <button type="button" className="nx-def-link" onClick={p.onAddLocation}>
                  <Plus size={14} aria-hidden="true" /> Lokasyon ekle
                </button>
              </div>
            )}
          </RecordFormGroup>
        )}
      </RecordFormPage>
    </section>
  );
}
