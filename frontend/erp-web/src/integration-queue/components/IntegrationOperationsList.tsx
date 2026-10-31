import AdvancedDataGrid from '../../AdvancedDataGrid'
import { Ban } from 'lucide-react'

export type IntegrationOperation = {
  operationId: string
  integrationCode: string
  status: 'AwaitingApproval' | 'Queued' | 'Running' | 'Succeeded' | 'Failed' | 'Indeterminate' | 'Cancelled'
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  attempts: number
  errorCode: string | null
}

export type IntegrationOperationPage = { items: IntegrationOperation[]; page: number; pageSize: number; totalCount: number }

type Props = {
  status: string
  statuses: readonly string[]
  data: IntegrationOperationPage | null
  loading: boolean
  page: number
  totalPages: number
  selectedOperation: IntegrationOperation | null
  busyId: string
  reconciliationOutcome: 'confirmed_submitted' | 'confirmed_not_submitted'
  reconciliationReference: string
  reconciliationEvidence: string
  onStatusChange: (value: string) => void
  onSelectOperation: (operationId: string) => void
  onCancel: (operation: IntegrationOperation) => void
  onReconciliationOutcomeChange: (value: 'confirmed_submitted' | 'confirmed_not_submitted') => void
  onReconciliationReferenceChange: (value: string) => void
  onReconciliationEvidenceChange: (value: string) => void
  onReconcile: (operation: IntegrationOperation) => void
  onPageChange: (delta: number) => void
  tr: (turkish: string, english: string) => string
  locale: () => string
  statusLabel: (status: IntegrationOperation['status']) => string
}

