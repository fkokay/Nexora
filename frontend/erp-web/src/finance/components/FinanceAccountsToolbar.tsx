import { Filter, Search } from "lucide-react";

type Props = {
  query: string;
  status: "all" | "active" | "inactive";
  onQueryChange: (value: string) => void;
  onStatusChange: (value: Props["status"]) => void;
  onApply: () => void;
};

export function FinanceAccountsToolbar({
  query,
  status,
  onQueryChange,
  onStatusChange,
  onApply,
}: Props) {
  return (
    <section className="finance-filterbar finance-filters" aria-label="Hesap filtreleri">
      <div className="finance-accounts-filter-heading">
        <h2>Filtreler</h2>
        <p>{status === "all" ? "Hesapları kod, ad, döviz veya etkinlik durumuna göre daraltın." : "Hesapları arama ve seçili etkinlik durumuna göre daraltın."}</p>
      </div>
      <div className="finance-filter-controls">
        <label className="finance-search">
          <Search size={16} />
          <input
            aria-label="Kod, hesap veya dövize göre ara"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Kod, hesap veya döviz ara"
          />
        </label>
        <select
          aria-label="Hesap durumu"
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as Props["status"])
          }
        >
          <option value="all">Tüm durumlar</option>
          <option value="active">Aktif</option>
          <option value="inactive">Pasif</option>
        </select>
        <button type="button" className="secondary small-button" onClick={onApply}>
          <Filter size={15} />
          Filtrele
        </button>
      </div>
    </section>
  );
}
