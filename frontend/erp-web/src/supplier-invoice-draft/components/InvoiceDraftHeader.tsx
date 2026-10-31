import { FilePlus2, ShieldCheck } from 'lucide-react'

export function InvoiceDraftHeader({ role }: { role: string }) {
  return <>
    <header className="sid-heading"><div><p className="sid-eyebrow">ERP CORE · SATIN ALMA</p><h1>Bağımsız alış faturası taslakları</h1><p>Siparişsiz tedarikçi faturasını kaydedin; uygunsa mal kabul satırıyla eşleştirip maliyet farkını aktarın.</p></div><span className="sid-tenant"><ShieldCheck size={15}/>{role} · firma kapsamı</span></header>
    <section className="sid-draft-banner" role="status"><span><FilePlus2 size={18}/></span><div><b>Taslak · muhasebeleştirilmedi</b><p>Bu kayıt yalnızca belge bilgisidir. Kaydetmek stok, cari borç, ödeme veya yevmiye hareketi oluşturmaz.</p></div></section>
  </>
}

export function InvoiceDraftMessages({ error, notice, onClearError, onClearNotice }: { error: string; notice: string; onClearError: () => void; onClearNotice: () => void }) {
  return <>
    {error && <div className="sid-alert" role="alert">{error}<button type="button" onClick={onClearError}>Kapat</button></div>}
    {notice && <div className="sid-notice" role="status">{notice}<button type="button" onClick={onClearNotice}>Kapat</button></div>}
  </>
}
