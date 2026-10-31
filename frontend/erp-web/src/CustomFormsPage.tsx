import { useCallback, useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi';
import { ClipboardList, FilePlus2, Plus } from 'lucide-react'
import './custom-forms.css'
import { CustomFormBuilder } from './custom-forms/components/CustomFormBuilder'
import { CustomFormsCatalog } from './custom-forms/components/CustomFormsCatalog'
import { CustomFormsHistoryPanel } from './custom-forms/components/CustomFormsHistoryPanel'
import { type Field, type Form, type Revision, type Submission } from './custom-forms/types'

export default function CustomFormsPage({token,role}:{token:string;role:string}) {
  const admin=role==='TenantAdmin'
  const [forms,setForms]=useState<Form[]>([]), [submissions,setSubmissions]=useState<Submission[]>([])
  const [selected,setSelected]=useState<Form|null>(null), [history,setHistory]=useState<Revision[]>([])
  const [name,setName]=useState(''), [code,setCode]=useState(''), [description,setDescription]=useState(''), [fields,setFields]=useState<Field[]>([])
  const [values,setValues]=useState<Record<string,string>>({}), [decisionReason,setDecisionReason]=useState<Record<string,string>>({})
  const [draggingFieldIndex,setDraggingFieldIndex]=useState<number|null>(null)
  const [builderPreview,setBuilderPreview]=useState(false), [previewErrors,setPreviewErrors]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState(''), [mode,setMode]=useState<'catalog'|'builder'|'history'>('catalog')
  const request=useCallback(async<T,>(url:string,init?:RequestInit):Promise<T>=>{
    const response=await authenticatedFetch(url, token, {...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...init?.headers}})
    if(!response.ok){const body=await response.json().catch(()=>null) as {error?:string;title?:string;errors?:Record<string,string[]>}|null;throw new Error(body?.error||Object.values(body?.errors??{}).flat().join(' ')||body?.title||`İstek başarısız (${response.status})`)}
    return response.status===204?undefined as T:response.json() as Promise<T>
  },[token])
  const refresh=useCallback(async()=>{const [f,s]=await Promise.all([request<Form[]>('/api/custom-forms/'),request<Submission[]>('/api/custom-forms/submissions')]);setForms(f);setSubmissions(s);setSelected(current=>current?f.find(x=>x.id===current.id)??current:null)},[request])
  useEffect(()=>{void refresh().catch(e=>setError((e as Error).message))},[refresh])
  const published=useMemo(()=>forms.filter(x=>x.status==='Published'),[forms])
  const catalogSelection=published.find(form=>form.id===selected?.id)??published[0]??null
  function startNew(){setSelected(null);setName('');setCode('');setDescription('');setFields([{code:'field_1',label:'Yeni alan',dataType:'Text',isRequired:false,maxLength:250,options:[]}]);setValues({});setBuilderPreview(false);setPreviewErrors({});setMode('builder')}
  function edit(form:Form){setSelected(form);setName(form.name);setCode(form.code);setDescription(form.description??'');setFields(form.fields.map(f=>({...f,options:f.options??[]})));setValues({});setBuilderPreview(false);setPreviewErrors({});setMode('builder')}
  function createField(dataType:Field['dataType'],current:Field[]):Field{let index=current.length+1,code=`field_${index}`;while(current.some(field=>field.code===code)){index++;code=`field_${index}`}return{code,label:dataType==='Text'?'Yeni metin alanı':dataType==='Decimal'?'Yeni sayı alanı':dataType==='Date'?'Yeni tarih alanı':dataType==='Boolean'?'Yeni onay alanı':'Yeni seçim alanı',dataType,isRequired:false,maxLength:dataType==='Text'?250:0,options:dataType==='Choice'?['Seçenek 1','Seçenek 2']:[]}}
  function addField(dataType:Field['dataType']='Text'){setFields(current=>current.length>=40?current:[...current,createField(dataType,current)])}
  function updateField(index:number,patch:Partial<Field>){setFields(current=>current.map((field,i)=>{if(i!==index)return field;if(patch.dataType==='Choice'&&field.dataType!=='Choice')return{...field,...patch,maxLength:0,options:['Seçenek 1','Seçenek 2']};if(patch.dataType&&patch.dataType!=='Choice')return{...field,...patch,options:[],maxLength:patch.dataType==='Text'?(field.maxLength||250):0};return{...field,...patch}}))}
  function moveField(from:number,to:number){if(from===to)return;setFields(current=>{if(from<0||to<0||from>=current.length||to>=current.length)return current;const next=[...current];const [field]=next.splice(from,1);next.splice(to,0,field);return next})}
  async function save(){setBusy(true);setError('');try{const body={name,description,fields};const saved=selected?await request<Form>(`/api/custom-forms/${selected.id}`,{method:'PUT',body:JSON.stringify(body)}):await request<Form>('/api/custom-forms/',{method:'POST',body:JSON.stringify({...body,code})});setSelected(saved);setNotice('Taslak kaydedildi.');await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function mutate(url:string,body?:unknown){setBusy(true);setError('');try{await request(url,{method:'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});await refresh();setNotice('İşlem tamamlandı.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function openHistory(form:Form){setSelected(form);setError('');try{setHistory(await request<Revision[]>(`/api/custom-forms/${form.id}/history`));setMode('history')}catch(e){setError((e as Error).message)}}
  async function submit(form:Form){setBusy(true);setError('');try{await request(`/api/custom-forms/${form.id}/submissions`,{method:'POST',body:JSON.stringify({values})});setValues({});setNotice('Yanıtınız gönderildi.');await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const control=(field:Field,value:string,onChange:(v:string)=>void,required=field.isRequired)=>field.dataType==='Boolean'?<select required={required} value={value} onChange={e=>onChange(e.target.value)}><option value="">Seçin</option><option value="true">Evet</option><option value="false">Hayır</option></select>:field.dataType==='Choice'?<select required={required} value={value} onChange={e=>onChange(e.target.value)}><option value="">Seçin</option>{(field.options??[]).map(option=><option key={option}>{option}</option>)}</select>:<input required={required} type={field.dataType==='Decimal'?'number':field.dataType==='Date'?'date':'text'} step={field.dataType==='Decimal'?'any':undefined} maxLength={field.dataType==='Text'?field.maxLength??undefined:undefined} value={value} onChange={e=>onChange(e.target.value)} />
  function validatePreview():Record<string,string>{
    const errors:Record<string,string>={}
    for(const field of fields){
      const value=(values[field.code]??'').trim()
      if(!value){if(field.isRequired)errors[field.code]='Bu alan zorunludur.';continue}
      if(field.dataType==='Text'&&value.length>(field.maxLength??250))errors[field.code]=`En fazla ${field.maxLength??250} karakter girilebilir.`
      else if(field.dataType==='Decimal'&&!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))errors[field.code]='Nokta kullanarak geçerli bir sayı girin.'
      else if(field.dataType==='Date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value))errors[field.code]='Geçerli bir tarih girin.'
      else if(field.dataType==='Boolean'&&value!=='true'&&value!=='false')errors[field.code]='Evet veya Hayır seçin.'
      else if(field.dataType==='Choice'&&!(field.options??[]).includes(value))errors[field.code]='Listeden geçerli bir seçenek seçin.'
    }
    setPreviewErrors(errors)
    return errors
  }
  return <div className="forms-page">
    <header className="forms-hero"><div className="forms-hero-icon"><ClipboardList size={23}/></div><div><p className="eyebrow">TENANT İŞ AKIŞLARI</p><h1>Özel Formlar</h1><p>İş süreçleri için form tasarlayın, yayımlayın ve yanıtları yönetin.</p></div>{admin&&<button className="primary" onClick={startNew}><Plus size={17}/> Yeni form</button>}</header>
    {error&&<div className="forms-alert error">{error}</div>}{notice&&<div className="forms-alert success">{notice}<button onClick={()=>setNotice('')}>Kapat</button></div>}
    {mode==='catalog'&&<section className="forms-kpis" aria-label="Form çalışma alanı özeti"><article><span>Yayımlanmış form</span><b>{published.length}</b></article><article><span>Taslak</span><b>{forms.filter(form=>form.status==='Draft').length}</b></article><article><span>Toplam yanıt</span><b>{submissions.length}</b></article><article><span>Bekleyen inceleme</span><b>{submissions.filter(item=>item.status==='Submitted').length}</b></article></section>}
    <div className="forms-tabs"><button className={mode==='catalog'?'active':''} onClick={()=>setMode('catalog')}><ClipboardList size={16}/> Formlar <span>{published.length}</span></button>{admin&&mode!=='catalog'&&<button className={mode==='builder'?'active':''} onClick={()=>setMode('builder')}><FilePlus2 size={16}/> Tasarım</button>}</div>
    {mode==='builder'&&admin&&<CustomFormBuilder selected={selected} name={name} code={code} description={description} fields={fields} values={values} draggingFieldIndex={draggingFieldIndex} builderPreview={builderPreview} previewErrors={previewErrors} busy={busy} onNameChange={setName} onCodeChange={setCode} onDescriptionChange={setDescription} onPreviewChange={setBuilderPreview} onCancel={()=>setMode('catalog')} onSave={()=>void save()} onAddField={addField} onUpdateField={updateField} onMoveField={moveField} onRemoveField={index=>setFields(current=>current.filter((_,i)=>i!==index))} onDraggingFieldIndexChange={setDraggingFieldIndex} onValueChange={(fieldCode,value)=>{setValues(current=>({...current,[fieldCode]:value}));setPreviewErrors(current=>({...current,[fieldCode]:''}))}} onValidatePreview={()=>{if(Object.keys(validatePreview()).length===0)setNotice('Önizleme geçerli. Bu ekranda yanıt gönderilmez.')}} control={control}/>}
    {mode==='history'&&selected&&admin&&<CustomFormsHistoryPanel selected={selected} history={history} busy={busy} onBack={()=>setMode('catalog')} onRestore={revision=>void mutate(`/api/custom-forms/${selected.id}/restore`,{revisionId:revision.id})}/> }
    {mode==='catalog'&&<CustomFormsCatalog forms={forms} published={published} submissions={submissions} catalogSelection={catalogSelection} selectedId={selected?.id??null} admin={admin} busy={busy} values={values} decisionReason={decisionReason} onSelect={setSelected} onValuesChange={setValues} onDecisionReasonChange={setDecisionReason} onSubmit={form=>void submit(form)} onEdit={edit} onOpenHistory={form=>void openHistory(form)} onMutate={(url,body)=>void mutate(url,body)} control={control}/>}
  </div>
}
