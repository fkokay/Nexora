import type { MutableRefObject, ReactNode } from "react";
import { Package } from "lucide-react";
import AdvancedDataGrid, { type GridExportActions } from "../../AdvancedDataGrid";
import type { BuiltInScreenLayoutField, Warehouse } from "../../erp-types";
import type { BulkAction } from "../../list-page/BulkActionBar";
import { ListFooter } from "../../list-page/ListFooter";
import { ListChipGroup, ListToolbar } from "../../list-page/ListToolbar";
import { StatusTag } from "../../list-page/StatusTag";
import { screenViewGridDefaults } from "../../screenViewGridLayout";

// Sized for the left half of the definition screen at 1440; saved layouts keep their own widths.
const WIDTHS: Record<string, number> = { code: 90, name: 170, status: 80, availability: 200 };

type Props = {
  fields: BuiltInScreenLayoutField[];
  warehouses: Warehouse[];
  /** Rows after the search and the status chips. */
  visible: Warehouse[];
  loading: boolean;
  search: string;
  status: string;
  currentId: string | null;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onRefresh: () => void;
  onCurrentRowChange: (key: string | null) => void;
  onSelectionChange: (keys: string[]) => void;
  selectedCount: number;
  bulkActions: BulkAction[];
  toolsSlot: HTMLDivElement | null;
  toolsSlotRef: (element: HTMLDivElement | null) => void;
  exportActionsRef: MutableRefObject<GridExportActions | null>;
  /** Shown in the empty list (first warehouse). */
  emptyAction?: ReactNode;
};

/** Left half of the Depolar definition screen: search, Tümü / Aktif / Pasif, the compact list and its footer. */
export function WarehouseDefinitionList(p: Props) {
  const active = p.warehouses.filter((row) => row.isActive).length;
  const cell = (field: BuiltInScreenLayoutField, warehouse: Warehouse): ReactNode => {
    switch (field.key) {
      case "code":
        return <span className="nx-code">{warehouse.code}</span>;
      case "name":
        return warehouse.name;
      case "status":
        return <StatusTag tone={warehouse.isActive ? "ok" : "off"}>{warehouse.isActive ? "Aktif" : "Pasif"}</StatusTag>;
      case "availability":
        return warehouse.isActive ? "Yeni stok hareketlerine açık" : "Yeni stok hareketlerine kapalı";
      default:
        return null;
    }
  };
  return (
    <>
      <ListToolbar
        search={p.search}
        onSearchChange={p.onSearchChange}
        searchLabel="Depo ara"
        searchPlaceholder="Depo kodu veya adıyla ara"
        onRefresh={p.onRefresh}
        toolsSlotRef={p.toolsSlotRef}
      >
        <ListChipGroup
          label="Durum"
          value={p.status}
          onChange={p.onStatusChange}
          options={[
            { value: "", label: "Tümü", count: p.warehouses.length },
            { value: "Active", label: "Aktif", count: active },
            { value: "Inactive", label: "Pasif", count: p.warehouses.length - active },
          ]}
        />
      </ListToolbar>
      <section className="panel inventory-stock-grid-panel warehouse-directory-grid list-v2-list">
        {p.loading ? (
          <div className="warehouse-empty" role="status">
            <span className="warehouse-empty-icon">
              <Package size={19} />
            </span>
            <div>
              <b>Depolar yükleniyor…</b>
              <p>Firma depoları ve kullanım durumları alınıyor.</p>
            </div>
          </div>
        ) : p.visible.length > 0 ? (
          <div className="customer-table-wrap">
            <AdvancedDataGrid
              className="customer-table"
              gridId="inventory-warehouses"
              {...screenViewGridDefaults(p.fields, (field) => WIDTHS[field.key])}
              externalPagination
              hideSearch
              enableRowSelection={false}
              selectable
              currentRowKey={p.currentId}
              onCurrentRowChange={p.onCurrentRowChange}
              onSelectionChange={p.onSelectionChange}
              bulkActions={p.bulkActions}
              toolbarContainer={p.toolsSlot}
              hideExport
              exportActionsRef={p.exportActionsRef}
              aria-label="Depo listesi"
            >
              <thead>
                <tr>
                  {p.fields.map((field) => (
                    <th key={field.key}>{field.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.visible.map((warehouse) => (
                  <tr key={warehouse.id}>
                    {p.fields.map((field) => (
                      <td key={field.key}>{cell(field, warehouse)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </AdvancedDataGrid>
          </div>
        ) : (
          <div className="warehouse-empty">
            <span className="warehouse-empty-icon">
              <Package size={19} />
            </span>
            <div>
              <b>{p.warehouses.length ? "Aramayla eşleşen depo yok" : "Henüz depo tanımlanmamış"}</b>
              <p>
                {p.warehouses.length
                  ? "Arama ifadesini değiştirip yeniden deneyin."
                  : "Stok hareketlerini kaydetmek için ilk deponuzu oluşturun."}
              </p>
            </div>
            {!p.warehouses.length && p.emptyAction}
          </div>
        )}
        <ListFooter hints="↑↓ listede gez · Tab forma geç · Ctrl+S kaydet · Esc listeye dön · F2 yeni depo">
          {p.selectedCount > 0 && (
            <span>
              <span>{p.selectedCount}</span> <span>seçili</span>
            </span>
          )}
          <span>
            <span>{p.warehouses.length}</span> <span>depo</span> · <span>{active}</span> <span>aktif</span> ·{" "}
            <span>{p.warehouses.length - active}</span> <span>pasif</span>
          </span>
        </ListFooter>
      </section>
    </>
  );
}
