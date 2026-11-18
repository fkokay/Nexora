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

export type ManufacturingOrderLine = {
  componentStockItemId: string;
  componentCode: string;
  componentName: string;
  requiredQuantity: number;
  standardUnitCostBaseSnapshot: number;
  plannedCostBase: number;
};
export type ManufacturingOrderOperation = {
  id: string;
  sequence: number;
  workCenterId: string;
  workCenterCode: string;
  workCenterName: string;
  setupMinutes: number;
  runMinutes: number;
  minimumWaitDaysAfterPrevious: number;
  setupFamilyCode: string;
  sequenceSetupMinutes: number;
  plannedEnergyQuantityKwh: number;
  plannedEnergyCostPerKwhBase: number;
  plannedEnergyCostBase: number;
  plannedCostBase: number;
  scheduledStartDate: string | null;
  scheduledEndDate: string | null;
  scheduledStartMinuteOfDay: number | null;
  scheduledEndMinuteOfDay: number | null;
  scheduledStartSecondOfDay: number | null;
  scheduledEndSecondOfDay: number | null;
  status: string;
  actualSetupMinutes: number | null;
  actualRunMinutes: number | null;
  actualEnergyQuantityKwh: number | null;
  actualEnergyCostPerKwhBase: number | null;
  actualEnergyCostBase: number | null;
  actualCostBase: number | null;
  performedByEmployeeId: string | null;
  performedByEmployeeName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  capacityDays: {
    date: string;
    minutes: number;
    startMinuteOfDay: number;
    endMinuteOfDay: number;
    startSecondOfDay: number;
    endSecondOfDay: number;
  }[];
};
export type ManufacturingOrder = {
  id: string;
  code: string;
  billOfMaterialId: string;
  billOfMaterialName: string;
  warehouseId: string;
  warehouseName: string;
  plannedQuantity: number;
  sourceSalesOrderId: string | null;
  sourceSalesOrderLineNumber: number | null;
  sourceSalesOrderCode: string | null;
  actualGoodQuantity: number | null;
  scrapQuantity: number | null;
  scrapReason: string | null;
  status: string;
  plannedDate: string;
  completedAt: string | null;
  lines: ManufacturingOrderLine[];
  operations: ManufacturingOrderOperation[];
};
