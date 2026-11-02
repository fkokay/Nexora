import { Filter } from 'lucide-react'
import { localizedText as tx } from '../../locale'

type Props = { isList: boolean }

export function ReportHero({ isList }: Props) {
  return <header className="report-hero screen-page-header"><div className="report-hero-mark"><Filter size={21} /></div><div><p className="eyebrow">{isList ? tx('TENANT UYARLAMA', 'TENANT CUSTOMIZATION') : tx('TENANT ANALİTİĞİ', 'TENANT ANALYTICS')}</p><h1>{isList ? tx('Dinamik liste oluşturucu', 'Dynamic list builder') : tx('Rapor oluşturucu', 'Report builder')}</h1><p>{isList ? tx('Veri kaynağı, sütun, filtre ve sıralamayı seçip çalıştırılabilir, tekrar kullanılabilir veri listeleri hazırlayın.', 'Choose a data source, columns, filters, and sorting to create runnable, reusable data lists.') : tx('ERP kayıtlarını sabit veri kaynakları, alanlar ve filtrelerle sorgulayın; rapor tanımlarını ekibiniz için saklayın.', 'Query ERP records using defined data sources, fields, and filters; save report definitions for your team.')}</p></div></header>
}
