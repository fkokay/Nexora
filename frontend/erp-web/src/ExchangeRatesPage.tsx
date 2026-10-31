import { useEffect, useState } from 'react'
import { api, localDateString } from './erpApi'
import type { BuiltInScreenLayoutField } from './erp-types'
import ExchangeRatesHeader from './exchange-rates/components/ExchangeRatesHeader'
import ExchangeRatesMessages from './exchange-rates/components/ExchangeRatesMessages'
import ExchangeRateEditor from './exchange-rates/components/ExchangeRateEditor'
import ExchangeRateHistory from './exchange-rates/components/ExchangeRateHistory'
import type { ExchangeRate } from './exchange-rates/types'

export default function ExchangeRatesPage({token,role}:{token:string;role:string}) {
  const [base,setBase]=useState('TRY'),[rates,setRates]=useState<ExchangeRate[]>([]),[code,setCode]=useState('USD'),[date,setDate]=useState(localDateString()),[rate,setRate]=useState(''),[source,setSource]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const defaultLayout:BuiltInScreenLayoutField[]=[{key:'rateDate',label:'Tarih',visible:true,position:0},{key:'currencyCode',label:'Döviz',visible:true,position:1},{key:'rate',label:'1 birim karşılığı',visible:true,position:2},{key:'revision',label:'Revizyon',visible:true,position:3},{key:'source',label:'Kaynak',visible:true,position:4}]
  const [screenFields,setScreenFields]=useState(defaultLayout)
  async function load(){try{const [currency,rows]=await Promise.all([api<{baseCurrencyCode:string}>('/api/finance/currency',token),api<ExchangeRate[]>('/api/finance/exchange-rates',token)]);setBase(currency.baseCurrencyCode);setRates(rows)}catch(e){setError((e as Error).message)}}
  useEffect(()=>{void load()},[token])
  useEffect(()=>{let cancelled=false;api<{fields:BuiltInScreenLayoutField[]}>('/api/screen-views/exchange-rates/active',token).then(view=>{if(!cancelled&&view.fields?.length)setScreenFields(view.fields)}).catch(()=>{});return()=>{cancelled=true}},[token])
  async function saveRate(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{await api('/api/finance/exchange-rates',token,{method:'POST',body:JSON.stringify({currencyCode:code,rateDate:date,rate:Number(rate),source:source||null})});setNotice('Döviz kuru eklendi. Düzeltmeler yeni revizyon olarak kaydedilir.');setRate('');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function importTcmb(){setBusy(true);setError('');setNotice('');try{const result=await api<{rateDate:string;imported:number;skipped:number;baseCurrencyCode:string}>('/api/finance/exchange-rates/import-tcmb',token,{method:'POST'});setNotice(`TCMB ${result.rateDate.split('-').reverse().join('.')} tarihli kurları alındı: ${result.imported} yeni kur, ${result.skipped} mevcut kur korundu. Baz para: ${result.baseCurrencyCode}.`);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function saveBase(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{const result=await api<{baseCurrencyCode:string}>('/api/finance/currency',token,{method:'PUT',body:JSON.stringify({baseCurrencyCode:base})});setBase(result.baseCurrencyCode);setNotice('Baz para birimi güncellendi.');await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <section className="panel finance-workbench fx-rates-workbench">
    <ExchangeRatesHeader role={role} busy={busy} onImport={() => void importTcmb()} />
    <ExchangeRatesMessages error={error} notice={notice} onDismissError={() => setError('')} />
    <div className="finance-workbench-grid fx-rates-grid">
      <ExchangeRateEditor
        base={base}
        code={code}
        date={date}
        rate={rate}
        source={source}
        busy={busy}
        role={role}
        onBaseChange={value => setBase(value.toUpperCase())}
        onCodeChange={value => setCode(value.toUpperCase())}
        onDateChange={setDate}
        onRateChange={setRate}
        onSourceChange={setSource}
        onSaveBase={saveBase}
        onSaveRate={saveRate}
      />
      <ExchangeRateHistory rates={rates} base={base} fields={screenFields} />
    </div>
  </section>
}
