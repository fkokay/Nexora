import { Filter, RefreshCw, Search } from "lucide-react";

type Props = {
  search: string;
  typeFilter: string;
  statusFilter: string;
  onSearchChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onApply: () => void;
  onRefresh: () => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  typeFilterLabel?: string;
  statusFilterLabel?: string;
  applyLabel?: string;
  showTypeFilter?: boolean;
  showStatusFilter?: boolean;
};

export function CustomerFilters({
  search,
  typeFilter,
  statusFilter,
  onSearchChange,
  onTypeChange,
  onStatusChange,
  onApply,
  onRefresh,
  searchLabel = "Cari ara",
  searchPlaceholder = "Cari kodu, unvanı veya vergi no ile ara",
  typeFilterLabel = "Cari türü",
  statusFilterLabel = "Durum",
  applyLabel = "Filtrele",
  showTypeFilter = true,
  showStatusFilter = true,
}: Props) {
  return (
    <div className="customer-toolbar customer-directory-toolbar">
      <div className="customer-directory-search-field">
        <label htmlFor="customer-directory-search">{searchLabel}</label>
        <form
          className="customer-search"
          onSubmit={(event) => {
            event.preventDefault();
            onApply();
          }}
        >
          <Search size={16} aria-hidden="true" />
          <input
            id="customer-directory-search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
          />
        </form>
      </div>
      {showTypeFilter && <label className="customer-filter-field">
        <span>{typeFilterLabel}</span>
        <select
          value={typeFilter}
          onChange={(event) => onTypeChange(event.target.value)}
        >
          <option value="">Tümü</option>
          <option value="Customer">Müşteri</option>
          <option value="Supplier">Tedarikçi</option>
          <option value="Both">Diğer</option>
          <option value="Dealer">Bayi</option>
          <option value="Employee">Personel</option>
        </select>
      </label>}
      {showStatusFilter && <label className="customer-filter-field">
        <span>{statusFilterLabel}</span>
        <select
          value={statusFilter}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <option value="">Tümü</option>
          <option value="Active">Aktif</option>
          <option value="Inactive">Pasif</option>
        </select>
      </label>}
      <button
        type="button"
        className="secondary customer-filter-button"
        onClick={onApply}
      >
        <Filter size={15} /> {applyLabel}
      </button>
      <button
        type="button"
        className="secondary customer-filter-refresh"
        onClick={onRefresh}
        aria-label="Cari listesini yenile"
      >
        <RefreshCw size={15} /> Yenile
      </button>
    </div>
  );
}
