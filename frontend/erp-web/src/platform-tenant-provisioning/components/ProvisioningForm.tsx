import { CircleAlert, LoaderCircle } from 'lucide-react'
import type { FormEventHandler } from 'react'
import type { ProvisioningRequest } from '../types'

type Props = {
  form: ProvisioningRequest
  error: string
  busy: boolean
  onChange: (field: keyof ProvisioningRequest, value: string) => void
  onSubmit: FormEventHandler<HTMLFormElement>
}

export default function ProvisioningForm({ form, error, busy, onChange, onSubmit }: Props) {
  return <div className="panel platform-provisioning-card">
    <div className="panel-heading">
      <div><p className="eyebrow">YENİ KAYIT</p><h3>Firma bilgileri</h3><p>İlk firma yöneticisi mevcut ve etkin bir kullanıcı olmalıdır.</p></div>
    </div>
    <form className="platform-provisioning-form" onSubmit={onSubmit}>
      <div className="form-two">
        <label>Firma adı<input value={form.name} onChange={event => onChange('name', event.target.value)} maxLength={200} required autoComplete="organization"/></label>
        <label>Firma kısa adı<input value={form.slug} onChange={event => onChange('slug', event.target.value)} maxLength={100} required placeholder="ornek-firma" autoCapitalize="none"/></label>
      </div>
      <div className="form-two">
        <label>Temel para birimi<input value={form.baseCurrencyCode} onChange={event => onChange('baseCurrencyCode', event.target.value.slice(0, 3).toUpperCase())} maxLength={3} minLength={3} required/></label>
        <label>Firma yöneticisi e-posta<input type="email" value={form.adminEmail} onChange={event => onChange('adminEmail', event.target.value)} maxLength={320} required autoComplete="email"/></label>
      </div>
      <label className="platform-provisioning-admin-name">Firma yöneticisi adı<input value={form.adminDisplayName} onChange={event => onChange('adminDisplayName', event.target.value)} maxLength={160} required autoComplete="name"/></label>
      <p className="platform-provisioning-note">Bu ekranda parola veya veritabanı bilgisi alınmaz. Yönetici hesabı önceden oluşturulmuş olmalıdır.</p>
      {error && <p className="platform-provisioning-error" role="alert"><CircleAlert size={16}/>{error}</p>}
      <div className="platform-provisioning-actions"><button className="primary" disabled={busy}>{busy ? <><LoaderCircle size={16} className="platform-provisioning-spin"/> İstek gönderiliyor…</> : 'Firma oluştur'}</button></div>
    </form>
  </div>
}
