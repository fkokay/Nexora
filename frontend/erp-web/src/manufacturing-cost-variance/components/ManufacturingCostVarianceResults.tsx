import AdvancedDataGrid from "../../AdvancedDataGrid";
import type { ScreenColumnPin } from "../../erp-types";
import { screenViewGridDefaults } from "../../screenViewGridLayout";
import type { CostOrder, CostReport } from "./types";

export type CostVarianceScreenViewField = {
  key: string;
  label: string;
  visible: boolean;
  position: number;
  fixed?: boolean;
  width?: number | null;
  pinned?: ScreenColumnPin | null;
};

export const defaultCostVarianceFields: CostVarianceScreenViewField[] = [
  { key: "orderCode", label: "Üretim emri", visible: true, position: 0 },
  { key: "plannedDate", label: "Plan tarihi", visible: true, position: 1 },
  { key: "status", label: "Durum", visible: true, position: 2 },
  { key: "plannedQuantity", label: "Miktar", visible: true, position: 3 },
  { key: "plannedMaterial", label: "Planlanan malzeme", visible: true, position: 4 },
  { key: "actualMaterial", label: "Fiilî malzeme", visible: true, position: 5 },
  { key: "plannedConversion", label: "Planlanan dönüşüm", visible: true, position: 6 },
  { key: "actualConversion", label: "Fiilî dönüşüm", visible: true, position: 7 },
  { key: "conversionVariance", label: "Dönüşüm farkı", visible: true, position: 8 },
  { key: "actualTotalCost", label: "Fiilî toplam", visible: true, position: 9 },
  { key: "totalVariance", label: "Toplam fark", visible: true, position: 10 },
  { key: "plannedLabor", label: "Planlanan işçilik", visible: false, position: 11 },
  { key: "actualLabor", label: "Fiilî işçilik", visible: false, position: 12 },
];

const amount = (value: number | null | undefined, currency: string) => {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
};

const statusName: Record<string, string> = {
  Planned: "Planlandı",
  Released: "Serbest bırakıldı",
  Completed: "Tamamlandı",
  Cancelled: "İptal edildi",
};

type Props = {
  report: CostReport;
  currency: string;
  pageCount: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  fields?: CostVarianceScreenViewField[];
};

const renderCell = (order: CostOrder, key: string, currency: string) => {
  switch (key) {
    case "orderCode":
      return (
        <>
          <b>{order.orderCode}</b>
          <small>{order.operationCount} operasyon</small>
        </>
      );
    case "plannedDate":
      return order.plannedDate;
    case "status":
      return (
        <span
          className={`manufacturing-cost-status status-${order.status.toLowerCase()}`}
        >
          {statusName[order.status] || order.status}
        </span>
      );
    case "plannedQuantity":
      return order.plannedQuantity.toLocaleString("tr-TR");
    case "plannedMaterial":
      return amount(order.plannedMaterialBase, currency);
    case "actualMaterial":
      return amount(order.actualMaterialBase, currency);
    case "plannedConversion":
      return amount(order.plannedConversionBase, currency);
    case "actualConversion":
      return amount(order.actualConversionBase, currency);
    case "conversionVariance":
      return amount(order.conversionVarianceBase, currency);
    case "actualTotalCost":
      return amount(order.actualTotalCostBase, currency);
    case "totalVariance":
      return amount(order.totalVarianceBase, currency);
    case "plannedLabor":
      return amount(order.plannedLaborBase, currency);
    case "actualLabor":
      return amount(order.actualLaborBase, currency);
    default:
      return null;
  }
};

export function ManufacturingCostVarianceResults({
  report,
  currency,
  pageCount,
  loading,
  onPageChange,
  fields = defaultCostVarianceFields,
}: Props) {
  const visibleFields = fields
    .filter((field) => field.visible || field.fixed)
    .sort((a, b) => a.position - b.position);
  return (
    <section
      className="panel manufacturing-cost-table-panel list-v2-list"
      aria-label="Maliyet farkı"
    >
      <div className="manufacturing-cost-table-wrap">
        <AdvancedDataGrid
          gridId="manufacturing-cost-variance"
          {...screenViewGridDefaults(visibleFields)}
          externalPagination
          hideSearch
          enableRowSelection={false}
        >
          <thead>
            <tr>
              {visibleFields.map((field) => (
                <th key={field.key}>{field.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.orders.map((order) => (
              <tr key={`${order.orderCode}-${order.plannedDate}`}>
                {visibleFields.map((field) => (
                  <td key={field.key}>
                    {renderCell(order, field.key, currency)}
                  </td>
                ))}
              </tr>
            ))}
            {report.orders.length === 0 && (
              <tr>
                <td colSpan={Math.max(1, visibleFields.length)} className="manufacturing-cost-empty">
                  Bu tarih aralığında üretim emri bulunamadı.
                </td>
              </tr>
            )}
          </tbody>
        </AdvancedDataGrid>
      </div>
      <footer className="manufacturing-cost-pagination">
        <small>
          Sayfa {report.page} / {pageCount}
        </small>
        <div>
          <button
            className="secondary"
            type="button"
            disabled={loading || report.page <= 1}
            onClick={() => onPageChange(report.page - 1)}
          >
            Önceki
          </button>
          <button
            className="secondary"
            type="button"
            disabled={loading || report.page >= pageCount}
            onClick={() => onPageChange(report.page + 1)}
          >
            Sonraki
          </button>
        </div>
      </footer>
    </section>
  );
}
