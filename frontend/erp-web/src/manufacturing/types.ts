export type { ManufacturingPageKey } from '../erp-types'

export type ManufacturingBom = {
  id: string
  code: string
  name: string
  productStockItemId: string
  productName: string
  productTrackingMode: string
  outputQuantity: number
  isActive: boolean
  orderCount: number
  rowVersion: string
  lines: {
    componentStockItemId: string
    componentName: string
    quantity: number
    scrapPercent: number
    standardUnitCostBase: number
  }[]
  operations: {
    sequence: number
    workCenterId: string
    workCenterName: string
    setupMinutes: number
    runMinutesPerOutputUnit: number
    minimumWaitDaysAfterPrevious: number
    setupFamilyCode: string
    plannedEnergyKwhPerOutput: number
    plannedEnergyCostPerKwhBase: number
    eligibleWorkCenterIds: string[]
  }[]
}
