import { useEffect, useRef, useState, type RefObject } from 'react'
import { Activity, ArrowRight, Boxes, Building2, Check, ChevronDown, ChevronRight, FileText, LayoutDashboard, Moon, Package, Plus, Search, ShoppingCart, Sparkles, Sun, Users } from 'lucide-react'
import type { GlobalSearchResult, Locale } from './WorkspaceComponents'
import type { Tenant } from './erp-types'
import { WorkspaceSearchDialog } from './WorkspaceSearchDialog'

export type ModuleLauncherProps = {
  tenant: Tenant
  tenants: Tenant[]
  canDefineCompany: boolean
  onSelectTenant: (tenant: Tenant) => void | Promise<void>
  onDefineCompany: () => void
  userInitial: string
  locale: Locale
  query: string
  results: GlobalSearchResult[]
  allItems: GlobalSearchResult[]
  quickLinks: GlobalSearchResult[]
  activeIndex:number
  inputRef: RefObject<HTMLInputElement | null>
  theme: 'light' | 'dark'
  onLocaleChange: (locale: Locale) => void
  onThemeToggle: () => void
  onQueryChange: (query: string) => void
  onMoveActiveIndex:(delta:number)=>void
  onOpenResult: (result: GlobalSearchResult) => void
  onShowModules: () => void
  editMode: boolean
  quickMenuPageIds: string[]
  onToggleEditMode: () => void
  onToggleQuickLink: (page: string) => void
  onSignOut: () => void
}

