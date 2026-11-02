type Props = { entryCount: number; targetCount: number }

export function CustomMenuSummary({ entryCount, targetCount }: Props) {
  return <>
    <div className="page-heading"><div><p className="eyebrow">TENANT UYARLAMA</p><h1>Özel menüler</h1><p className="muted">Kullanıcılarınız için ERP çalışma alanına kısayollar ekleyin ve sıralayın.</p></div><span className="custom-menu-count">{entryCount} / 30 öğe</span></div>
    <section className="custom-menu-kpis" aria-label="Özel menü özeti"><article><span>Tanımlı menü</span><b>{entryCount}</b></article><article><span>Kullanılabilir alan</span><b>{30 - entryCount}</b></article><article><span>ERP hedefi</span><b>{targetCount}</b></article></section>
  </>
}
