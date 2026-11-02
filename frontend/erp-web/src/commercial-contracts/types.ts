export type ContractStatus = 'Draft' | 'Active' | 'Suspended' | 'Completed' | 'Terminated' | 'Cancelled'
export type ContractType = 'Sales' | 'Purchase'

export type Contract = {
  id: string
  code: string
  type: ContractType
  counterpartyId: string
  counterpartyName: string
  effectiveFrom: string
  effectiveThrough: string
  currencyCode: string
  status: ContractStatus
  salesQuoteId: string | null
  salesOrderId: string | null
  purchaseSupplierQuoteId: string | null
  purchaseOrderId: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export type Transition = {
  id: string
  contractId: string
  fromStatus: string
  toStatus: string
  reason: string | null
  changedByUserId: string
  changedAt: string
}

export type Counterparty = {
  id: string
  code: string
  name: string
  type: 'Customer' | 'Supplier' | 'Both'
  currencyCode: string
}

export type SourceKind = 'none' | 'sales-quote' | 'sales-order' | 'purchase-quote' | 'purchase-order'

export type SourceOption = {
  id: string
  code: string
  counterpartyId: string
  currencyCode: string
  counterpartyName: string
}

export type SourcePage = { items: SourceOption[]; page: number; pageSize: number; total: number }
export type CounterpartyPage = { items: Counterparty[]; page: number; pageSize: number; total: number }
export type Page = { items: Contract[]; page: number; pageSize: number; total: number }
export type Detail = { contract: Contract; transitions: Transition[] }
export type ScreenField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; section?: string | null }
export type Translate = (value: string) => string

export const defaultScreenFields: ScreenField[] = [
  { key: 'code', label: 'Sözleşme kodu', visible: true, position: 0 },
  { key: 'type', label: 'Tür', visible: true, position: 1 },
  { key: 'counterpartyName', label: 'Cari hesap', visible: true, position: 2 },
  { key: 'effectiveFrom', label: 'Başlangıç', visible: true, position: 3 },
  { key: 'effectiveThrough', label: 'Bitiş', visible: true, position: 4 },
  { key: 'currencyCode', label: 'Döviz', visible: true, position: 5 },
  { key: 'status', label: 'Durum', visible: true, position: 6 },
  { key: 'revision', label: 'Sürüm', visible: true, position: 7 },
  { key: 'actions', label: 'İşlemler', visible: true, position: 8, fixed: true },
]

export const statusLabel: Record<ContractStatus, string> = {
  Draft: 'Taslak', Active: 'Aktif', Suspended: 'Askıda', Completed: 'Tamamlandı', Terminated: 'Feshedildi', Cancelled: 'İptal',
}

export const statusLabelsEn: Record<ContractStatus, string> = {
  Draft: 'Draft', Active: 'Active', Suspended: 'Suspended', Completed: 'Completed', Terminated: 'Terminated', Cancelled: 'Cancelled',
}

export const dateLabel = (value: string, en: boolean) => {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(en ? 'en-US' : 'tr-TR')
}

export const statusClass = (status: ContractStatus) =>
  status === 'Active' ? 'accepted' : status === 'Cancelled' || status === 'Terminated' ? 'rejected' : status === 'Draft' ? 'draft' : 'sent'
