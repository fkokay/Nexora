import type { KeyboardEvent, MouseEvent, MutableRefObject, ReactNode } from "react";
import { X } from "lucide-react";
import type { GridExportActions } from "../AdvancedDataGrid";
import { ListFooter } from "../list-page/ListFooter";
import {
  SalesPanelFacts,
  SalesPanelSection,
} from "../sales/components/SalesListDetailPanel";
import "../sales/sales-list-v2.css";

/**
 * Props that turn an İK AdvancedDataGrid into the list type (same as Satış / Üretim): checkbox column, a page-owned
 * current row (click, ↑/↓) that the right panel and İşlemler follow, Excel of the ticked rows. The grid keeps its
 * own extras (spreadsheet import / edit on Personel).
 */
export function hrGridSelection(
  currentId: string | null,
  onCurrentChange: (id: string | null) => void,
  exportActionsRef: MutableRefObject<GridExportActions | null>,
  isEn: boolean,
) {
  return {
    selectable: true,
    currentRowKey: currentId,
    onCurrentRowChange: onCurrentChange,
    hideExport: true,
    exportActionsRef,
    bulkActions: [
      {
        id: "export-selected",
        label: isEn ? "Excel (selected)" : "Excel (seçilenler)",
        run: () => void exportActionsRef.current?.exportExcel(),
      },
    ],
  };
}

/** Row props: double click / Enter open the record (not from the checkbox cell or a control inside the row). */
export function hrRowProps(id: string, onOpen: (id: string) => void) {
  return {
    "data-record-id": id,
    tabIndex: 0,
    onDoubleClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if ((event.target as HTMLElement).closest("button,input,select,a,.advanced-grid-select-cell")) return;
      event.preventDefault();
      onOpen(id);
    },
    onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.target !== event.currentTarget || event.defaultPrevented || event.key !== "Enter") return;
      event.preventDefault();
      onOpen(id);
    },
  };
}

/**
 * Bottom line of an İK list: hints, shown / loaded counts and, when the endpoint's fixed limit is reached, "ilk N
 * kayıt" (the lists are not paged; the endpoints return at most `cap` records).
 */
export function HrListFooter({ shown, loaded, cap, isEn }: { shown: number; loaded: number; cap: number; isEn: boolean }) {
  const number = (value: number) => value.toLocaleString(isEn ? "en-US" : "tr-TR");
  return (
    <ListFooter
      hints={
        isEn
          ? "↑↓ move · Space mark · Enter open · Double-click open"
          : "↑↓ gez · Boşluk işaretle · Enter aç · Çift tık aç"
      }
    >
      <span>
        <span>{isEn ? "Shown" : "Gösterilen"}</span>{" "}
        <span>
          {number(shown)} / {number(loaded)}
        </span>
      </span>
      {loaded >= cap && (
        <span>
          {isEn ? `first ${number(cap)} records` : `ilk ${number(cap)} kayıt`}
        </span>
      )}
    </ListFooter>
  );
}

type PanelProps = {
  /** Accessible name ("Personel özeti"). */
  label: string;
  code?: string;
  title: string;
  tags?: ReactNode;
  facts: Array<{ label: string; value: ReactNode }>;
  /** Extra lines under the facts (e.g. why an action is unavailable). */
  note?: ReactNode;
  onClose: () => void;
  closeLabel: string;
};

/** Right-hand panel of an İK list (Satış panel frame): the current row's summary from the list data. */
export function HrRecordPanel({ label, code, title, tags, facts, note, onClose, closeLabel }: PanelProps) {
  return (
    <aside className="sales-ld hr-ld" aria-label={label} tabIndex={-1}>
      <div className="sales-ld-head">
        <div className="sales-ld-top">
          <span className="nx-code">{code ?? ""}</span>
          <span className="sales-ld-actions">
            <button type="button" className="sales-ld-close" aria-label={closeLabel} title={closeLabel} onClick={onClose}>
              <X size={15} aria-hidden="true" />
            </button>
          </span>
        </div>
        <h3>{title || "—"}</h3>
        {tags && <div className="sales-ld-labels">{tags}</div>}
      </div>
      <div className="sales-ld-body">
        <SalesPanelSection title={label}>
          <SalesPanelFacts items={facts} />
        </SalesPanelSection>
        {note && <p className="sales-ld-muted">{note}</p>}
      </div>
    </aside>
  );
}
