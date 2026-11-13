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
const persistablePages=new Set(['projects','foreign-trade','integrations','erp-assistant','screen-views','custom-lists','custom-menus','business-rules','reports','workflows','custom-forms','customers','customer-create','customer-edit','customer-ledger','crm-opportunities','fixed-assets','human-resources','modules','inventory-tracking','inventory-locations','inventory-stock','inventory-stock-create','inventory-cost','inventory-warehouses','commercial-contracts','sales-requests','sales-purchase-quotes','sales-quotes','sales-quote-create','sales-orders','sales-order-create','sales-invoices','sales-invoice-create','sales-deliveries','sales-promotions','sales-distribution','sales-purchasing','sales-purchase-invoices','sales-purchase-receipts','sales-returns','sales-purchase-returns','sales-customer-requests','sales-purchase-delivery-notes','sales-purchase-invoice-entry','sales-purchase-invoice-drafts','manufacturing-order-create','finance-accounts','finance-banks','finance-statements','finance-cash-flow','finance-fx','finance-ledger','finance-ledger-chart','finance-ledger-mappings','finance-journal-vouchers','finance-trial-balance','finance-balance-sheet','finance-journal-ledger','finance-transfer-sources','finance-budget','finance-cash-budget','finance-exposure','finance-maturities','finance-instruments','finance-credit-facilities','finance-credit-facility-create','finance-credit-schedule-create','finance-credit-movement-create','finance-credit-repayment-create','finance-credit-security-create','ai-settings','audit','access','company-settings','license-settings','settings'])
export const isPersistablePage=(page:string)=>persistablePages.has(page)||page.startsWith('manufacturing-')||page.startsWith('module:')||page.startsWith('custom-page:')||['location-definitions','address-definitions'].includes(page)
export function getInitialPage(standaloneStudio:boolean,embeddedStudioTool=false){
  if(!embeddedStudioTool&&localStorage.getItem(platformSessionKey)==='true')return 'platform-tenants'
  if(standaloneStudio)return 'studio'
  const query = new URLSearchParams(window.location.search)
  const previewId = query.get('customPagePreview')
  if (previewId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(previewId)) return `custom-page-preview:${previewId}`
  const publishedCustomPage = query.get('customPage')
  if (publishedCustomPage && /^[a-z0-9_-]{1,40}$/i.test(publishedCustomPage)) return `custom-page:${publishedCustomPage}`
  const requestedPlatformTool=query.get('platformTool')
  if(requestedPlatformTool&&platformCustomizationPages.includes(requestedPlatformTool))return requestedPlatformTool
  try{const activeTenant=JSON.parse(localStorage.getItem(activeTenantKey)||'null') as Tenant|null;if(!localStorage.getItem(tokenKey)||!activeTenant?.id)return 'launcher';const workspace=JSON.parse(sessionStorage.getItem(workspaceStorageKey(activeTenant.id))||'null') as {activePage?:unknown}|null;const preferences=readWorkspacePreferences();if(preferences.restoreTabs===false)return 'launcher';return typeof workspace?.activePage==='string'&&isPersistablePage(workspace.activePage)?workspace.activePage:'launcher'}catch{return 'launcher'}
}
export function readWorkspaceTabs(tenantId:string|undefined):Array<{id:string;label:string}>{
 if(!tenantId)return []
 try{const workspace=JSON.parse(sessionStorage.getItem(workspaceStorageKey(tenantId))||'null') as {tabs?:unknown}|null;if(!Array.isArray(workspace?.tabs)||readWorkspacePreferences().restoreTabs===false)return [];return workspace.tabs.filter((tab):tab is {id:string;label:string}=>Boolean(tab)&&typeof tab==='object'&&typeof (tab as {id?:unknown}).id==='string'&&isPersistablePage((tab as {id:string}).id)&&typeof (tab as {label?:unknown}).label==='string').slice(0,12).map(tab=>tab.id==='sales-order-create'?{...tab,label:'Yeni Sipariş'}:tab)}catch{return []}
}
