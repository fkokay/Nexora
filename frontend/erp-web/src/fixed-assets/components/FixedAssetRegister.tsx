import { useState, type ReactNode } from "react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import type { Asset, AssetField } from "../types";

type Props = {
  assets: Asset[];
  totalAssetCount: number;
  /** Shown on the status chips; omit while unknown. */
  activeAssetCount?: number;
  onRefresh?: () => void;
  fields: AssetField[];
  loading: boolean;
  search: string;
  status: string;
  selectedId: string | null;
  locale: "tr" | "en";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSelect: (asset: Asset) => void;
  fieldLabel: (key: string, label: string) => string;
  formatField: (asset: Asset, key: string) => ReactNode;
};

export function FixedAssetRegister({
  assets,
  totalAssetCount,
  activeAssetCount,
  onRefresh,
  fields: allFields,
  loading,
  search,
  status,
  selectedId,
  locale,
  onSearchChange,
  onStatusChange,
  onSelect,
  fieldLabel,
  formatField,
}: Props) {
  const en = locale === "en";
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  // The code is shown under the name, so it gets no column of its own while the
  // name column is visible.
  const hasName = allFields.some((field) => field.key === "name");
  const fields = hasName
    ? allFields.filter((field) => field.key !== "assetCode")
    : allFields;
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
          { value: "all", label: en ? "All assets" : "Tüm kıymetler", count: totalAssetCount },
          { value: "active", label: en ? "Active" : "Etkin", count: activeAssetCount },
          {
            value: "inactive",
            label: en ? "Disposed or inactive" : "Elden çıkarılan veya pasif",
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
        <AdvancedDataGrid
          enableRowSelection={false}
          hideSearch
          toolbarContainer={toolsSlot}
          {...screenViewGridDefaults(fields)}
          className="customer-table fixed-asset-register-table"
        >
          <thead>
            <ScreenViewGroupHeader
              fields={fields}
              generalLabel={en ? "General" : "Genel"}
            />
            <tr>
              {fields.map((field) => (
                <th key={field.key} scope="col">
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
              >
                {fields.map((field) => (
                  <td
                    key={field.key}
                    data-label={fieldLabel(field.key, field.label)}
                  >
                    {field.key === "actions" ? (
                      <button
                        type="button"
                        className="row-action"
                        aria-pressed={selectedId === asset.id}
                        onClick={() => onSelect(asset)}
                      >
                        {en ? "Details" : "Detay"}
                      </button>
                    ) : field.key === "name" ? (
                      <>
                        <button
                          type="button"
                          className="row-action"
                          aria-pressed={selectedId === asset.id}
                          onClick={() => onSelect(asset)}
                        >
                          {asset.name}
                        </button>
                        <small className="cell-subtitle list-v2-name-code">{asset.assetCode}</small>
                      </>
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
      </div>
    </section>
    </>
  );
}
