import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BadgeCheck, Building2, Check, ChevronDown, Clipboard, KeyRound, LoaderCircle, Search, ShieldCheck } from 'lucide-react'
import './platform-license-issuance.css'

type Tenant = { id: string; name: string; slug: string; isActive: boolean }
type IssuedLicense = { tenantId: string; tenantName: string; licenseId: string; tier: string; keyId: string; issuedAt: string; expiresAt: string; signedGrant: string }
type ApiRequest = <T>(url: string, token?: string, init?: RequestInit) => Promise<T>

export default function PlatformLicenseIssuancePage({ token, api }:{ token:string; api:ApiRequest }) {
  const [tenants,setTenants]=useState<Tenant[]>([])
  const [tenantId,setTenantId]=useState('')
  const [tier,setTier]=useState('Large')
  const [expiresOn,setExpiresOn]=useState('')
  const [issuer,setIssuer]=useState<{ready:boolean;keyId:string|null}|null>(null)
  const [issued,setIssued]=useState<IssuedLicense|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [copied,setCopied]=useState(false)
  const [error,setError]=useState('')
  const [tenantPickerOpen,setTenantPickerOpen]=useState(false)
  const [tenantSearch,setTenantSearch]=useState('')
  const tenantPickerRef=useRef<HTMLDivElement>(null)
  const tenantSearchRef=useRef<HTMLInputElement>(null)

  useEffect(()=>{
    if(!tenantPickerOpen)return
    setTenantSearch('')
    tenantSearchRef.current?.focus()
    const closeOnOutsideClick=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!tenantPickerRef.current?.contains(event.target))setTenantPickerOpen(false)
    }
    document.addEventListener('pointerdown',closeOnOutsideClick)
    return()=>document.removeEventListener('pointerdown',closeOnOutsideClick)
  },[tenantPickerOpen])

  useEffect(()=>{
    let cancelled=false
    setLoading(true)
    Promise.all([
      api<Tenant[]>('/api/platform/licenses/tenants',token),
      api<{ready:boolean;keyId:string|null}>('/api/platform/licenses/configuration',token)
    ]).then(([tenantRows,config])=>{
      if(cancelled)return
      setTenants(tenantRows)
      setTenantId(current=>current||tenantRows.find(tenant=>tenant.isActive)?.id||'')
      setIssuer(config)
    }).catch(cause=>{if(!cancelled)setError(cause instanceof Error?cause.message:'Lisans bilgileri yüklenemedi.')})
      .finally(()=>{if(!cancelled)setLoading(false)})
    return()=>{cancelled=true}
  },[api,token])

  async function issue(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!issuer?.ready||busy)return
    setBusy(true);setError('');setIssued(null);setCopied(false)
    try {
      setIssued(await api<IssuedLicense>('/api/platform/licenses/issue',token,{method:'POST',body:JSON.stringify({tenantId,tier,expiresOn})}))
    } catch(cause) { setError(cause instanceof Error?cause.message:'Lisans üretilemedi.') }
    finally { setBusy(false) }
  }

  async function copyGrant() {
    if(!issued)return
    try { await navigator.clipboard.writeText(issued.signedGrant);setCopied(true) }
    catch { setError('Panoya kopyalanamadı. Lisans kodunu metin alanından seçip kopyalayın.') }
  }

  const activeTenants=tenants.filter(tenant=>tenant.isActive)
  const filteredTenants=activeTenants.filter(tenant=>`${tenant.name} ${tenant.slug}`.toLocaleLowerCase('tr-TR').includes(tenantSearch.trim().toLocaleLowerCase('tr-TR')))
  const selectedTenant=activeTenants.find(tenant=>tenant.id===tenantId)
  return <div className="platform-license-page">
    <div className="platform-license-heading"><div><p className="eyebrow">PLATFORM YÖNETİMİ · LİSANS</p><h1>Lisans oluştur</h1><p className="muted">Firma için imzalı lisans kodu üretin. Kod oluşturulması lisansı firmada etkinleştirmez.</p></div><span className="platform-license-mark"><KeyRound size={20}/></span></div>
    {error&&<div className="alert inline-alert" role="alert">{error}</div>}
    {issuer&&!issuer.ready&&<div className="platform-license-warning" role="status"><ShieldCheck size={18}/><span><b>Lisans imzalayıcısı yapılandırılmamış</b><small>API sunucusunda lisans veren key ID, özel imzalama anahtarı ve eşleşen açık doğrulama anahtarı güvenli secret store üzerinden yapılandırılmalı.</small></span></div>}
    <section className="panel platform-license-card">
      <div className="panel-heading"><div><h3><BadgeCheck size={17}/> Lisans bilgileri</h3><p>Firma seçin, paket ve bitiş tarihini belirleyin.</p></div>{issuer?.ready&&<span className="platform-license-key-id">İmzalama anahtarı · {issuer.keyId}</span>}</div>
      {loading?<div className="platform-license-loading" role="status"><LoaderCircle size={17}/> Firma ve imzalayıcı bilgileri yükleniyor…</div>:<form className="platform-license-form" onSubmit={event=>void issue(event)}>
        <div className="platform-license-company-field"><span className="platform-license-field-label" id="license-company-label">Firma</span><div className="platform-license-company-picker" ref={tenantPickerRef} onKeyDown={event=>{if(event.key==='Escape')setTenantPickerOpen(false)}}><button type="button" className="platform-license-company-trigger" aria-labelledby="license-company-label" aria-haspopup="dialog" aria-expanded={tenantPickerOpen} disabled={!activeTenants.length} onClick={()=>setTenantPickerOpen(open=>!open)}><span className={selectedTenant?'':'is-placeholder'}>{selectedTenant?`${selectedTenant.name} · ${selectedTenant.slug}`:'Firma seçin'}</span><ChevronDown size={16} aria-hidden="true"/></button>{tenantPickerOpen&&<div className="platform-license-company-popup" role="dialog" aria-label="Firma seç"><label className="platform-license-company-search"><Search size={15} aria-hidden="true"/><input ref={tenantSearchRef} type="search" aria-label="Firma ara" placeholder="Firma adı veya kısa adı ara" value={tenantSearch} onChange={event=>setTenantSearch(event.target.value)}/></label><div className="platform-license-company-options" role="listbox" aria-labelledby="license-company-label">{filteredTenants.length?filteredTenants.map(tenant=><button key={tenant.id} type="button" role="option" aria-selected={tenant.id===tenantId} className="platform-license-company-option" onClick={()=>{setTenantId(tenant.id);setIssued(null);setTenantPickerOpen(false)}}><span><strong>{tenant.name}</strong><small>{tenant.slug}</small></span>{tenant.id===tenantId&&<Check size={16} aria-hidden="true"/>}</button>):<p className="platform-license-company-empty">Aramanızla eşleşen firma bulunamadı.</p>}</div></div>}</div><small>Hazırlığı tamamlanmış firmalar listelenir.</small></div>
        <div className="form-two"><label>Lisans paketi<select value={tier} onChange={event=>{setTier(event.target.value);setIssued(null)}}><option value="Small">Small · 10 kullanıcı · 10 GB</option><option value="Medium">Medium · 50 kullanıcı · 50 GB</option><option value="Large">Large · sınırsız kullanıcı/modül · 250 GB</option></select></label><label>Bitiş tarihi<input type="date" required value={expiresOn} onChange={event=>{setExpiresOn(event.target.value);setIssued(null)}}/></label></div>
        {tier==='Large'&&<p className="platform-license-note">Large paketi sınırsız kullanıcı/modül kotası ve 250 GB SQL depolama kotası uygular. HA işareti lisans metadata'sıdır; altyapı veya SLA sağlamaz.</p>}
        {!activeTenants.length&&<p className="platform-license-note">Lisans üretmek için önce en az bir firmanın hazırlığı tamamlanmış olmalı.</p>}
        <div className="platform-license-actions"><button className="primary" disabled={busy||!issuer?.ready||!tenantId||!expiresOn||!activeTenants.length}>{busy?<><LoaderCircle size={16}/>İmzalanıyor…</>:<><KeyRound size={16}/>Lisans kodu üret</>}</button></div>
      </form>}
    </section>
    {issued&&<section className="panel platform-license-result" aria-live="polite"><div className="panel-heading"><div><h3><BadgeCheck size={17}/> Lisans kodu oluşturuldu</h3><p>{issued.tenantName} · {issued.tier} · {new Date(issued.expiresAt).toLocaleDateString('tr-TR')} tarihine kadar</p></div><button type="button" className="secondary small-button" onClick={()=>void copyGrant()}><Clipboard size={14}/>{copied?'Kopyalandı':'Kodu kopyala'}</button></div><label>İmzalı lisans kodu<textarea readOnly rows={4} value={issued.signedGrant} onFocus={event=>event.currentTarget.select()}/></label><div className="platform-license-meta"><span><Building2 size={14}/> Firma kimliği · <code>{issued.tenantId}</code></span><span>Lisans kimliği · <code>{issued.licenseId}</code></span></div><p className="platform-license-note">Bu kodu firmaya güvenli kanaldan iletin. Firma yöneticisi Firma ayarları → Firma lisansı ekranından etkinleştirebilir.</p></section>}
  </div>
}
