import type { Tenant } from './erp-types'

export const tokenKey='aierp.accessToken'
export const refreshTokenKey='aierp.refreshToken'
export const activeTenantKey='aierp.tenant'
export const platformAdminAvailableKey='aierp.platformAdminAvailable'
export const platformSessionKey='aierp.platformSession'
const platformCustomizationPages=['modules','custom-forms','workflows','business-rules','reports','custom-lists','screen-views','custom-menus','settings']
export const workspaceStorageKey=(tenantId:string)=>`aierp.workspace.${tenantId}`
const workspacePreferencesKey=()=>`aierp.workspace-preferences.${encodeURIComponent((localStorage.getItem('aierp.user')||'user').trim().toLocaleLowerCase('tr-TR'))}`
export function readWorkspacePreferences(){try{return JSON.parse(localStorage.getItem(workspacePreferencesKey())||'{}') as {defaultPage?:string;rememberTabs?:boolean;restoreTabs?:boolean;confirmTabClose?:boolean}}catch{return {}}}
function defaultWorkspacePage(){return readWorkspacePreferences().defaultPage==='dashboard'?'dashboard':'launcher'}
const persistablePages=new Set(['dashboard','projects','foreign-trade','integrations','erp-assistant','screen-views','custom-lists','custom-menus','business-rules','reports','workflows','custom-forms','customers','crm-opportunities','fixed-assets','human-resources','modules','inventory-tracking','inventory-locations','inventory-stock','inventory-warehouses','commercial-contracts','sales-requests','sales-purchase-quotes','sales-quotes','sales-orders','sales-invoices','sales-deliveries','sales-promotions','sales-distribution','sales-purchasing','sales-purchase-invoices','sales-purchase-receipts','sales-purchase-delivery-notes','sales-purchase-invoice-entry','sales-purchase-invoice-drafts','finance-accounts','finance-statements','finance-cash-flow','finance-fx','finance-ledger','finance-budget','finance-cash-budget','finance-exposure','finance-maturities','finance-instruments','finance-credit-facilities','ai-settings','audit','access','company-settings','license-settings','settings'])
export const isPersistablePage=(page:string)=>persistablePages.has(page)||page.startsWith('manufacturing-')||page.startsWith('module:')||['location-definitions','address-definitions'].includes(page)
export function getInitialPage(standaloneStudio:boolean,embeddedStudioTool=false){
  if(!embeddedStudioTool&&localStorage.getItem(platformSessionKey)==='true')return 'platform-tenants'
  if(standaloneStudio)return 'studio'
  const requestedPlatformTool=new URLSearchParams(window.location.search).get('platformTool')
  if(requestedPlatformTool&&platformCustomizationPages.includes(requestedPlatformTool))return requestedPlatformTool
  try{const activeTenant=JSON.parse(localStorage.getItem(activeTenantKey)||'null') as Tenant|null;if(!localStorage.getItem(tokenKey)||!activeTenant?.id)return 'dashboard';const workspace=JSON.parse(sessionStorage.getItem(workspaceStorageKey(activeTenant.id))||'null') as {activePage?:unknown}|null;const preferences=readWorkspacePreferences();if(preferences.restoreTabs===false)return defaultWorkspacePage();return typeof workspace?.activePage==='string'&&isPersistablePage(workspace.activePage)?workspace.activePage:defaultWorkspacePage()}catch{return 'dashboard'}
}
export function readWorkspaceTabs(tenantId:string|undefined):Array<{id:string;label:string}>{
 if(!tenantId)return []
 try{const workspace=JSON.parse(sessionStorage.getItem(workspaceStorageKey(tenantId))||'null') as {tabs?:unknown}|null;if(!Array.isArray(workspace?.tabs)||readWorkspacePreferences().restoreTabs===false)return [];return workspace.tabs.filter((tab):tab is {id:string;label:string}=>Boolean(tab)&&typeof tab==='object'&&typeof (tab as {id?:unknown}).id==='string'&&isPersistablePage((tab as {id:string}).id)&&typeof (tab as {label?:unknown}).label==='string').slice(0,12)}catch{return []}
}
