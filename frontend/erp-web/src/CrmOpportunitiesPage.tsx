import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { authenticatedFetch } from './authApi';
import { CalendarClock, CircleDollarSign, UserRound } from 'lucide-react'
import './crm-opportunities.css'
import { CrmOpportunityHeader } from './crm-opportunities/components/CrmOpportunityHeader'
import { CrmOpportunityFilters } from './crm-opportunities/components/CrmOpportunityFilters'
import { CrmOpportunityGrid, CrmOpportunityPagination } from './crm-opportunities/components/CrmOpportunityGrid'
import { CrmOpportunityDetail } from './crm-opportunities/components/CrmOpportunityDetail'
import { CrmOpportunityCreateForm } from './crm-opportunities/components/CrmOpportunityCreateForm'
import { defaultScreenFields, formatMoney, nextStage, stageLabels, type Customer, type Opportunity, type Page, type ScreenField } from './crm-opportunities/types'

export default function CrmOpportunitiesPage({token}:{token:string}) {
  const [items,setItems]=useState<Opportunity[]>([]),[customers,setCustomers]=useState<Customer[]>([]),[totalCount,setTotalCount]=useState(0),[page,setPage]=useState(1),[customerQuery,setCustomerQuery]=useState(''),[selectedCustomer,setSelectedCustomer]=useState<Customer|null>(null),[customerLoading,setCustomerLoading]=useState(false)
  const [selectedOpportunity,setSelectedOpportunity]=useState<Opportunity|null>(null),[createOpen,setCreateOpen]=useState(false)
  const [screenFields,setScreenFields]=useState<ScreenField[]>(defaultScreenFields)
  const [query,setQuery]=useState(''),[filter,setFilter]=useState(''),[busy,setBusy]=useState(false),[listLoading,setListLoading]=useState(true),[listError,setListError]=useState(''),[customerError,setCustomerError]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [closeFrom,setCloseFrom]=useState(''),[closeTo,setCloseTo]=useState(''),[valueFrom,setValueFrom]=useState(''),[valueTo,setValueTo]=useState('')
  const [code,setCode]=useState(''),[name,setName]=useState(''),[customerId,setCustomerId]=useState(''),[value,setValue]=useState(''),[currency,setCurrency]=useState('TRY'),[probability,setProbability]=useState('10'),[closeDate,setCloseDate]=useState(''),[activity,setActivity]=useState(''),[notes,setNotes]=useState('')
  const listRequestId=useRef(0)
  const queryRef=useRef(query),filterRef=useRef(filter),pageRef=useRef(page),advancedFiltersRef=useRef({closeFrom,closeTo,valueFrom,valueTo})
  queryRef.current=query;filterRef.current=filter;pageRef.current=page;advancedFiltersRef.current={closeFrom,closeTo,valueFrom,valueTo}
  const request=useCallback(async<T,>(url:string,init?:RequestInit):Promise<T>=>{
    const response=await authenticatedFetch(url, token, {...init,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...init?.headers}})
    if(!response.ok){const body=await response.json().catch(()=>null) as {error?:string;title?:string;errors?:Record<string,string[]>}|null;throw new Error(body?.error||Object.values(body?.errors??{}).flat().join(' ')||body?.title||`İstek başarısız (${response.status})`)}
    return response.status===204?undefined as T:response.json() as Promise<T>
  },[token])
  const refresh=useCallback(async()=>{
    const requestId=++listRequestId.current
    const currentQuery=queryRef.current,currentFilter=filterRef.current,currentAdvanced=advancedFiltersRef.current
    const q=new URLSearchParams({page:String(pageRef.current),pageSize:'50'});if(currentQuery.trim())q.set('q',currentQuery.trim());if(currentFilter)q.set('stage',currentFilter)
    if(currentAdvanced.closeFrom)q.set('closeFrom',currentAdvanced.closeFrom);if(currentAdvanced.closeTo)q.set('closeTo',currentAdvanced.closeTo)
    if(currentAdvanced.valueFrom)q.set('valueFrom',currentAdvanced.valueFrom);if(currentAdvanced.valueTo)q.set('valueTo',currentAdvanced.valueTo)
    setListLoading(true);setListError('')
    try{const result=await request<Page<Opportunity>>(`/api/crm/opportunities/?${q}`);if(requestId===listRequestId.current){setItems(result.items);setTotalCount(result.total)}}
    catch(e){if(requestId===listRequestId.current)setListError((e as Error).message)}
    finally{if(requestId===listRequestId.current)setListLoading(false)}
  },[request])
  useEffect(()=>{let active=true;void request<{fields:ScreenField[]}>('/api/screen-views/crm-opportunities/active').then(view=>{if(active&&view.fields?.length)setScreenFields(view.fields)}).catch(()=>{});return()=>{active=false}},[request])
  useEffect(()=>{const timer=window.setTimeout(()=>void refresh(),200);return()=>window.clearTimeout(timer)},[filter,query,page,closeFrom,closeTo,valueFrom,valueTo,refresh])
  useEffect(()=>{if(!createOpen)return;let active=true;setCustomerLoading(true);setCustomerError('');const timer=window.setTimeout(()=>{const params=new URLSearchParams({page:'1',pageSize:'50'});if(customerQuery.trim())params.set('q',customerQuery.trim());void request<Page<Customer>>(`/api/customers/?${params}`).then(result=>{if(active)setCustomers(result.items.filter(x=>x.isActive&&(x.type==='Customer'||x.type==='Both')))}).catch(e=>{if(active){setCustomers([]);setCustomerError((e as Error).message)}}).finally(()=>{if(active)setCustomerLoading(false)})},200);return()=>{active=false;window.clearTimeout(timer)}},[createOpen,customerQuery,request])
  async function create(e:FormEvent):Promise<boolean>{e.preventDefault();setBusy(true);setError('');setNotice('');try{await request('/api/crm/opportunities/',{method:'POST',body:JSON.stringify({code,name,customerId:customerId||null,estimatedValue:value?Number(value):null,currencyCode:currency,probabilityPercent:Number(probability),expectedCloseDate:closeDate||null,nextActivityAt:activity?new Date(activity).toISOString():null,notes:notes||null})});setCode('');setName('');setCustomerId('');setSelectedCustomer(null);setValue('');setCloseDate('');setActivity('');setNotes('');setNotice('Fırsat kaydedildi.');await refresh();return true}catch(e){setError((e as Error).message);return false}finally{setBusy(false)}}
  async function move(item:Opportunity,stage:string){setBusy(true);setError('');setNotice('');try{await request(`/api/crm/opportunities/${item.id}/stage`,{method:'POST',body:JSON.stringify({stage})});setSelectedOpportunity({...item,stage});setNotice(`${item.name}: ${stageLabels[stage]||stage} aşamasına taşındı.`);await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
  const pipelineTotals=items.filter(x=>x.stage!=='Won'&&x.stage!=='Lost'&&x.estimatedValue!==null).reduce<Record<string,number>>((totals,item)=>{totals[item.currencyCode]=(totals[item.currencyCode]??0)+(item.estimatedValue??0);return totals},{})
  const visibleFields=screenFields.filter(field=>field.visible).sort((a,b)=>a.position-b.position)
  const renderField=(item:Opportunity,field:ScreenField)=>{
    switch(field.key){
      case 'code':return <span className="crm-code crm-truncate" title={item.code}>{item.code}</span>
      case 'name':return <b className="crm-truncate" title={item.name}>{item.name}</b>
      case 'customerName':return item.customerName?<span className="crm-truncate" title={item.customerName}>{item.customerName}</span>:<span className="crm-muted">Bağlanmadı</span>
      case 'stage':return <span className={`crm-stage crm-stage-${item.stage.toLowerCase()}`}>{stageLabels[item.stage]||item.stage}</span>
      case 'estimatedValue':return item.estimatedValue===null?'—':formatMoney(item.estimatedValue,item.currencyCode,2)
      case 'probabilityPercent':return <div className="crm-probability" aria-label={`Kazanma olasılığı yüzde ${item.probabilityPercent}`}><i aria-hidden="true"><span style={{width:`${Math.min(100,Math.max(0,item.probabilityPercent))}%`}}/></i><b>%{item.probabilityPercent}</b></div>
      case 'expectedCloseDate':return <span className="crm-date">{item.expectedCloseDate&&<CalendarClock size={14} aria-hidden="true"/>}{item.expectedCloseDate?new Date(item.expectedCloseDate).toLocaleDateString('tr-TR'):'Tarih yok'}</span>
      case 'nextActivityAt':return item.nextActivityAt?new Date(item.nextActivityAt).toLocaleString('tr-TR',{dateStyle:'short',timeStyle:'short'}):'Takip planlanmadı'
      case 'actions':return <div className="crm-actions">{nextStage[item.stage]&&<button type="button" className="secondary small-button" disabled={busy} aria-label={`${item.name} fırsatını ${stageLabels[nextStage[item.stage]]} aşamasına ilerlet`} onClick={()=>void move(item,nextStage[item.stage])}>İlerlet</button>}{!['Won','Lost'].includes(item.stage)&&<button type="button" className="crm-lost" disabled={busy} aria-label={`${item.name} fırsatını kaybedildi olarak işaretle`} onClick={()=>void move(item,'Lost')}>Kaybet</button>}{item.stage==='Won'&&<CircleDollarSign size={17} className="crm-won-icon" aria-label="Kazanıldı"/>}{item.stage==='Lost'&&<UserRound size={17} className="crm-lost-icon" aria-label="Kaybedildi"/>}</div>
      default:return '—'
    }
  }

  return <div className="crm-page">
    <CrmOpportunityHeader pipelineTotals={pipelineTotals} formatMoney={formatMoney} onCreate={()=>setCreateOpen(true)}/>
    {error&&<div className="alert inline-alert" role="alert">{error}<button type="button" aria-label="Hata mesajını kapat" onClick={()=>setError('')}>×</button></div>}{notice&&<div className="notice" role="status" aria-live="polite">{notice}</div>}
    {createOpen&&<CrmOpportunityCreateForm customerError={customerError} customers={customers} customerId={customerId} selectedCustomer={selectedCustomer} customerLoading={customerLoading} code={code} name={name} value={value} currency={currency} probability={probability} closeDate={closeDate} activity={activity} notes={notes} busy={busy} onClose={()=>setCreateOpen(false)} onSubmit={event=>{void create(event).then(saved=>{if(saved)setCreateOpen(false)})}} onCodeChange={setCode} onNameChange={setName} onCustomerSelect={id=>{setCustomerId(id);setSelectedCustomer(customers.find(x=>x.id===id)||null)}} onCustomerSearchChange={setCustomerQuery} onValueChange={setValue} onCurrencyChange={setCurrency} onProbabilityChange={setProbability} onCloseDateChange={setCloseDate} onActivityChange={setActivity} onNotesChange={setNotes}/>}
    <section className="crm-panel crm-opportunity-workbench" aria-busy={listLoading}>
      <CrmOpportunityFilters loading={listLoading} itemsCount={items.length} totalCount={totalCount} page={page} query={query} filter={filter} closeFrom={closeFrom} closeTo={closeTo} valueFrom={valueFrom} valueTo={valueTo} onQueryChange={value=>{setQuery(value);setPage(1)}} onFilterChange={value=>{setFilter(value);setPage(1)}} onCloseFromChange={value=>{setCloseFrom(value);setPage(1)}} onCloseToChange={value=>{setCloseTo(value);setPage(1)}} onValueFromChange={value=>{setValueFrom(value);setPage(1)}} onValueToChange={value=>{setValueTo(value);setPage(1)}} onClear={()=>{setQuery('');setFilter('');setCloseFrom('');setCloseTo('');setValueFrom('');setValueTo('');setPage(1)}}/>
      <div className={`crm-record-workspace${selectedOpportunity?' is-inspecting':''}${items.length===0&&!listLoading?' is-empty':''}`}>
        <CrmOpportunityGrid items={items} fields={visibleFields} loading={listLoading} error={listError} query={query} filter={filter} selectedId={selectedOpportunity?.id??null} renderField={renderField} onSelect={setSelectedOpportunity} onRefresh={()=>void refresh()} onCreate={()=>setCreateOpen(true)} onClearFilters={()=>{setQuery('');setFilter('');setCloseFrom('');setCloseTo('');setValueFrom('');setValueTo('');setPage(1)}}/>
        <CrmOpportunityDetail selected={selectedOpportunity} itemsCount={items.length} loading={listLoading} listError={listError} query={query} filter={filter} busy={busy} formatMoney={formatMoney} onClear={()=>{setQuery('');setFilter('');setCloseFrom('');setCloseTo('');setValueFrom('');setValueTo('');setPage(1)}} onCreate={()=>setCreateOpen(true)} onClose={()=>setSelectedOpportunity(null)} onMove={stage=>{if(selectedOpportunity)void move(selectedOpportunity,stage)}}/>
      </div>
      <CrmOpportunityPagination loading={listLoading} page={page} totalCount={totalCount} onPageChange={setPage}/>
    </section>
  </div>
}
