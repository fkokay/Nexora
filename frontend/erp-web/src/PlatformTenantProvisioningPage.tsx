import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import ProvisioningCompanyList from './platform-tenant-provisioning/components/ProvisioningCompanyList'
import ProvisioningForm from './platform-tenant-provisioning/components/ProvisioningForm'
import ProvisioningHeader from './platform-tenant-provisioning/components/ProvisioningHeader'
import ProvisioningJobStatus from './platform-tenant-provisioning/components/ProvisioningJobStatus'
import ProvisioningSteps from './platform-tenant-provisioning/components/ProvisioningSteps'
import type { PlatformTenantSummary, ProvisioningRequest, ProvisioningStatus } from './platform-tenant-provisioning/types'
import './platform-tenant-provisioning.css'

type ApiRequest = <T>(url: string, token?: string, init?: RequestInit) => Promise<T>

export type PlatformTenantProvisioningPageProps = {
  token: string
  api: ApiRequest
}

const errorText: Record<string, string> = {
  tenant_database_provisioning_failed: 'Veritabanı hazırlığı tamamlanamadı. Yeniden deneyebilirsiniz.',
  tenant_database_not_ready: 'Veritabanı henüz hazır değil. Yeniden deneyebilirsiniz.',
  tenant_database_provisioning_interrupted: 'Hazırlık işlemi kesildi. Yeniden deneyebilirsiniz.'
}

const terminal = (status: ProvisioningStatus['status']) => status === 'Completed' || status === 'Failed'

export default function PlatformTenantProvisioningPage({ token, api }: PlatformTenantProvisioningPageProps) {
  const [form, setForm] = useState<ProvisioningRequest>({
    name: '', slug: '', baseCurrencyCode: 'TRY', adminEmail: '', adminDisplayName: ''
  })
  const [job, setJob] = useState<ProvisioningStatus | null>(null)
  const [companies, setCompanies] = useState<PlatformTenantSummary[]>([])
  const [companySearch, setCompanySearch] = useState('')
  const [companiesLoading, setCompaniesLoading] = useState(true)
  const [companiesError, setCompaniesError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pollError, setPollError] = useState('')
  const keyForRequest = useRef<{ fingerprint: string; key: string } | null>(null)

  useEffect(() => {
    if (!job || terminal(job.status)) return
    let cancelled = false
    let timer = 0
    const poll = async () => {
      try {
        const next = await api<ProvisioningStatus>(job.statusUrl, token)
        if (!cancelled) {
          setJob(next)
          setPollError('')
        }
      } catch {
        if (!cancelled) setPollError('Durum alınamadı. Biraz sonra yeniden denenecek.')
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 2500)
      }
    }
    timer = window.setTimeout(poll, 1500)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [api, job?.jobId, job?.status, job?.statusUrl, token])

  useEffect(() => {
    let cancelled = false
    setCompaniesLoading(true)
    setCompaniesError('')
    api<PlatformTenantSummary[]>('/api/platform/tenants', token)
      .then(result => { if (!cancelled) setCompanies(result) })
      .catch(() => { if (!cancelled) setCompaniesError('Firma listesi alınamadı. Yeniden deneyin.') })
      .finally(() => { if (!cancelled) setCompaniesLoading(false) })
    return () => { cancelled = true }
  }, [api, job?.status, token])

  const update = (field: keyof ProvisioningRequest, value: string) => {
    setForm(current => ({ ...current, [field]: value }))
    setError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim().toLowerCase(),
      baseCurrencyCode: form.baseCurrencyCode.trim().toUpperCase(),
      adminEmail: form.adminEmail.trim().toLowerCase(),
      adminDisplayName: form.adminDisplayName.trim()
    }
    const fingerprint = JSON.stringify(payload)
    if (!keyForRequest.current || keyForRequest.current.fingerprint !== fingerprint) {
      keyForRequest.current = { fingerprint, key: crypto.randomUUID() }
    }
    try {
      const created = await api<ProvisioningStatus>('/api/platform/tenants', token, {
        method: 'POST',
        headers: { 'Idempotency-Key': keyForRequest.current.key },
        body: JSON.stringify(payload)
      })
      setJob(created)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Firma oluşturma isteği başarısız oldu.')
    } finally {
      setBusy(false)
    }
  }

  const retry = async () => {
    if (!job) return
    setBusy(true)
    setError('')
    try {
      const updated = await api<ProvisioningStatus>(`${job.statusUrl}/retry`, token, { method: 'POST' })
      setJob(updated)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Yeniden deneme isteği başarısız oldu.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="page-heading platform-provisioning-page">
    <ProvisioningHeader />
    <ProvisioningSteps job={job} />
    <ProvisioningCompanyList companies={companies} search={companySearch} loading={companiesLoading} error={companiesError} onSearchChange={setCompanySearch} />
    <ProvisioningForm form={form} error={error} busy={busy} onChange={update} onSubmit={submit} />
    {job && <ProvisioningJobStatus job={job} pollError={pollError} busy={busy} errorText={code => errorText[code] ?? 'Hazırlık işlemi tamamlanamadı.'} onRetry={() => void retry()} />}
  </div>
}
