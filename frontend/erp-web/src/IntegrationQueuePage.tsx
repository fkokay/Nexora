import AdvancedDataGrid from './AdvancedDataGrid'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Ban, RefreshCw, ShieldCheck } from 'lucide-react'
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
const statusLabels: Record<IntegrationOperation['status'], string> = {
  AwaitingApproval: 'Onay bekliyor', Queued: 'Kuyrukta', Running: 'Çalışıyor', Succeeded: 'Başarılı', Failed: 'Başarısız', Indeterminate: 'Sonuç belirsiz', Cancelled: 'İptal edildi',
}

async function fetchQueue<T>(url: string, token: string, requestApi: Props['requestApi'], init?: RequestInit): Promise<T> {
  try {
    return await requestApi<T>(url, token, init)
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes('(409)'))
      throw new Error('İşlem durumu değişti. Listeyi yenileyin.')
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
    else setError(queueResult.reason instanceof Error ? queueResult.reason.message : 'Kuyruk yüklenemedi.')
    if (submissionsResult.status === 'fulfilled') setSubmissions(submissionsResult.value)
    else setSubmissionsError(submissionsResult.reason instanceof Error ? submissionsResult.reason.message : 'Onay bekleyen gönderimler yüklenemedi.')
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
      .catch(cause => { if (!controller.signal.aborted) setSourceDocumentsError(cause instanceof Error ? cause.message : 'ERP belgeleri yüklenemedi.') })
      .finally(() => { if (!controller.signal.aborted) setSourceDocumentsLoading(false) })
    return () => controller.abort()
  }, [documentType, token, requestApi])

  async function cancel(item: IntegrationOperation) {
    if (!['Queued', 'AwaitingApproval'].includes(item.status) || !window.confirm(`${item.integrationCode} işlemini iptal etmek istiyor musunuz?`)) return
    setBusyId(item.operationId)
    setError('')
    setNotice('')
    try {
      await fetchQueue(`/api/integrations/operations/${item.operationId}/cancel`, token, requestApi, { method: 'POST' })
      setNotice('Kuyrukta bekleyen işlem iptal edildi.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'İşlem iptal edilemedi.')
    } finally {
      setBusyId('')
    }
  }

  async function prepareSubmission(event: FormEvent) {
    event.preventDefault()
    setError(''); setNotice('')
    if (!documentId) { setError('Önce gönderime hazırlanacak ERP belgesini seçin.'); return }
    setSubmitting(true)
    try {
      const body = JSON.stringify({ documentType, documentId })
      if (body !== submissionBody.current) { submissionBody.current = body; submissionIdempotencyKey.current = crypto.randomUUID() }
      await fetchQueue('/api/e-documents/submissions', token, requestApi, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': submissionIdempotencyKey.current }, body })
      submissionIdempotencyKey.current = ''; submissionBody.current = ''
      setNotice('Taslak hazırlandı. Dış sağlayıcıya gönderim için farklı bir yönetici onayı gerekiyor.')
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'E-belge taslağı oluşturulamadı.') }
    finally { setSubmitting(false) }
  }

  async function previewSourceDocument() {
    if (!documentId) return
    setPreviewing(true); setError(''); setNotice(''); setSourcePreview(null)
    try {
      const preview = await fetchQueue<EDocumentSubmissionDetail>(`/api/e-documents/source-documents/${encodeURIComponent(documentType)}/${documentId}/preview`, token, requestApi)
      setSourcePreview(preview)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Belge önizlemesi yüklenemedi.') }
    finally { setPreviewing(false) }
  }

  async function reviewSubmission(item: EDocumentSubmission) {
    setBusyId(item.operationId); setError(''); setReviewItem(null); setReviewDetail(null)
    try {
      const detail = await fetchQueue<EDocumentSubmissionDetail>(`/api/e-documents/submissions/${item.operationId}`, token, requestApi)
      setReviewItem(item); setReviewDetail(detail)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Belge ayrıntıları yüklenemedi.') }
    finally { setBusyId('') }
  }

  async function approveSubmission() {
    const item = reviewItem
    const detail = reviewDetail
    if (!item || !detail || !window.confirm(`${detail.documentType} ${detail.documentNumber} belgesini dış sağlayıcıya gönderilmek üzere onaylıyor musunuz? Bu işlem dış sistemde sonuç doğurabilir.`)) return
    setBusyId(item.operationId); setError(''); setNotice('')
    try {
      await fetchQueue(`/api/e-documents/submissions/${item.operationId}/approve`, token, requestApi, { method: 'POST' })
      setNotice('Gönderim onaylandı ve güvenli entegrasyon kuyruğuna alındı.')
      setReviewItem(null); setReviewDetail(null)
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gönderim onaylanamadı.') }
    finally { setBusyId('') }
  }

  const totalPages = Math.max(1, Math.ceil((data?.totalCount || 0) / 25))
  const selectedOperation = data?.items.find(item => item.operationId === selectedOperationId) ?? data?.items[0] ?? null
  return <div className="integration-queue-page">
    <div className="page-heading">
      <div><p className="eyebrow">YÖNETİM · ENTEGRASYONLAR</p><h1>Entegrasyon kuyruğu</h1><p className="muted">Tenant işlemlerini izleyin; yalnızca henüz çalışmamış işleri iptal edin.</p></div>
      <button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'queue-spin' : ''}/> Yenile</button>
    </div>
    <section className="integration-queue-kpis" aria-label="Kuyruk özeti" aria-live="polite"><article><span>Filtredeki kayıt</span><b>{data?.totalCount ?? '—'}</b><small>{status ? statusLabels[status as IntegrationOperation['status']] : 'Tüm durumlar'}</small></article><article><span>Çalışıyor</span><b>{data?.items.filter(item=>item.status==='Running').length ?? '—'}</b><small>Bu sayfadaki kayıtlar</small></article><article><span>Başarısız / belirsiz</span><b>{data?.items.filter(item=>['Failed','Indeterminate'].includes(item.status)).length ?? '—'}</b><small>Operatör incelemesi</small></article><article><span>Onay bekleyen belge</span><b>{submissionsLoading?'—':submissions.length}</b><small>E-belge taslakları</small></article></section>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <section className="panel integration-queue-panel">
      <div className="integration-queue-toolbar"><div><h2>E-belge gönderim taslağı</h2><p className="muted">Sağlayıcıdan bağımsız sözleşme: e-Fatura, e-İrsaliye veya e-Arşiv. Taslaklar farklı bir tenant yöneticisi onaylamadan gönderilmez.</p></div></div>
      <form className="integration-edoc-form" onSubmit={event => void prepareSubmission(event)} aria-busy={sourceDocumentsLoading || submitting}>
        <label>Belge türü<select value={documentType} onChange={event => setDocumentType(event.target.value)}><option value="e-invoice">e-Fatura</option><option value="e-dispatch">e-İrsaliye</option><option value="e-archive">e-Arşiv</option></select></label>
        <label className="integration-edoc-payload">ERP belgesi<select required value={documentId} disabled={sourceDocumentsLoading || Boolean(sourceDocumentsError)} onChange={event => { setDocumentId(event.target.value); setSourcePreview(null) }}><option value="">{sourceDocumentsLoading ? 'Belgeler yükleniyor…' : 'Belge seçin'}</option>{sourceDocuments.map(item => <option key={item.id} value={item.id}>{item.number} · {item.issueDate} · {item.counterpartyName} · {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: item.currencyCode }).format(item.total)}</option>)}</select></label>
        {sourceDocumentsError ? <p className="integration-inline-error" role="alert">ERP belgeleri yüklenemedi: {sourceDocumentsError}</p> : !sourceDocumentsLoading && !sourceDocuments.length && <p className="muted" role="status">Bu türde gönderime hazırlanabilecek açık ERP belgesi bulunamadı.</p>}
        <button type="button" className="secondary" disabled={!documentId || previewing} onClick={() => void previewSourceDocument()}>{previewing ? 'Önizleme yükleniyor…' : 'Belge içeriğini önizle'}</button>
        <button className="primary" disabled={submitting || !documentId}>{submitting ? 'Taslak hazırlanıyor…' : 'Onay için taslak oluştur'}</button>
      </form>
      <p className="muted">Ürün kararı gerekli: Aynı ERP belgesi yeni bir operasyon anahtarıyla tekrar taslaklanabilir. Belge düzeyinde yinelenen gönderimlerin engellenip engellenmeyeceği belirlenmeli.</p>
      {sourcePreview && <div className="integration-edoc-review" role="region" aria-label="E-belge taslak önizlemesi">
        <div><h3>Sağlayıcıya hazırlanacak belge</h3><p className="muted">{sourcePreview.documentType} · {sourcePreview.documentNumber} · {sourcePreview.issueDate} · {sourcePreview.currencyCode}</p></div>
        <pre>{JSON.stringify(sourcePreview.document, null, 2)}</pre>
        <p className="muted">Bu yalnızca kaynak ERP verisinin önizlemesidir. Resmî e-belge şeması, sağlayıcı eşlemesi veya GİB kabulü anlamına gelmez.</p>
      </div>}
      <div className="boundary-note"><ShieldCheck size={16}/><span>Bu temel katman veriyi yalnızca şifreli kuyrukta saklar. Gerçek sağlayıcı, alan eşlemesi, sandbox kabulü ve mevzuat uyumu ayrıca doğrulanmalıdır.</span></div>
    </section>
    <section className="panel integration-queue-panel">
      <div className="integration-queue-toolbar"><div><h2>Onay bekleyen gönderimler</h2><p className="muted">Onaylayan kişi taslağı oluşturan kişiden farklı olmalıdır.</p></div></div>
      {submissionsError && <div className="integration-inline-error" role="alert">Onay bekleyen gönderimler yüklenemedi: {submissionsError}</div>}
      <div className="integration-queue-table-wrap" role="region" aria-label="Onay bekleyen gönderim tablosu" tabIndex={0} aria-busy={submissionsLoading}>
        <AdvancedDataGrid  className="integration-queue-table"><caption className="integration-visually-hidden">Onay bekleyen e-belge gönderimleri</caption><thead><tr><th scope="col">Tür</th><th scope="col">Belge</th><th scope="col">Düzenleme tarihi</th><th scope="col">Para birimi</th><th scope="col">Hazırlanma</th><th scope="col">İşlemler</th></tr></thead><tbody>
        {submissionsLoading ? <tr><td colSpan={6} className="queue-empty" role="status">Onay bekleyen gönderimler yükleniyor…</td></tr> : submissionsError ? <tr><td colSpan={6} className="queue-empty">Gönderim listesi görüntülenemiyor. Yenile düğmesini kullanın.</td></tr> : submissions.length ? submissions.map(item => <tr key={item.operationId}><td>{item.documentType}</td><td><b>{item.documentNumber}</b><small className="queue-id">{item.documentId}</small></td><td>{item.issueDate}</td><td>{item.currencyCode}</td><td>{new Date(item.createdAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</td><td><button type="button" className="primary small-button" disabled={busyId === item.operationId} onClick={() => void reviewSubmission(item)}>{busyId === item.operationId ? 'Yükleniyor…' : 'İncele'}</button></td></tr>) : <tr><td colSpan={6} className="queue-empty">Onay bekleyen gönderim yok.</td></tr>}
      </tbody></AdvancedDataGrid></div>
      {reviewItem && reviewDetail && <div className="integration-edoc-review" role="region" aria-label="E-belge gönderim incelemesi">
        <div><h3>Gönderim içeriğini inceleyin</h3><p className="muted">{reviewDetail.documentType} · {reviewDetail.documentNumber} · {reviewDetail.issueDate} · {reviewDetail.currencyCode}</p></div>
        <pre>{JSON.stringify(reviewDetail.document, null, 2)}</pre>
        <p className="muted">Gönderen yönetici: {reviewItem.requestedByUserId}. Dış sağlayıcıya iletim ancak bu farklı yönetici onayladıktan sonra başlar.</p>
        <div className="integration-edoc-review-actions"><button className="secondary" onClick={() => { setReviewItem(null); setReviewDetail(null) }}>Kapat</button><button className="primary" disabled={busyId === reviewItem.operationId} onClick={() => void approveSubmission()}>{busyId === reviewItem.operationId ? 'Onaylanıyor…' : 'İnceledim, gönderimi onayla'}</button></div>
      </div>}
    </section>
    <section className="panel integration-queue-panel">
      <div className="integration-queue-toolbar">
        <div><h2>İşlem geçmişi</h2><p className="muted">Kuyruk içeriği ve hassas istek verileri bu listede gösterilmez.</p></div>
        <label>Durum
          <select value={status} onChange={event => { setPage(1); setStatus(event.target.value) }}>
            {statuses.map(value => <option key={value || 'all'} value={value}>{value ? statusLabels[value as IntegrationOperation['status']] : 'Tüm durumlar'}</option>)}
          </select>
        </label>
      </div>
      <div className="integration-operations-workbench">
      <div className="integration-queue-table-wrap" role="region" aria-label="Entegrasyon işlem geçmişi tablosu" tabIndex={0} aria-busy={loading}>
        <AdvancedDataGrid  className="integration-queue-table">
          <caption className="integration-visually-hidden">Entegrasyon işlemlerinin durum ve deneme geçmişi</caption>
          <thead><tr><th scope="col">Entegrasyon</th><th scope="col">Durum</th><th scope="col">Oluşturulma</th><th scope="col">Deneme</th><th scope="col">Hata kodu</th><th scope="col">İşlemler</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={6} className="queue-empty" role="status">Kuyruk yükleniyor…</td></tr> : !data ? <tr><td colSpan={6} className="queue-empty">Kuyruk görüntülenemiyor. Yenile düğmesini kullanın.</td></tr> : data.items.length ? data.items.map(item => <tr key={item.operationId}>
            <td><b>{item.integrationCode}</b><small className="queue-id">{item.operationId}</small></td>
            <td><span className={`queue-status status-${item.status.toLowerCase()}`}><i/>{statusLabels[item.status]}</span></td>
            <td>{new Date(item.createdAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</td>
            <td><span>{item.attempts}</span>{['Failed', 'Indeterminate'].includes(item.status) && <small className="queue-retry-note">Otomatik tekrar yok</small>}</td>
            <td>{item.errorCode || '—'}</td>
            <td><div className="queue-row-actions"><button type="button" className="secondary small-button" aria-pressed={selectedOperation?.operationId===item.operationId} onClick={()=>setSelectedOperationId(item.operationId)}>Ayrıntı</button>{['Queued', 'AwaitingApproval'].includes(item.status) && <button className="secondary small-button queue-cancel" disabled={busyId === item.operationId} onClick={() => void cancel(item)}><Ban size={14}/>{busyId === item.operationId ? 'İptal ediliyor…' : 'İptal et'}</button>}</div></td>
          </tr>) : <tr><td colSpan={6} className="queue-empty">Bu filtrede işlem bulunmuyor.</td></tr>}</tbody>
        </AdvancedDataGrid>
      </div>
      {selectedOperation&&<aside className="integration-operation-inspector" aria-label="Seçili kuyruk işlemi"><div className="integration-inspector-heading"><div><p className="eyebrow">SEÇİLİ İŞLEM</p><h3>{selectedOperation.integrationCode}</h3><small className="queue-id">{selectedOperation.operationId}</small></div><span className={`queue-status status-${selectedOperation.status.toLowerCase()}`}><i/>{statusLabels[selectedOperation.status]}</span></div><dl><div><dt>Oluşturulma</dt><dd>{new Date(selectedOperation.createdAt).toLocaleString('tr-TR')}</dd></div><div><dt>Son güncelleme</dt><dd>{new Date(selectedOperation.updatedAt).toLocaleString('tr-TR')}</dd></div><div><dt>Başladı</dt><dd>{selectedOperation.startedAt?new Date(selectedOperation.startedAt).toLocaleString('tr-TR'):'—'}</dd></div><div><dt>Tamamlandı</dt><dd>{selectedOperation.completedAt?new Date(selectedOperation.completedAt).toLocaleString('tr-TR'):'—'}</dd></div><div><dt>Deneme sayısı</dt><dd>{selectedOperation.attempts}</dd></div><div><dt>Hata kodu</dt><dd>{selectedOperation.errorCode||'—'}</dd></div></dl><p>İstek gövdesi ve hassas belge verileri kuyruk ayrıntısında gösterilmez.</p>{['Queued','AwaitingApproval'].includes(selectedOperation.status)&&<button className="secondary queue-cancel" disabled={busyId===selectedOperation.operationId} onClick={()=>void cancel(selectedOperation)}><Ban size={14}/> İptal et</button>}</aside>}
      </div>
      <footer className="integration-queue-pagination"><span>{data ? `${data.totalCount} işlem · Sayfa ${page}/${totalPages}` : '—'}</span><div><button className="secondary small-button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Önceki</button><button className="secondary small-button" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Sonraki</button></div></footer>
    </section>
    <div className="boundary-note integration-queue-boundary"><ShieldCheck size={16}/><span>Geçici ve yeniden denenebilir hatalarda worker, deneme sınırına kadar aynı sağlayıcı idempotency anahtarıyla tekrar deneyebilir. Sınır aşıldıktan sonra terminal Failed/Indeterminate işlemler otomatik tekrarlanmaz; dış sistem sonucunu operatör incelemelidir.</span></div>
  </div>
}
