import AdvancedDataGrid from './AdvancedDataGrid'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Ban, RefreshCw, ShieldCheck } from 'lucide-react'
import { localizedText } from './locale'
import './integration-queue.css'

type IntegrationOperation = {
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

type IntegrationOperationPage = { items: IntegrationOperation[]; page: number; pageSize: number; totalCount: number }
type EDocumentSubmission = { operationId: string; documentType: string; documentId: string; documentNumber: string; issueDate: string; currencyCode: string; status: string; createdAt: string; requestedByUserId: string }
type EDocumentSubmissionDetail = { documentType: string; documentId: string; documentNumber: string; issueDate: string; currencyCode: string; document: Record<string, unknown> }
type EDocumentSourceDocument = { id: string; number: string; issueDate: string; currencyCode: string; counterpartyName: string; total: number; status: string }
type Props = {
  token: string
  requestApi: <T>(url: string, token?: string, init?: RequestInit) => Promise<T>
}
const statuses = ['', 'AwaitingApproval', 'Queued', 'Running', 'Succeeded', 'Failed', 'Indeterminate', 'Cancelled'] as const
const tr = (turkish: string, english: string) => localizedText(turkish, english)
const locale = () => localizedText('tr-TR', 'en-US')
function statusLabel(status: IntegrationOperation['status']) {
  const labels: Record<IntegrationOperation['status'], [string, string]> = {
    AwaitingApproval: ['Onay bekliyor', 'Awaiting approval'], Queued: ['Kuyrukta', 'Queued'], Running: ['Çalışıyor', 'Running'], Succeeded: ['Başarılı', 'Succeeded'], Failed: ['Başarısız', 'Failed'], Indeterminate: ['Sonuç belirsiz', 'Indeterminate'], Cancelled: ['İptal edildi', 'Cancelled'],
  }
  return tr(...labels[status])
}
function documentTypeLabel(type: string) {
  const labels: Record<string, [string, string]> = {
    'e-invoice': ['e-Fatura', 'e-Invoice'],
    'e-dispatch': ['e-İrsaliye', 'e-Dispatch'],
    'e-archive': ['e-Arşiv', 'e-Archive'],
  }
  const label = labels[type]
  return label ? tr(...label) : type
}

async function fetchQueue<T>(url: string, token: string, requestApi: Props['requestApi'], init?: RequestInit): Promise<T> {
  try {
    return await requestApi<T>(url, token, init)
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('(409)'))
      throw new Error(tr('İşlem durumu değişti. Listeyi yenileyin.', 'The operation status changed. Refresh the list.'))
    throw cause
  }
}

