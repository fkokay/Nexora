import { Plus, Search } from "lucide-react";
import type { CustomerLocationProvinceView } from "../../erp-types";

export type ProvinceStatusFilter = "all" | "active" | "inactive";

type Props = {
  provinces: CustomerLocationProvinceView[];
  totalCount: number;
  districtCounts: Map<number, number>;
  selectedProvinceId: number;
  loading: boolean;
  query: string;
  status: ProvinceStatusFilter;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: ProvinceStatusFilter) => void;
  onSelect: (id: number) => void;
  onNew: () => void;
};

/** Left column: the provinces, searchable and filterable by status; a click shows the province's districts. */
export function ProvinceList({
  provinces,
  totalCount,
  districtCounts,
  selectedProvinceId,
  loading,
  query,
  status,
  onQueryChange,
  onStatusChange,
  onSelect,
  onNew,
}: Props) {
  return (
    <section className="cld-panel cld-provinces" aria-labelledby="cld-provinces-title">
      <header className="cld-panel-head">
        <div className="cld-panel-title">
          <h2 id="cld-provinces-title">İller</h2>
          <span className="cld-count">{totalCount}</span>
        </div>
        <button type="button" className="secondary small-button cld-head-action" onClick={onNew}>
          <Plus size={14} aria-hidden="true" /> Yeni il
        </button>
      </header>
      <div className="cld-filters">
        <label className="cld-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="İl ara"
            aria-label="İl ara"
          />
        </label>
        <select
          aria-label="Durum"
          value={status}
          onChange={(event) => onStatusChange(event.target.value as ProvinceStatusFilter)}
        >
          <option value="all">Tümü</option>
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
        </select>
      </div>
      <ul className="cld-province-list" aria-label="İl listesi">
        {provinces.map((item) => {
          const selected = item.id === selectedProvinceId;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`cld-province${selected ? " is-selected" : ""}${item.isActive ? "" : " is-inactive"}`}
                aria-pressed={selected}
                onClick={() => onSelect(item.id)}
              >
                <span className="cld-province-name">{item.name}</span>
                {!item.isActive && <span className="cld-tag is-off">Pasif</span>}
                <span className="cld-province-count" aria-label={`${districtCounts.get(item.id) ?? 0} ilçe`}>
                  {districtCounts.get(item.id) ?? 0}
                </span>
              </button>
            </li>
          );
        })}
        {!loading && provinces.length === 0 && (
          <li className="cld-empty">{totalCount ? "Aramanızla eşleşen il yok." : "Henüz il tanımı yok."}</li>
        )}
        {loading && provinces.length === 0 && <li className="cld-empty">İller yükleniyor…</li>}
      </ul>
    </section>
  );
}
