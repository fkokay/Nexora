type Props = {
  role: string
  busy: boolean
  onImport: () => void
}

export default function ExchangeRatesHeader({ role, busy, onImport }: Props) {
  return <div className="panel-heading">
    <div>
      <h3>Baz para birimi ve döviz kurları</h3>
      <p>TCMB gösterge satış kurları her gün Türkiye saatiyle 16.45’ten sonra otomatik alınır. Yayın gecikirse yapılandırılmış yeniden deneme penceresinde artan aralıklarla tekrar denenir. Tatil günlerinde son yayımlanan tarih kullanılır. Elle girilen kurlar korunur.</p>
    </div>
    {role === 'TenantAdmin' && <button type="button" className="secondary" disabled={busy} onClick={onImport}>
      {busy ? 'TCMB kurları alınıyor…' : 'TCMB’den güncel kurları çek'}
    </button>}
  </div>
}
