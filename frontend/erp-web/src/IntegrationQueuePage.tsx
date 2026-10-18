import { useCallback, useEffect, useState } from 'react'
import { Activity, Ban, RefreshCw, ShieldCheck } from 'lucide-react'
import './integration-queue.css'

type IntegrationOperation = {
  operationId: string
  integrationCode: string
  status: 'Queued' | 'Running' | 'Succeeded' | 'Failed' | 'Indeterminate' | 'Cancelled'
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  attempts: number
  errorCode: string | null
}

type IntegrationOperationPage = { items: IntegrationOperation[]; page: number; pageSize: number; totalCount: number }
type Props = { token: string }
const statuses = ['', 'Queued', 'Running', 'Succeeded', 'Failed', 'Indeterminate', 'Cancelled'] as const
const statusLabels: Record<IntegrationOperation['status'], string> = {
  Queued: 'Kuyrukta', Running: 'Çalışıyor', Succeeded: 'Başarılı', Failed: 'Başarısız', Indeterminate: 'Sonuç belirsiz', Cancelled: 'İptal edildi',
}

async function fetchQueue(url: string, token: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { errorCode?: string; title?: string } | null
    throw new Error(response.status === 409 ? 'İşlem durumu değişti. Listeyi yenileyin.' : body?.title || body?.errorCode || `İstek başarısız (${response.status}).`)
  }
  return response.status === 204 ? null : response.json()
}

export default function IntegrationQueuePage({ token }: Props) {
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<IntegrationOperationPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError('')
    const query = new URLSearchParams({ page: String(page), pageSize: '25' })
    if (status) query.set('status', status)
    try {
      const result = await fetchQueue(`/api/integrations/operations?${query}`, token, { signal }) as IntegrationOperationPage
      setData(result)
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : 'Kuyruk yüklenemedi.')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [page, status, token])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  async function cancel(item: IntegrationOperation) {
    if (item.status !== 'Queued' || !window.confirm(`${item.integrationCode} işlemini kuyruktan iptal etmek istiyor musunuz?`)) return
    setBusyId(item.operationId)
    setError('')
    setNotice('')
    try {
      await fetchQueue(`/api/integrations/operations/${item.operationId}/cancel`, token, { method: 'POST' })
      setNotice('Kuyrukta bekleyen işlem iptal edildi.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'İşlem iptal edilemedi.')
    } finally {
      setBusyId('')
    }
  }

  const totalPages = Math.max(1, Math.ceil((data?.totalCount || 0) / 25))
  return <div className="integration-queue-page">
    <div className="page-heading">
      <div><p className="eyebrow">YÖNETİM · ENTEGRASYONLAR</p><h1>Entegrasyon kuyruğu</h1><p className="muted">Tenant işlemlerini izleyin; yalnızca henüz çalışmamış işleri iptal edin.</p></div>
      <button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'queue-spin' : ''}/> Yenile</button>
    </div>
    <div className="integration-queue-summary">
      <span className="queue-summary-icon"><Activity size={19}/></span>
      <div><b>{data?.totalCount ?? '—'}</b><small>{status ? `${statusLabels[status as IntegrationOperation['status']]} işlemi` : 'Gösterilen filtredeki işlem'}</small></div>
      <span className="queue-summary-note"><ShieldCheck size={15}/> Tenant sınırı uygulanıyor</span>
    </div>
    {error && <div className="alert" role="alert">{error}</div>}
    {notice && <div className="notice" role="status">{notice}</div>}
    <section className="panel integration-queue-panel">
      <div className="integration-queue-toolbar">
        <div><h2>İşlem geçmişi</h2><p className="muted">Kuyruk içeriği ve hassas istek verileri bu listede gösterilmez.</p></div>
        <label>Durum
          <select value={status} onChange={event => { setPage(1); setStatus(event.target.value) }}>
            {statuses.map(value => <option key={value || 'all'} value={value}>{value ? statusLabels[value as IntegrationOperation['status']] : 'Tüm durumlar'}</option>)}
          </select>
        </label>
      </div>
      <div className="integration-queue-table-wrap">
        <table className="integration-queue-table">
          <thead><tr><th>Entegrasyon</th><th>Durum</th><th>Oluşturulma</th><th>Deneme</th><th>Hata kodu</th><th aria-label="İşlemler"/></tr></thead>
          <tbody>{loading ? <tr><td colSpan={6} className="queue-empty">Kuyruk yükleniyor…</td></tr> : data?.items.length ? data.items.map(item => <tr key={item.operationId}>
            <td><b>{item.integrationCode}</b><small className="queue-id">{item.operationId}</small></td>
            <td><span className={`queue-status status-${item.status.toLowerCase()}`}><i/>{statusLabels[item.status]}</span></td>
            <td>{new Date(item.createdAt).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</td>
            <td>{item.attempts}</td>
            <td>{item.errorCode || '—'}</td>
            <td>{item.status === 'Queued' && <button className="secondary small-button queue-cancel" disabled={busyId === item.operationId} onClick={() => void cancel(item)}><Ban size={14}/>{busyId === item.operationId ? 'İptal ediliyor…' : 'İptal et'}</button>}</td>
          </tr>) : <tr><td colSpan={6} className="queue-empty">Bu filtrede işlem bulunmuyor.</td></tr>}</tbody>
        </table>
      </div>
      <footer className="integration-queue-pagination"><span>{data ? `${data.totalCount} işlem · Sayfa ${page}/${totalPages}` : '—'}</span><div><button className="secondary small-button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Önceki</button><button className="secondary small-button" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Sonraki</button></div></footer>
    </section>
    <div className="boundary-note integration-queue-boundary"><ShieldCheck size={16}/><span>Başlamış, başarısız veya sonucu belirsiz bir provider çağrısı otomatik olarak yeniden oynatılmaz; dış sistemde çift işlem riski için operatör incelemesi gerekir.</span></div>
  </div>
}
