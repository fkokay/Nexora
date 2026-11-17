import type { ReactNode } from "react";
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
  onRefresh?: () => void;
  /** Extra toolbar items after the chips (Detay paneli). */
  children?: ReactNode;
};

export default function SupplierQuotesFilters({
  search,
  status,
  onSearchChange,
  onSearchApply,
  onStatusChange,
  toolsSlotRef,
  onRefresh,
  children,
}: Props) {
  return (
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      onSearchApply={onSearchApply}
      searchLabel="Tedarikçi tekliflerinde ara"
      searchPlaceholder="Teklif no, talep no veya tedarikçi"
      toolsSlotRef={toolsSlotRef}
      onRefresh={onRefresh}
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
      {children}
    </ListToolbar>
  );
}
