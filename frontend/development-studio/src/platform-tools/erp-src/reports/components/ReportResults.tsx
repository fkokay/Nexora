import { ArrowLeft, Download } from 'lucide-react'
import AdvancedDataGrid from '../../AdvancedDataGrid'
import { localizedCatalogLabel, localizedText as tx } from '../../locale'
import type { Column, Definition, Result, Source } from '../reportTypes'

type Props = {
  result: Result
  source?: Source
  columns: Column[]
  resultGroupingFields: string[]
  isGrouped: boolean
  drilldownBase: Definition | null
  busy: boolean
  locale: string
  groupValue: (value: unknown, field: string) => string
  onReturnToGroups: () => void
  onExport: () => void
  onDrillIntoGroup: (values: unknown[]) => void
  onPageChange: (page: number) => void
}

export function ReportResults({ result, source, columns, resultGroupingFields, isGrouped, drilldownBase, busy, locale, groupValue, onReturnToGroups, onExport, onDrillIntoGroup, onPageChange }: Props) {
  return <section className="report-result" aria-label={tx('Rapor önizlemesi', 'Report preview')}>
    <div className="report-result-heading"><div><h3>{drilldownBase ? tx('Grup ayrıntıları', 'Group details') : tx('Sonuçlar', 'Results')}</h3><p>{isGrouped ? `${(result.totalGroups ?? 0).toLocaleString(locale)} ${tx('grup', 'groups')} · ${result.totalCount.toLocaleString(locale)} ${tx('kayıt', 'records')} · ${tx('sayfa', 'page')} ${result.page}` : `${result.totalCount.toLocaleString(locale)} ${tx('kayıt', 'records')} · ${tx('sayfa', 'page')} ${result.page}`}</p></div><div className="report-result-actions">{drilldownBase && <button className="secondary small-button" onClick={onReturnToGroups} disabled={busy}><ArrowLeft size={14} /> {tx('Gruplara dön', 'Back to groups')}</button>}<button className="secondary small-button" onClick={onExport} disabled={busy || (!result.rows.length && !result.groups?.length)}><Download size={14} /> {tx('CSV indir', 'Download CSV')}</button></div></div>
    <div className="report-table-wrap" role="region" tabIndex={0} aria-label={tx('Rapor sonuçları; yatay kaydırmak için ok tuşlarını kullanın', 'Report results; use arrow keys to scroll horizontally')}><AdvancedDataGrid externalPagination enableRowSelection={false}><caption className="report-visually-hidden">{tx('Rapor sonuçları', 'Report results')}</caption><thead><tr>{isGrouped ? <>{resultGroupingFields.map(field => <th scope="col" key={field}>{localizedCatalogLabel(columns.find(c => c.code === field)?.label ?? field)}</th>)}<th scope="col">{tx('Kayıt sayısı', 'Record count')}</th>{result.aggregate !== 'count' && <th scope="col">{localizedCatalogLabel(source?.aggregates.find(option => option.code === result.aggregate)?.label ?? tx('Değer', 'Value'))}</th>}</> : result.columns.map(c => <th scope="col" key={c.code}>{localizedCatalogLabel(c.label)}</th>)}</tr></thead><tbody>
      {isGrouped ? (result.groups ?? []).map((group, index) => { const values = group.groupValues ?? [group.groupValue]; return <tr key={index}>{resultGroupingFields.map((field, fieldIndex) => { const value = values[fieldIndex]; return <td key={field}>{value === undefined ? '—' : <button type="button" className="report-group-drill" onClick={() => onDrillIntoGroup(values)} title={tx('Bu grubun kayıt ayrıntılarını aç', 'Open this group’s record details')}>{groupValue(value, field)}</button>}</td>})}<td>{group.rowCount.toLocaleString(locale)}</td>{result.aggregate !== 'count' && <td>{group.value?.toLocaleString(locale, { maximumFractionDigits: 2 }) ?? '—'}</td>}</tr> }) : result.rows.map((row, index) => <tr key={index}>{result.columns.map(c => <td key={c.code}>{typeof row[c.code] === 'boolean' ? row[c.code] ? tx('Aktif', 'Active') : tx('Pasif', 'Inactive') : row[c.code] === null ? '—' : c.dataType === 'date' && row[c.code] ? new Date(String(row[c.code])).toLocaleDateString(locale) : String(row[c.code])}</td>)}</tr>)}
      {(isGrouped ? !result.groups?.length : !result.rows.length) && <tr><td colSpan={isGrouped ? resultGroupingFields.length + 1 + (result.aggregate === 'count' ? 0 : 1) : Math.max(result.columns.length, 1)} className="report-empty">{tx('Filtreye uygun kayıt bulunamadı.', 'No records match the filters.')}</td></tr>}
    </tbody></AdvancedDataGrid></div>
    <nav className="report-pagination" aria-label={tx('Sonuç sayfaları', 'Result pages')}><span>{isGrouped ? `${result.totalGroups ? (result.page - 1) * result.pageSize + 1 : 0}–${Math.min(result.page * result.pageSize, result.totalGroups ?? 0)} / ${result.totalGroups ?? 0} ${tx('grup', 'groups')}` : result.totalCount ? `${(result.page - 1) * result.pageSize + 1}–${Math.min(result.page * result.pageSize, result.totalCount)} / ${result.totalCount}` : tx('0 kayıt', '0 records')}</span><div><button type="button" className="secondary small-button" disabled={busy || result.page <= 1} onClick={() => onPageChange(result.page - 1)}>{tx('Önceki', 'Previous')}</button><button type="button" className="secondary small-button" disabled={busy || result.page * result.pageSize >= (isGrouped ? result.totalGroups ?? 0 : result.totalCount)} onClick={() => onPageChange(result.page + 1)}>{tx('Sonraki', 'Next')}</button></div></nav>
  </section>
}
