export type Opportunity = {
  id: string
  code: string
  name: string
  customerId: string | null
  customerName: string | null
  stage: string
  estimatedValue: number | null
  currencyCode: string
  probabilityPercent: number
  expectedCloseDate: string | null
  nextActivityAt: string | null
  notes: string | null
  updatedAt: string
}

export type Customer = { id: string; code: string; name: string; type: string; isActive: boolean }
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number; totalCount?: number }
export type ScreenField = { key: string; label: string; visible: boolean; position: number; section?: string | null; fixed?: boolean }

export const defaultScreenFields: ScreenField[] = [
  { key: 'code', label: 'Fırsat kodu', visible: true, position: 0 },
  { key: 'name', label: 'Fırsat', visible: true, position: 1 },
  { key: 'customerName', label: 'Müşteri', visible: true, position: 2 },
  { key: 'stage', label: 'Aşama', visible: true, position: 3 },
  { key: 'estimatedValue', label: 'Tahmini değer', visible: true, position: 4 },
  { key: 'probabilityPercent', label: 'Olasılık', visible: true, position: 5 },
  { key: 'expectedCloseDate', label: 'Beklenen kapanış', visible: true, position: 6 },
  { key: 'nextActivityAt', label: 'Sonraki takip', visible: true, position: 7 },
  { key: 'actions', label: 'İşlem', visible: true, position: 8, fixed: true }
]

export const stages = ['Prospecting', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const
export const stageLabels: Record<string, string> = { Prospecting: 'İlk temas', Qualified: 'Nitelikli', Proposal: 'Teklif', Negotiation: 'Müzakere', Won: 'Kazanıldı', Lost: 'Kaybedildi' }
export const nextStage: Record<string, string> = { Prospecting: 'Qualified', Qualified: 'Proposal', Proposal: 'Negotiation', Negotiation: 'Won' }

export function formatMoney(amount: number, code: string, maximumFractionDigits: number) {
  try { return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: code, maximumFractionDigits }).format(amount) }
  catch { return `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits }).format(amount)} ${code}` }
}