export function ModuleLauncher({tenant,tenants,canDefineCompany,onSelectTenant,onDefineCompany,userInitial,locale,query,results,allItems,quickLinks,activeIndex,inputRef,theme,onLocaleChange,onThemeToggle,onQueryChange,onMoveActiveIndex,onOpenResult,onShowModules,editMode,quickMenuPageIds,onToggleEditMode,onToggleQuickLink,onSignOut}:ModuleLauncherProps) {
  const [allModulesOpen,setAllModulesOpen]=useState(false)
  const [companyMenuOpen,setCompanyMenuOpen]=useState(false)
  const companyMenuRef=useRef<HTMLDivElement>(null)
  const english=locale==='en'
  useEffect(()=>{
    if(!companyMenuOpen)return
    const closeOnOutsideClick=(event:PointerEvent)=>{if(event.target instanceof Node&&!companyMenuRef.current?.contains(event.target))setCompanyMenuOpen(false)}
    const closeOnEscape=(event:KeyboardEvent)=>{if(event.key==='Escape')setCompanyMenuOpen(false)}
    document.addEventListener('pointerdown',closeOnOutsideClick)
    document.addEventListener('keydown',closeOnEscape)
    return()=>{document.removeEventListener('pointerdown',closeOnOutsideClick);document.removeEventListener('keydown',closeOnEscape)}
  },[companyMenuOpen])
  const icon=(result:GlobalSearchResult,size=32)=>result.kind==='customer'?<Users size={size}/>:result.page==='dashboard'?<LayoutDashboard size={size}/>:result.page?.startsWith('sales-')?<ShoppingCart size={size}/>:result.page?.startsWith('inventory-')?<Package size={size}/>:result.page?.startsWith('finance-')?<Activity size={size}/>:result.page==='reports'?<FileText size={size}/>:<Boxes size={size}/>
  return <div className="module-launcher">
    <header className="module-launcher-topbar"><div className="module-launcher-brand"><span className="brand-mark"><Sparkles size={19}/></span><b>nexora <strong>ERP</strong></b><span className="module-launcher-divider"/><div className="module-launcher-company-wrap" ref={companyMenuRef}><button type="button" className="module-launcher-company" aria-haspopup="menu" aria-expanded={companyMenuOpen} onClick={()=>setCompanyMenuOpen(value=>!value)}><Building2 size={16}/><b>{tenant.name}</b><ChevronDown size={14}/></button>{companyMenuOpen&&<div className="module-launcher-company-menu" role="menu"><div className="module-launcher-company-menu-heading">{english?'Available companies':'Tanımlı firmalar'}</div>{tenants.map(item=><button type="button" role="menuitem" key={item.id} className={item.id===tenant.id?'active':''} onClick={()=>{setCompanyMenuOpen(false);if(item.id!==tenant.id)void onSelectTenant(item)}}><span className="module-launcher-company-avatar">{item.name.slice(0,1).toUpperCase()}</span><span className="module-launcher-company-copy"><b>{item.name}</b><small>{item.role}</small></span>{item.id===tenant.id&&<Check size={15}/>}</button>)}{tenants.length===0&&<p>{english?'No other companies are assigned to your account.':'Hesabınıza atanmış başka firma yok.'}</p>}{canDefineCompany&&<button type="button" className="module-launcher-company-create" role="menuitem" onClick={()=>{setCompanyMenuOpen(false);onDefineCompany()}}><Plus size={16}/>{english?'Define company':'Firma tanımla'}</button>}</div>}</div></div><div className="module-launcher-actions"><button className="icon-button" type="button" title={theme==='dark'?(english?'Switch to light theme':'Açık temaya geç'):(english?'Switch to dark theme':'Koyu temaya geç')} onClick={onThemeToggle}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button><div className="locale-switch" role="group" aria-label={english?'Language':'Dil'}><button type="button" aria-pressed={!english} onClick={()=>onLocaleChange('tr')}>TR</button><button type="button" aria-pressed={english} onClick={()=>onLocaleChange('en')}>EN</button></div><button className="top-avatar" type="button" onClick={onSignOut} title={english?'Sign out':'Oturumu kapat'} aria-label={english?'Sign out':'Oturumu kapat'}>{userInitial}</button></div></header>
    <main className="module-launcher-main"><section className="module-launcher-welcome"><p>{english?'WELCOME':'HOŞ GELDİNİZ'}</p><h1>Nexora ERP</h1><span>{english?'Search modules, actions and reports.':'Modüller, işlemler ve raporlar arasında arama yapın.'}</span></section>
      <form className="module-launcher-search" role="search" onSubmit={event=>{event.preventDefault();if(results[activeIndex])onOpenResult(results[activeIndex])}}><Search size={21}/><input ref={inputRef} value={query} onChange={event=>onQueryChange(event.target.value)} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();onMoveActiveIndex(1)}else if(event.key==='ArrowUp'){event.preventDefault();onMoveActiveIndex(-1)}else if(event.key==='Escape'&&query){event.preventDefault();onQueryChange('')}}} placeholder={english?'Search modules, actions or reports…':'Modül, işlem veya rapor ara…'} aria-label={english?'Search modules, actions or reports':'Modül, işlem veya rapor ara'} autoComplete="off" aria-autocomplete="list" aria-controls="module-launcher-results"/><kbd>Ctrl + K</kbd><button type="submit" aria-label={english?'Open selected result':'Seçili sonucu aç'}><Search size={20}/></button>
        {query.trim()&&<div className="module-launcher-suggestions"><div id="module-launcher-results" role="listbox" aria-label={english?'Live search results':'Canlı arama sonuçları'}>{results.map((result,index)=><button type="button" role="option" aria-selected={index===activeIndex} key={`${result.kind||'page'}-${result.page||result.label}`} onMouseEnter={()=>onMoveActiveIndex(index-activeIndex)} onClick={()=>onOpenResult(result)}><span className="module-launcher-result-icon">{icon(result,17)}</span><span><b>{result.label}</b><small>{result.description}</small></span><ArrowRight size={16}/></button>)}{results.length===0&&<p>{english?'No matching modules or records.':'Eşleşen modül veya kayıt bulunamadı.'}</p>}</div>{quickLinks.length>0&&<section className="module-launcher-search-quick" aria-label={english?'Quick access':'Hızlı erişim'}><h2>{english?'Quick access':'Hızlı erişim'}</h2><div>{quickLinks.slice(0,6).map(result=><button type="button" key={result.page||result.label} onClick={()=>onOpenResult(result)}><span>{icon(result,16)}</span><b>{result.label}</b><ArrowRight size={14}/></button>)}</div></section>}</div>}
      </form>
      {!query.trim()&&<section className="module-launcher-quick"><div className="module-launcher-section-heading"><h2>{english?'Quick access':'Hızlı erişim'}</h2><button type="button" onClick={()=>{onQueryChange('');setAllModulesOpen(true);window.setTimeout(()=>inputRef.current?.focus(),0)}}>{english?'All modules':'Tüm Modüller'}<ChevronRight size={17}/></button></div><div className="module-launcher-cards">{results.slice(0,8).map(result=><button type="button" className="module-launcher-card" key={result.page||result.label} onClick={()=>onOpenResult(result)}><span>{icon(result)}</span><b>{result.label}</b></button>)}</div></section>}
    </main>
    <WorkspaceSearchDialog open={allModulesOpen} initialShowAll locale={locale} query={query} results={results} allItems={allItems} quickLinks={quickLinks} activeIndex={activeIndex} inputRef={inputRef} editMode={editMode} quickMenuPageIds={quickMenuPageIds} onQueryChange={onQueryChange} onMoveActiveIndex={onMoveActiveIndex} onOpenResult={onOpenResult} onClose={()=>setAllModulesOpen(false)} onToggleEditMode={onToggleEditMode} onToggleQuickLink={onToggleQuickLink} onShowMarketplace={()=>{setAllModulesOpen(false);onShowModules()}}/>
  </div>
}
