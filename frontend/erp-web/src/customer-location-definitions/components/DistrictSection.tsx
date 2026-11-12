import type { FormEvent } from "react";
import type {
  BuiltInScreenLayoutField,
  CustomerLocationProvinceView,
  TurkeyDistrictOption,
} from "../../erp-types";

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
    <form className="collection-form" onSubmit={onSubmit}>
      <div className="form-two">
        <label>
          İl
          <select
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
          İlçe adı
          <input
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
      </div>
      <div className="modal-foot">
        <span>
          {editingId
            ? "Seçili ilçe tanımını düzenleyin."
            : "Yeni ilçe tanımı ekleyin."}
        </span>
        <div>
          {editingId && (
            <button type="button" className="secondary" onClick={onCancel}>
              Vazgeç
            </button>
          )}
          <button className="primary" disabled={busy || provinces.length === 0}>
            {busy
              ? "Kaydediliyor…"
              : editingId
                ? "İlçe tanımını kaydet"
                : "İlçe ekle"}
          </button>
        </div>
      </div>
    </form>
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
      <table className="customer-table">
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
      </table>
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
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>{totalCount} kayıt · {resultCount} listelenen</p>
        </div>
      </div>
      <section className="location-definition-summary" aria-label="İlçe tanımları özeti">
        <article><span>Toplam ilçe</span><b>{totalCount}</b></article>
        <article><span>Listelenen</span><b>{resultCount}</b></article>
        <article><span>Seçili il</span><b className="location-summary-name">{title.replace(/ ilçeleri$/i, "") || "—"}</b></article>
      </section>
      <section className="location-definition-filter-card" aria-label="İlçe filtreleri">
        <div>
          <h3>Filtreler</h3>
          <p>Seçili il içindeki ilçeleri ada göre daraltın.</p>
        </div>
        <label>
          Ara
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="İlçe adı ara"
          />
        </label>
      </section>
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
