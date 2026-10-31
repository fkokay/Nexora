import { useCallback, useEffect, useMemo, useState } from 'react'
import { authenticatedFetch } from './authApi'
import { localizedText, localizedUiText } from './locale'
import { WorkflowPageHeader } from './workflows/components/WorkflowPageHeader'
import { WorkflowSummary } from './workflows/components/WorkflowSummary'
import { WorkflowBuilder } from './workflows/components/WorkflowBuilder'
import { WorkflowCatalogPanels } from './workflows/components/WorkflowCatalogPanels'
import { WorkflowInbox } from './workflows/components/WorkflowInbox'
import type { WorkflowDefinition, WorkflowInstance, WorkflowStep } from './workflows/types'
import './workflow.css'

const roles=['TenantAdmin','TenantDeveloper','TenantUser']

export default function WorkflowPage({token,role}:{token:string;role:string}) {
  const admin=role==='TenantAdmin'
  const [definitions,setDefinitions]=useState<WorkflowDefinition[]>([]),[instances,setInstances]=useState<WorkflowInstance[]>([])
  const [editing,setEditing]=useState<WorkflowDefinition|null>(null),[builderOpen,setBuilderOpen]=useState(false),[name,setName]=useState(''),[code,setCode]=useState(''),[description,setDescription]=useState(''),[steps,setSteps]=useState<WorkflowStep[]>([{name:localizedText('Yönetici onayı','Manager approval'),approverRole:'TenantAdmin'}])
  const [starting,setStarting]=useState<WorkflowDefinition|null>(null),[subjectTitle,setSubjectTitle]=useState(''),[subjectType,setSubjectType]=useState('General')
  const [rejectNotes,setRejectNotes]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [selectedInstanceId,setSelectedInstanceId]=useState('')
  const request=useCallback(async<T,>(url:string,init?:RequestInit):Promise<T>=>{const response=await authenticatedFetch(url,token,{...init,headers:{'Content-Type':'application/json',...init?.headers}});if(!response.ok){const body=await response.json().catch(()=>null) as {error?:string;title?:string;errors?:Record<string,string[]>}|null;throw new Error(body?.error||Object.values(body?.errors??{}).flat().join(' ')||body?.title||localizedText(`İstek başarısız (${response.status})`,`Request failed (${response.status})`))}return response.status===204?undefined as T:response.json() as Promise<T>},[token])
  const refresh=useCallback(async()=>{try{const [d,i]=await Promise.all([request<WorkflowDefinition[]>('/api/workflows/definitions'),request<WorkflowInstance[]>('/api/workflows/instances')]);setDefinitions(d);setInstances(i)}finally{setLoading(false)}},[request])
  useEffect(()=>{void refresh().catch(e=>setError((e as Error).message))},[refresh])
  const drafts=useMemo(()=>definitions.filter(x=>x.status==='Draft'),[definitions]),published=useMemo(()=>definitions.filter(x=>x.status==='Published'),[definitions])
  const approvalTasks=useMemo(()=>instances.filter(x=>x.status==='Pending'&&(admin||x.currentStep.approverRole===role)&&x.startedByUserId!==readUserId()),[instances,admin,role])
  function newWorkflow(){setEditing(null);setBuilderOpen(true);setCode('');setName('');setDescription('');setSteps([{name:localizedText('Yönetici onayı','Manager approval'),approverRole:'TenantAdmin'}])}
  function editWorkflow(item:WorkflowDefinition){setEditing(item);setBuilderOpen(true);setCode(item.code);setName(item.name);setDescription(item.description??'');setSteps(item.steps.map(x=>({...x})))}
  function updateStep(index:number,patch:Partial<WorkflowStep>){setSteps(current=>current.map((step,i)=>i===index?{...step,...patch}:step))}
  async function save(){setBusy(true);setError('');try{const payload={code,name,description,steps};await request(editing?`/api/workflows/definitions/${editing.id}`:'/api/workflows/definitions',{method:editing?'PUT':'POST',body:JSON.stringify(payload)});setNotice(localizedText('İş akışı taslağı kaydedildi.','Workflow draft saved.'));setEditing(null);setBuilderOpen(false);await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function post(url:string,body?:unknown){setBusy(true);setError('');try{await request(url,{method:'POST',...(body===undefined?{}:{body:JSON.stringify(body)})});await refresh();setNotice(localizedText('İşlem tamamlandı.','Action completed.'))}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  async function start(item:WorkflowDefinition){await post(`/api/workflows/definitions/${item.id}/instances`,{subjectType,subjectTitle,context:{}});setStarting(null);setSubjectTitle('')}
  return <div className="workflow-page"><WorkflowPageHeader admin={admin} onNew={newWorkflow}/>
    {error&&<div className="workflow-alert error" role="alert"><span>{localizedUiText(error)}</span><button onClick={()=>{setError('');setLoading(true);void refresh().catch(e=>setError((e as Error).message))}}>{localizedText('Yeniden dene','Retry')}</button></div>}{notice&&<div className="workflow-alert success" role="status">{notice}<button aria-label={localizedText('Bildirimi kapat','Dismiss notification')} onClick={()=>setNotice('')}>{localizedText('Kapat','Close')}</button></div>}
    {!loading&&!error&&<WorkflowSummary admin={admin} publishedCount={published.length} draftCount={drafts.length} inProgressCount={instances.filter(x=>x.status==='Pending').length} awaitingDecisionCount={approvalTasks.length}/>}
    {loading&&<section className="workflow-loading" role="status" aria-live="polite"><span className="workflow-spinner" aria-hidden="true"/> {localizedText('İş akışları yükleniyor…','Loading workflows…')}</section>}
    {admin&&builderOpen&&<WorkflowBuilder editing={editing} busy={busy} code={code} name={name} description={description} steps={steps} roles={roles} onCodeChange={setCode} onNameChange={setName} onDescriptionChange={setDescription} onClose={()=>{setEditing(null);setBuilderOpen(false);setCode('');setName('')}} onSave={()=>void save()} onAddStep={()=>setSteps(current=>[...current,{name:`${localizedText('Onay adımı','Approval step')} ${current.length+1}`,approverRole:'TenantAdmin'}])} onUpdateStep={updateStep} onRemoveStep={index=>setSteps(current=>current.filter((_,i)=>i!==index))}/>}
    {!loading&&!error&&<WorkflowCatalogPanels admin={admin} published={published} drafts={drafts} busy={busy} starting={starting} subjectType={subjectType} subjectTitle={subjectTitle} setStarting={setStarting} setSubjectType={setSubjectType} setSubjectTitle={setSubjectTitle} editWorkflow={editWorkflow} post={post} start={start}/>}
    {!loading&&!error&&<WorkflowInbox admin={admin} role={role} instances={instances} approvalTasks={approvalTasks} selectedInstanceId={selectedInstanceId} rejectNotes={rejectNotes} busy={busy} currentUserId={readUserId()} setSelectedInstanceId={setSelectedInstanceId} setRejectNotes={setRejectNotes} post={post}/>}
  </div>
}

function readUserId(){try{const token=localStorage.getItem('aierp.accessToken')??localStorage.getItem('aierp.token');if(!token)return '';const payload=token.split('.')[1];return JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/'))).sub??''}catch{return ''}}
