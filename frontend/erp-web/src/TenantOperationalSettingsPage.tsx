import { useEffect, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { CircleDollarSign, Save, ShieldCheck, Warehouse } from 'lucide-react'
import './tenant-operational-settings.css'

type OperationsSettings = { tenantId:string; allowNegativeStock:boolean; updatedAt:string|null; rowVersion:string|null }
type CurrencySettings = { baseCurrencyCode:string }
type RetentionSettings = { retentionDays:number; minimumRetentionDays:number; maximumRetentionDays:number; lastPurgeAt:string|null }
type CompanyProfile = { tenantId:string; legalName:string; taxOffice:string|null; taxNumber:string|null; updatedAt:string|null; taxNumberMasked:boolean }
type ApiOptions = { method?:string; body?:unknown }

export default function TenantOperationalSettingsPage({ token, role, tenant, onNavigate }:{ token:string; role:string; tenant:{id:string;name:string;slug:string}; onNavigate?:(page:string)=>void }) {
  const [operations,setOperations]=useState<OperationsSettings|null>(null)
  const [allowNegativeStock,setAllowNegativeStock]=useState(false)
  const [currency,setCurrency]=useState<CurrencySettings|null>(null)
  const [baseCurrencyCode,setBaseCurrencyCode]=useState('TRY')
  const [retention,setRetention]=useState<RetentionSettings|null>(null)
  const [retentionDays,setRetentionDays]=useState('365')
  const [companyProfile,setCompanyProfile]=useState<CompanyProfile|null>(null)
  const [legalName,setLegalName]=useState('')
  const [taxOffice,setTaxOffice]=useState('')
  const [taxNumber,setTaxNumber]=useState('')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [errors,setErrors]=useState<Record<string,string>>({})
  const [notices,setNotices]=useState<Record<string,string>>({})
  const isAdmin=role==='TenantAdmin'
  const stockChanged=operations!==null&&allowNegativeStock!==operations.allowNegativeStock
  const currencyChanged=currency!==null&&baseCurrencyCode!==currency.baseCurrencyCode
  const retentionChanged=retention!==null&&retentionDays!==String(retention.retentionDays)
  const profileChanged=companyProfile!==null&&(legalName!==companyProfile.legalName||taxOffice!==(companyProfile.taxOffice??'')||taxNumber!==(companyProfile.taxNumber??''))

  async function request<T>(path:string,options:ApiOptions={}):Promise<T> {
    const response=await authenticatedFetch(path, token, {method:options.method??'GET',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:options.body===undefined?undefined:JSON.stringify(options.body)})
    if(!response.ok){const payload=await response.json().catch(()=>null) as {error?:string;title?:string;errors?:Record<string,string[]>}|null;const validation=payload?.errors?Object.values(payload.errors).flat()[0]:undefined;throw new Error(response.status===403?'Bu işlem için yetkiniz yok.':validation||payload?.error||payload?.title||`İstek başarısız (${response.status}).`)}
    return response.json() as Promise<T>
  }

  async function load(){
    setLoading(true);setErrors({});setNotices({})
    const [operationsResult,currencyResult,retentionResult,profileResult]=await Promise.allSettled([
      request<OperationsSettings>('/api/tenant-settings/operations/'),
      request<CurrencySettings>('/api/finance/currency'),
      request<RetentionSettings>('/api/audit-retention/'),
      request<CompanyProfile>('/api/tenant-company-profile/')
    ])
    if(operationsResult.status==='fulfilled'){setOperations(operationsResult.value);setAllowNegativeStock(operationsResult.value.allowNegativeStock)}else setErrors(current=>({...current,stock:(operationsResult.reason as Error).message}))
    if(currencyResult.status==='fulfilled'){setCurrency(currencyResult.value);setBaseCurrencyCode(currencyResult.value.baseCurrencyCode)}else setErrors(current=>({...current,currency:(currencyResult.reason as Error).message}))
    if(retentionResult.status==='fulfilled'){setRetention(retentionResult.value);setRetentionDays(String(retentionResult.value.retentionDays))}else setErrors(current=>({...current,audit:(retentionResult.reason as Error).message}))
    if(profileResult.status==='fulfilled'){setCompanyProfile(profileResult.value);setLegalName(profileResult.value.legalName);setTaxOffice(profileResult.value.taxOffice??'');setTaxNumber(profileResult.value.taxNumber??'')}else setErrors(current=>({...current,profile:(profileResult.reason as Error).message}))
    setLoading(false)
  }
  useEffect(()=>{void load()},[token])

  async function saveStock(){setBusy('stock');setErrors(current=>({...current,stock:''}));setNotices(current=>({...current,stock:''}));try{const row=await request<OperationsSettings>('/api/tenant-settings/operations/',{method:'PUT',body:{allowNegativeStock,rowVersion:operations?.rowVersion??null}});setOperations(row);setAllowNegativeStock(row.allowNegativeStock);setNotices(current=>({...current,stock:'Stok politikası kaydedildi.'}))}catch(e){setErrors(current=>({...current,stock:(e as Error).message}))}finally{setBusy('')}}
  async function saveCurrency(){setBusy('currency');setErrors(current=>({...current,currency:''}));setNotices(current=>({...current,currency:''}));try{const row=await request<CurrencySettings>('/api/finance/currency',{method:'PUT',body:{baseCurrencyCode:baseCurrencyCode.trim().toUpperCase()}});setCurrency(row);setBaseCurrencyCode(row.baseCurrencyCode);setNotices(current=>({...current,currency:'Baz para birimi kaydedildi.'}))}catch(e){setErrors(current=>({...current,currency:(e as Error).message}))}finally{setBusy('')}}
  async function saveRetention(){setBusy('audit');setErrors(current=>({...current,audit:''}));setNotices(current=>({...current,audit:''}));try{const row=await request<RetentionSettings>('/api/audit-retention/',{method:'PUT',body:{retentionDays:Number(retentionDays)}});setRetention(row);setRetentionDays(String(row.retentionDays));setNotices(current=>({...current,audit:'Denetim saklama politikası kaydedildi.'}))}catch(e){setErrors(current=>({...current,audit:(e as Error).message}))}finally{setBusy('')}}
  async function saveProfile(){setBusy('profile');setErrors(current=>({...current,profile:''}));setNotices(current=>({...current,profile:''}));try{const row=await request<CompanyProfile>('/api/tenant-company-profile/',{method:'PUT',body:{legalName,taxOffice,taxNumber}});setCompanyProfile(row);setLegalName(row.legalName);setTaxOffice(row.taxOffice??'');setTaxNumber(row.taxNumber??'');setNotices(current=>({...current,profile:'Firma profili kaydedildi.'}))}catch(e){setErrors(current=>({...current,profile:(e as Error).message}))}finally{setBusy('')}}

  return <div className="page-content company-settings-page tenant-operational-settings-page">
    <div className="page-heading"><div><p className="eyebrow">FİRMA · PROFİL VE OPERASYON</p><h1>Firma ayarları</h1><p className="muted">Ticari kimlik ve bu firma için geçerli çalışma ayarları.</p></div><div className="company-settings-actions"><button className="secondary" onClick={()=>onNavigate?.('license-settings')}>Firma lisansı</button><button className="secondary" onClick={()=>void load()} disabled={loading||Boolean(busy)}>Yenile</button></div></div>
    {!isAdmin&&<div className="boundary-note"><ShieldCheck size={17}/><span><b>Salt okunur görünüm</b>Bu ayarları yalnızca firma yöneticisi değiştirebilir.</span></div>}
    <section className="panel company-setting-card company-identity-card">
      <div className="panel-heading"><div><h3>Firma profili</h3><p>Ticari unvan ve vergi kimliği. Bu kayıt yalnızca açık olan firmaya bağlanır.</p></div><span className="status-live ready"><ShieldCheck size={14}/> Firma kapsamlı</span></div>
      {errors.profile&&<div className="alert inline-alert">{errors.profile}</div>}{notices.profile&&<div className="notice">{notices.profile}</div>}
      <div className="company-identity-values"><div><small>Firma adı</small><b>{tenant.name}</b></div><div><small>Firma kodu</small><b>{tenant.slug}</b></div></div>
      <div className="company-profile-fields">
        <label className="company-setting-field">Ticari unvan<input value={legalName} maxLength={200} required disabled={loading||Boolean(busy)||!isAdmin||!companyProfile} onChange={e=>{setLegalName(e.target.value);setErrors(current=>({...current,profile:''}));setNotices(current=>({...current,profile:''}))}} placeholder="Örn. Nexora Teknoloji Anonim Şirketi"/><small>Resmî kayıtlardaki ticari unvan.</small></label>
        <label className="company-setting-field">Vergi dairesi <span className="field-optional">İsteğe bağlı</span><input value={taxOffice} maxLength={100} disabled={loading||Boolean(busy)||!isAdmin||!companyProfile} onChange={e=>{setTaxOffice(e.target.value);setErrors(current=>({...current,profile:''}));setNotices(current=>({...current,profile:''}))}} placeholder="Örn. Kadıköy"/></label>
        <label className="company-setting-field">Vergi numarası <span className="field-optional">İsteğe bağlı</span><input inputMode="numeric" autoComplete="off" value={taxNumber} maxLength={10} disabled={loading||Boolean(busy)||!isAdmin||!companyProfile||companyProfile.taxNumberMasked} onChange={e=>{setTaxNumber(e.target.value.replace(/\D/g,'').slice(0,10));setErrors(current=>({...current,profile:''}));setNotices(current=>({...current,profile:''}))}} placeholder="10 rakam"/><small>{companyProfile?.taxNumberMasked?'Güvenlik için yalnızca son 4 hane gösterilir; düzenleme için firma yöneticisine başvurun.':'Yalnızca firma vergi numarası alınır; kişisel kimlik numarası istenmez.'}</small></label>
      </div>
      {isAdmin&&<div className="modal-foot"><span>{companyProfile?.updatedAt?`Son kayıt: ${new Date(companyProfile.updatedAt).toLocaleString('tr-TR')}`:'Profil ilk kez kaydedilecek.'}</span><div className="setting-actions">{profileChanged&&<button className="secondary small-button" disabled={Boolean(busy)} onClick={()=>{setLegalName(companyProfile!.legalName);setTaxOffice(companyProfile!.taxOffice??'');setTaxNumber(companyProfile!.taxNumber??'');setErrors(current=>({...current,profile:''}));setNotices(current=>({...current,profile:''}))}}>Geri al</button>}<button className="primary" disabled={loading||Boolean(busy)||!companyProfile||!legalName.trim()||(taxNumber!==''&&!/^\d{10}$/.test(taxNumber))||!profileChanged} onClick={()=>void saveProfile()}><Save size={15}/>{busy==='profile'?'Kaydediliyor…':'Profili kaydet'}</button></div></div>}
      <div className="boundary-note"><ShieldCheck size={16}/><span>Firma adı ve kodu çalışma alanı tanımı olarak kalır. Yasal profil ve vergi bilgileri bu firmanın platform kaydında tutulur; vergi numarası denetim kaydına eklenmez.</span></div>
    </section>
    <div className="company-settings-grid">
      <section className="panel company-setting-card">
        <div className="panel-heading"><div><h3><Warehouse size={17}/> Stok politikası</h3><p>Stok çıkışı, sevkiyat, üretim sarfı ve depo transferlerinde uygulanır.</p></div><span className="status-live ready"><ShieldCheck size={14}/> Firma kapsamlı</span></div>
        {errors.stock&&<div className="alert inline-alert">{errors.stock}</div>}{notices.stock&&<div className="notice">{notices.stock}</div>}
        <div className={`stock-policy-state ${allowNegativeStock?'is-enabled':'is-blocked'} ${stockChanged?'is-draft':''}`} role="status"><span className="stock-policy-indicator"/><span className="stock-policy-copy"><b>{stockChanged?'Kaydedilmemiş değişiklik':allowNegativeStock?'Negatif bakiye açık':'Negatif bakiye engelli'}</b><small>{stockChanged?`Taslak seçim: negatif bakiye ${allowNegativeStock?'açık':'engelli'}. Henüz etkin değil.`:allowNegativeStock?'Uygun işlemlerde stok sıfırın altına inebilir.':'Stok çıkışı kullanılabilir miktarı aşamaz.'}</small></span>{stockChanged&&<span className="stock-policy-draft-badge">Taslak</span>}</div>
        <label className="check-row company-setting-option"><input type="checkbox" checked={allowNegativeStock} disabled={loading||Boolean(busy)||!isAdmin||!operations} onChange={e=>{setAllowNegativeStock(e.target.checked);setNotices(current=>({...current,stock:''}));setErrors(current=>({...current,stock:''}))}}/><span><b>Negatif stok bakiyesine izin ver</b><small>Açık olduğunda izin yalnızca izlenmeyen ve belirli bir depo konumu atanmamış stoklarda, aktif rezervasyon yoksa uygulanır. Lot/seri takibi, depo konumu ve rezervasyon kontrolleri korunur.</small></span></label>
        {isAdmin&&<div className="modal-foot"><span>{operations?.updatedAt?`Son kaydedilen durum: ${operations.allowNegativeStock?'Negatif stok açık':'Negatif stok engelli'} · ${new Date(operations.updatedAt).toLocaleString('tr-TR')}`:'Varsayılan: negatif stok engelli'}</span><div className="setting-actions">{stockChanged&&<button className="secondary small-button" disabled={Boolean(busy)} onClick={()=>{setAllowNegativeStock(operations!.allowNegativeStock);setErrors(current=>({...current,stock:''}));setNotices(current=>({...current,stock:''}))}}>Geri al</button>}<button className="primary" disabled={loading||Boolean(busy)||!operations||!stockChanged} onClick={()=>void saveStock()}><Save size={15}/>{busy==='stock'?'Kaydediliyor…':'Kaydet'}</button></div></div>}
      </section>

      <section className="panel company-setting-card">
        <div className="panel-heading"><div><h3><CircleDollarSign size={17}/> Finans ve para birimi</h3><p>Yeni finansal kayıtlarda kullanılacak firmanın baz para birimi.</p></div><span className="status-live ready"><ShieldCheck size={14}/> Firma kapsamlı</span></div>
        {errors.currency&&<div className="alert inline-alert">{errors.currency}</div>}{notices.currency&&<div className="notice">{notices.currency}</div>}
        <label className="company-setting-field">Baz para birimi (ISO 4217)<input aria-label="Baz para birimi" value={baseCurrencyCode} maxLength={3} autoCapitalize="characters" disabled={loading||Boolean(busy)||!isAdmin||!currency} onChange={e=>{setBaseCurrencyCode(e.target.value.toUpperCase().replace(/[^A-Z]/g,''));setErrors(current=>({...current,currency:''}));setNotices(current=>({...current,currency:''}))}}/><small>Örnek: TRY, USD, EUR. İlk finansal hareket veya kur kaydından sonra değiştirilemez.</small></label>
        {isAdmin&&<div className="modal-foot"><span>Kaydedilmiş değer: {currency?.baseCurrencyCode??(loading?'Yükleniyor…':'—')}</span><div className="setting-actions">{currencyChanged&&<button className="secondary small-button" disabled={Boolean(busy)} onClick={()=>{setBaseCurrencyCode(currency!.baseCurrencyCode);setErrors(current=>({...current,currency:''}));setNotices(current=>({...current,currency:''}))}}>Geri al</button>}<button className="primary" disabled={loading||Boolean(busy)||!currency||!/^[A-Z]{3}$/.test(baseCurrencyCode)||!currencyChanged} onClick={()=>void saveCurrency()}><Save size={15}/>{busy==='currency'?'Kaydediliyor…':'Kaydet'}</button></div></div>}
      </section>

      <section className="panel company-setting-card">
        <div className="panel-heading"><div><h3><ShieldCheck size={17}/> Denetim kayıtları</h3><p>Bu firmaya ait değiştirilemez işlem kayıtlarının saklama süresi.</p></div><span className="status-live ready"><ShieldCheck size={14}/> Firma kapsamlı</span></div>
        {errors.audit&&<div className="alert inline-alert">{errors.audit}</div>}{notices.audit&&<div className="notice">{notices.audit}</div>}
        <label className="company-setting-field">Saklama süresi (gün)<input aria-label="Denetim saklama süresi" type="number" min={retention?.minimumRetentionDays??30} max={retention?.maximumRetentionDays??3650} step="1" value={retentionDays} disabled={loading||Boolean(busy)||!isAdmin||!retention} onChange={e=>{setRetentionDays(e.target.value);setErrors(current=>({...current,audit:''}));setNotices(current=>({...current,audit:''}))}}/><small>İzin verilen aralık: {retention?.minimumRetentionDays??30}–{retention?.maximumRetentionDays??3650} gün.</small></label>
        {isAdmin&&<div className="modal-foot"><span>{retention?.lastPurgeAt?`Son temizlik: ${new Date(retention.lastPurgeAt).toLocaleString('tr-TR')}`:'Temizlik henüz çalışmadı.'}</span><div className="setting-actions">{retentionChanged&&<button className="secondary small-button" disabled={Boolean(busy)} onClick={()=>{setRetentionDays(String(retention!.retentionDays));setErrors(current=>({...current,audit:''}));setNotices(current=>({...current,audit:''}))}}>Geri al</button>}<button className="primary" disabled={loading||Boolean(busy)||!retention||!/^[0-9]+$/.test(retentionDays)||Number(retentionDays)<retention.minimumRetentionDays||Number(retentionDays)>retention.maximumRetentionDays||!retentionChanged} onClick={()=>void saveRetention()}><Save size={15}/>{busy==='audit'?'Kaydediliyor…':'Kaydet'}</button></div></div>}
      </section>
    </div>
  </div>
}
