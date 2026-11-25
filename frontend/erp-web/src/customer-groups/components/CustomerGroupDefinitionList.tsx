import type { ReactNode } from "react";
import { Users } from "lucide-react";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import type { CustomerGroupItem } from "../../erp-types";
import { ListFooter } from "../../list-page/ListFooter";
import { ListToolbar } from "../../list-page/ListToolbar";
import { StatusTag } from "../../list-page/StatusTag";

// Columns of the approved mockup (Kod, Ad, Durum); sized for the left half of the definition screen at 1440.
const COLUMNS = [
  { key: "code", label: "Kod", width: 110 },
  { key: "name", label: "Ad", width: 220 },
  { key: "status", label: "Durum", width: 90 },
] as const;

type Props = {
  groups: CustomerGroupItem[];
  /** Rows after the search. */
  visible: CustomerGroupItem[];
  loading: boolean;
  search: string;
  currentId: string | null;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onCurrentRowChange: (key: string | null) => void;
  toolsSlot: HTMLDivElement | null;
  toolsSlotRef: (element: HTMLDivElement | null) => void;
  /** Shown in the empty list (first group). */
  emptyAction?: ReactNode;
};

/** Left half of the Cari Grupları definition screen: search, the compact list and its footer. */
export function CustomerGroupDefinitionList(p: Props) {
  const active = p.groups.filter((group) => group.isActive).length;
  const cell = (key: (typeof COLUMNS)[number]["key"], group: CustomerGroupItem): ReactNode => {
    switch (key) {
      case "code":
        return <span className="nx-code">{group.code}</span>;
      case "name":
        return group.name;
      case "status":
        return <StatusTag tone={group.isActive ? "ok" : "off"}>{group.isActive ? "Aktif" : "Pasif"}</StatusTag>;
    }
  };
  return (
    <>
      <ListToolbar
        search={p.search}
        onSearchChange={p.onSearchChange}
        searchLabel="Grup ara"
        searchPlaceholder="Grup kodu veya adıyla ara"
        onRefresh={p.onRefresh}
        refreshLabel="Grupları yenile"
        toolsSlotRef={p.toolsSlotRef}
      />
      <section className="panel list-v2-list">
        {p.loading && !p.groups.length ? (
          <div className="cgr-empty" role="status">
            <span className="cgr-empty-icon">
              <Users size={19} />
            </span>
            <div>
              <b>Gruplar yükleniyor…</b>
            </div>
          </div>
        ) : p.visible.length > 0 ? (
          <div className="customer-table-wrap">
            <AdvancedDataGrid
              className="customer-table"
              gridId="customer-groups"
              initialColumnWidths={COLUMNS.map((column) => column.width)}
              externalPagination
              hideSearch
              enableRowSelection={false}
              selectable
              currentRowKey={p.currentId}
              onCurrentRowChange={p.onCurrentRowChange}
              toolbarContainer={p.toolsSlot}
              hideExport
              aria-label="Cari grubu listesi"
            >
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.visible.map((group) => (
                  <tr key={group.id}>
                    {COLUMNS.map((column) => (
                      <td key={column.key}>{cell(column.key, group)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </AdvancedDataGrid>
          </div>
        ) : (
          <div className="cgr-empty">
            <span className="cgr-empty-icon">
              <Users size={19} />
            </span>
            <div>
              <b>{p.groups.length ? "Aramayla eşleşen grup yok" : "Henüz grup tanımı yok"}</b>
              <p>{p.groups.length ? "Arama ifadesini değiştirip yeniden deneyin." : "Yeni grup ekleyerek başlayın."}</p>
            </div>
            {!p.groups.length && p.emptyAction}
          </div>
        )}
        <ListFooter hints="↑↓ listede gez · Tab forma geç · Ctrl+S kaydet · Esc listeye dön · F2 yeni grup">
          <span>
            <span>{p.groups.length}</span> <span>grup</span> · <span>{active}</span> <span>aktif</span>
          </span>
        </ListFooter>
      </section>
    </>
  );
}
