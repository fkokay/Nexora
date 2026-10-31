import type { FxRevaluationHeaderProps } from './types'

export default function FxRevaluationHeader({ onRefresh }: FxRevaluationHeaderProps) {
  return <div className="panel-heading"><div><h3>Dönem sonu kur değerleme fişleri</h3><p>Açık dövizli satış ve alış faturalarını dönem kuru ile değerler. Deftere aktarım için tenant hesap eşleştirmeleri gerekir; otomatik aktarım yapılmaz.</p></div><button className="secondary small-button" onClick={onRefresh}>Yenile</button></div>
}
