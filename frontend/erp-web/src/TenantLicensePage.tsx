import { useEffect, useState } from 'react'
import { BadgeCheck, Database, KeyRound, Layers3, ShieldCheck, Users } from 'lucide-react'
import './license.css'

type License = {
  status: 'Unlicensed' | 'Active' | 'Expired' | 'Invalid'
  licenseId: string | null
  tier: string | null
  expiresAt: string | null
  maxUsers: number | null
  maxCustomModules: number | null
  maxStorageGb: number | null
  features: { advancedWorkflow: boolean; customModuleSource: boolean; highAvailability: boolean } | null
  rowVersion: string | null
  usage: { users: number; customModules: number; sqlDataBytes: number | null } | null
}

const tiers = [
  { code: 'Small', name: 'Küçük firma', users: '10 kullanıcı', modules: '3 özel modül', storage: '10 GB', workflow: false, source: false, ha: false },
  { code: 'Medium', name: 'Orta firma', users: '50 kullanıcı', modules: '15 özel modül', storage: '100 GB', workflow: true, source: true, ha: false },
  { code: 'Large', name: 'Büyük firma', users: 'Sınırsız kullanıcı', modules: 'Sınırsız özel modül', storage: 'Sınırsız', workflow: true, source: true, ha: true },
] as const

function formatStorage(bytes: number | null | undefined): string {
  if (bytes == null) return 'Ölçüm kullanılamıyor'
  return `${(bytes / 1_000_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} GB`
}

