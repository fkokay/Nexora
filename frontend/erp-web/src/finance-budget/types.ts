export type Account = { id:string; code:string; name:string; isActive:boolean; statementSection:string }
export type Line = { id?:string; accountId:string; accountCode?:string; accountName?:string; statementSection?:string; periodStart:string; plannedAmount:number; actualAmount?:number; variance?:number|null; notes:string|null }
export type Plan = { id:string; name:string; fiscalYear:number; currencyCode:string; baseCurrencyCode:string; status:number|string; lineCount:number; plannedTotal:number; actualTotal:number; createdAt:string; createdByUserId:string; approvedByUserId:string|null; approvedAt:string|null; revision:number }
export type PlanView = { plan:Plan; lines:Line[] }
export type Entry = { accountId:string; periodStart:string; plannedAmount:number; notes:string|null }
export type BudgetLayoutField = { key:string; label:string; visible:boolean; position:number }
