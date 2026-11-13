import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";

type Props = {
  search: string;
  status: string;
  onSearchChange: (value: string) => void;
  /** Applies the typed search text (called after typing stops and on Enter). */
  onSearchApply: () => void;
  onStatusChange: (value: string) => void;
  /** Receives the toolbar slot the list grid renders its own tools into. */
  toolsSlotRef?: (element: HTMLDivElement | null) => void;
};

export default function SupplierQuotesFilters({
  search,
  status,
  onSearchChange,
  onSearchApply,
  onStatusChange,
  toolsSlotRef,
}: Props) {
  return (
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      onSearchApply={onSearchApply}
      searchLabel="Tedarikçi tekliflerinde ara"
      searchPlaceholder="Teklif no, talep no veya tedarikçi"
      toolsSlotRef={toolsSlotRef}
    >
      <ListChipGroup
        label="Durum"
        value={status}
        onChange={onStatusChange}
        options={[
          { value: "", label: "Tümü" },
          { value: "Submitted", label: "Değerlendirmede" },
          { value: "Selected", label: "Seçildi" },
          { value: "NotSelected", label: "Seçilmedi" },
        ]}
      />
    </ListToolbar>
  );
}
