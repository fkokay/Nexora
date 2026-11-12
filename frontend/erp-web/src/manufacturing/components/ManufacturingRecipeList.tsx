import { Boxes, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import type { ManufacturingBom, ManufacturingPageKey } from "../types";

export type RecipeScreenField = {
  key: string;
  label: string;
  visible: boolean;
  position: number;
  fixed?: boolean;
  section?: string | null;
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
  page,
  setPage,
  pageCount,
  onResetForm,
  onNavigate,
  onEdit,
  onChangeState,
  onDelete,
}: Props) {
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
      <section className="panel manufacturing-recipe-filter-card" aria-label="Reçete filtreleri">
        <div className="manufacturing-recipe-filter-heading">
          <h2>Filtreler</h2>
          <p>Reçeteleri kod, ad veya mamul bilgisine göre daraltın.</p>
        </div>
        <div className="manufacturing-recipe-filterbar">
          <label className="manufacturing-recipe-search">
            <Search size={16} aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Kod, reçete veya mamul ara"
              aria-label="Reçetelerde ara"
            />
          </label>
          {search && (
            <button
              type="button"
              className="secondary small-button"
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
            >
              Temizle
            </button>
          )}
        </div>
      </section>
      <section
        className="manufacturing-recipe-list"
        aria-label="Tanımlı reçeteler"
        aria-busy={loading}
      >
      <div className="manufacturing-recipe-list-heading">
        <p>
          {loading ? (
            "Reçeteler yükleniyor…"
          ) : (
            <>
              <b>{filteredBoms.length.toLocaleString("tr-TR")}</b> kayıt{" "}
              <span>·</span>{" "}
              <b>
                {boms.filter((x) => x.isActive).length.toLocaleString("tr-TR")}
              </b>{" "}
              aktif{" "}
            </>
          )}
        </p>
      </div>
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
              externalPagination
              hideSearch
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
