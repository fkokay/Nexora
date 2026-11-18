import type { ScreenColumnPin } from "../erp-types";
export type Kind = 'Check' | 'PromissoryNote'
export type Direction = 'Receivable' | 'Payable'
export type Status = 'Portfolio' | 'Endorsed' | 'Collected' | 'Bounced' | 'Cancelled'
export type StatusFilter = Status | 'All'
export type KindFilter = Kind | 'All'
export type Item = { id:string; code:string; type:Kind; direction:Direction; status:Status; instrumentNumber:string; counterpartyName:string; counterpartyAccountId?:string|null; bankName:string; currencyCode:string; amount:number; issueDate:string; dueDate:string; portfolioDate:string; endorsedTo:string|null; endorsedAt:string|null; collectedAt:string|null; financialAccountId:string|null; notes:string|null; rowVersion:string; createdAt:string }
export type FinanceAccount = { id:string; name:string; code:string; type:'Cash'|'Bank'; currencyCode:string; isActive:boolean }
export type CurrencyAmount = { currencyCode:string; amount:number }
export type PageResult = {items:Item[];page:number;pageSize:number;totalCount:number;summary:{openByCurrency:CurrencyAmount[];dueCount:number;bouncedCount:number}}
export type ScreenField = {key:string;label:string;visible:boolean;position:number;fixed?:boolean;section?:string|null;width?:number|null;pinned?:ScreenColumnPin|null}
/** `counterpartyAccountId` is set when the counterparty was picked from the customer/supplier list; null for free text. */
export type Draft = { type:Kind; direction:Direction; instrumentNumber:string; counterpartyName:string; counterpartyAccountId:string|null; bankName:string; currencyCode:string; amount:string; issueDate:string; dueDate:string; portfolioDate:string; notes:string }
export type PortfolioSummary = PageResult['summary']
/** GET /api/finance/payment-instruments/{id}/events — no journal codes are exposed. */
export type InstrumentEvent = { id:string; eventType:string; previousStatus:Status|null; newStatus:Status; eventDate:string; note:string|null; financialAccountTransactionId:string|null; createdAt:string }
/** Customer account option for the counterparty picker (GET /api/customers/). */
export type Counterparty = { id:string; code:string; name:string; type:string; isActive:boolean }
export type RowAction = 'endorse' | 'collect' | 'bounce' | 'cancel'

export const statusText:Record<Status,string>={Portfolio:'Portföyde',Endorsed:'Ciro edildi',Collected:'Tahsil/ödeme edildi',Bounced:'Karşılıksız',Cancelled:'İptal'}
/** StatusTag tone per status (Portföyde info, Ciro edildi / Tahsil edildi ok, Karşılıksız bad, İptal off). */
export const statusTone:Record<Status,'ok'|'warn'|'bad'|'off'|'info'>={Portfolio:'info',Endorsed:'ok',Collected:'ok',Bounced:'bad',Cancelled:'off'}

/** Actions the API accepts for the instrument's current status (see PaymentInstrumentEndpoints). */
export function allowedActions(item: Item): RowAction[] {
  const actions: RowAction[] = []
  if (item.status === 'Portfolio' || item.status === 'Bounced') actions.push('collect')
  if (item.type === 'Check' && item.direction === 'Receivable' && item.status === 'Portfolio') actions.push('endorse')
  if (item.status === 'Portfolio' || item.status === 'Endorsed' || item.status === 'Collected') actions.push('bounce')
  if (item.status === 'Portfolio') actions.push('cancel')
  return actions
}

export function collectLabel(item: Item) {
  return item.direction === 'Receivable' ? 'Tahsil et' : 'Ödendi olarak işle'
}
