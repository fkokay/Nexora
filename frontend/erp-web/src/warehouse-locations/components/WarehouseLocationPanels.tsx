import type { MutableRefObject, ReactNode } from "react";
import AdvancedDataGrid, { type GridExportActions } from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { Warehouse } from "lucide-react";
import type { BulkAction } from "../../list-page/BulkActionBar";
import { StatusTag } from "../../list-page/StatusTag";
import type { Balance, Location, Reconciliation, ScreenField } from "../types";

type LocationListProps = {
  locations: Location[];
  filteredLocations: Location[];
  visibleFields: ScreenField[];
  /** The location open in the form (the grid's current row); null when none is. */
  selectedId: string | null;
  search: string;
  loading: boolean;
  warehouseId: string;
  /** Page-level toolbar element that hosts the grid's column and pivot tools. */
  toolbarContainer?: HTMLElement | null;
  /** Hides the grid's XLSX/CSV buttons; the page offers export through the action bar instead. */
  hideExport?: boolean;
  exportActionsRef?: MutableRefObject<GridExportActions | null>;
  /** A row was clicked or reached with ↑/↓; the page decides whether it opens (unsaved changes). */
  onSelect: (id: string | null) => void;
  onSelectionChange?: (keys: string[]) => void;
  bulkActions?: BulkAction[];
  /** Line under the list (hints, counts). */
  footer?: ReactNode;
};

// Sized for the left half of the definition screen at 1440; saved layouts keep their own widths.
const LIST_WIDTHS: Record<string, number> = { code: 110, name: 180, parentLocation: 110, status: 80 };

