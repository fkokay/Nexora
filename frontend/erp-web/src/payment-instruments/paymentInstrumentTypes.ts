export type Kind = 'Check' | 'PromissoryNote'
export type Direction = 'Receivable' | 'Payable'
export type Status = 'Portfolio' | 'Endorsed' | 'Collected' | 'Bounced' | 'Cancelled'
export type StatusFilter = Status | 'All'
export type KindFilter = Kind | 'All'
export type Item = { id:string; code:string; type:Kind; direction:Direction; status:Status; instrumentNumber:string; counterpartyName:string; bankName:string; currencyCode:string; amount:number; issueDate:string; dueDate:string; portfolioDate:string; endorsedTo:string|null; endorsedAt:string|null; collectedAt:string|null; financialAccountId:string|null; notes:string|null; rowVersion:string; createdAt:string }
export type FinanceAccount = { id:string; name:string; code:string; type:'Cash'|'Bank'; currencyCode:string; isActive:boolean }
export type PageResult = {items:Item[];page:number;pageSize:number;totalCount:number;summary:{openByCurrency:{currencyCode:string;amount:number}[];dueCount:number;bouncedCount:number}}
export type ScreenField = {key:string;label:string;visible:boolean;position:number;fixed?:boolean;section?:string|null}
export type Draft = { type:Kind; direction:Direction; instrumentNumber:string; counterpartyName:string; bankName:string; currencyCode:string; amount:string; issueDate:string; dueDate:string; portfolioDate:string; notes:string }
export type PortfolioSummary = PageResult['summary']

export const statusText:Record<Status,string>={Portfolio:'Portföyde',Endorsed:'Ciro edildi',Collected:'Tahsil/ödeme edildi',Bounced:'Karşılıksız',Cancelled:'İptal'}
