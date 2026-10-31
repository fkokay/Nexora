import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './platform-license-issuance.css'
import { IssuedLicenseResult } from './platform-license-issuance/components/IssuedLicenseResult'
import { LicenseIssuanceForm } from './platform-license-issuance/components/LicenseIssuanceForm'
import { PlatformLicensePageHeader } from './platform-license-issuance/components/PlatformLicensePageHeader'
import type { IssuedLicense, LicenseIssuer, Tenant } from './platform-license-issuance/types'

type ApiRequest = <T>(url: string, token?: string, init?: RequestInit) => Promise<T>

export default function PlatformLicenseIssuancePage({ token, api }: { token: string; api: ApiRequest }) {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [tenantId, setTenantId] = useState('')
  const [tier, setTier] = useState('Large')
  const [expiresOn, setExpiresOn] = useState('')
  const [issuer, setIssuer] = useState<LicenseIssuer | null>(null)
  const [issued, setIssued] = useState<IssuedLicense | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  const [tenantPickerOpen, setTenantPickerOpen] = useState(false)
  const [tenantSearch, setTenantSearch] = useState('')
  const tenantPickerRef = useRef<HTMLDivElement>(null)
  const tenantSearchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!tenantPickerOpen) return
    setTenantSearch('')
    tenantSearchRef.current?.focus()
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !tenantPickerRef.current?.contains(event.target)) setTenantPickerOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [tenantPickerOpen])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([
      api<Tenant[]>('/api/platform/licenses/tenants', token),
      api<LicenseIssuer>('/api/platform/licenses/configuration', token),
    ]).then(([tenantRows, config]) => {
      if (cancelled) return
      setTenants(tenantRows)
      setTenantId(current => current || tenantRows.find(tenant => tenant.isActive)?.id || '')
      setIssuer(config)
    }).catch(cause => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Lisans bilgileri yüklenemedi.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [api, token])

  async function issue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!issuer?.ready || busy) return
    setBusy(true)
    setError('')
    setIssued(null)
    setCopied(false)
    try {
      setIssued(await api<IssuedLicense>('/api/platform/licenses/issue', token, {
        method: 'POST',
        body: JSON.stringify({ tenantId, tier, expiresOn }),
      }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Lisans üretilemedi.')
    } finally {
      setBusy(false)
    }
  }

  async function copyGrant() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.signedGrant)
      setCopied(true)
    } catch {
      setError('Panoya kopyalanamadı. Lisans kodunu metin alanından seçip kopyalayın.')
    }
  }

  const activeTenants = tenants.filter(tenant => tenant.isActive)
  const filteredTenants = activeTenants.filter(tenant => `${tenant.name} ${tenant.slug}`.toLocaleLowerCase('tr-TR').includes(tenantSearch.trim().toLocaleLowerCase('tr-TR')))
  const selectedTenant = activeTenants.find(tenant => tenant.id === tenantId)

  return <div className="platform-license-page">
    <PlatformLicensePageHeader />
    {error && <div className="alert inline-alert" role="alert">{error}</div>}
    <LicenseIssuanceForm
      issuer={issuer}
      loading={loading}
      busy={busy}
      activeTenants={activeTenants}
      filteredTenants={filteredTenants}
      selectedTenant={selectedTenant}
      tenantId={tenantId}
      tier={tier}
      expiresOn={expiresOn}
      tenantPickerOpen={tenantPickerOpen}
      tenantSearch={tenantSearch}
      pickerRef={node => { tenantPickerRef.current = node }}
      searchInputRef={node => { tenantSearchRef.current = node }}
      onSubmit={issue}
      onToggleTenantPicker={() => setTenantPickerOpen(open => !open)}
      onCloseTenantPicker={() => setTenantPickerOpen(false)}
      onSelectTenant={id => { setTenantId(id); setIssued(null); setTenantPickerOpen(false) }}
      onTenantSearchChange={setTenantSearch}
      onTierChange={value => { setTier(value); setIssued(null) }}
      onExpiresOnChange={value => { setExpiresOn(value); setIssued(null) }}
    />
    {issued && <IssuedLicenseResult issued={issued} copied={copied} onCopy={() => void copyGrant()} />}
  </div>
}
