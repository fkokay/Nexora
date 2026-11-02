export type Warehouse = { id: string; code: string; name: string; isActive: boolean }

export type Balance = {
  stockItemId: string
  stockItemCode: string
  stockItemName: string
  unitCode: string
  trackingMode: 'Lot' | 'Serial'
  warehouseId: string
  warehouseCode: string
  warehouseName: string
  trackingCode: string
  expiryDate: string | null
  quantityOnHand: number
  lastMovementDate: string
}

export type Page = { items: Balance[]; page: number; pageSize: number; totalCount: number }

export type ScreenField = {
  key: 'trackingCode' | 'trackingMode' | 'stockItem' | 'warehouse' | 'quantityOnHand' | 'expiryDate' | 'lastMovementDate'
  label: string
  visible: boolean
  position: number
  section?: string | null
}
