import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";

export type SalesListTab = "quotes" | "orders" | "invoices";

type SalesListToolbarProps = {
  activeTab: SalesListTab;
  search: string;
  /** The page reloads the list shortly after the text changes. */
  onSearchChange: (value: string) => void;
  quoteStatus: string;
  onQuoteStatusChange: (value: string) => void;
  quoteDateFrom: string;
  onQuoteDateFromChange: (value: string) => void;
  quoteDateTo: string;
  onQuoteDateToChange: (value: string) => void;
  /** Receives the element where the list's own tools (columns, pivot…) are rendered. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
  onRefresh: () => void;
};

const placeholders: Record<SalesListTab, string> = {
  quotes: "Teklif no veya müşteriyle ara",
  orders: "Sipariş no veya müşteriyle ara",
  invoices: "Fatura no veya müşteriyle ara",
};

/** Toolbar row of the sales quote / order / invoice lists (list-v2). */
export default function SalesListToolbar({
  activeTab,
  search,
  onSearchChange,
  quoteStatus,
  onQuoteStatusChange,
  quoteDateFrom,
  onQuoteDateFromChange,
  quoteDateTo,
  onQuoteDateToChange,
  toolsSlotRef,
  onRefresh,
}: SalesListToolbarProps) {
  return (
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      searchLabel={placeholders[activeTab]}
      searchPlaceholder={placeholders[activeTab]}
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
    >
      {activeTab === "quotes" && (
        <>
          <ListChipGroup
            label="Durum"
            value={quoteStatus}
            onChange={onQuoteStatusChange}
            options={[
              { value: "", label: "Tümü" },
              { value: "Draft", label: "Taslak" },
              { value: "Sent", label: "İletildi" },
              { value: "Accepted", label: "Kabul edildi" },
              { value: "Rejected", label: "Reddedildi" },
              { value: "Expired", label: "Süresi doldu" },
            ]}
          />
          <label className="list-v2-filter">
            <span>Başlangıç</span>
            <input
              type="date"
              value={quoteDateFrom}
              onChange={(event) => onQuoteDateFromChange(event.target.value)}
            />
          </label>
          <label className="list-v2-filter">
            <span>Bitiş</span>
            <input
              type="date"
              value={quoteDateTo}
              onChange={(event) => onQuoteDateToChange(event.target.value)}
            />
          </label>
        </>
      )}
    </ListToolbar>
  );
}
