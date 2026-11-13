import type { FormEvent } from "react";
import { ListToolbar } from "../../list-page/ListToolbar";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type {
  BuiltInScreenLayoutField,
  CustomerLocationProvinceView,
  TurkeyLocationOption,
} from "../../erp-types";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import { useRecordFormShortcutScope } from "../../customers/components/useRecordFormShortcutScope";
import "../../purchasing-record-forms.css";

export const defaultProvinceFields: BuiltInScreenLayoutField[] = [
  { key: "name", label: "İl", visible: true, position: 0 },
  { key: "status", label: "Durum", visible: true, position: 1 },
  { key: "districtCount", label: "İlçeler", visible: true, position: 2 },
  { key: "actions", label: "İşlemler", visible: true, position: 3, fixed: true },
];

type ProvinceFormProps = {
  editingId: number | null;
  name: string;
  active: boolean;
  busy: boolean;
  onNameChange: (value: string) => void;
  onActiveChange: (value: boolean) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

function ProvinceForm({
  editingId,
  name,
  active,
  busy,
  onNameChange,
  onActiveChange,
  onSubmit,
  onCancel,
}: ProvinceFormProps) {
  return (
    <RecordFormPage
      variant="dialog"
      className={`prf-embedded${editingId ? "" : " prf-no-cancel"}`}
      title={editingId ? "İl Tanımını Düzenle" : "Yeni İl Tanımı"}
      mode={editingId ? "edit" : "create"}
      busy={busy}
      saveLabel={editingId ? "İl tanımını kaydet" : "İl ekle"}
      onSubmit={onSubmit}
      onCancel={() => {
        if (editingId) onCancel();
      }}
      status={
        <span>
          {editingId
            ? "Seçili il tanımını düzenleyin."
            : "Yeni il tanımı ekleyin."}
        </span>
      }
    >
      <RecordFormGroup title="İl Kimliği" bodyClassName="rf-identity prf-identity-2">
        <label>
          <span>İl adı <RequiredMark /></span>
          <input
            className="rf-must"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            required
            maxLength={100}
            placeholder="İl adı"
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

type ProvinceGridProps = {
  provinces: CustomerLocationProvinceView[];
  districts: { provinceId: number }[];
  selectedProvinceId: number;
  loading: boolean;
  busy: boolean;
  onSelect: (id: number) => void;
  onEdit: (item: CustomerLocationProvinceView) => void;
  onToggle: (item: TurkeyLocationOption) => void;
  fields?: BuiltInScreenLayoutField[];
};

function ProvinceGrid({
  provinces,
  districts,
  selectedProvinceId,
  loading,
  busy,
  onSelect,
  onEdit,
  onToggle,
  fields,
}: ProvinceGridProps) {
  const visibleFields = (fields?.length ? fields : defaultProvinceFields)
    .filter((field) => field.key === "actions" || field.visible)
    .sort((a, b) =>
      a.key === "actions" ? 1 : b.key === "actions" ? -1 : a.position - b.position,
    );
  function renderCell(item: CustomerLocationProvinceView, key: string) {
    switch (key) {
      case "name":
        return <b>{item.name}</b>;
      case "status":
        return item.isActive ? "Aktif" : "Pasif";
      case "districtCount":
        return districts.filter((district) => district.provinceId === item.id)
          .length;
      case "actions":
        return (
          <>
            <button
              type="button"
              className="row-action"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(item);
              }}
            >
              Düzenle
            </button>
            <button
              type="button"
              className="row-action"
              disabled={busy}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(item);
              }}
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
        gridId="customer-provinces"
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
          {provinces.map((item) => (
            <tr
              key={item.id}
              className={
                selectedProvinceId === item.id ? "erp-selected-row" : ""
              }
              onClick={() => onSelect(item.id)}
            >
              {visibleFields.map((field) => (
                <td key={field.key}>{renderCell(item, field.key)}</td>
              ))}
            </tr>
          ))}
          {!loading && provinces.length === 0 && (
            <tr>
              <td colSpan={Math.max(visibleFields.length, 1)} className="table-empty">
                İl tanımı bulunamadı.
              </td>
            </tr>
          )}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}

type Props = ProvinceFormProps & ProvinceGridProps & {
  totalCount: number;
  query: string;
  onQueryChange: (value: string) => void;
};

export function ProvinceSection(props: Props) {
  const {
    provinces,
    totalCount,
    districts,
    selectedProvinceId,
    loading,
    busy,
    onSelect,
    onEdit,
    onToggle,
    editingId,
    name,
    active,
    onNameChange,
    onActiveChange,
    onSubmit,
    onCancel,
    query,
    onQueryChange,
    fields,
  } = props;
  useRecordFormShortcutScope();
  return (
    <section className="panel list-v2-list">
      <div className="panel-heading">
        <div>
          <h2>İl tanımları</h2>
          <p>{totalCount} il · varsayılan Türkiye listesi</p>
        </div>
      </div>
      <ListToolbar
        search={query}
        onSearchChange={onQueryChange}
        searchPlaceholder="İl adı ara"
      />
      <ProvinceGrid
        provinces={provinces}
        districts={districts}
        selectedProvinceId={selectedProvinceId}
        loading={loading}
        busy={busy}
        onSelect={onSelect}
        onEdit={onEdit}
        onToggle={onToggle}
        fields={fields}
      />
      <ProvinceForm
        editingId={editingId}
        name={name}
        active={active}
        busy={busy}
        onNameChange={onNameChange}
        onActiveChange={onActiveChange}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    </section>
  );
}