export default function IntegrationQueuePage({ token, requestApi }: Props) {
  const [status, setStatus] = useState('')
  const [selectedOperationId, setSelectedOperationId] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<IntegrationOperationPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reconciliationOutcome, setReconciliationOutcome] = useState<'confirmed_submitted' | 'confirmed_not_submitted'>('confirmed_submitted')
  const [reconciliationReference, setReconciliationReference] = useState('')
  const [reconciliationEvidence, setReconciliationEvidence] = useState('')
  const [submissions, setSubmissions] = useState<EDocumentSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(true)
  const [submissionsError, setSubmissionsError] = useState('')
  const [documentType, setDocumentType] = useState('e-invoice')
  const [sourceDocuments, setSourceDocuments] = useState<EDocumentSourceDocument[]>([])
  const [sourceDocumentsLoading, setSourceDocumentsLoading] = useState(true)
  const [sourceDocumentsError, setSourceDocumentsError] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [sourcePreview, setSourcePreview] = useState<EDocumentSubmissionDetail | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reviewItem, setReviewItem] = useState<EDocumentSubmission | null>(null)
  const [reviewDetail, setReviewDetail] = useState<EDocumentSubmissionDetail | null>(null)
  const submissionIdempotencyKey = useRef('')
  const submissionBody = useRef('')

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    setSubmissionsLoading(true)
    setSubmissionsError('')
    const query = new URLSearchParams({ page: String(page), pageSize: '25' })
    if (status) query.set('status', status)
    const [queueResult, submissionsResult] = await Promise.allSettled([
      fetchQueue<IntegrationOperationPage>(`/api/integrations/operations?${query}`, token, requestApi, { signal }),
      fetchQueue<EDocumentSubmission[]>('/api/e-documents/submissions', token, requestApi, { signal }),
    ])
    if (signal?.aborted) return
    if (queueResult.status === 'fulfilled') setData(queueResult.value)
    else setError(queueResult.reason instanceof Error ? queueResult.reason.message : tr('Kuyruk yüklenemedi.', 'Could not load the queue.'))
    if (submissionsResult.status === 'fulfilled') setSubmissions(submissionsResult.value)
    else setSubmissionsError(submissionsResult.reason instanceof Error ? submissionsResult.reason.message : tr('Onay bekleyen gönderimler yüklenemedi.', 'Could not load pending submissions.'))
    setLoading(false)
    setSubmissionsLoading(false)
  }, [page, status, token, requestApi])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  useEffect(() => {
    const controller = new AbortController()
    setDocumentId('')
    setSourcePreview(null)
    setSourceDocuments([])
    setSourceDocumentsError('')
    setSourceDocumentsLoading(true)
    void fetchQueue<EDocumentSourceDocument[]>(`/api/e-documents/source-documents?documentType=${encodeURIComponent(documentType)}`, token, requestApi, { signal: controller.signal })
      .then((items: EDocumentSourceDocument[]) => setSourceDocuments(items))
      .catch(cause => { if (!controller.signal.aborted) setSourceDocumentsError(cause instanceof Error ? cause.message : tr('ERP belgeleri yüklenemedi.', 'Could not load ERP documents.')) })
      .finally(() => { if (!controller.signal.aborted) setSourceDocumentsLoading(false) })
    return () => controller.abort()
  }, [documentType, token, requestApi])

  async function cancel(item: IntegrationOperation) {
    if (!['Queued', 'AwaitingApproval'].includes(item.status) || !window.confirm(tr(`${item.integrationCode} işlemini iptal etmek istiyor musunuz?`, `Do you want to cancel operation ${item.integrationCode}?`))) return
    setBusyId(item.operationId)
    setError('')
    setNotice('')
    try {
      await fetchQueue(`/api/integrations/operations/${item.operationId}/cancel`, token, requestApi, { method: 'POST' })
      setNotice(tr('Kuyrukta bekleyen işlem iptal edildi.', 'The queued operation was cancelled.'))
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : tr('İşlem iptal edilemedi.', 'Could not cancel the operation.'))
    } finally {
      setBusyId('')
    }
  }

  async function prepareSubmission(event: FormEvent) {
    event.preventDefault()
    setError(''); setNotice('')
    if (!documentId) { setError(tr('Önce gönderime hazırlanacak ERP belgesini seçin.', 'Select the ERP document to prepare for submission first.')); return }
    setSubmitting(true)
    try {
      const body = JSON.stringify({ documentType, documentId })
      if (body !== submissionBody.current) { submissionBody.current = body; submissionIdempotencyKey.current = crypto.randomUUID() }
      await fetchQueue('/api/e-documents/submissions', token, requestApi, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': submissionIdempotencyKey.current }, body })
      submissionIdempotencyKey.current = ''; submissionBody.current = ''
      setNotice(tr('Taslak hazırlandı. Dış sağlayıcıya gönderim için farklı bir yönetici onayı gerekiyor.', 'The draft is ready. Approval from another administrator is required before sending it to the external provider.'))
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr('E-belge taslağı oluşturulamadı.', 'Could not create the e-document draft.')) }
    finally { setSubmitting(false) }
  }

  async function previewSourceDocument() {
    if (!documentId) return
    setPreviewing(true); setError(''); setNotice(''); setSourcePreview(null)
    try {
      const preview = await fetchQueue<EDocumentSubmissionDetail>(`/api/e-documents/source-documents/${encodeURIComponent(documentType)}/${documentId}/preview`, token, requestApi)
      setSourcePreview(preview)
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr('Belge önizlemesi yüklenemedi.', 'Could not load the document preview.')) }
    finally { setPreviewing(false) }
  }

  async function reviewSubmission(item: EDocumentSubmission) {
    setBusyId(item.operationId); setError(''); setReviewItem(null); setReviewDetail(null)
    try {
      const detail = await fetchQueue<EDocumentSubmissionDetail>(`/api/e-documents/submissions/${item.operationId}`, token, requestApi)
      setReviewItem(item); setReviewDetail(detail)
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr('Belge ayrıntıları yüklenemedi.', 'Could not load the document details.')) }
    finally { setBusyId('') }
  }

  async function approveSubmission() {
    const item = reviewItem
    const detail = reviewDetail
    if (!item || !detail || !window.confirm(tr(`${detail.documentType} ${detail.documentNumber} belgesini dış sağlayıcıya gönderilmek üzere onaylıyor musunuz? Bu işlem dış sistemde sonuç doğurabilir.`, `Approve ${detail.documentType} ${detail.documentNumber} for external submission? This action may have effects in the external system.`))) return
    setBusyId(item.operationId); setError(''); setNotice('')
    try {
      await fetchQueue(`/api/e-documents/submissions/${item.operationId}/approve`, token, requestApi, { method: 'POST' })
      setNotice(tr('Gönderim onaylandı ve güvenli entegrasyon kuyruğuna alındı.', 'The submission was approved and added to the secure integration queue.'))
      setReviewItem(null); setReviewDetail(null)
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr('Gönderim onaylanamadı.', 'Could not approve the submission.')) }
    finally { setBusyId('') }
  }

  async function reconcileIndeterminate(item: IntegrationOperation) {
    const confirmedSubmitted = reconciliationOutcome === 'confirmed_submitted'
    if (confirmedSubmitted && !reconciliationReference.trim()) {
      setError(tr('Gönderildi olarak kapatmak için sağlayıcı referansını girin.', 'Enter the provider reference to close this as submitted.'))
      return
    }
    if (reconciliationEvidence.trim().length < 10) {
      setError(tr('Dış sağlayıcıda yaptığınız kontrolü en az 10 karakterle açıklayın.', 'Describe the check performed in the external provider portal (at least 10 characters).'))
      return
    }
    const decision = confirmedSubmitted
      ? tr('Bu belgeyi dış sağlayıcıda gönderilmiş olarak kaydedin?', 'Record this document as submitted in the external provider?')
      : tr('Dış sağlayıcıda gönderilmediğini doğruladınız mı? İşlem gönderilmedi olarak kapatılacak ve otomatik tekrar yapılmayacak.', 'Have you confirmed it was not submitted in the external provider? The operation will close as not submitted and will not be retried automatically.')
    if (!window.confirm(decision)) return
    setBusyId(item.operationId); setError(''); setNotice('')
    try {
      await fetchQueue(`/api/e-documents/submissions/${item.operationId}/reconcile`, token, requestApi, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: reconciliationOutcome, externalReference: reconciliationReference.trim() || null, evidenceSummary: reconciliationEvidence.trim() }),
      })
      setNotice(confirmedSubmitted
        ? tr('Gönderim sağlayıcı referansı ile kapatıldı. Mutabakat kaydı şifreli saklandı.', 'Submission reconciled with the provider reference. The reconciliation record is stored encrypted.')
        : tr('İşlem “sağlayıcıda gönderilmedi” olarak kapatıldı. Otomatik yeniden gönderim yapılmadı.', 'Operation was closed as “not submitted at provider.” No automatic resubmission was made.'))
      setReconciliationReference(''); setReconciliationEvidence('')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : tr('Belirsiz gönderim mutabakatı kaydedilemedi.', 'Could not save the indeterminate submission reconciliation.')) }
    finally { setBusyId('') }
  }

  const totalPages = Math.max(1, Math.ceil((data?.totalCount || 0) / 25))
  const selectedOperation = data?.items.find(item => item.operationId === selectedOperationId) ?? data?.items[0] ?? null
  return <div className="integration-queue-page">
    <div className="page-heading">
      <div><p className="eyebrow">{tr('YÖNETİM · ENTEGRASYONLAR', 'ADMINISTRATION · INTEGRATIONS')}</p><h1>{tr('Entegrasyon kuyruğu', 'Integration queue')}</h1><p className="muted">{tr('Firma işlemlerini izleyin; yalnızca henüz çalışmamış işleri iptal edin.', 'Monitor company operations; cancel only work that has not started.')}</p></div>
      <button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'queue-spin' : ''}/> {tr('Yenile', 'Refresh')}</button>
    </div>
    <section className="integration-queue-kpis" aria-label={tr('Kuyruk özeti', 'Queue summary')} aria-live="polite"><article><span>{tr('Filtredeki kayıt', 'Filtered records')}</span><b>{data?.totalCount ?? '—'}</b><small>{status ? statusLabel(status as IntegrationOperation['status']) : tr('Tüm durumlar', 'All statuses')}</small></article><article><span>{tr('Çalışıyor', 'Running')}</span><b>{data?.items.filter(item=>item.status==='Running').length ?? '—'}</b><small>{tr('Bu sayfadaki kayıtlar', 'Records on this page')}</small></article><article><span>{tr('Başarısız / belirsiz', 'Failed / indeterminate')}</span><b>{data?.items.filter(item=>['Failed','Indeterminate'].includes(item.status)).length ?? '—'}</b><small>{tr('Operatör incelemesi', 'Operator review')}</small></article><article><span>{tr('Onay bekleyen belge', 'Documents awaiting approval')}</span><b>{submissionsLoading?'—':submissions.length}</b><small>{tr('E-belge taslakları', 'E-document drafts')}</small></article></section>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <section className="panel integration-queue-panel">
      <div className="integration-queue-toolbar"><div><h2>{tr('E-belge gönderim taslağı', 'E-document submission draft')}</h2><p className="muted">{tr('Sağlayıcıdan bağımsız sözleşme: e-Fatura, e-İrsaliye veya e-Arşiv. Taslaklar farklı bir firma yöneticisi onaylamadan gönderilmez.', 'Provider-neutral workflow for e-invoice, e-dispatch, or e-archive. Drafts cannot be sent until another company administrator approves them.')}</p></div></div>
      <form className="integration-edoc-form" onSubmit={event => void prepareSubmission(event)} aria-busy={sourceDocumentsLoading || submitting}>
        <label>{tr('Belge türü', 'Document type')}<select value={documentType} onChange={event => setDocumentType(event.target.value)}><option value="e-invoice">e-Fatura</option><option value="e-dispatch">e-İrsaliye</option><option value="e-archive">e-Arşiv</option></select></label>
        <label className="integration-edoc-payload">{tr('ERP belgesi', 'ERP document')}<select required value={documentId} disabled={sourceDocumentsLoading || Boolean(sourceDocumentsError)} onChange={event => { setDocumentId(event.target.value); setSourcePreview(null) }}><option value="">{sourceDocumentsLoading ? tr('Belgeler yükleniyor…', 'Loading documents…') : tr('Belge seçin', 'Select a document')}</option>{sourceDocuments.map(item => <option key={item.id} value={item.id}>{item.number} · {new Date(item.issueDate).toLocaleDateString(locale())} · {item.counterpartyName} · {new Intl.NumberFormat(locale(), { style: 'currency', currency: item.currencyCode }).format(item.total)}</option>)}</select></label>
        {sourceDocumentsError ? <p className="integration-inline-error" role="alert">{tr('ERP belgeleri yüklenemedi:', 'Could not load ERP documents:')} {sourceDocumentsError}</p> : !sourceDocumentsLoading && !sourceDocuments.length && <p className="muted" role="status">{tr('Bu türde gönderime hazırlanabilecek açık ERP belgesi bulunamadı.', 'No open ERP documents are available to prepare for this type.')}</p>}
        <button type="button" className="secondary" disabled={!documentId || previewing} onClick={() => void previewSourceDocument()}>{previewing ? tr('Önizleme yükleniyor…', 'Loading preview…') : tr('Belge içeriğini önizle', 'Preview document')}</button>
        <button className="primary" disabled={submitting || !documentId}>{submitting ? tr('Taslak hazırlanıyor…', 'Preparing draft…') : tr('Onay için taslak oluştur', 'Create draft for approval')}</button>
      </form>
      <p className="muted">{tr('Ürün kararı gerekli: Aynı ERP belgesi yeni bir operasyon anahtarıyla tekrar taslaklanabilir. Belge düzeyinde yinelenen gönderimlerin engellenip engellenmeyeceği belirlenmeli.', 'Product decision required: the same ERP document can be drafted again with a new operation key. Decide whether duplicate submissions should be blocked at document level.')}</p>
      {sourcePreview && <div className="integration-edoc-review" role="region" aria-label={tr('E-belge taslak önizlemesi', 'E-document draft preview')}>
        <div><h3>{tr('Sağlayıcıya hazırlanacak belge', 'Document prepared for the provider')}</h3><p className="muted">{documentTypeLabel(sourcePreview.documentType)} · {sourcePreview.documentNumber} · {new Date(sourcePreview.issueDate).toLocaleDateString(locale())} · {sourcePreview.currencyCode}</p></div>
        <pre>{JSON.stringify(sourcePreview.document, null, 2)}</pre>
        <p className="muted">{tr('Bu yalnızca kaynak ERP verisinin önizlemesidir. Resmî e-belge şeması, sağlayıcı eşlemesi veya GİB kabulü anlamına gelmez.', 'This is only a preview of source ERP data. It does not imply an official e-document schema, provider mapping, or GİB acceptance.')}</p>
      </div>}
      <div className="boundary-note"><ShieldCheck size={16}/><span>{tr('Bu temel katman veriyi yalnızca şifreli kuyrukta saklar. Gerçek sağlayıcı, alan eşlemesi, sandbox kabulü ve mevzuat uyumu ayrıca doğrulanmalıdır.', 'This foundation stores data only in the encrypted queue. A real provider, field mapping, sandbox acceptance, and regulatory compliance must be validated separately.')}</span></div>
    </section>
    <section className="panel integration-queue-panel">
      <div className="integration-queue-toolbar"><div><h2>{tr('Onay bekleyen gönderimler', 'Submissions awaiting approval')}</h2><p className="muted">{tr('Onaylayan kişi taslağı oluşturan kişiden farklı olmalıdır.', 'The approver must be different from the person who created the draft.')}</p></div></div>
      {submissionsError && <div className="integration-inline-error" role="alert">{tr('Onay bekleyen gönderimler yüklenemedi:', 'Could not load pending submissions:')} {submissionsError}</div>}
      <div className="integration-queue-table-wrap" role="region" aria-label={tr('Onay bekleyen gönderim tablosu', 'Submissions awaiting approval table')} tabIndex={0} aria-busy={submissionsLoading}>
        <AdvancedDataGrid className="integration-queue-table"><caption className="integration-visually-hidden">{tr('Onay bekleyen e-belge gönderimleri', 'E-document submissions awaiting approval')}</caption><thead><tr><th scope="col">{tr('Tür', 'Type')}</th><th scope="col">{tr('Belge', 'Document')}</th><th scope="col">{tr('Düzenleme tarihi', 'Issue date')}</th><th scope="col">{tr('Para birimi', 'Currency')}</th><th scope="col">{tr('Hazırlanma', 'Prepared')}</th><th scope="col">{tr('İşlemler', 'Actions')}</th></tr></thead><tbody>
        {submissionsLoading ? <tr><td colSpan={6} className="queue-empty" role="status">{tr('Onay bekleyen gönderimler yükleniyor…', 'Loading submissions awaiting approval…')}</td></tr> : submissionsError ? <tr><td colSpan={6} className="queue-empty">{tr('Gönderim listesi görüntülenemiyor. Yenile düğmesini kullanın.', 'Cannot display the submission list. Use Refresh to try again.')}</td></tr> : submissions.length ? submissions.map(item => <tr key={item.operationId}><td>{documentTypeLabel(item.documentType)}</td><td><b>{item.documentNumber}</b><small className="queue-id">{item.documentId}</small></td><td>{new Date(item.issueDate).toLocaleDateString(locale())}</td><td>{item.currencyCode}</td><td>{new Date(item.createdAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })}</td><td><button type="button" className="primary small-button" disabled={busyId === item.operationId} onClick={() => void reviewSubmission(item)}>{busyId === item.operationId ? tr('Yükleniyor…', 'Loading…') : tr('İncele', 'Review')}</button></td></tr>) : <tr><td colSpan={6} className="queue-empty">{tr('Onay bekleyen gönderim yok.', 'No submissions are awaiting approval.')}</td></tr>}
      </tbody></AdvancedDataGrid></div>
      {reviewItem && reviewDetail && <div className="integration-edoc-review" role="region" aria-label={tr('E-belge gönderim incelemesi', 'E-document submission review')}>
        <div><h3>{tr('Gönderim içeriğini inceleyin', 'Review submission content')}</h3><p className="muted">{documentTypeLabel(reviewDetail.documentType)} · {reviewDetail.documentNumber} · {new Date(reviewDetail.issueDate).toLocaleDateString(locale())} · {reviewDetail.currencyCode}</p></div>
        <pre>{JSON.stringify(reviewDetail.document, null, 2)}</pre>
        <p className="muted">{tr('Gönderen yönetici:', 'Requested by:')} {reviewItem.requestedByUserId}. {tr('Dış sağlayıcıya iletim ancak bu farklı yönetici onayladıktan sonra başlar.', 'Submission to the external provider begins only after a different administrator approves it.')}</p>
        <div className="integration-edoc-review-actions"><button className="secondary" onClick={() => { setReviewItem(null); setReviewDetail(null) }}>{tr('Kapat', 'Close')}</button><button className="primary" disabled={busyId === reviewItem.operationId} onClick={() => void approveSubmission()}>{busyId === reviewItem.operationId ? tr('Onaylanıyor…', 'Approving…') : tr('İnceledim, gönderimi onayla', 'I reviewed it, approve submission')}</button></div>
      </div>}
    </section>
    <section className="panel integration-queue-panel">
      <div className="integration-queue-toolbar">
        <div><h2>{tr('İşlem geçmişi', 'Operation history')}</h2><p className="muted">{tr('Kuyruk içeriği ve hassas istek verileri bu listede gösterilmez.', 'Queue contents and sensitive request data are not shown in this list.')}</p></div>
        <label>{tr('Durum', 'Status')}
          <select value={status} onChange={event => { setPage(1); setStatus(event.target.value) }}>
            {statuses.map(value => <option key={value || 'all'} value={value}>{value ? statusLabel(value as IntegrationOperation['status']) : tr('Tüm durumlar', 'All statuses')}</option>)}
          </select>
        </label>
      </div>
      <div className="integration-operations-workbench">
      <div className="integration-queue-table-wrap" role="region" aria-label={tr('Entegrasyon işlem geçmişi tablosu', 'Integration operation history table')} tabIndex={0} aria-busy={loading}>
        <AdvancedDataGrid  className="integration-queue-table">
          <caption className="integration-visually-hidden">{tr('Entegrasyon işlemlerinin durum ve deneme geçmişi', 'Status and attempt history for integration operations')}</caption>
          <thead><tr><th scope="col">{tr('Entegrasyon', 'Integration')}</th><th scope="col">{tr('Durum', 'Status')}</th><th scope="col">{tr('Oluşturulma', 'Created')}</th><th scope="col">{tr('Deneme', 'Attempt')}</th><th scope="col">{tr('Hata kodu', 'Error code')}</th><th scope="col">{tr('İşlemler', 'Actions')}</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={6} className="queue-empty" role="status">{tr('Kuyruk yükleniyor…', 'Loading queue…')}</td></tr> : !data ? <tr><td colSpan={6} className="queue-empty">{tr('Kuyruk görüntülenemiyor. Yenile düğmesini kullanın.', 'Cannot display the queue. Use Refresh to try again.')}</td></tr> : data.items.length ? data.items.map(item => <tr key={item.operationId}>
            <td><b>{item.integrationCode}</b><small className="queue-id">{item.operationId}</small></td>
            <td><span className={`queue-status status-${item.status.toLowerCase()}`}><i/>{statusLabel(item.status)}</span></td>
            <td>{new Date(item.createdAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' })}</td>
            <td><span>{item.attempts}</span>{['Failed', 'Indeterminate'].includes(item.status) && <small className="queue-retry-note">{tr('Otomatik tekrar yok', 'No automatic retry')}</small>}</td>
            <td>{item.errorCode || '—'}</td>
            <td><div className="queue-row-actions"><button type="button" className="secondary small-button" aria-pressed={selectedOperation?.operationId===item.operationId} onClick={()=>setSelectedOperationId(item.operationId)}>{tr('Ayrıntı', 'Details')}</button>{['Queued', 'AwaitingApproval'].includes(item.status) && <button className="secondary small-button queue-cancel" disabled={busyId === item.operationId} onClick={() => void cancel(item)}><Ban size={14}/>{busyId === item.operationId ? tr('İptal ediliyor…', 'Cancelling…') : tr('İptal et', 'Cancel')}</button>}</div></td>
          </tr>) : <tr><td colSpan={6} className="queue-empty">{tr('Bu filtrede işlem bulunmuyor.', 'No operations match this filter.')}</td></tr>}</tbody>
        </AdvancedDataGrid>
      </div>
      {selectedOperation&&<aside className="integration-operation-inspector" aria-label={tr('Seçili kuyruk işlemi', 'Selected queue operation')}><div className="integration-inspector-heading"><div><p className="eyebrow">{tr('SEÇİLİ İŞLEM', 'SELECTED OPERATION')}</p><h3>{selectedOperation.integrationCode}</h3><small className="queue-id">{selectedOperation.operationId}</small></div><span className={`queue-status status-${selectedOperation.status.toLowerCase()}`}><i/>{statusLabel(selectedOperation.status)}</span></div><dl><div><dt>{tr('Oluşturulma', 'Created')}</dt><dd>{new Date(selectedOperation.createdAt).toLocaleString(locale())}</dd></div><div><dt>{tr('Son güncelleme', 'Last updated')}</dt><dd>{new Date(selectedOperation.updatedAt).toLocaleString(locale())}</dd></div><div><dt>{tr('Başladı', 'Started')}</dt><dd>{selectedOperation.startedAt?new Date(selectedOperation.startedAt).toLocaleString(locale()):'—'}</dd></div><div><dt>{tr('Tamamlandı', 'Completed')}</dt><dd>{selectedOperation.completedAt?new Date(selectedOperation.completedAt).toLocaleString(locale()):'—'}</dd></div><div><dt>{tr('Deneme sayısı', 'Attempts')}</dt><dd>{selectedOperation.attempts}</dd></div><div><dt>{tr('Hata kodu', 'Error code')}</dt><dd>{selectedOperation.errorCode||'—'}</dd></div></dl><p>{tr('İstek gövdesi ve hassas belge verileri kuyruk ayrıntısında gösterilmez.', 'Request bodies and sensitive document data are not shown in queue details.')}</p>{['Queued','AwaitingApproval'].includes(selectedOperation.status)&&<button className="secondary queue-cancel" disabled={busyId===selectedOperation.operationId} onClick={()=>void cancel(selectedOperation)}><Ban size={14}/> {tr('İptal et', 'Cancel')}</button>}</aside>}
      </div>
      {selectedOperation?.integrationCode==='tr.e-document.submit'&&selectedOperation.status==='Indeterminate'&&<section className="integration-reconciliation" aria-label={tr('Dış sağlayıcıyla mutabakat', 'Reconcile with external provider')}><h3>{tr('Dış sağlayıcıyla mutabakat', 'Reconcile with external provider')}</h3><p>{tr('Önce sağlayıcı portalında bu aynı belgeyi bulun. Taslağı oluşturan kişiden farklı bir firma yöneticisi doğruladığı sonucu kaydetmelidir.', 'First locate this document in the provider portal. A company administrator different from the draft creator must record the verified outcome.')}</p><label>{tr('Doğrulanan sonuç', 'Verified outcome')}<select value={reconciliationOutcome} onChange={event => setReconciliationOutcome(event.target.value as typeof reconciliationOutcome)}><option value="confirmed_submitted">{tr('Sağlayıcıda gönderildi', 'Submitted at provider')}</option><option value="confirmed_not_submitted">{tr('Sağlayıcıda gönderilmedi', 'Not submitted at provider')}</option></select></label>{reconciliationOutcome==='confirmed_submitted'&&<label>{tr('Sağlayıcı belge referansı', 'Provider document reference')}<input maxLength={200} value={reconciliationReference} onChange={event => setReconciliationReference(event.target.value)} /></label>}<label>{tr('Kontrol kanıtı özeti', 'Evidence summary of the check')}<textarea minLength={10} maxLength={1000} rows={3} value={reconciliationEvidence} onChange={event => setReconciliationEvidence(event.target.value)} placeholder={tr('Örn. sağlayıcı portalında belge numarasıyla arandı ve durum doğrulandı.', 'E.g. searched by document number in the provider portal and verified the status.')} /></label><small>{tr('Özete secret, PIN, kişisel veri veya sağlayıcı yanıt gövdesi eklemeyin. Kayıt şifreli saklanır; işlem yeniden gönderilmez.', 'Do not include secrets, PINs, personal data, or provider response bodies. The record is stored encrypted; the operation is not resubmitted.')}</small><button className="primary" disabled={busyId===selectedOperation.operationId} onClick={()=>void reconcileIndeterminate(selectedOperation)}>{busyId===selectedOperation.operationId?tr('Kaydediliyor…','Saving…'):tr('Doğrulanmış sonucu kaydet','Record verified outcome')}</button></section>}
      <footer className="integration-queue-pagination"><span>{data ? `${data.totalCount} ${tr('işlem · Sayfa', 'operations · Page')} ${page}/${totalPages}` : '—'}</span><div><button className="secondary small-button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>{tr('Önceki', 'Previous')}</button><button className="secondary small-button" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>{tr('Sonraki', 'Next')}</button></div></footer>
    </section>
    <div className="boundary-note integration-queue-boundary"><ShieldCheck size={16}/><span>{tr('Geçici ve yeniden denenebilir hatalarda worker, deneme sınırına kadar aynı sağlayıcı idempotency anahtarıyla tekrar deneyebilir. Sınır aşıldıktan sonra son durumdaki başarısız veya belirsiz işlemler otomatik tekrarlanmaz; dış sistem sonucunu operatör incelemelidir.', 'For transient and retryable failures, the worker may retry with the same provider idempotency key up to the attempt limit. After the limit, terminal failed or indeterminate operations are not retried automatically; an operator must review the external system outcome.')}</span></div>
  </div>
}
