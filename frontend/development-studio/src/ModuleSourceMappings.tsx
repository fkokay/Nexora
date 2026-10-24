import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck, X } from 'lucide-react'
import { api } from './api'

type Project = { id:string; name:string; repositoryUrl:string; defaultBranch:string }
type Mapping = { id:string; moduleCode:string; projectId:string; projectName:string; repositoryUrl:string; ref:string; pathAllowlist:string[]; createdAt:string }

export function ModuleSourceMappings({token,project,onClose}:{token:string;project:Project;onClose:()=>void}) {
  const [items,setItems]=useState<Mapping[]>([]),[moduleCodes,setModuleCodes]=useState<string[]>([]),[moduleCode,setModuleCode]=useState(''),[ref,setRef]=useState(project.defaultBranch),[paths,setPaths]=useState(''),[confirmed,setConfirmed]=useState(false),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  async function load(){setError('');try{const [mappings,codes]=await Promise.all([api<Mapping[]>(`/studio/projects/${project.id}/module-source-mappings`,token),api<string[]>('/studio/modules/active',token)]);setItems(mappings);setModuleCodes(codes);setModuleCode(current=>current||codes[0]||'')}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
  useEffect(()=>{void load()},[project.id,token])
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');setNotice('');try{await api<Mapping>('/studio/projects/module-source-mappings',token,{method:'POST',body:JSON.stringify({projectId:project.id,moduleCode:moduleCode.trim(),ref:ref.trim(),pathAllowlist:paths.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),mappingConfirmed:confirmed})});setNotice('Modül kaynak eşlemesi tenant için kaydedildi ve denetim kaydına eklendi.');setModuleCode('');setPaths('');setConfirmed(false);await load()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function remove(item:Mapping){if(!window.confirm(`${item.moduleCode} kaynak eşlemesi kaldırılsın mı?`))return;setBusy(true);setError('');try{await api<void>(`/studio/projects/module-source-mappings/${item.id}`,token,{method:'DELETE'});setItems(current=>current.filter(x=>x.id!==item.id));setNotice('Eşleme kaldırıldı ve denetim kaydına eklendi.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose()}}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="module-source-mappings-title">
    <header className="modal-head"><div><p className="eyebrow">TENANT KAPSAMINDA · KULLANICI ONAYLI</p><h2 id="module-source-mappings-title">Modül kaynak eşlemeleri</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Kapat"><X size={19}/></button></header>
    <p className="muted modal-sub">Hedef repo, kayıtlı Studio projesinden alınır: <b>{project.repositoryUrl}</b>. Repo URL’si bu formda değiştirilemez. Ref ve kaynak path’lerini siz doğrularsınız.</p>
    {error&&<div className="alert">{error}</div>}{notice&&<div className="notice">{notice}</div>}
    <form onSubmit={save}>
      <label>Etkin modül kodu<select value={moduleCode} onChange={e=>setModuleCode(e.target.value)} required disabled={moduleCodes.length===0}><option value="">{moduleCodes.length?'Modül seçin':'Etkin modül bulunamadı'}</option>{moduleCodes.map(code=><option key={code} value={code}>{code}</option>)}</select><small>Yalnızca bu tenant’ta etkinleştirilmiş modüller listelenir.</small></label>
      <label>Git ref / branch<input value={ref} onChange={e=>setRef(e.target.value)} maxLength={256} required placeholder="main"/></label>
      <label>Path allowlist metaverisi<textarea value={paths} onChange={e=>setPaths(e.target.value)} maxLength={4000} required rows={4} placeholder={'modules/inventory-tools\nfrontend/modules/inventory-tools'}/><small>Her satıra bir dizin veya dosya yolu. Mutlak yollar, traversal ve hassas klasör adları reddedilir; bu liste mevcut workspace editöründe henüz zorunlu tutulmaz.</small></label>
      <label style={{display:'flex',alignItems:'flex-start',gap:9,marginTop:10}}><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} required style={{width:16,marginTop:3}}/><span>Bu modül için doğru repo, ref ve kaynak path’lerini doğruladım. Kaydetme yalnız eşleme kaydı oluşturur.</span></label>
      <div className="modal-foot"><span><ShieldCheck size={14}/> Repo bağlantısı ve yayın onayları ayrı kalır</span><button className="primary" disabled={busy||!confirmed}>{busy?'Kaydediliyor…':'Eşlemeyi kaydet'} <span>→</span></button></div>
    </form>
    <div className="list-toolbar"><div><h3>Bu projeye bağlı modüller</h3><p>{items.length} eşleme</p></div></div>
    <div className="requests-list">{loading?<div className="empty-small">Eşlemeler yükleniyor…</div>:items.length?items.map(item=><article className="request-row" key={item.id}><div className="request-symbol"><ShieldCheck size={17}/></div><div className="request-info"><b>{item.moduleCode}</b><small>{item.repositoryUrl} · {item.ref}</small><small>Path sınırı: {item.pathAllowlist.join(' · ')}</small></div><button type="button" className="secondary small-button danger-action" disabled={busy} onClick={()=>void remove(item)}>Kaldır</button></article>):<div className="empty-small">Bu projeye henüz modül bağlanmadı.</div>}</div>
    <div className="boundary-note"><ShieldCheck size={17}/><span><b>İşlem sınırı</b>Bu kayıt yalnızca tenant kapsamındaki eşlemeyi saklar. Checkout, Git işlemi, kod çalıştırma, push veya yayın başlatmaz.</span></div>
  </section></div>
}
