import { BadgeCheck, Building2, Clipboard } from 'lucide-react'
import type { IssuedLicense } from '../types'

type Props = {
  issued: IssuedLicense
  copied: boolean
  onCopy: () => void
}

export function IssuedLicenseResult({ issued, copied, onCopy }: Props) {
  return <section className="panel platform-license-result" aria-live="polite"><div className="panel-heading"><div><h3><BadgeCheck size={17}/> Lisans kodu oluşturuldu</h3><p>{issued.tenantName} · {issued.tier} · {new Date(issued.expiresAt).toLocaleDateString('tr-TR')} tarihine kadar</p></div><button type="button" className="secondary small-button" onClick={onCopy}><Clipboard size={14}/>{copied ? 'Kopyalandı' : 'Kodu kopyala'}</button></div><label>İmzalı lisans kodu<textarea readOnly rows={4} value={issued.signedGrant} onFocus={event => event.currentTarget.select()}/></label><div className="platform-license-meta"><span><Building2 size={14}/> Firma kimliği · <code>{issued.tenantId}</code></span><span>Lisans kimliği · <code>{issued.licenseId}</code></span></div><p className="platform-license-note">Bu kodu firmaya güvenli kanaldan iletin. Firma yöneticisi Firma ayarları → Firma lisansı ekranından etkinleştirebilir.</p></section>
}
