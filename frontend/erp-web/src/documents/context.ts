import type { DocKey } from './definitions'
import type { SalesCustomer, StockItem, Warehouse } from './models'
import type { DocScope } from './storage'

/** Belge sayfasına listeden gelirken açılacak bölüm (örn. önizlemedeki "İrsaliye oluştur"). */
export type DocIntent = 'deliver' | 'receive' | 'collect' | 'pay' | 'return' | 'invoice' | 'quote'

export type DocContext = {
  token: string
  role: string
  scope: (key: DocKey) => DocScope
  customers: SalesCustomer[]
  stockItems: StockItem[]
  warehouses: Warehouse[]
  intent: DocIntent | null
  open: (key: DocKey, id: string, intent?: DocIntent) => void
  create: (key: DocKey, sourceId?: string) => void
  back: () => void
  /** Liste verisinin yeniden yüklenmesi gerektiğini bildirir. */
  changed: () => void
}

export const isAdmin = (ctx: DocContext) => ctx.role === 'TenantAdmin'
