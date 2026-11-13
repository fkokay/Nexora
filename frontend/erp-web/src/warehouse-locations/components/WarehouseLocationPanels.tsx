import AdvancedDataGrid from "../../AdvancedDataGrid";
import ScreenViewGroupHeader from "../../ScreenViewGroupHeader";
import { Pencil, Warehouse } from "lucide-react";
import type { Balance, Location, Reconciliation, ScreenField } from "../types";

type LocationListProps = {
  locations: Location[];
  filteredLocations: Location[];
  visibleFields: ScreenField[];
  selectedId: string;
  search: string;
  loading: boolean;
  warehouseId: string;
  /** Page-level toolbar element that hosts the grid's column and pivot tools. */
  toolbarContainer?: HTMLElement | null;
  onSelect: (id: string) => void;
};

export function LocationListPanel({
  locations,
  filteredLocations,
  visibleFields,
  selectedId,
  search,
  loading,
  warehouseId,
  toolbarContainer,
  onSelect,
}: LocationListProps) {
  // The code is shown under the name, and row actions live in the detail panel, so
  // neither gets a column of its own. The code column stays if the name is hidden.
  const hasName = visibleFields.some((field) => field.key === "name");
  const fields = visibleFields.filter(
    (field) => field.key !== "actions" && !(hasName && field.key === "code"),
  );
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
        <div
          className="customer-table-wrap warehouse-location-table-wrap"
          role="region"
          aria-label="Depo raf ve bölme listesi"
          tabIndex={0}
        >
          <AdvancedDataGrid
            enableRowSelection={false}
            hideSearch
            toolbarContainer={toolbarContainer}
            className="customer-table"
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
                <tr
                  key={location.id}
                  className={
                    selectedId === location.id
                      ? "selected erp-selected-row"
                      : undefined
                  }
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "button,a,input,select,textarea",
                      )
                    )
                      return;
                    onSelect(location.id);
                  }}
                >
                  {fields.map((field) => (
                    <td key={field.key}>
                      {field.key === "name" ? (
                        <button
                          type="button"
                          className="warehouse-location-select"
                          aria-pressed={selectedId === location.id}
                          onClick={() => onSelect(location.id)}
                        >
                          <span>
                            <b>{location.name}</b>
                            <small className="cell-subtitle list-v2-name-code">
                              {location.code}
                            </small>
                          </span>
                        </button>
                      ) : field.key === "code" ? (
                        <button
                          type="button"
                          className="warehouse-location-select"
                          aria-pressed={selectedId === location.id}
                          onClick={() => onSelect(location.id)}
                        >
                          <b>{location.code}</b>
                        </button>
                      ) : field.key === "parentLocation" ? (
                        (locations.find(
                          (row) => row.id === location.parentLocationId,
                        )?.code ?? "Üst düzey")
                      ) : field.key === "status" ? (
                        <span
                          className={
                            location.isActive
                              ? "warehouse-location-state is-active"
                              : "warehouse-location-state"
                          }
                        >
                          {location.isActive ? "Aktif" : "Pasif"}
                        </span>
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

type LocationBalanceProps = {
  selected: Location | null;
  locations: Location[];
  balances: Balance[];
  visibleFields: ScreenField[];
  loading: boolean;
  error: string;
  role: string;
  busy: boolean;
  onEdit: (location: Location) => void;
};

export function LocationBalancePanel({
  selected,
  locations,
  balances,
  visibleFields,
  loading,
  error,
  role,
  busy,
  onEdit,
}: LocationBalanceProps) {
  return (
    <section
      className="panel warehouse-location-detail"
      aria-labelledby="warehouse-location-balance-title"
      aria-busy={loading}
    >
      {selected ? (
        <>
          <header className="list-v2-detail-head">
            <div>
              <span className="list-v2-kind">Depo konumu</span>
              <h2 id="warehouse-location-balance-title">{selected.name}</h2>
            </div>
            {role === "TenantAdmin" && (
              <div className="list-v2-detail-head-actions">
                <button
                  type="button"
                  className="secondary small-button"
                  disabled={busy}
                  onClick={() => onEdit(selected)}
                >
                  <Pencil size={14} aria-hidden="true" /> Düzenle
                </button>
              </div>
            )}
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
                        <b>{row.stockItemCode}</b>
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
      className="panel warehouse-location-reconciliation"
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
                        <b>{row.stockItemCode}</b>
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
