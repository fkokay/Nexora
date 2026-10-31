import { useEffect, useState } from 'react'
import { api, localDateString } from './erpApi'
import type { FxRevaluationVoucherSummary, FxRevaluationVoucher } from './erp-types'
import FxRevaluationHeader from './fx-revaluation/components/FxRevaluationHeader'
import FxRevaluationMessages from './fx-revaluation/components/FxRevaluationMessages'
import FxRevaluationCreateForm from './fx-revaluation/components/FxRevaluationCreateForm'
import FxRevaluationVoucherGrid from './fx-revaluation/components/FxRevaluationVoucherGrid'
import FxRevaluationVoucherDetail from './fx-revaluation/components/FxRevaluationVoucherDetail'
import FxRevaluationEmptySelection from './fx-revaluation/components/FxRevaluationEmptySelection'

export default function FxRevaluationPage({token,role}:{token:string;role:string}) {
  const today=localDateString()
  const [date,setDate]=useState(today),[vouchers,setVouchers]=useState<FxRevaluationVoucherSummary[]>([]),[selected,setSelected]=useState<FxRevaluationVoucher|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  async function load(){try{setVouchers(await api<FxRevaluationVoucherSummary[]>('/api/finance/fx-revaluations',token))}catch(e){setError((e as Error).message)}}
  useEffect(()=>{void load()},[token])
  async function create(){if(!window.confirm(`${date} tarihi için değerleme fişi oluşturulsun mu? Fiş kaydedildikten sonra değiştirilemez.`))return;setBusy(true);setError('');setNotice('');try{const voucher=await api<FxRevaluationVoucher>('/api/finance/fx-revaluations',token,{method:'POST',body:JSON.stringify({asOfDate:date})});setSelected(voucher);setNotice(`${voucher.code} fişi oluşturuldu. Borç ve alacak toplamı ${voucher.totalDebit.toLocaleString('tr-TR',{minimumFractionDigits:2})} ${voucher.baseCurrencyCode}.`);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function open(id:string){setError('');try{setSelected(await api<FxRevaluationVoucher>(`/api/finance/fx-revaluations/${id}`,token))}catch(e){setError((e as Error).message)}}
  const money=(value:number,currency:string)=>`${value.toLocaleString('tr-TR',{minimumFractionDigits:2})} ${currency}`
  return <section className="panel finance-workbench fx-revaluation-workbench">
    <FxRevaluationHeader onRefresh={()=>void load()} />
    <FxRevaluationMessages error={error} notice={notice} onDismissError={()=>setError('')} onDismissNotice={()=>setNotice('')} />
    <div className="finance-workbench-grid fx-revaluation-grid">
      <section className="finance-workbench-card">
        <div className="list-toolbar"><div><h4>Değerleme fişleri</h4><p>{vouchers.length} kayıt</p></div></div>
        {role==='TenantAdmin'&&<FxRevaluationCreateForm date={date} today={today} busy={busy} onDateChange={setDate} onCreate={()=>void create()} />}
        <FxRevaluationVoucherGrid token={token} vouchers={vouchers} money={money} onOpen={id=>void open(id)} />
      </section>
      {selected
        ? <FxRevaluationVoucherDetail token={token} voucher={selected} money={money} onClose={()=>setSelected(null)} />
        : <FxRevaluationEmptySelection />}
    </div>
  </section>
}
