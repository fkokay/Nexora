export type Asset = {
  id: string
  assetCode: string
  name: string
  category: string | null
  acquisitionDate: string
  inServiceDate: string
  acquisitionCostBase: number
  residualValueBase: number
  usefulLifeMonths: number
  accumulatedDepreciationBase: number
  status: string
  supplierAccountId: string | null
  sourceReference: string | null
  purchaseInvoiceId: string | null
  rowVersion: string
  vukTaxYear: number | null
  vukDepreciationLowerLimitTry: number | null
  vukCommuniqueNumber: number | null
  vukSourceUrl: string | null
}

export type AssetField = { key: string; label: string; visible: boolean; position: number; fixed?: boolean; section?: string | null }
