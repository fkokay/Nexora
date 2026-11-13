import { Boxes, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import type { ScreenColumnPin } from "../../erp-types";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { ManufacturingBom, ManufacturingPageKey } from "../types";

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

type Props = {
  fields?: RecipeScreenField[];
  boms: ManufacturingBom[];
  filteredBoms: ManufacturingBom[];
  pagedBoms: ManufacturingBom[];
  loading: boolean;
  busy: boolean;
  search: string;
  setSearch: (value: string) => void;
  /** "" (all), "Active" or "Inactive"; applied by the page when it filters the recipes. */
  status: string;
  setStatus: (value: string) => void;
  onRefresh: () => void;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  pageCount: number;
  onResetForm: () => void;
  onNavigate: (page: ManufacturingPageKey) => void;
  onEdit: (bom: ManufacturingBom) => void;
  onChangeState: (bom: ManufacturingBom) => void;
  onDelete: (bom: ManufacturingBom) => void;
};

export default function ManufacturingRecipeList({
  fields = defaultRecipeFields,
  boms,
  filteredBoms,
  pagedBoms,
  loading,
  busy,
  search,
  setSearch,
  status,
  setStatus,
  onRefresh,
  page,
  setPage,
  pageCount,
  onResetForm,
  onNavigate,
  onEdit,
  onChangeState,
  onDelete,
}: Props) {
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const activeCount = boms.filter((x) => x.isActive).length;
  const visibleFields = fields
    .filter((field) => field.key === "actions" || field.visible)
    .sort((a, b) => {
      if (a.key === "actions") return 1;
      if (b.key === "actions") return -1;
      return a.position - b.position;
    });
  const renderCell = (bom: ManufacturingBom, key: string): ReactNode => {
    switch (key) {
      case "recipe":
        return (
          <>
            <b>{bom.code}</b>
            <small>{bom.name}</small>
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
            {bom.lines.length} bileşen · {bom.operations.length}{" "}
            operasyon
          </>
        );
      case "status":
        return (
          <>
            <span
              className={`manufacturing-status ${bom.isActive ? "manufacturing-completed" : "manufacturing-cancelled"}`}
            >
              {bom.isActive ? "Aktif" : "Pasif"}
            </span>
            <small>{bom.orderCount} üretim emri</small>
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
      case "actions":
        return (
          <div className="manufacturing-recipe-actions">
            <button
              type="button"
              className="secondary small-button"
              disabled={busy}
              onClick={() => onEdit(bom)}
            >
              <Pencil size={13} /> Düzenle
            </button>
            <button
              type="button"
              className="secondary small-button"
              disabled={busy}
              onClick={() => onChangeState(bom)}
            >
              {bom.isActive ? "Pasife al" : "Etkinleştir"}
            </button>
            <button
              type="button"
              className="secondary small-button manufacturing-recipe-delete"
              disabled={busy || bom.orderCount > 0}
              title={
                bom.orderCount > 0
                  ? "Üretim emri referansı olan reçeteler silinemez."
                  : ""
              }
              aria-label={`${bom.code} reçetesini sil`}
              onClick={() => onDelete(bom)}
            >
              <Trash2 size={13} /> Sil
            </button>
          </div>
        );
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
      {loading ? (
        <div className="manufacturing-empty" role="status" aria-live="polite">
          <RefreshCw size={18} aria-hidden="true" />
          <span>Ürün reçeteleri yükleniyor…</span>
        </div>
      ) : boms.length === 0 ? (
        <div className="manufacturing-empty">
          <Boxes size={22} />
          <b>Henüz ürün reçetesi yok</b>
          <span>Yeni reçete düğmesini kullanarak ilk reçeteyi oluşturun.</span>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onResetForm();
              onNavigate("manufacturing-recipe-create");
            }}
          >
            <Plus size={15} /> Reçete oluştur
          </button>
        </div>
      ) : filteredBoms.length === 0 ? (
        <div className="manufacturing-empty">
          Aramanızla eşleşen reçete bulunamadı.
        </div>
      ) : (
        <>
          <div className="manufacturing-table-wrap manufacturing-recipe-table-wrap">
            <AdvancedDataGrid
              className="customer-table manufacturing-recipe-grid"
              gridId="manufacturing-recipes"
              {...screenViewGridDefaults(visibleFields)}
              externalPagination
              hideSearch
              toolbarContainer={toolsSlot}
              enableRowSelection={false}
              aria-label="Ürün reçeteleri"
            >
              <thead>
                <tr>
                  {visibleFields.map((field) => (
                    <th key={field.key}>{field.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedBoms.map((bom) => (
                  <tr key={bom.id}>
                    {visibleFields.map((field) => (
                      <td key={field.key}>{renderCell(bom, field.key)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </AdvancedDataGrid>
          </div>
          <div className="manufacturing-recipe-pagination">
            <span>
              {filteredBoms.length.toLocaleString("tr-TR")} reçete · Sayfa{" "}
              {page}/{pageCount}
            </span>
            <div>
              <button
                type="button"
                className="secondary small-button"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Önceki
              </button>
              <button
                type="button"
                className="secondary small-button"
                disabled={page >= pageCount}
                onClick={() =>
                  setPage((value) => Math.min(pageCount, value + 1))
                }
              >
                Sonraki
              </button>
            </div>
          </div>
        </>
      )}
      </section>
    </div>
  );
}
