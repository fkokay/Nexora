import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";

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
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      searchLabel="Kod, kurum, tür veya notta ara"
      searchPlaceholder="Kod, kurum veya tür"
      onRefresh={onRefresh}
      refreshLabel="Kredi kayıtlarını yenile"
    >
      <ListChipGroup
        label="Durum"
        value={statusFilter}
        onChange={onStatusChange}
        options={[
          { value: "All", label: "Tüm durumlar", count: counts?.all },
          { value: "Active", label: "Aktif", count: counts?.active },
          { value: "Closed", label: "Kapalı", count: counts?.closed },
        ]}
      />
      <label className="list-v2-filter">
        Para birimi
        <select
          value={currencyFilter}
          onChange={(event) => onCurrencyChange(event.target.value)}
        >
          <option value="All">Tüm para birimleri</option>
          {currencies.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>
    </ListToolbar>
  );
}