export default function TenantLicensePage({ token, role, onBack }: { token: string; role: string; onBack?:()=>void }) {
  const [license, setLicense] = useState<License | null>(null)
  const [signedGrant, setSignedGrant] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string; title?: string } | null
      throw new Error(response.status === 403 ? 'Bu işlem için firma yöneticisi yetkisi gerekir.' : payload?.error || payload?.title || `İstek başarısız (${response.status}).`)
    }
    return response.json() as Promise<T>
  }

  async function load() {
    setLoading(true); setError('')
    try { setLicense(await request<License>('/api/tenant-license/')) }
    catch (cause) { setError((cause as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [token])

  async function activate(event: React.FormEvent) {
    event.preventDefault()
    if (!license || !signedGrant.trim() || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await request<License>('/api/tenant-license/activate', 'POST', { signedGrant: signedGrant.trim(), rowVersion: license.rowVersion })
      setLicense(await request<License>('/api/tenant-license/')); setSignedGrant(''); setNotice('Lisans doğrulandı ve bu firma için etkinleştirildi.')
    } catch (cause) { setError((cause as Error).message) }
    finally { setBusy(false) }
  }

  const isAdmin = role === 'TenantAdmin'
  return <div className="page-content company-settings-page license-page">
    <div className="page-heading"><div><p className="eyebrow">FİRMA · LİSANSLAMA</p><h1>Firma lisansı</h1><p className="muted">Lisans seviyesini görüntüleyin ve bu firmaya ait imzalı lisans kodunu etkinleştirin.</p></div><div className="company-settings-actions"><button className="secondary" onClick={onBack}>Firma ayarları</button><button className="secondary" onClick={() => void load()} disabled={loading || busy}>Yenile</button></div></div>
    {error && <div className="alert inline-alert" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    <section className="panel license-current"><div className="panel-heading"><div><h3><BadgeCheck size={18}/> Geçerli lisans</h3><p>Durum ve kullanım sınırları bu firma için uygulanır.</p></div><span className={`license-state ${license?.status === 'Active' ? 'active' : ''}`}><i/>{loading ? 'Yükleniyor…' : license?.status === 'Active' ? 'Etkin' : license?.status === 'Expired' ? 'Süresi dolmuş' : license?.status === 'Invalid' ? 'Yeniden etkinleştirme gerekli' : 'Lisans girilmemiş'}</span></div>
    {license?.status === 'Invalid' ? <div className="license-empty" role="status"><KeyRound size={20}/><span><b>Kayıtlı lisans paketi tanınmıyor</b><small>Bu firmadaki lisans kaydı desteklenmeyen bir paket adı içeriyor. Lisans sınırları gösterilemiyor. Firma yöneticisi, aşağıya bu firmaya ait geçerli imzalı lisansı girerek kaydı düzeltebilir.</small></span></div> : license && license.status !== 'Unlicensed' ? <div className="license-limits"><div><Users size={17}/><b>{license.usage?.users ?? 0} / {license.maxUsers === 2147483647 ? '∞' : license.maxUsers}</b><small>Kullanıcı sınırı · uygulanıyor</small></div><div><Layers3 size={17}/><b>{license.usage?.customModules ?? 0} / {license.maxCustomModules === 2147483647 ? '∞' : license.maxCustomModules}</b><small>Özel modül sınırı · uygulanıyor</small></div><div><Database size={17}/><b>{formatStorage(license.usage?.sqlDataBytes)} / {license.maxStorageGb === 2147483647 ? 'Sınırsız' : `${license.maxStorageGb} GB`}</b><small>SQL veri sayfaları · ölçüm, kota değil</small></div><div><ShieldCheck size={17}/><b>{license.tier}</b><small>{license.expiresAt ? `Bitiş ${new Date(license.expiresAt).toLocaleDateString('tr-TR')}` : 'Süre bilgisi yok'}</small></div></div> : <div className="license-empty"><KeyRound size={20}/><span><b>Henüz etkin lisans yok</b><small>Başlangıç kullanımı: {license?.usage?.users ?? 0} / 10 kullanıcı, {license?.usage?.customModules ?? 0} / 3 özel modül. SQL veri sayfası kullanımı {formatStorage(license?.usage?.sqlDataBytes)} olarak izlenir; kota henüz uygulanmaz.</small></span></div>}
    </section>
    <div className="boundary-note"><Database size={16}/><span>SQL veri kullanımı, seçili firmanın ayrı veritabanındaki ayrılmış veri sayfalarından ölçülür. Bu ölçüm dosya deposunu ve transaction log alanını kapsamaz; şimdilik bilgilendirme amaçlıdır ve yazma kotası uygulamaz. Kullanıcı ve özel modül sınırları sunucu tarafında uygulanır.</span></div>
    <section className="license-tier-grid" aria-label="Lisans paketleri">{tiers.map((tier,index)=><article className={`panel license-tier-card ${license?.tier === tier.code ? 'selected' : ''}`} key={tier.code}><span className="license-tier-number">0{index+1}</span><p className="eyebrow">{tier.code.toLocaleUpperCase('tr-TR')} · PAKET</p><h3>{tier.name}</h3><div><Users size={15}/>{tier.users}</div><div><Layers3 size={15}/>{tier.modules}</div><div><Database size={15}/>{tier.storage} · paket bilgisi, kota uygulanmıyor</div><ul><li className={tier.workflow ? 'included' : ''}>Gelişmiş iş akışları</li><li className={tier.source ? 'included' : ''}>Özel modül kaynak kodu</li><li>Depolama kotası uygulanmıyor</li><li>{tier.ha ? 'HA lisans işareti; HA altyapısı ve SLA sağlanmıyor' : 'HA pakete dahil değil'}</li></ul>{license?.tier === tier.code && <span className="license-selected-badge">Etkin paket</span>}</article>)}</section>
    <section className="panel license-activation"><div className="panel-heading"><div><h3><KeyRound size={17}/> Lisans kodunu etkinleştir</h3><p>Kod, sunucudaki lisans veren açık anahtarla doğrulanır.</p></div><ShieldCheck size={19}/></div>
      {!isAdmin && <div className="boundary-note"><ShieldCheck size={16}/><span>Lisansı yalnız firma yöneticisi değiştirebilir.</span></div>}
      <form onSubmit={event => void activate(event)}><label>İmzalı lisans kodu<textarea value={signedGrant} onChange={event => setSignedGrant(event.target.value)} required maxLength={8192} disabled={!isAdmin || busy || loading || !license} rows={3} autoComplete="off" spellCheck={false} placeholder="Sağlayıcınızın verdiği imzalı lisans kodunu buraya yapıştırın"/></label><div className="modal-foot"><span>Kod doğrulama tamamlanınca alan temizlenir; yalnız kod özeti saklanır.</span><button className="primary" disabled={!isAdmin || busy || loading || !license || !signedGrant.trim()}><KeyRound size={15}/>{busy ? 'Doğrulanıyor…' : 'Lisansı etkinleştir'}</button></div></form>
      <div className="boundary-note"><ShieldCheck size={16}/><span>İmza geçersizse, firmaya ait değilse veya sunucuda lisans veren açık anahtar yoksa kod reddedilir. Lisans kodu kullanıcı arayüzünde saklanmaz.</span></div>
    </section>
  </div>
}
