import type { FormEvent } from "react";
import { ListToolbar } from "../../list-page/ListToolbar";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type {
  BuiltInScreenLayoutField,
  CustomerLocationProvinceView,
  TurkeyDistrictOption,
} from "../../erp-types";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import { useRecordFormShortcutScope } from "../../customers/components/useRecordFormShortcutScope";
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
  onProvinceIdChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

function DistrictForm({
  provinces,
  editingId,
  provinceId,
  name,
  active,
  busy,
  onProvinceIdChange,
  onNameChange,
  onActiveChange,
  onSubmit,
  onCancel,
}: DistrictFormProps) {
  return (
    <RecordFormPage
      variant="dialog"
      className={`prf-embedded${editingId ? "" : " prf-no-cancel"}${provinces.length === 0 ? " prf-save-blocked" : ""}`}
      title={editingId ? "İlçe Tanımını Düzenle" : "Yeni İlçe Tanımı"}
      mode={editingId ? "edit" : "create"}
      busy={busy}
      saveLabel={editingId ? "İlçe tanımını kaydet" : "İlçe ekle"}
      onSubmit={onSubmit}
      onCancel={() => {
        if (editingId) onCancel();
      }}
      status={
        <span>
          {editingId
            ? "Seçili ilçe tanımını düzenleyin."
            : "Yeni ilçe tanımı ekleyin."}
        </span>
      }
    >
      <RecordFormGroup title="İlçe Kimliği" bodyClassName="rf-identity prf-identity-3">
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

function DistrictGrid({
  districts,
  provinces,
  loading,
  busy,
  onEdit,
  onToggle,
  fields,
}: DistrictGridProps) {
  const visibleFields = (fields?.length ? fields : defaultDistrictFields)
    .filter((field) => field.key === "actions" || field.visible)
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
        return item.isActive ? "Aktif" : "Pasif";
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
        {...screenViewGridDefaults(visibleFields)}
        externalPagination
        hideSearch
        enableRowSelection={false}
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
            <tr key={item.id}>
              {visibleFields.map((field) => (
                <td key={field.key}>{renderCell(item, field.key)}</td>
              ))}
            </tr>
          ))}
          {!loading && districts.length === 0 && (
            <tr>
              <td colSpan={Math.max(visibleFields.length, 1)} className="table-empty">
                Seçili il için ilçe bulunamadı.
              </td>
            </tr>
          )}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}

type Props = DistrictFormProps &
  DistrictGridProps & {
    title: string;
    resultCount: number;
  totalCount: number;
    query: string;
    onQueryChange: (value: string) => void;
  };

export function DistrictSection(props: Props) {
  const {
    provinces,
    editingId,
    provinceId,
    name,
    active,
    busy,
    onProvinceIdChange,
    onNameChange,
    onActiveChange,
    onSubmit,
    onCancel,
    districts,
    loading,
    onEdit,
    onToggle,
    title,
    resultCount,
    totalCount,
    query,
    onQueryChange,
    fields,
  } = props;
  useRecordFormShortcutScope();
  return (
    <section className="panel list-v2-list">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{totalCount} kayıt · {resultCount} listelenen</p>
        </div>
      </div>
      <ListToolbar
        search={query}
        onSearchChange={onQueryChange}
        searchPlaceholder="İlçe adı ara"
      />
      <DistrictGrid
        districts={districts}
        provinces={provinces}
        loading={loading}
        busy={busy}
        onEdit={onEdit}
        onToggle={onToggle}
        fields={fields}
      />
      <DistrictForm
        provinces={provinces}
        editingId={editingId}
        provinceId={provinceId}
        name={name}
        active={active}
        busy={busy}
        onProvinceIdChange={onProvinceIdChange}
        onNameChange={onNameChange}
        onActiveChange={onActiveChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </section>
  );
}
