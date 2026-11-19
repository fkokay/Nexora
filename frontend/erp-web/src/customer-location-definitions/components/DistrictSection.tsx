import { type FormEvent } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type {
  BuiltInScreenLayoutField,
  CustomerLocationProvinceView,
  TurkeyDistrictOption,
} from "../../erp-types";
import { LocationStatusTag } from "./LocationStatusTag";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import "../../purchasing-record-forms.css";

export const defaultDistrictFields: BuiltInScreenLayoutField[] = [
  { key: "name", label: "İlçe", visible: true, position: 0 },
  { key: "province", label: "İl", visible: true, position: 1 },
  { key: "status", label: "Durum", visible: true, position: 2 },
  { key: "actions", label: "İşlemler", visible: true, position: 3, fixed: true },
];

type DistrictFormProps = {
  provinces: CustomerLocationProvinceView[];
  editingId: number | null;
  provinceId: string;
  name: string;
  active: boolean;
  busy: boolean;
  error?: string;
  onDismissError?: () => void;
  onProvinceIdChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

export function DistrictForm({
  provinces,
  editingId,
  provinceId,
  name,
  active,
  busy,
  error,
  onDismissError,
  onProvinceIdChange,
  onNameChange,
  onActiveChange,
  onSubmit,
  onCancel,
}: DistrictFormProps) {
  return (
    <RecordFormPage
      variant="dialog"
      className={provinces.length === 0 ? "prf-save-blocked" : undefined}
      title={editingId ? "İlçeyi düzenle" : "Yeni ilçe"}
      mode={editingId ? "edit" : "create"}
      busy={busy}
      saveLabel={editingId ? "Kaydet" : "İlçe ekle"}
      onSubmit={onSubmit}
      onCancel={onCancel}
      error={error}
      onDismissError={onDismissError}
      status={
        <span>
          Pasif ilçeler yeni adres seçimlerinde gösterilmez.
        </span>
      }
    >
      <RecordFormGroup title="İlçe Kimliği" bodyClassName="rf-identity">
        <label>
          <span>İl <RequiredMark /></span>
          <select
            className="rf-must"
            value={provinceId}
            onChange={(event) => onProvinceIdChange(event.target.value)}
            required
          >
            <option value="">İl seçin</option>
            {provinces.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.isActive ? "" : " · Pasif"}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>İlçe adı <RequiredMark /></span>
          <input
            className="rf-must"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            required
            maxLength={100}
            placeholder="İlçe adı"
          />
        </label>
        <label>
          Durum
          <select
            value={active ? "active" : "inactive"}
            onChange={(event) =>
              onActiveChange(event.target.value === "active")
            }
          >
            <option value="active">Aktif</option>
            <option value="inactive">Pasif</option>
          </select>
        </label>
      </RecordFormGroup>
    </RecordFormPage>
  );
}

type DistrictGridProps = {
  districts: TurkeyDistrictOption[];
  provinces: CustomerLocationProvinceView[];
  loading: boolean;
  busy: boolean;
  onEdit: (item: TurkeyDistrictOption) => void;
  onToggle: (item: TurkeyDistrictOption) => void;
  fields?: BuiltInScreenLayoutField[];
};

export function DistrictGrid({
  districts,
  provinces,
  loading,
  busy,
  onEdit,
  onToggle,
  fields,
  toolbarContainer,
  emptyMessage = "Seçili il için ilçe bulunamadı.",
}: DistrictGridProps & { toolbarContainer?: HTMLElement | null; emptyMessage?: string }) {
  const visibleFields = (fields?.length ? fields : defaultDistrictFields)
    // The panel is the selected province's: its İl column would repeat the heading.
    .filter((field) => field.key !== "province" && (field.key === "actions" || field.visible))
    .sort((a, b) =>
      a.key === "actions" ? 1 : b.key === "actions" ? -1 : a.position - b.position,
    );
  function renderCell(item: TurkeyDistrictOption, key: string) {
    switch (key) {
      case "name":
        return <b>{item.name}</b>;
      case "province":
        return (
          provinces.find((province) => province.id === item.provinceId)
            ?.name || "—"
        );
      case "status":
        return <LocationStatusTag active={item.isActive} />;
      case "actions":
        return (
          <>
            <button
              type="button"
              className="row-action"
              onClick={() => onEdit(item)}
            >
              Düzenle
            </button>
            <button
              type="button"
              className="row-action"
              disabled={busy}
              onClick={() => onToggle(item)}
            >
              {item.isActive ? "Pasife al" : "Etkinleştir"}
            </button>
          </>
        );
      default:
        return null;
    }
  }
  return (
    <div className="ledger-list">
      <AdvancedDataGrid
        className="customer-table"
        gridId="customer-districts"
        // Without a saved width the İşlemler column fits both buttons (Düzenle + Pasife al / Etkinleştir).
        {...screenViewGridDefaults(visibleFields, (field) => (field.key === "actions" ? 200 : undefined))}
        externalPagination
        hideSearch
        enableRowSelection={false}
        toolbarContainer={toolbarContainer}
      >
        <thead>
          <tr>
            {visibleFields.map((field) => (
              <th key={field.key}>{field.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {districts.map((item) => (
            <tr key={item.id} className={item.isActive ? undefined : "cld-inactive-row"}>
              {visibleFields.map((field) => (
                <td key={field.key}>{renderCell(item, field.key)}</td>
              ))}
            </tr>
          ))}
          {!loading && districts.length === 0 && (
            <tr>
              <td colSpan={Math.max(visibleFields.length, 1)} className="table-empty">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}
