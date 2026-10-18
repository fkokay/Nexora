import { useState, type FormEvent } from 'react'
import { Database, ShieldCheck, X } from 'lucide-react'
import { api } from './api'

type DatabaseEngineeringPlan = {
  summary:string
  readOnlySqlQueries:{purpose:string;sql:string}[]
  migrationDesign:string[]
  indexRecommendations:string[]
  performanceAnalysis:string[]
  integrityChecks:string[]
  assumptions:string[]
  risks:string[]
}
type PlanResponse = {plan:DatabaseEngineeringPlan;sources:{path:string;sha256:string}[];executed:boolean}

export function DatabaseEngineer({token,projectId,projectName,requestId,workspaceName,disabled}:{token:string;projectId:string;projectName:string;requestId:string;workspaceName:string;disabled?:boolean}) {
  const [open,setOpen]=useState(false),[request,setRequest]=useState(''),[pathsText,setPathsText]=useState(''),[consent,setConsent]=useState(false),[loading,setLoading]=useState(false),[result,setResult]=useState<PlanResponse|null>(null),[error,setError]=useState('')
  async function createPlan(event:FormEvent) {
    event.preventDefault()
    const paths=pathsText.split(/\r?\n/).map(path=>path.trim()).filter(Boolean)
    if(!consent||!request.trim()||paths.length===0)return
    setLoading(true);setError('');setResult(null)
    try {
      setResult(await api<PlanResponse>(`/studio/projects/${projectId}/workspace-requests/${requestId}/database-engineering-plan`,token,{method:'POST',body:JSON.stringify({request:request.trim(),paths,aiSharingConfirmed:true})}))
      setConsent(false)
    } catch(e) { setError((e as Error).message) } finally { setLoading(false) }
  }
  return <>
    <button type="button" className="secondary small-button" disabled={disabled} onClick={()=>{setOpen(true);setError('')}}><Database size={14}/> AI Database Engineer</button>
    {open&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!loading)setOpen(false)}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="database-engineer-title">
      <div className="modal-head"><div><p className="eyebrow">AI AGENT · VERİTABANI MÜHENDİSİ</p><h2 id="database-engineer-title">{projectName} · {workspaceName}</h2></div><button type="button" className="icon-button" onClick={()=>setOpen(false)} disabled={loading} aria-label="Kapat"><X size={18}/></button></div>
      <p className="muted modal-sub">Seçtiğiniz SQL, ORM, uygulama modeli veya API sözleşmelerine göre sorgu, migration, indeks, performans ve veri bütünlüğü önerileri hazırlar. OpenAPI, protobuf, GraphQL, WSDL/XSD, Thrift ve Avro dosyaları desteklenir. Öneriler çalıştırılmaz ve canlı veritabanına bağlanılmaz.</p>
      {error&&<div className="alert">{error}</div>}
      {!result&&<form onSubmit={createPlan}>
        <label>Veritabanı görevi<textarea value={request} onChange={event=>setRequest(event.target.value)} required maxLength={2000} rows={3} placeholder="Örn. Müşteri hareketleri için tenant güvenli ve sayfalı SQL Server sorgusu tasarla"/></label>
        <label>İncelenecek dosya yolları <small>Her satıra bir dosya yazın. En fazla 10 dosya; SQL, Prisma, protobuf, GraphQL, WSDL/XSD, Thrift ve Avro dosyaları kabul edilir.</small><textarea value={pathsText} onChange={event=>setPathsText(event.target.value)} required rows={4} placeholder={'db/schema.sql\ncontracts/orders.proto\ncontracts/orders.wsdl'}/></label>
        <label style={{display:'flex',alignItems:'flex-start',gap:9,marginTop:12}}><input type="checkbox" checked={consent} onChange={event=>setConsent(event.target.checked)} required style={{width:16,marginTop:3}}/><span>Seçtiğim dosyaların içeriğinin güvenlik taramasından sonra OpenAI’ye gönderilmesini onaylıyorum. SQL çalıştırılmaz, migration uygulanmaz ve plan otomatik kaydedilmez.</span></label>
        <div className="modal-foot"><span>En çok 32 KiB/dosya, 128 KiB toplam. Sadece seçtiğiniz dosyalar okunur.</span><button className="primary" disabled={loading||!consent}>{loading?'Analiz ediliyor…':'Veritabanı planı hazırla'}</button></div>
      </form>}
      {result&&<><div className="notice">{result.plan.summary}</div><div className="boundary-note"><ShieldCheck size={17}/><span><b>Çalıştırılmadı</b> SQL önerileri yalnızca SELECT sorgularıdır. Migration taslakları açıklama niteliğindedir; kodda veya veritabanında değişiklik yapılmadı.</span></div>
        <div className="requests-list" style={{marginTop:12}}>{result.sources.map(source=><article className="request-row" key={source.path}><div className="request-info"><b>{source.path}</b><small>SHA-256 · {source.sha256.slice(0,16)}</small></div></article>)}</div>
        {result.plan.readOnlySqlQueries.length>0&&<section className="panel" style={{marginTop:12}}><div className="panel-heading"><b>Salt okunur SQL Server sorguları</b></div>{result.plan.readOnlySqlQueries.map((item,index)=><article className="request-row expanded" key={index}><div className="request-info"><b>{item.purpose}</b><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}><code>{item.sql}</code></pre></div></article>)}</section>}
        {([['Migration tasarımı',result.plan.migrationDesign],['İndeks önerileri',result.plan.indexRecommendations],['Performans analizi',result.plan.performanceAnalysis],['Veri bütünlüğü kontrolleri',result.plan.integrityChecks],['Varsayımlar ve riskler',[...result.plan.assumptions,...result.plan.risks]]] as [string,string[]][]).map(([title,items])=>items.length>0&&<section className="panel" style={{marginTop:12}} key={title}><div className="panel-heading"><b>{title}</b></div><ul>{items.map((item,index)=><li key={index}>{item}</li>)}</ul></section>)}
        <div className="modal-foot"><span>İnsan incelemesi ve bağımsız doğrulama gerekli.</span><button type="button" className="secondary" onClick={()=>{setResult(null);setRequest('');setPathsText('')}}>Yeni analiz</button></div>
      </>}
    </section></div>}
  </>
}
