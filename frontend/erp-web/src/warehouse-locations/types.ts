export type WarehouseRow = { id: string; code: string; name: string; isActive: boolean }
export type Location = { id: string; warehouseId: string; code: string; name: string; parentLocationId: string | null; isActive: boolean; rowVersion: string }
export type Balance = { stockItemId: string; stockItemCode: string; stockItemName: string; unitCode: string; quantity: number }
export type Reconciliation = { stockItemId: string; stockItemCode: string; stockItemName: string; unitCode: string; warehouseQuantity: number; locatedQuantity: number; unlocatedQuantity: number }
export type ScreenField = { key: string; label: string; visible: boolean; position: number; section?: string | null; fixed?: boolean }
