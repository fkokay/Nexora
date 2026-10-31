import { Plus, Trash2 } from 'lucide-react'
import { localizedCatalogLabel, localizedText as tx } from '../../locale'
import type { Column, FilterRow } from '../reportTypes'

type Props = { columns: Column[]; filters: FilterRow[]; busy: boolean; onAdd: () => void; onChange: (index: number, patch: Partial<FilterRow>) => void; onRemove: (index: number) => void }

function operatorsFor(column: Column | undefined) {
  if (!column) return ['equals']
  if (column.code === 'startedByUserId') return ['equals']
  if (column.code === 'barcode' || column.code === 'category' || column.code === 'riskLimit') return ['contains', 'equals', 'gt', 'gte', 'lt', 'lte', 'isNull'].filter(op => column.dataType === 'text' ? op === 'contains' || op === 'equals' || op === 'isNull' : op !== 'contains')
  if (column.options || column.dataType === 'boolean') return ['equals']
  if (column.dataType === 'text') return ['contains', 'equals']
  if (column.dataType === 'date') return ['gt', 'gte', 'lt', 'lte']
  return ['equals', 'gt', 'gte', 'lt', 'lte']
}

function ValueInput({ column, value, busy, onChange }: { column?: Column; value: string; busy: boolean; onChange: (value: string) => void }) {
  const label = `${tx('Filtre değeri', 'Filter value')}: ${localizedCatalogLabel(column?.label ?? '')}`
  if (column?.options) return <select aria-label={label} disabled={busy} value={value} onChange={e => onChange(e.target.value)}><option value="">{tx('Seçin', 'Select')}</option>{column.options.map(option => <option value={option} key={option}>{option}</option>)}</select>
  if (column?.dataType === 'boolean') return <select aria-label={label} disabled={busy} value={value} onChange={e => onChange(e.target.value)}><option value="">{tx('Seçin', 'Select')}</option><option value="true">{tx('Aktif', 'Active')}</option><option value="false">{tx('Pasif', 'Inactive')}</option></select>
  if (column?.code === 'createdAt') return <input aria-label={label} disabled={busy} type="text" value={value} onChange={e => onChange(e.target.value)} maxLength={200} placeholder={tx('ISO tarih/saat', 'ISO date/time')} />
  return <input aria-label={label} disabled={busy} type={column?.dataType === 'date' ? 'date' : column?.dataType === 'number' || column?.dataType === 'decimal' ? 'number' : 'text'} step={column?.dataType === 'decimal' ? '0.01' : undefined} value={value} onChange={e => onChange(e.target.value)} maxLength={200} placeholder={tx('Değer', 'Value')} />
}

export function ReportFilters({ columns, filters, busy, onAdd, onChange, onRemove }: Props) {
  const columnMap = new Map(columns.map(column => [column.code, column]))
  return <>
    <div className="report-filter-head"><div><h3>{tx('Filtreler', 'Filters')}</h3><p>{tx('Tüm koşullar birlikte uygulanır.', 'All conditions are applied together.')}</p></div><button type="button" className="secondary small-button" disabled={busy || filters.length >= 8} onClick={onAdd}><Plus size={14} /> {tx('Filtre ekle', 'Add filter')}</button></div>
    {filters.map((filter, index) => { const field = columnMap.get(filter.field); const filterLabel = `${tx('Filtre', 'Filter')} ${index + 1}`; return <div className="report-filter-row" key={index}><select aria-label={`${filterLabel}: ${tx('alan', 'field')}`} disabled={busy} value={filter.field} onChange={e => { const selected = columnMap.get(e.target.value); onChange(index, { field: e.target.value, operator: operatorsFor(selected)[0], value: '' }) }}>{columns.map(column => <option value={column.code} key={column.code}>{localizedCatalogLabel(column.label)}</option>)}</select><select aria-label={`${filterLabel}: ${tx('operatör', 'operator')}`} disabled={busy} value={filter.operator} onChange={e => onChange(index, { operator: e.target.value, ...(e.target.value === 'isNull' ? { value: '' } : {}) })}>{operatorsFor(field).map(op => <option value={op} key={op}>{({ contains: tx('İçerir', 'Contains'), equals: tx('Eşittir', 'Equals'), gt: tx('Büyüktür', 'Greater than'), gte: tx('En az', 'At least'), lt: tx('Küçüktür', 'Less than'), lte: tx('En çok', 'At most'), isNull: tx('Boş', 'Is empty') } as Record<string, string>)[op]}</option>)}</select>{filter.operator === 'isNull' ? <input aria-label={`${filterLabel}: ${tx('değer', 'value')}`} type="text" disabled value="" placeholder={tx('Boş değer', 'Empty value')} /> : <ValueInput column={field} value={filter.value} busy={busy} onChange={value => onChange(index, { value })} />}<button type="button" className="report-delete-filter" aria-label={`${filterLabel}: ${tx('kaldır', 'remove')}`} disabled={busy} onClick={() => onRemove(index)}><Trash2 size={15} /></button></div> })}
  </>
}
