import { useRef, useState, type MutableRefObject, type ReactNode } from "react";
import AdvancedDataGrid, { type GridExportActions } from "../../AdvancedDataGrid";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { StatusTag } from "../../list-page/StatusTag";
import type { Asset, AssetField } from "../types";

/** Grid settings key (`nexora.grid.<id>`): keep it stable so the viewer's column choices survive. */
export const FIXED_ASSET_REGISTER_GRID_ID = "fixed-assets-register";

/**
 * Columns that stay available in the grid's column menu but start hidden, so the register opens
 * with the essentials (asset, in-service date, cost, net book value, status, actions).
 */
const DEFAULT_HIDDEN_KEYS = new Set([
  "category",
  "acquisitionDate",
  "residualValueBase",
  "usefulLifeMonths",
  "accumulatedDepreciationBase",
  "vukTaxYear",
  "vukDepreciationLowerLimitTry",
  "vukCommuniqueNumber",
]);
const NUMERIC_KEYS = new Set([
  "acquisitionCostBase",
  "residualValueBase",
  "usefulLifeMonths",
  "accumulatedDepreciationBase",
  "remainingBookValueBase",
  "vukDepreciationLowerLimitTry",
]);

/**
 * AdvancedDataGrid has no "hidden by default" option; it only reads saved settings. Before the grid
 * mounts for the first time, store the default-hidden columns for viewers who have never changed
 * this grid. Saved settings (including "Görünümü sıfırla") are never overwritten.
 */
function seedDefaultHiddenColumns(fields: AssetField[]) {
  try {
    const key = `nexora.grid.${FIXED_ASSET_REGISTER_GRID_ID}`;
    if (localStorage.getItem(key) !== null) return;
    const hidden = fields
      .map((field, index) => (DEFAULT_HIDDEN_KEYS.has(field.key) ? index : -1))
      .filter((index) => index >= 0);
    if (!hidden.length) return;
    localStorage.setItem(
      key,
      JSON.stringify({ order: [], hidden, widths: {}, pinned: {}, density: "normal", pageSize: 25 }),
    );
  } catch {
    /* storage unavailable: the grid simply shows every column */
  }
}

type Props = {
  assets: Asset[];
  totalAssetCount: number;
  /** Shown on the status chips; omit while unknown. */
  activeAssetCount?: number;
  onRefresh?: () => void;
  fields: AssetField[];
  /**
   * False until the screen view request settled; the grid mounts only then, so the default-hidden
   * columns are computed from the final column order.
   */
  layoutReady: boolean;
  /** True when the columns come from the built-in catalog rather than a tenant-published view. */
  defaultLayout: boolean;
  loading: boolean;
  busy?: boolean;
  search: string;
  status: string;
  /** Current row (click, ↑/↓); the panel and the action bar's Aç / İşlemler follow it. */
  selectedId: string | null;
  locale: "tr" | "en";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSelect: (asset: Asset) => void;
  /** Double click / Enter: opens the asset card (the panel's summary). */
  onOpen: (asset: Asset) => void;
  exportActionsRef: MutableRefObject<GridExportActions | null>;
  /** Line under the list (hints, counts). */
  footer?: ReactNode;
  fieldLabel: (key: string, label: string) => string;
  formatField: (asset: Asset, key: string) => ReactNode;
};

