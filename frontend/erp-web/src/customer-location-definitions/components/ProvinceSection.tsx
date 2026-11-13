import type { FormEvent } from "react";
import type {
  CustomerLocationProvinceView,
  TurkeyLocationOption,
} from "../../erp-types";
import { RecordFormGroup, RecordFormPage, RequiredMark } from "../../record-form/RecordForm";
import { useRecordFormShortcutScope } from "../../customers/components/useRecordFormShortcutScope";
import "../../purchasing-record-forms.css";

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
}: ProvinceGridProps) {
  return (
    <div className="ledger-list">
      <table className="customer-table">
        <thead>
          <tr>
            <th>İl</th>
            <th>Durum</th>
            <th>İlçeler</th>
            <th>İşlemler</th>
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
              <td>
                <b>{item.name}</b>
              </td>
              <td>{item.isActive ? "Aktif" : "Pasif"}</td>
              <td>
                {
                  districts.filter(
                    (district) => district.provinceId === item.id,
                  ).length
                }
              </td>
              <td>
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
              </td>
            </tr>
          ))}
          {!loading && provinces.length === 0 && (
            <tr>
              <td colSpan={4} className="table-empty">
                İl tanımı bulunamadı.
              </td>
            </tr>
          )}
        </tbody>
      </table>
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
  } = props;
  useRecordFormShortcutScope();
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>İl tanımları</h2>
          <p>{totalCount} il · varsayılan Türkiye listesi</p>
        </div>
      </div>
      <section className="location-definition-summary" aria-label="İl tanımları özeti">
        <article><span>Toplam il</span><b>{totalCount}</b></article>
        <article><span>Listelenen</span><b>{provinces.length}</b></article>
        <article><span>İlçe tanımları</span><b>{districts.length}</b></article>
      </section>
      <section className="location-definition-filter-card" aria-label="İl filtreleri">
        <div>
          <h3>Filtreler</h3>
          <p>İl adını yazarak tanımları daraltın.</p>
        </div>
        <label>
          Ara
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="İl adı ara"
          />
        </label>
      </section>
      <ProvinceGrid
        provinces={provinces}
        districts={districts}
        selectedProvinceId={selectedProvinceId}
        loading={loading}
        busy={busy}
        onSelect={onSelect}
        onEdit={onEdit}
        onToggle={onToggle}
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