export default function IntegrationOperationsList({
  status, statuses, data, loading, page, totalPages, selectedOperation, busyId,
  reconciliationOutcome, reconciliationReference, reconciliationEvidence,
  onStatusChange, onSelectOperation, onCancel, onReconciliationOutcomeChange,
  onReconciliationReferenceChange, onReconciliationEvidenceChange, onReconcile,
  onPageChange, tr, locale, statusLabel,
}: Props) {
  return <>
    <div className="integration-queue-toolbar">
      <div><h2>{tr('İşlem geçmişi', 'Operation history')}</h2><p className="muted">{tr('Kuyruk içeriği ve hassas istek verileri bu listede gösterilmez.', 'Queue contents and sensitive request data are not shown in this list.')}</p></div>
      <label>{tr('Durum', 'Status')}
        <select value={status} onChange={event => onStatusChange(event.target.value)}>
          {statuses.map(value => <option key={value || 'all'} value={value}>{value ? statusLabel(value as IntegrationOperation['status']) : tr('Tüm durumlar', 'All statuses')}</option>)}
        </select>
      </label>
    </div>
    <div className="integration-operations-workbench">
      <div className="integration-queue-table-wrap" role="region" aria-label={tr('Entegrasyon işlem geçmişi tablosu', 'Integration operation history table')} tabIndex={0} aria-busy={loading}>
        <AdvancedDataGrid externalPagination className="integration-queue-table">
          <caption className="integration-visually-hidden">{tr('Entegrasyon işlemlerinin durum ve deneme geçmişi', 'Status and attempt history for integration operations')}</caption>
          <thead><tr><th scope="col">{tr('Entegrasyon', 'Integration')}</th><th scope="col">{tr('Durum', 'Status')}</th><th scope="col">{tr('Oluşturulma', 'Created')}</th><th scope="col">{tr('Deneme', 'Attempt')}</th><th scope="col">{tr('Hata kodu', 'Error code')}</th><th scope="col">{tr('İşlemler', 'Actions')}</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={6} className="queue-empty" role="status">{tr('Kuyruk yükleniyor…', 'Loading queue…')}</td></tr> : !data ? <tr><td colSpan={6} className="queue-empty">{tr('Kuyruk görüntülenemiyor. Yenile düğmesini kullanın.', 'Cannot display the queue. Use Refresh to try again.')}</td></tr> : data.items.length ? data.items.map(item => <tr key={item.operationId}>
            <td><b>{item.integrationCode}</b><small className="queue-id">{item.operationId}</small></td>
            <td><span className={`queue-status status-${item.status.toLowerCase()}`}><i />{statusLabel(item.status)}</span></td>
            <td>{new Date(item.createdAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })}</td>
            <td><span>{item.attempts}</span>{['Failed', 'Indeterminate'].includes(item.status) && <small className="queue-retry-note">{tr('Otomatik tekrar yok', 'No automatic retry')}</small>}</td>
            <td>{item.errorCode || '—'}</td>
            <td><div className="queue-row-actions"><button type="button" className="secondary small-button" aria-pressed={selectedOperation?.operationId === item.operationId} onClick={() => onSelectOperation(item.operationId)}>{tr('Ayrıntı', 'Details')}</button>{['Queued', 'AwaitingApproval'].includes(item.status) && <button className="secondary small-button queue-cancel" disabled={busyId === item.operationId} onClick={() => onCancel(item)}><Ban size={14} />{busyId === item.operationId ? tr('İptal ediliyor…', 'Cancelling…') : tr('İptal et', 'Cancel')}</button>}</div></td>
          </tr>) : <tr><td colSpan={6} className="queue-empty">{tr('Bu filtrede işlem bulunmuyor.', 'No operations match this filter.')}</td></tr>}</tbody>
        </AdvancedDataGrid>
      </div>
      {selectedOperation && <aside className="integration-operation-inspector" aria-label={tr('Seçili kuyruk işlemi', 'Selected queue operation')}>
        <div className="integration-inspector-heading"><div><p className="eyebrow">{tr('SEÇİLİ İŞLEM', 'SELECTED OPERATION')}</p><h3>{selectedOperation.integrationCode}</h3><small className="queue-id">{selectedOperation.operationId}</small></div><span className={`queue-status status-${selectedOperation.status.toLowerCase()}`}><i />{statusLabel(selectedOperation.status)}</span></div>
        <dl><div><dt>{tr('Oluşturulma', 'Created')}</dt><dd>{new Date(selectedOperation.createdAt).toLocaleString(locale())}</dd></div><div><dt>{tr('Son güncelleme', 'Last updated')}</dt><dd>{new Date(selectedOperation.updatedAt).toLocaleString(locale())}</dd></div><div><dt>{tr('Başladı', 'Started')}</dt><dd>{selectedOperation.startedAt ? new Date(selectedOperation.startedAt).toLocaleString(locale()) : '—'}</dd></div><div><dt>{tr('Tamamlandı', 'Completed')}</dt><dd>{selectedOperation.completedAt ? new Date(selectedOperation.completedAt).toLocaleString(locale()) : '—'}</dd></div><div><dt>{tr('Deneme sayısı', 'Attempts')}</dt><dd>{selectedOperation.attempts}</dd></div><div><dt>{tr('Hata kodu', 'Error code')}</dt><dd>{selectedOperation.errorCode || '—'}</dd></div></dl>
        <p>{tr('İstek gövdesi ve hassas belge verileri kuyruk ayrıntısında gösterilmez.', 'Request bodies and sensitive document data are not shown in queue details.')}</p>
        {['Queued', 'AwaitingApproval'].includes(selectedOperation.status) && <button className="secondary queue-cancel" disabled={busyId === selectedOperation.operationId} onClick={() => onCancel(selectedOperation)}><Ban size={14} /> {tr('İptal et', 'Cancel')}</button>}
      </aside>}
    </div>
    {selectedOperation?.integrationCode === 'tr.e-document.submit' && selectedOperation.status === 'Indeterminate' && <section className="integration-reconciliation" aria-label={tr('Dış sağlayıcıyla mutabakat', 'Reconcile with external provider')}>
      <h3>{tr('Dış sağlayıcıyla mutabakat', 'Reconcile with external provider')}</h3><p>{tr('Önce sağlayıcı portalında bu aynı belgeyi bulun. Taslağı oluşturan kişiden farklı bir firma yöneticisi doğruladığı sonucu kaydetmelidir.', 'First locate this document in the provider portal. A company administrator different from the draft creator must record the verified outcome.')}</p>
      <label>{tr('Doğrulanan sonuç', 'Verified outcome')}<select value={reconciliationOutcome} onChange={event => onReconciliationOutcomeChange(event.target.value as Props['reconciliationOutcome'])}><option value="confirmed_submitted">{tr('Sağlayıcıda gönderildi', 'Submitted at provider')}</option><option value="confirmed_not_submitted">{tr('Sağlayıcıda gönderilmedi', 'Not submitted at provider')}</option></select></label>
      {reconciliationOutcome === 'confirmed_submitted' && <label>{tr('Sağlayıcı belge referansı', 'Provider document reference')}<input maxLength={200} value={reconciliationReference} onChange={event => onReconciliationReferenceChange(event.target.value)} /></label>}
      <label>{tr('Kontrol kanıtı özeti', 'Evidence summary of the check')}<textarea minLength={10} maxLength={1000} rows={3} value={reconciliationEvidence} onChange={event => onReconciliationEvidenceChange(event.target.value)} placeholder={tr('Örn. sağlayıcı portalında belge numarasıyla arandı ve durum doğrulandı.', 'E.g. searched by document number in the provider portal and verified the status.')} /></label>
      <small>{tr('Özete secret, PIN, kişisel veri veya sağlayıcı yanıt gövdesi eklemeyin. Kayıt şifreli saklanır; işlem yeniden gönderilmez.', 'Do not include secrets, PINs, personal data, or provider response bodies. The record is stored encrypted; the operation is not resubmitted.')}</small>
      <button className="primary" disabled={busyId === selectedOperation.operationId} onClick={() => onReconcile(selectedOperation)}>{busyId === selectedOperation.operationId ? tr('Kaydediliyor…', 'Saving…') : tr('Doğrulanmış sonucu kaydet', 'Record verified outcome')}</button>
    </section>}
    <footer className="integration-queue-pagination"><span>{data ? `${data.totalCount} ${tr('işlem · Sayfa', 'operations · Page')} ${page}/${totalPages}` : '—'}</span><div><button className="secondary small-button" disabled={page <= 1 || loading} onClick={() => onPageChange(-1)}>{tr('Önceki', 'Previous')}</button><button className="secondary small-button" disabled={page >= totalPages || loading} onClick={() => onPageChange(1)}>{tr('Sonraki', 'Next')}</button></div></footer>
  </>
}