export function FixedAssetRegister({
  assets,
  totalAssetCount,
  activeAssetCount,
  onRefresh,
  fields: allFields,
  layoutReady,
  defaultLayout,
  loading,
  search,
  status,
  selectedId,
  locale,
  onSearchChange,
  onStatusChange,
  onSelect,
  onOpen,
  exportActionsRef,
  footer,
  fieldLabel,
  formatField,
}: Props) {
  const en = locale === "en";
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const seeded = useRef(false);
  // The code is shown under the name, so it gets no column of its own while the
  // name column is visible.
  const hasName = allFields.some((field) => field.key === "name");
  // Row actions are on the action bar (İşlemler), so there is no actions column.
  const fields = allFields.filter(
    (field) => field.key !== "actions" && !(hasName && field.key === "assetCode"),
  );
  if (layoutReady && !seeded.current) {
    seeded.current = true;
    if (defaultLayout) seedDefaultHiddenColumns(fields);
  }
  const numeric = (key: string) => (NUMERIC_KEYS.has(key) ? "nx-num" : key === "assetCode" ? "nx-code" : undefined);
  const [, setTicked] = useState<string[]>([]);
  return (
    <>
    <ListToolbar
      search={search}
      onSearchChange={onSearchChange}
      searchLabel={en ? "Search" : "Ara"}
      searchPlaceholder={en ? "Code, name, or category" : "Kod, ad veya kategori"}
      toolsSlotRef={setToolsSlot}
      onRefresh={onRefresh}
      refreshLabel={en ? "Refresh" : "Yenile"}
    >
      <ListChipGroup
        label={en ? "Status" : "Durum"}
        value={status}
        onChange={onStatusChange}
        options={[
          { value: "all", label: en ? "All" : "Tümü", count: totalAssetCount },
          { value: "active", label: en ? "Active" : "Etkin", count: activeAssetCount },
          {
            value: "inactive",
            label: en ? "Disposed" : "Elden çıkarılan",
            count: activeAssetCount == null ? undefined : totalAssetCount - activeAssetCount,
          },
        ]}
      />
    </ListToolbar>
    <section
      className="fixed-asset-register list-v2-list"
      aria-label={en ? "Asset register" : "Kıymet listesi"}
    >
      <div className="fixed-asset-register-wrap">
        {!layoutReady ? (
          <p className="table-empty fixed-asset-register-loading" role="status">
            {en ? "Loading assets…" : "Kıymetler yükleniyor…"}
          </p>
        ) : (
        <AdvancedDataGrid
          gridId={FIXED_ASSET_REGISTER_GRID_ID}
          enableRowSelection={false}
          hideSearch
          hideExport
          exportActionsRef={exportActionsRef}
          toolbarContainer={toolsSlot}
          {...screenViewGridDefaults(fields)}
          className="customer-table fixed-asset-register-table"
          aria-label={en ? "Asset register table" : "Kıymet listesi tablosu"}
          selectable
          currentRowKey={selectedId}
          onCurrentRowChange={(id) => {
            const asset = assets.find((candidate) => candidate.id === id);
            if (asset) onSelect(asset);
          }}
          onSelectionChange={setTicked}
          bulkActions={[
            {
              id: "export-selected",
              label: en ? "Excel (selected)" : "Excel (seçilenler)",
              run: () => void exportActionsRef.current?.exportExcel(),
            },
          ]}
        >
          <thead>
            <ScreenViewGroupHeader
              fields={fields}
              generalLabel={en ? "General" : "Genel"}
            />
            <tr>
              {fields.map((field) => (
                <th
                  key={field.key}
                  scope="col"
                  className={numeric(field.key)}
                >
                  {fieldLabel(field.key, field.label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr
                key={asset.id}
                data-record-id={asset.id}
                tabIndex={0}
                // The grid owns click / ↑↓ / Space; double click and Enter open the asset card.
                onDoubleClick={(event) => {
                  if ((event.target as HTMLElement).closest("button,input,select,a,.advanced-grid-select-cell")) return;
                  event.preventDefault();
                  onOpen(asset);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || event.defaultPrevented || event.key !== "Enter") return;
                  event.preventDefault();
                  onOpen(asset);
                }}
              >
                {fields.map((field) => (
                  <td
                    key={field.key}
                    className={numeric(field.key)}
                    data-label={fieldLabel(field.key, field.label)}
                  >
                    {field.key === "name" ? (
                      <>
                        <span>{asset.name}</span>
                        <small className="cell-subtitle list-v2-name-code">
                          {[asset.assetCode, asset.category].filter(Boolean).join(" · ")}
                        </small>
                      </>
                    ) : field.key === "status" ? (
                      <StatusTag tone={asset.status === "Active" ? "ok" : "off"}>
                        {formatField(asset, field.key)}
                      </StatusTag>
                    ) : (
                      formatField(asset, field.key)
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {loading && !assets.length && (
              <tr>
                <td
                  colSpan={Math.max(fields.length, 1)}
                  className="table-empty"
                  role="status"
                >
                  {en ? "Loading assets…" : "Kıymetler yükleniyor…"}
                </td>
              </tr>
            )}
            {!loading && !assets.length && (
              <tr>
                <td
                  colSpan={Math.max(fields.length, 1)}
                  className="table-empty"
                >
                  {totalAssetCount
                    ? en
                      ? "No assets match these filters."
                      : "Filtreye uygun kıymet bulunamadı."
                    : en
                      ? "No assets recorded yet. Use New acquisition to add one."
                      : "Henüz kıymet kaydı yok. Yeni edinim ile ilk kaydı oluşturun."}
                </td>
              </tr>
            )}
          </tbody>
        </AdvancedDataGrid>
        )}
      </div>
      {footer}
    </section>
    </>
  );
}
