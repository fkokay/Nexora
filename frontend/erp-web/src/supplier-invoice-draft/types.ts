import type { FormEvent } from 'react'

export type Supplier = { id: string; code: string; name: string; currencyCode: string }
export type SupplierPage = { items: Supplier[]; totalCount: number }
export type ExpenseAccount = { id: string; code: string; name: string; isActive: boolean; statementSection: string }
export type DraftLineInput = { description: string; quantity: string; unitCode: string; unitPrice: string; subtotal: string; discountAmount: string; taxAmount: string; total: string; expenseAccountId: string; vatRate: string; standalonePurchaseReceiptLineId: string }
export type DraftInput = { requestId: string; supplierId: string; invoiceNumber: string; invoiceDate: string; dueDate: string; currencyCode: string; notes: string; subtotal: string; discountTotal: string; taxTotal: string; grandTotal: string; lines: DraftLineInput[] }
export type DraftSummary = { id: string; supplierId: string; supplierName: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null; currencyCode: string; grandTotal: number; lineCount: number; status: string; createdAt: string }
export type DraftPage = { items: DraftSummary[]; page: number; pageSize: number; totalCount: number }
export type ReceiptOption = { lineId: string; receiptId: string; receiptCode: string; receiptDate: string; stockCode: string; stockName: string; quantity: number; unitCode: string; unitCostBase: number }
export type DraftScreenField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; section?: string | null }
export type DraftDetail = { id: string; supplierId: string; supplierName: string; invoiceNumber: string; invoiceDate: string; dueDate: string | null; currencyCode: string; notes: string | null; subtotal: number; discountTotal: number; taxTotal: number; grandTotal: number; status: string; rowVersion: string; lines: Array<{ lineNumber: number; description: string; quantity: number | null; unitCode: string | null; unitPrice: number | null; subtotal: number; discountAmount: number; taxAmount: number; total: number; expenseAccountId: string | null; vatRate: number | null; standalonePurchaseReceiptLineId: string | null }> }
export type StandaloneSupplierInvoiceDraftPageProps = { token: string; role: string }

export type InvoiceDraftFormProps = {
  draft: DraftInput
  editing: boolean
  busy: boolean
  expenseAccounts: ExpenseAccount[]
  receiptOptions: ReceiptOption[]
  visibleSuppliers: Supplier[]
  supplierCount: number
  onSubmit: (event: FormEvent) => void
  onUpdate: <K extends keyof DraftInput>(field: K, value: DraftInput[K]) => void
  onUpdateLine: (index: number, field: keyof DraftLineInput, value: string) => void
  onSelectSupplier: (id: string) => void
  onSearchSuppliers: (value: string) => void
  onSelectReceiptLine: (index: number, id: string) => void
  onAddLine: () => void
  onRemoveLine: (index: number) => void
  onCancelEdit: () => void
}

export type DraftListProps = {
  drafts: DraftSummary[]
  fields: DraftScreenField[]
  loading: boolean
  busy: boolean
  onRefresh: () => void
  onEdit: (id: string) => void
  onPost: (item: DraftSummary) => void
}
