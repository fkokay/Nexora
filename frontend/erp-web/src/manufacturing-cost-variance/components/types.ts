export type CostOrder = {
  orderCode: string
  plannedDate: string
  status: string
  plannedQuantity: number
  operationCount: number
  currencyCode: string
  plannedLaborBase: number
  actualLaborBase: number | null
  plannedOverheadBase: number
  actualOverheadBase: number | null
  plannedEnergyBase: number | null
  actualEnergyBase: number | null
  plannedMaterialBase: number | null
  actualMaterialBase: number | null
  plannedConversionBase: number
  actualConversionBase: number | null
  conversionVarianceBase: number | null
  actualTotalCostBase: number | null
  totalVarianceBase: number | null
}

export type CostReport = {
  from: string
  to: string
  periodBasis: string
  baseCurrencyCode: string
  page: number
  pageSize: number
  totalCount: number
  orders: CostOrder[]
  pageTotals: {
    orderCount: number
    plannedLaborBase: number
    actualLaborBase: number | null
    plannedOverheadBase: number
    actualOverheadBase: number | null
    plannedEnergyBase: number
    plannedMaterialBase: number
    actualEnergyBase: number | null
    actualConversionBase: number | null
    actualMaterialBase: number | null
  }
  limitations: string
}
