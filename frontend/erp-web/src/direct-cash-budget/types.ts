export type PlanSummary = {
  id: string
  name: string
  fiscalYear: number
  currencyCode: string
  status: string | number
  createdAt: string
  createdByUserId: string
  approvedByUserId: string | null
  approvedAt: string | null
  revision: number
  lineCount: number
}

export type PlanScreenField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean }
export type BudgetLine = { id?: string; periodStart: string; direction: 'Inflow' | 'Outflow'; category: string; description: string; amount: number }
export type PlanView = Omit<PlanSummary, 'lineCount'> & { lines: BudgetLine[] }
export type ForecastMonth = { periodStart: string; directCashBudgetInflows: number; directCashBudgetOutflows: number; netChange: number }
export type Forecast = { currencies: { currencyCode: string; months: ForecastMonth[] }[] }
export type LineInput = Omit<BudgetLine, 'amount'> & { amount: number }

export const categories = [
  ['Sales', 'Satış tahsilatları'], ['Collections', 'Diğer tahsilatlar'], ['Payroll', 'Bordro'],
  ['Suppliers', 'Tedarikçiler'], ['Taxes', 'Vergi ve harçlar'], ['Investment', 'Yatırım'],
  ['Financing', 'Finansman'], ['Operating', 'İşletme giderleri'], ['Other', 'Diğer'],
] as const

export const money = (value: number, currency: string) => {
  try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value) }
  catch { return `${value.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${currency}` }
}

export const isApproved = (status: PlanSummary['status']) => status === 'Approved' || status === 2
export const formatMonth = (value: string) => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date(`${value}T00:00:00`))
