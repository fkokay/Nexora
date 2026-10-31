import { useRef, type ReactNode } from 'react'
import { Search, X } from 'lucide-react'
import type { ModuleMenuSelection } from './ModuleMarketplacePage'
export type Locale = 'tr' | 'en'
export type GlobalSearchResult = { kind?: 'page' | 'customer'; label: string; description: string; page?: string; query?: string; selection?: ModuleMenuSelection }

export type WorkspaceTabsProps={tabs:Array<{id:string;label:string}>;activeId:string;locale:Locale;dirtyTabs:Set<string>;onSelect:(id:string)=>void;onClose:(id:string)=>void;onMove:(draggedId:string,targetId:string)=>void}
export function WorkspaceTabs({tabs,activeId,locale,dirtyTabs,onSelect,onClose,onMove}:WorkspaceTabsProps){
  const homeLabel=locale==='en'?'Home':'Ana Sayfa'
  const workspaceTabs=[{id:'dashboard',label:homeLabel},...tabs.filter(tab=>tab.id!=='dashboard')]
  const homeActive=activeId==='launcher'||activeId==='dashboard'
  return <nav className="workspace-tabs" aria-label={locale==='en'?'Open screens':'Açık ekranlar'}>
    <div className="workspace-tab-list" role="tablist">{workspaceTabs.map(tab=><div className={`workspace-tab${tab.id==='dashboard'?' workspace-tab-home':''}${(tab.id==='dashboard'?homeActive:activeId===tab.id)?' active':''}${dirtyTabs.has(tab.id)?' is-dirty':''}`} key={tab.id} draggable={tab.id!=='dashboard'} role="presentation" onDragStart={event=>{event.dataTransfer.setData('text/plain',tab.id);event.dataTransfer.effectAllowed='move'}} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const dragged=event.dataTransfer.getData('text/plain');if(dragged)onMove(dragged,tab.id)}}>
      <button type="button" role="tab" aria-label={tab.id==='dashboard'?(locale==='en'?'Module search':'Modül arama'):undefined} title={tab.id==='dashboard'?(locale==='en'?'Module search':'Modül arama'):undefined} aria-selected={tab.id==='dashboard'?homeActive:activeId===tab.id} className="workspace-tab-select" onClick={()=>onSelect(tab.id==='dashboard'?'launcher':tab.id)}>{tab.id==='dashboard'?<Search size={17} aria-hidden="true"/>:<><span>{tab.label}</span>{dirtyTabs.has(tab.id)&&<i aria-label={locale==='en'?'Unsaved changes':'Kaydedilmemiş değişiklikler'}/>}</>}</button>
      {tab.id!=='dashboard'&&<button type="button" className="workspace-tab-close" aria-label={`${locale==='en'?'Close':'Kapat'} ${tab.label}`} onClick={()=>onClose(tab.id)}><X size={14}/></button>}
    </div>)}</div>
  </nav>
}

export function KeepAliveViews({activeKey,openKeys,children}:{activeKey:string;openKeys:string[];children:ReactNode}){
  const cache=useRef(new Map<string,ReactNode>())
  const allowed=new Set([...openKeys,activeKey])
  for(const key of cache.current.keys())if(!allowed.has(key))cache.current.delete(key)
  cache.current.set(activeKey,children)
  return <div className="workspace-keepalive">{Array.from(cache.current.entries()).map(([key,view])=><div className="workspace-view" key={key} hidden={key!==activeKey}>{view}</div>)}</div>
}

