import { Children, cloneElement, isValidElement, useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import ScreenViewGroupHeader from './ScreenViewGroupHeader'
import AdvancedDataGrid from './AdvancedDataGrid'
import { api } from './erpApi'
import type { BuiltInScreenLayoutField, FinanceGridColumn } from './erp-types'

export function groupBuiltInScreenFields(fields: BuiltInScreenLayoutField[]) {
  if (!fields.some(field => field.section?.trim())) return []
  return fields.reduce<{ label: string; count: number }[]>((groups, field) => {
    const label = field.section?.trim() || 'Genel'
    const current = groups[groups.length - 1]
    if (current?.label === label) current.count++
    else groups.push({ label, count: 1 })
    return groups
  }, [])
}

export function FinanceStudioGrid({ token, screenKey, defaults, children }: { token: string; screenKey: string; defaults: FinanceGridColumn[]; children: ReactNode }) {
  const [fields, setFields] = useState<BuiltInScreenLayoutField[]>(defaults.map((field, position) => ({ ...field, visible: true, position })))
  useEffect(() => {
    let cancelled = false
    api<{ fields: BuiltInScreenLayoutField[] }>(`/api/screen-views/${screenKey}/active`, token)
      .then(view => { if (!cancelled && view.fields?.length) setFields(view.fields.map((field, index) => ({ ...field, fixed: field.fixed || field.key === 'actions', position: field.position ?? index }))) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [screenKey, token])

  const table = Children.toArray(children).find(child => isValidElement(child)) as ReactElement<{ children?: ReactNode; className?: string }> | undefined
  if (!table) return <>{children}</>
  const active = fields.filter(field => field.fixed || field.visible).sort((a, b) => a.position - b.position)
  const tableChildren = Children.toArray(table.props.children)
  const head = tableChildren.find(child => isValidElement(child) && child.type === 'thead') as ReactElement<{ children?: ReactNode }> | undefined
  const body = tableChildren.find(child => isValidElement(child) && child.type === 'tbody') as ReactElement<{ children?: ReactNode }> | undefined
  if (!head || !body) return <AdvancedDataGrid className={table.props.className || 'customer-table'} gridId={`studio-finance-${screenKey}`}>{children}</AdvancedDataGrid>

  const headerRows = Children.toArray(head.props.children)
  const dataHeaderIndex = headerRows.findIndex(row => isValidElement(row) && Children.toArray((row.props as { children?: ReactNode }).children).some(cell => isValidElement(cell) && cell.type === 'th'))
  const hasMergedHeaders = headerRows.some(row => isValidElement(row) && Children.toArray((row.props as { children?: ReactNode }).children).some(cell => isValidElement(cell) && Number((cell.props as { colSpan?: number; rowSpan?: number }).colSpan || 1) > 1 || isValidElement(cell) && Number((cell.props as { rowSpan?: number }).rowSpan || 1) > 1))
  const sourceKeys = defaults.map(field => field.key)
  const headerColumnCount = hasMergedHeaders || dataHeaderIndex < 0 ? defaults.length : Children.toArray((headerRows[dataHeaderIndex] as ReactElement<{ children?: ReactNode }>).props.children).length
  const visibleFields = active.filter(field => sourceKeys.slice(0, headerColumnCount).includes(field.key))
  const orderedKeys = visibleFields.map(field => field.key)
  const groupRow = groupBuiltInScreenFields(visibleFields).length > 0
    ? <ScreenViewGroupHeader key={`groups-${screenKey}`} fields={visibleFields}/>
    : null
  const remapRow = (row: ReactNode, isHeader = false): ReactNode => {
    if (!isValidElement(row) || row.type !== 'tr') return row
    const rowProps = row.props as { children?: ReactNode; className?: string }
    const cells = Children.toArray(rowProps.children)
    if (cells.some(cell => isValidElement(cell) && Number((cell.props as { colSpan?: number }).colSpan || 1) > 1)) return row
    const byKey = new Map<string, ReactNode>()
    cells.forEach((cell, index) => { const field = defaults[index]; if (field) byKey.set(field.key, cell) })
    const orderedCells = orderedKeys.map(key => {
      const cell = byKey.get(key)
      if (!cell || !isValidElement(cell)) return cell
      const field = visibleFields.find(item => item.key === key)
      const cellElement = cell as ReactElement<{ children?: ReactNode; style?: CSSProperties }>
      const style = field?.width ? { ...cellElement.props.style, width: `${field.width}px`, minWidth: `${field.width}px` } : cellElement.props.style
      return isHeader && field
        ? cloneElement(cellElement, { children: field.label, style })
        : field?.width ? cloneElement(cellElement, { style }) : cell
    }).filter(Boolean)
    return cloneElement(row as ReactElement<{ children?: ReactNode }>, { children: orderedCells })
  }
  const nextHeadRows = hasMergedHeaders
    ? [<tr key={`headers-${screenKey}`}>{visibleFields.map(field => <th key={field.key}>{field.label}</th>)}</tr>]
    : headerRows.map((row, index) => index === dataHeaderIndex ? remapRow(row, true) : row)
  if (groupRow && dataHeaderIndex >= 0) nextHeadRows.splice(dataHeaderIndex, 0, groupRow)
  const nextBodyRows = Children.toArray(body.props.children).map(row => remapRow(row))
  const nextTable = cloneElement(table, { children: <><thead>{nextHeadRows}</thead><tbody>{nextBodyRows}</tbody></> })
  return <AdvancedDataGrid className={table.props.className || 'customer-table'} gridId={`studio-finance-${screenKey}`}>{nextTable}</AdvancedDataGrid>
}
