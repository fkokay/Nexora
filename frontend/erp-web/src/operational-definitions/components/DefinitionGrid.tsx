import AdvancedDataGrid from "../../AdvancedDataGrid";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { ScreenColumnPin } from "../../erp-types";
import type { Definition, Translate } from "../types";

export type DefinitionScreenField = {
  key: string;
  label: string;
  visible: boolean;
  position: number;
  fixed?: boolean;
  width?: number | null;
  pinned?: ScreenColumnPin | null;
};

export const defaultDefinitionFields: (DefinitionScreenField & { enLabel: string })[] = [
  { key: "kind", label: "Tür", enLabel: "Type", visible: true, position: 0 },
  { key: "code", label: "Kod", enLabel: "Code", visible: true, position: 1 },
  { key: "name", label: "Ad", enLabel: "Name", visible: true, position: 2 },
  { key: "status", label: "Durum", enLabel: "Status", visible: true, position: 3 },
  { key: "actions", label: "İşlemler", enLabel: "Actions", visible: true, position: 4, fixed: true },
];

type Props = {
  rows: Definition[];
  loading: boolean;
  busy: boolean;
  tx: Translate;
  kindName: (kind: Definition["kind"]) => string;
  onEdit: (row: Definition) => void;
  onToggle: (row: Definition) => void;
  fields?: DefinitionScreenField[];
  toolbarContainer?: HTMLElement | null;
};

export function DefinitionGrid({
  rows,
  loading,
  busy,
  tx,
  kindName,
  onEdit,
  onToggle,
  fields = defaultDefinitionFields,
  toolbarContainer,
}: Props) {
  const visibleFields = fields
    .filter((field) => field.key === "actions" || field.visible)
    .sort((a, b) =>
      a.key === "actions" ? 1 : b.key === "actions" ? -1 : a.position - b.position,
    );
  const columnSpan = Math.max(visibleFields.length, 1);
  // Tenant-relabelled columns keep the tenant's text; untouched standard labels follow the UI locale.
  const fieldLabel = (field: DefinitionScreenField) => {
    const standard = defaultDefinitionFields.find((item) => item.key === field.key);
    return standard && standard.label === field.label
      ? tx(standard.label, standard.enLabel)
      : field.label;
  };

  function renderCell(field: DefinitionScreenField, row: Definition) {
    switch (field.key) {
      case "kind":
        return <td key={field.key}>{kindName(row.kind)}</td>;
      case "code":
        return (
          <td key={field.key}>
            <b>{row.code}</b>
          </td>
        );
      case "name":
        return <td key={field.key}>{row.name}</td>;
      case "status":
        return (
          <td key={field.key}>
            {row.isActive
              ? tx("Etkin", "Active")
              : tx("Devre dışı", "Inactive")}
          </td>
        );
      case "actions":
        return (
          <td key={field.key}>
            <button
              type="button"
              className="row-action"
              disabled={busy}
              onClick={() => onEdit(row)}
            >
              {tx("Düzenle", "Edit")}
            </button>
            <button
              type="button"
              className="row-action"
              disabled={busy}
              onClick={() => onToggle(row)}
            >
              {row.isActive
                ? tx("Devre dışı bırak", "Deactivate")
                : tx("Etkinleştir", "Activate")}
            </button>
          </td>
        );
      default:
        return <td key={field.key} />;
    }
  }

  return (
    <div className="ledger-list">
      <AdvancedDataGrid
        className="customer-table"
        gridId="operational-definitions"
        {...screenViewGridDefaults(visibleFields)}
        externalPagination
        hideSearch
        enableRowSelection={false}
        toolbarContainer={toolbarContainer}
      >
        <thead>
          <tr>
            {visibleFields.map((field) => (
              <th key={field.key}>{fieldLabel(field)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {visibleFields.map((field) => renderCell(field, row))}
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columnSpan} className="table-empty">
                {tx("Seçili filtrelerle eşleşen tanım yok.", "No definitions match these filters.")}
              </td>
            </tr>
          )}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}