export function LocationListPanel({
  locations,
  filteredLocations,
  visibleFields,
  selectedId,
  search,
  loading,
  warehouseId,
  toolbarContainer,
  hideExport,
  exportActionsRef,
  onSelect,
  onSelectionChange,
  bulkActions,
  footer,
}: LocationListProps) {
  // Row actions live in the form beside the list, so they get no column. Kod has its own mono column (mockup 04),
  // so rows stay single-line.
  const fields = visibleFields.filter((field) => field.key !== "actions");
  return (
    <section
      className="panel warehouse-location-list-panel list-v2-list"
      aria-label="Raf ve bölmeler"
      aria-busy={loading}
    >
      {loading ? (
        <div className="empty-small" role="status" aria-live="polite">
          Konumlar yükleniyor…
        </div>
      ) : !warehouseId ? (
        <div className="empty-small">
          Konumları görmek için önce bir depo seçin.
        </div>
      ) : locations.length === 0 ? (
        <div className="empty-small">
          Bu depoda henüz konum yok. Kod ve ad vererek raf ya da bölme ekleyin.
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="empty-small" role="status">
          “{search}” aramasıyla eşleşen konum bulunamadı.
        </div>
      ) : fields.length === 0 ? (
        <div className="empty-small">
          Konum görünümünde açık sütun bulunmuyor.
        </div>
      ) : (
        <div className="customer-table-wrap warehouse-location-table-wrap">
          <AdvancedDataGrid
            enableRowSelection={false}
            selectable
            // All locations of the warehouse are loaded; the list footer counts them (no second pager in the card).
            externalPagination
            currentRowKey={selectedId}
            onCurrentRowChange={onSelect}
            onSelectionChange={onSelectionChange}
            bulkActions={bulkActions}
            hideSearch
            toolbarContainer={toolbarContainer}
            hideExport={hideExport}
            exportActionsRef={exportActionsRef}
            className="customer-table"
            gridId="inventory-warehouse-locations"
            {...screenViewGridDefaults(fields, (field) => LIST_WIDTHS[field.key])}
            aria-label="Depo raf ve bölmeler"
          >
            <thead>
              <ScreenViewGroupHeader fields={fields} />
              <tr>
                {fields.map((field) => (
                  <th scope="col" key={field.key}>
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredLocations.map((location) => (
                <tr key={location.id}>
                  {fields.map((field) => (
                    <td key={field.key}>
                      {field.key === "code" ? (
                        <span className="nx-code">{location.code}</span>
                      ) : field.key === "name" ? (
                        location.name
                      ) : field.key === "parentLocation" ? (
                        (locations.find(
                          (row) => row.id === location.parentLocationId,
                        )?.code ?? "Üst düzey")
                      ) : field.key === "status" ? (
                        <StatusTag tone={location.isActive ? "ok" : "off"}>
                          {location.isActive ? "Aktif" : "Pasif"}
                        </StatusTag>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </AdvancedDataGrid>
        </div>
      )}
      {footer}
    </section>
  );
}

type LocationBalanceProps = {
  selected: Location | null;
  locations: Location[];
  balances: Balance[];
  visibleFields: ScreenField[];
  loading: boolean;
  error: string;
  /** Under the edit form: only the balance part (the form already shows the location). */
  compact?: boolean;
};

export function LocationBalancePanel({
  selected,
  locations,
  balances,
  visibleFields,
  loading,
  error,
  compact = false,
}: LocationBalanceProps) {
  return (
    <section
      className="panel warehouse-location-detail list-v2-grid-card"
      aria-labelledby="warehouse-location-balance-title"
      aria-busy={loading}
    >
      {selected && compact ? (
        <div className="warehouse-location-detail-balances">
          <h3 id="warehouse-location-balance-title" title="Bu konuma açıkça atanmış stok hareketlerinin net miktarı">
            Konum bakiyesi
          </h3>
          <span className="tenant-scope">
            <Warehouse size={14} aria-hidden="true" />
            {balances.length} stok satırı
          </span>
        </div>
      ) : selected ? (
        <>
          <header className="list-v2-detail-head">
            <div>
              <span className="list-v2-kind">Depo konumu</span>
              <h2 id="warehouse-location-balance-title">{selected.name}</h2>
            </div>
          </header>
          <div className="list-v2-detail-meta">
            <span className="list-v2-detail-code">{selected.code}</span>
            <span
              className={`list-v2-status${selected.isActive ? " is-active" : ""}`}
            >
              <i aria-hidden="true" />
              {selected.isActive ? "Aktif" : "Pasif"}
            </span>
          </div>
          <dl className="list-v2-facts">
            <div>
              <dt>Üst konum</dt>
              <dd>
                {selected.parentLocationId
                  ? locations.find(
                      (row) => row.id === selected.parentLocationId,
                    )?.code
                  : "Üst düzey"}
              </dd>
            </div>
          </dl>
          <div className="warehouse-location-detail-balances">
            <h3 title="Bu konuma açıkça atanmış stok hareketlerinin net miktarı">
              Konum bakiyesi
            </h3>
            <span className="tenant-scope">
              <Warehouse size={14} aria-hidden="true" />
              {balances.length} stok satırı
            </span>
          </div>
        </>
      ) : (
        <div className="panel-heading">
          <div>
            <b id="warehouse-location-balance-title">Konum bakiyesi</b>
            <small>Bakiye görmek için bir konum seçin.</small>
          </div>
        </div>
      )}
      {error ? (
        <div className="empty-small" role="alert">
          {error}
        </div>
      ) : !selected ? (
        <div className="empty-small">Bir raf veya bölme seçin.</div>
      ) : loading ? (
        <div className="empty-small" role="status" aria-live="polite">
          Konum bakiyesi yükleniyor…
        </div>
      ) : balances.length === 0 ? (
        <div className="empty-small">Bu konumda stok bakiyesi bulunmuyor.</div>
      ) : visibleFields.length === 0 ? (
        <div className="empty-small">
          Bakiye görünümünde açık sütun bulunmuyor.
        </div>
      ) : (
        <div
          className="customer-table-wrap warehouse-location-table-wrap"
          role="region"
          aria-label="Konum stok bakiyesi tablosu"
          tabIndex={0}
        >
          <AdvancedDataGrid
            enableRowSelection={false}
            className="customer-table"
            gridId="warehouse-location-balances"
            {...screenViewGridDefaults(visibleFields)}
            aria-label={`${selected.code} konumundaki stok bakiyeleri`}
          >
            <thead>
              <ScreenViewGroupHeader fields={visibleFields} />
              <tr>
                {visibleFields.map((field) => (
                  <th scope="col" key={field.key}>
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {balances.map((row) => (
                <tr key={row.stockItemId}>
                  {visibleFields.map((field) => (
                    <td key={field.key}>
                      {field.key === "stockItemCode" ? (
                        <span className="nx-code">{row.stockItemCode}</span>
                      ) : field.key === "stockItemName" ? (
                        row.stockItemName
                      ) : field.key === "quantity" ? (
                        row.quantity.toLocaleString("tr-TR", {
                          maximumFractionDigits: 4,
                        })
                      ) : (
                        row.unitCode
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </AdvancedDataGrid>
        </div>
      )}
    </section>
  );
}

type ReconciliationPanelProps = {
  rows: Reconciliation[];
  visibleFields: ScreenField[];
  loading: boolean;
  error: string;
};

export function ReconciliationPanel({
  rows,
  visibleFields,
  loading,
  error,
}: ReconciliationPanelProps) {
  return (
    <section
      className="panel warehouse-location-reconciliation list-v2-grid-card"
      aria-labelledby="warehouse-location-reconciliation-title"
      aria-busy={loading}
    >
      <div className="panel-heading">
        <div>
          <b id="warehouse-location-reconciliation-title">
            Konumlandırma denetimi
          </b>
          <small>
            Raf/konum ataması olmayan hareketler nedeniyle depo bakiyesiyle
            konum bakiyeleri arasındaki fark
          </small>
        </div>
        <span className="tenant-scope">
          <Warehouse size={14} aria-hidden="true" />
          {rows.length} stok kalemi
        </span>
      </div>
      <p className="warehouse-location-reconciliation-note">
        Konumu boş eski hareketler burada görünür; bu ekran geçmiş kayıtlara
        otomatik konum atamaz. Miktarlar kendi stok birimleri içinde
        karşılaştırılır.
      </p>
      {error ? (
        <div className="empty-small" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="empty-small" role="status" aria-live="polite">
          Depo ve konum bakiyeleri karşılaştırılıyor…
        </div>
      ) : rows.length === 0 ? (
        <div className="empty-small">
          Konumu boş hareket kaynaklı fark bulunmuyor.
        </div>
      ) : visibleFields.length === 0 ? (
        <div className="empty-small">
          Denetim görünümünde açık sütun bulunmuyor.
        </div>
      ) : (
        <div
          className="customer-table-wrap warehouse-location-table-wrap"
          role="region"
          aria-label="Depo ve konum bakiyesi karşılaştırması"
          tabIndex={0}
        >
          <AdvancedDataGrid
            enableRowSelection={false}
            className="customer-table"
            gridId="inventory-warehouse-reconciliation"
            {...screenViewGridDefaults(visibleFields)}
            aria-label="Konumlandırma denetimi"
          >
            <thead>
              <ScreenViewGroupHeader fields={visibleFields} />
              <tr>
                {visibleFields.map((field) => (
                  <th scope="col" key={field.key}>
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.stockItemId}>
                  {visibleFields.map((field) => (
                    <td key={field.key}>
                      {field.key === "stockItemCode" ? (
                        <span className="nx-code">{row.stockItemCode}</span>
                      ) : field.key === "stockItemName" ? (
                        row.stockItemName
                      ) : field.key === "warehouseQuantity" ? (
                        row.warehouseQuantity.toLocaleString("tr-TR", {
                          maximumFractionDigits: 4,
                        })
                      ) : field.key === "locatedQuantity" ? (
                        row.locatedQuantity.toLocaleString("tr-TR", {
                          maximumFractionDigits: 4,
                        })
                      ) : field.key === "unlocatedQuantity" ? (
                        <span className="warehouse-unlocated-quantity">
                          {row.unlocatedQuantity.toLocaleString("tr-TR", {
                            maximumFractionDigits: 4,
                          })}
                        </span>
                      ) : field.key === "unitCode" ? (
                        row.unitCode
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </AdvancedDataGrid>
        </div>
      )}
    </section>
  );
}
