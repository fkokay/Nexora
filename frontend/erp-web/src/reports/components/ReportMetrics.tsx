import { localizedCatalogLabel, localizedText as tx } from '../../locale'
import type { Source } from '../reportTypes'

type Props = { isList: boolean; savedCount: number; sourceCount: number; activeFilterCount: number; visibleFieldCount: number; source?: Source; loading: boolean; locale: string }

export function ReportMetrics({ isList, savedCount, sourceCount, activeFilterCount, visibleFieldCount, source, loading, locale }: Props) {
  return <section className="report-workbench-metrics" aria-label={tx('Çalışma alanı özeti', 'Workbench summary')}>
    <article><span>{isList ? tx('Kayıtlı listeler', 'Saved lists') : tx('Kayıtlı raporlar', 'Saved reports')}</span><strong>{savedCount.toLocaleString(locale)}</strong><small>{loading ? tx('Yükleniyor…', 'Loading…') : tx('Bu firmada', 'In this company')}</small></article>
    <article><span>{tx('Veri kaynakları', 'Data sources')}</span><strong>{sourceCount.toLocaleString(locale)}</strong><small>{tx('Yetkili katalog', 'Available catalog')}</small></article>
    <article><span>{tx('Etkin filtreler', 'Active filters')}</span><strong>{activeFilterCount.toLocaleString(locale)}</strong><small>{tx('En fazla 8 koşul', 'Up to 8 conditions')}</small></article>
    <article><span>{tx('Görünen alan', 'Visible fields')}</span><strong>{visibleFieldCount.toLocaleString(locale)}</strong><small>{localizedCatalogLabel(source?.label ?? tx('Kaynak seçilmedi', 'No source selected'))}</small></article>
  </section>
}
