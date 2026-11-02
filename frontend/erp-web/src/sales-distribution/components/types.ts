export type Warehouse = { id: string; code: string; name: string; isActive: boolean }
export type Need = { stockItemId: string; stockCode: string; stockName: string; unitCode: string; openDemand: number; onHand: number; activeReserved: number; available: number; uncovered: number; openOrderCount: number }
export type DistributionPage = { warehouse: { id: string; code: string; name: string } | null; items: Need[]; page: number; pageSize: number; totalCount: number; method: string }
export type ScreenField = { key: string; label: string; visible: boolean; position: number; section?: string | null }
