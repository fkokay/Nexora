import { Users } from "lucide-react";
import { StatusTag } from "../../list-page/StatusTag";
import { hrStatusTone } from "../hrStatus";
import AdvancedDataGrid from "../../AdvancedDataGrid";
import { hrGridSelection, hrRowProps } from "../hrList";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { Employee, EmployeeScreenField, Translate } from "./types";

export type EmployeeGridProps = {
  rows: Employee[];
  fields: EmployeeScreenField[];
  fieldLabel: (field: EmployeeScreenField) => string;
  isEnglish: boolean;
  isAdmin: boolean;
  busy: boolean;
  search: string;
  totalCount: number;
  /** Page-level toolbar element that hosts the grid's column and pivot tools. */
  toolbarContainer?: HTMLElement | null;
  /** List-type selection (current row, ticks, Excel of the ticked rows). */
  selection: ReturnType<typeof hrGridSelection>;
  /** Double click / Enter on a row. */
  onOpen: (id: string) => void;
  onImportRows: (rows: Record<string, unknown>[]) => void | Promise<void>;
  onEditRows: (
    rows: { key: string; values: Record<string, string> }[],
  ) => void | Promise<void>;
  translate: Translate;
  statusLabel: (status: string, isEnglish: boolean) => string;
};

export default function EmployeeGrid({
  rows,
  fields,
  fieldLabel,
  isEnglish,
  isAdmin,
  search,
  totalCount,
  toolbarContainer,
  selection,
  onOpen,
  onImportRows,
  onEditRows,
  translate,
  statusLabel,
}: EmployeeGridProps) {
  return (
    <div className="hr-table-wrap">
      <AdvancedDataGrid
        hideSearch
        {...screenViewGridDefaults(fields)}
        className="hr-table hr-employee-table"
        toolbarContainer={toolbarContainer}
        onImportRows={isAdmin ? onImportRows : undefined}
        onEditRows={isAdmin ? onEditRows : undefined}
        {...selection}
      >
        <thead>
          <tr>
            {fields.map((field) => (
              <th
                key={field.key}
                style={
                  field.width
                    ? { width: field.width, minWidth: field.width }
                    : undefined
                }
              >
                {fieldLabel(field)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((employee) => (
            <tr key={employee.id} {...hrRowProps(employee.id, onOpen)}>
              {fields.map((field) => (
                <td
                  key={field.key}
                  style={
                    field.width
                      ? { width: field.width, minWidth: field.width }
                      : undefined
                  }
                  data-label={fieldLabel(field)}
                >
                  {field.key === "personnelCode" ? (
                    employee.personnelCode
                  ) : field.key === "fullName" ? (
                    <b>{employee.fullName}</b>
                  ) : field.key === "department" ? (
                    employee.department || "—"
                  ) : field.key === "jobTitle" ? (
                    employee.jobTitle || "—"
                  ) : field.key === "employmentCategory" ? (
                    employee.employmentCategory || "—"
                  ) : field.key === "status" ? (
                    <StatusTag tone={hrStatusTone(employee.status)}>
                      {statusLabel(employee.status, isEnglish)}
                    </StatusTag>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={Math.max(1, fields.length)}>
                <div className="hr-empty">
                  <Users size={20} />
                  <span>
                    {search
                      ? translate(
                          "Aramayla eşleşen personel yok.",
                          "No employees match this search.",
                        )
                      : translate("Henüz personel yok.", "No employees yet.")}
                  </span>
                  {!search && totalCount === 0 && (
                    <small>
                      {translate(
                        "İlk kaydınızı Personel ekle düğmesiyle ekleyin.",
                        "Use Add employee to create your first record.",
                      )}
                    </small>
                  )}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </AdvancedDataGrid>
    </div>
  );
}
