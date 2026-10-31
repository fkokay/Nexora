import { Users } from 'lucide-react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import type { Employee, EmployeeScreenField, Translate } from './types'

export type EmployeeGridProps = {
  rows: Employee[]
  fields: EmployeeScreenField[]
  fieldLabel: (field: EmployeeScreenField) => string
  isEnglish: boolean
  isAdmin: boolean
  busy: boolean
  search: string
  totalCount: number
  onEditEmployee: (employee: Employee) => void
  onImportRows: (rows: Record<string, unknown>[]) => void | Promise<void>
  onEditRows: (rows: { key: string; values: Record<string, string> }[]) => void | Promise<void>
  translate: Translate
  statusLabel: (status: string, isEnglish: boolean) => string
}

export default function EmployeeGrid({
  rows,
  fields,
  fieldLabel,
  isEnglish,
  isAdmin,
  busy,
  search,
  totalCount,
  onEditEmployee,
  onImportRows,
  onEditRows,
  translate,
  statusLabel,
}: EmployeeGridProps) {
  return (
    <div className="hr-table-wrap">
      <AdvancedDataGrid
        hideSearch
        className="hr-table hr-employee-table"
        onImportRows={isAdmin ? onImportRows : undefined}
        onEditRows={isAdmin ? onEditRows : undefined}
      >
        <thead>
          <tr>
            {fields.map(field => (
              <th key={field.key} style={field.width ? { width: field.width, minWidth: field.width } : undefined}>
                {fieldLabel(field)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(employee => (
            <tr key={employee.id}>
              {fields.map(field => (
                <td
                  key={field.key}
                  style={field.width ? { width: field.width, minWidth: field.width } : undefined}
                  data-label={fieldLabel(field)}
                >
                  {field.key === 'personnelCode' ? employee.personnelCode
                    : field.key === 'fullName' ? <b>{employee.fullName}</b>
                      : field.key === 'department' ? (employee.department || '—')
                        : field.key === 'jobTitle' ? (employee.jobTitle || '—')
                          : field.key === 'employmentCategory' ? (employee.employmentCategory || '—')
                            : field.key === 'status' ? <span className="hr-status">{statusLabel(employee.status, isEnglish)}</span>
                              : field.key === 'actions' && isAdmin ? (
                                <button type="button" className="secondary" disabled={busy} onClick={() => onEditEmployee(employee)}>
                                  {translate('Düzenle', 'Edit')}
                                </button>
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
                  <span>{search ? translate('Aramayla eşleşen personel yok.', 'No employees match this search.') : translate('Henüz personel yok.', 'No employees yet.')}</span>
                  {!search && totalCount === 0 && (
                    <small>{translate('İlk kaydınızı Personel ekle düğmesiyle ekleyin.', 'Use Add employee to create your first record.')}</small>
                  )}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </AdvancedDataGrid>
    </div>
  )
}
