import { useRef, useState, type ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import SalesRowActionsMenu from "../../sales/components/SalesRowActionsMenu";
import type { Asset, AssetField } from "../types";

export type FixedAssetRowAction = "details" | "depreciate" | "assign" | "dispose";

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
  selectedId: string | null;
  locale: "tr" | "en";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSelect: (asset: Asset) => void;
  onAction: (asset: Asset, action: FixedAssetRowAction) => void;
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
  busy = false,
  search,
  status,
  selectedId,
  locale,
  onSearchChange,
  onStatusChange,
  onSelect,
  onAction,
  fieldLabel,
  formatField,
}: Props) {
  const en = locale === "en";
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const seeded = useRef(false);
  // The code is shown under the name, so it gets no column of its own while the
  // name column is visible.
  const hasName = allFields.some((field) => field.key === "name");
  const fields = hasName
    ? allFields.filter((field) => field.key !== "assetCode")
    : allFields;
  if (layoutReady && !seeded.current) {
    seeded.current = true;
    if (defaultLayout) seedDefaultHiddenColumns(fields);
  }
  const numeric = (key: string) => (NUMERIC_KEYS.has(key) ? "fixed-asset-col-number" : undefined);
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
      className="panel fixed-asset-register-panel list-v2-list"
      aria-label={en ? "Asset register" : "Kıymet listesi"}
    >
      <div
        className="ledger-list"
        role="region"
        aria-label={en ? "Asset register table" : "Kıymet listesi tablosu"}
        tabIndex={0}
      >
        {!layoutReady ? (
          <p className="table-empty fixed-asset-register-loading" role="status">
            {en ? "Loading assets…" : "Kıymetler yükleniyor…"}
          </p>
        ) : (
        <AdvancedDataGrid
          gridId={FIXED_ASSET_REGISTER_GRID_ID}
          enableRowSelection={false}
          hideSearch
          toolbarContainer={toolsSlot}
          {...screenViewGridDefaults(
            // Keep the ⋯ menu visible when extra columns make the grid scroll sideways.
            fields.map((field) =>
              field.key === "actions" && !field.pinned
                ? { ...field, pinned: "right" as const, width: field.width || 64 }
                : field,
            ),
          )}
          className="customer-table fixed-asset-register-table"
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
                  className={field.key === "actions" ? "fixed-asset-col-actions" : numeric(field.key)}
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
                className={
                  selectedId === asset.id ? "fixed-asset-selected" : ""
                }
                // The whole row selects the asset for the panel; buttons inside keep their own action.
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest("button, a, input, select")) return;
                  onSelect(asset);
                }}
              >
                {fields.map((field) => (
                  <td
                    key={field.key}
                    className={field.key === "actions" ? "fixed-asset-col-actions" : numeric(field.key)}
                    data-label={fieldLabel(field.key, field.label)}
                  >
                    {field.key === "actions" ? (
                      <SalesRowActionsMenu label={asset.assetCode}>
                        <button
                          type="button"
                          role="menuitem"
                          className="sales-row-menu-item"
                          onClick={() => onAction(asset, "details")}
                        >
                          {en ? "Details" : "Detay"}
                        </button>
                        {asset.status === "Active" && (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              className="sales-row-menu-item"
                              disabled={busy}
                              onClick={() => onAction(asset, "depreciate")}
                            >
                              {en ? "Post depreciation" : "Amortismanı kaydet"}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="sales-row-menu-item"
                              disabled={busy}
                              onClick={() => onAction(asset, "assign")}
                            >
                              {en ? "Assign custody" : "Zimmetle"}
                            </button>
                            <div role="separator" className="sales-row-menu-separator" />
                            <button
                              type="button"
                              role="menuitem"
                              className="sales-row-menu-item danger-action"
                              disabled={busy}
                              onClick={() => onAction(asset, "dispose")}
                            >
                              {en ? "Dispose" : "Elden çıkar"}
                            </button>
                          </>
                        )}
                      </SalesRowActionsMenu>
                    ) : field.key === "name" ? (
                      <>
                        <button
                          type="button"
                          className="row-action fixed-asset-name"
                          aria-pressed={selectedId === asset.id}
                          onClick={() => onSelect(asset)}
                        >
                          {asset.name}
                        </button>
                        <small className="cell-subtitle list-v2-name-code">
                          {[asset.assetCode, asset.category].filter(Boolean).join(" · ")}
                        </small>
                      </>
                    ) : field.key === "status" ? (
                      <span
                        className={`fixed-asset-status${asset.status === "Active" ? " is-active" : ""}`}
                      >
                        {formatField(asset, field.key)}
                      </span>
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
    </section>
    </>
  );
}
