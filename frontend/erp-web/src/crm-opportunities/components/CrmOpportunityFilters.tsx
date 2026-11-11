import { Filter, Search } from "lucide-react";
import { stages, stageLabels } from "../types";

type Props = {
  query: string;
  filter: string;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: string) => void;
};

export function CrmOpportunityFilters({
  query,
  filter,
  onQueryChange,
  onFilterChange,
}: Props) {
  return (
    <section className="crm-filter-panel" aria-label="Fırsat filtreleri">
      <div className="crm-filter-panel-heading">
        <Filter size={15} aria-hidden="true" />
        <h2>Filtreler</h2>
      </div>
      <div className="crm-toolbar">
        <label className="crm-search">
          <span>Ara</span>
          <span className="crm-search-control">
            <Search size={16} aria-hidden="true" />
            <input
              aria-label="Fırsatlarda ara"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Kod, fırsat veya müşteri ara"
            />
          </span>
        </label>
        <label className="crm-filter-label">
          <span>Aşama</span>
          <select
            aria-label="Aşamaya göre filtrele"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
          >
            <option value="">Tüm aşamalar</option>
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {stageLabels[stage]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
