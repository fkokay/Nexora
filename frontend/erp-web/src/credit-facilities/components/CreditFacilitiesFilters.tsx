import { RefreshCw, Search } from "lucide-react";
import { ListChipGroup } from "../../list-page/ListToolbar";

type Props = {
  search: string;
  statusFilter: string;
  currencyFilter: string;
  currencies: string[];
  /** Counts shown on the status chips; null while unknown. */
  counts?: { all: number; active: number; closed: number } | null;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  onRefresh?: () => void;
};

/** Filters above the credit list column: search, status chips and (with several currencies) currency chips. */
export function CreditFacilitiesFilters({
  search,
  statusFilter,
  currencyFilter,
  currencies,
  counts = null,
  onSearchChange,
  onStatusChange,
  onCurrencyChange,
  onRefresh,
}: Props) {
  return (
    <div className="cf-filters">
      <div className="cf-search-row">
        <label className="cf-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Kod, kurum veya tür"
            aria-label="Kod, kurum, tür veya notta ara"
          />
        </label>
        {onRefresh && (
          <button
            type="button"
            className="list-v2-icon-button"
            onClick={onRefresh}
            aria-label="Kredi kayıtlarını yenile"
            title="Yenile"
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>
      <ListChipGroup
        label="Durum"
        value={statusFilter === "All" ? "" : statusFilter}
        allowClear
        onChange={(value) => onStatusChange(value || "All")}
        options={[
          { value: "Active", label: "Aktif", count: counts?.active },
          { value: "Closed", label: "Kapalı", count: counts?.closed },
        ]}
      />
      {currencies.length > 1 && (
        <ListChipGroup
          label="Para birimi"
          value={currencyFilter === "All" ? "" : currencyFilter}
          allowClear
          onChange={(value) => onCurrencyChange(value || "All")}
          options={currencies.map((code) => ({ value: code, label: code }))}
        />
      )}
    </div>
  );
}
