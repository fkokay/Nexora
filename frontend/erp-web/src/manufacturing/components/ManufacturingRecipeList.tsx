import { useState, type MutableRefObject, type ReactNode } from "react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import type { ScreenColumnPin } from "../../erp-types";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { StatusTag } from "../../list-page/StatusTag";
import SalesDocumentGrid from "../../sales/components/SalesDocumentGrid";
import { SalesListFooter } from "../../sales/components/SalesListFooter";
import type { ManufacturingBom } from "../types";

export type RecipeScreenField = {
  key: string;
  label: string;
  visible: boolean;
  position: number;
  fixed?: boolean;
  section?: string | null;
  width?: number | null;
  pinned?: ScreenColumnPin | null;
};

export const defaultRecipeFields: RecipeScreenField[] = [
  { key: "recipe", label: "Reçete", visible: true, position: 0 },
  { key: "product", label: "Mamul", visible: true, position: 1 },
  { key: "outputQuantity", label: "Çıktı", visible: true, position: 2 },
  { key: "content", label: "İçerik", visible: true, position: 3 },
  { key: "status", label: "Durum / kullanım", visible: true, position: 4 },
  { key: "workCenters", label: "İş merkezleri", visible: false, position: 5 },
  { key: "actions", label: "İşlemler", visible: true, position: 6, fixed: true },
];

const RECIPE_LIST_WIDTHS: Record<string, number> = {
  recipe: 280,
  product: 240,
  outputQuantity: 90,
  content: 170,
  status: 170,
  workCenters: 220,
};
const RECIPE_NUMBER_FIELDS: ReadonlySet<string> = new Set(["outputQuantity"]);
export const RECIPE_PAGE_SIZE = 25;

type Props = {
  fields?: RecipeScreenField[];
  boms: ManufacturingBom[];
  filteredBoms: ManufacturingBom[];
  pagedBoms: ManufacturingBom[];
  loading: boolean;
  /** The list is the visible screen (the floating bulk bar shows only then). */
  active: boolean;
  search: string;
  setSearch: (value: string) => void;
  /** "" (all), "Active" or "Inactive"; applied by the page when it filters the recipes. */
  status: string;
  setStatus: (value: string) => void;
  onRefresh: () => void;
  page: number;
  setPage: (page: number) => void;
  /** Current row (click, ↑/↓); the bar's Aç / Sil and İşlemler follow it. */
  currentId: string | null;
  onCurrentChange: (id: string | null) => void;
  /** Double click / Enter: opens the recipe record (edit). */
  onOpen: (bom: ManufacturingBom) => void;
  exportActionsRef: MutableRefObject<GridExportActions | null>;
};

/**
 * Tanımlı reçeteler (list type, mockup 10 mapping): single click selects, double click / Enter opens the recipe
 * record; Düzenle, Pasife al / Etkinleştir and Sil are the action bar's Aç, İşlemler and Sil.
 */
export default function ManufacturingRecipeList({
  fields = defaultRecipeFields,
  boms,
  filteredBoms,
  pagedBoms,
  loading,
  active,
  search,
  setSearch,
  status,
  setStatus,
  onRefresh,
  page,
  setPage,
  currentId,
  onCurrentChange,
  onOpen,
  exportActionsRef,
}: Props) {
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [ticked, setTicked] = useState<string[]>([]);
  const activeCount = boms.filter((x) => x.isActive).length;
  // Row actions are on the action bar, so the list has no actions column.
  const visibleFields = fields
    .filter((field) => field.key !== "actions" && field.visible)
    .sort((a, b) => a.position - b.position);
  const renderCell = (bom: ManufacturingBom, key: string): ReactNode => {
    switch (key) {
      case "recipe":
        return (
          <>
            <span>{bom.name}</span>
            <small className="cell-subtitle list-v2-name-code">{bom.code}</small>
          </>
        );
      case "product":
        return bom.productName;
      case "outputQuantity":
        return bom.outputQuantity.toLocaleString("tr-TR", {
          maximumFractionDigits: 4,
        });
      case "content":
        return (
          <>
            <span>{bom.lines.length}</span> <span>bileşen</span> · <span>{bom.operations.length}</span>{" "}
            <span>operasyon</span>
          </>
        );
      case "status":
        return (
          <>
            <StatusTag tone={bom.isActive ? "ok" : "off"}>{bom.isActive ? "Aktif" : "Pasif"}</StatusTag>{" "}
            <span className="mfg-cell-muted">
              <span>{bom.orderCount}</span> <span>üretim emri</span>
            </span>
          </>
        );
      case "workCenters": {
        const names = Array.from(
          new Set(
            [...bom.operations]
              .sort((a, b) => a.sequence - b.sequence)
              .map((operation) => operation.workCenterName)
              .filter(Boolean),
          ),
        );
        return names.length ? names.join(", ") : "—";
      }
      default:
        return null;
    }
  };
  return (
    <div className="manufacturing-recipe-stack">
      <ListToolbar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchLabel="Reçetelerde ara"
        searchPlaceholder="Kod, reçete veya mamul ara"
        toolsSlotRef={setToolsSlot}
        onRefresh={onRefresh}
      >
        <ListChipGroup
          label="Durum"
          value={status}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
          allowClear
          hideEmpty
          options={[
            { value: "Active", label: "Aktif", count: activeCount },
            {
              value: "Inactive",
              label: "Pasif",
              count: boms.length - activeCount,
            },
          ]}
        />
      </ListToolbar>
      <section
        className="manufacturing-recipe-list list-v2-list"
        aria-label="Tanımlı reçeteler"
        aria-busy={loading}
      >
        <SalesDocumentGrid
          gridId="manufacturing-recipes"
          ariaLabel="Ürün reçeteleri"
          hideExport
          exportActionsRef={exportActionsRef}
          fields={visibleFields}
          items={pagedBoms}
          loading={loading}
          loadingMessage="Ürün reçeteleri yükleniyor…"
          emptyMessage={
            status
              ? "Aramanızla eşleşen reçete bulunamadı."
              : "Henüz ürün reçetesi yok. Yeni (F2) ile ilk reçeteyi oluşturun."
          }
          search={search}
          searchEmptyMessage="Aramanızla eşleşen reçete bulunamadı."
          toolbarContainer={toolsSlot}
          renderCell={(field, bom) => renderCell(bom, field.key)}
          selection={{
            currentId,
            onCurrentChange,
            onTickedChange: setTicked,
            bulkActions: active
              ? [
                  {
                    id: "export-selected",
                    label: "Excel (seçilenler)",
                    run: () => void exportActionsRef.current?.exportExcel(),
                  },
                ]
              : undefined,
            onOpen: (id) => {
              const bom = boms.find((candidate) => candidate.id === id);
              if (bom) onOpen(bom);
            },
          }}
          footer={
            <SalesListFooter
              ticked={ticked.length}
              shown={pagedBoms.length}
              total={filteredBoms.length}
              page={page}
              pageSize={RECIPE_PAGE_SIZE}
              loading={loading}
              onPageChange={setPage}
              hints="↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç"
            />
          }
          columnWidths={RECIPE_LIST_WIDTHS}
          numberFields={RECIPE_NUMBER_FIELDS}
        />
      </section>
    </div>
  );
}
