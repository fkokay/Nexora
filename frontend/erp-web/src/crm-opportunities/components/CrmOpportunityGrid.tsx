import { Target } from "lucide-react";
import type { MutableRefObject, ReactNode } from "react";
import type { GridExportActions } from "../../AdvancedDataGrid";
import type { BuiltInScreenLayoutField } from "../../erp-types";
import SalesDocumentGrid, { type SalesGridSelection } from "../../sales/components/SalesDocumentGrid";
import { stageLabels, type Opportunity, type ScreenField } from "../types";

type Props = {
  items: Opportunity[];
  fields: ScreenField[];
  loading: boolean;
  error: string;
  query: string;
  filter: string;
  /** Page-level toolbar element that hosts the grid's own tools. */
  toolbarContainer?: HTMLElement | null;
  exportActionsRef: MutableRefObject<GridExportActions | null>;
  selection: SalesGridSelection;
  footer: ReactNode;
  renderField: (item: Opportunity, field: ScreenField) => ReactNode;
  onRefresh: () => void;
  onCreate: () => void;
  onClearFilters: () => void;
};

function CrmOpportunityEmptyState({
  query,
  filter,
  onCreate,
  onClearFilters,
}: Pick<Props, "query" | "filter" | "onCreate" | "onClearFilters">) {
  const hasFilters = Boolean(query.trim() || filter);
  return (
    <div className={`crm-empty crm-empty-explained${hasFilters ? " crm-empty-filtered" : ""}`} role="status">
      <div className="crm-empty-icon">
        <Target size={23} aria-hidden="true" />
      </div>
      <b>{hasFilters ? "Bu aramayla eşleşen fırsat yok" : "Satış hattınız henüz boş"}</b>
      <span>
        {hasFilters
          ? "Girilen kod, fırsat adı veya müşteri adıyla eşleşen bir kayıt bulunamadı. Arama metnini ve aşama filtresini kontrol edip yeniden deneyin."
          : "Henüz CRM fırsatı oluşturulmadığı için listelenecek kayıt bulunmuyor. İlk fırsatınızı ekleyerek müşteri, tahmini tutar, kazanma olasılığı ve takip tarihini satış hattınızda izlemeye başlayabilirsiniz."}
      </span>
      {hasFilters ? (
        <>
          <div className="crm-active-filters">
            {query.trim() && <span>Arama: “{query.trim()}”</span>}
            {filter && <span>Aşama: {stageLabels[filter] || filter}</span>}
          </div>
          <button type="button" className="secondary small-button" onClick={onClearFilters}>
            Aramayı ve filtreleri temizle
          </button>
        </>
      ) : (
        <button type="button" className="primary crm-empty-action" onClick={onCreate}>
          <span aria-hidden="true">＋</span>İlk fırsatı oluştur
        </button>
      )}
    </div>
  );
}

const COLUMN_WIDTHS: Record<string, number> = {
  code: 100,
  name: 210,
  customerName: 200,
  stage: 100,
  estimatedValue: 130,
  probabilityPercent: 76,
  expectedCloseDate: 110,
  nextActivityAt: 130,
};
const NUMBER_FIELDS: ReadonlySet<string> = new Set(["estimatedValue", "probabilityPercent"]);
const CODE_FIELDS: ReadonlySet<string> = new Set(["code"]);

/**
 * CRM Fırsatları list in the approved list type (as Cari Hesaplar / Satış): checkbox column, the page-owned current
 * row that the bar's Aç / Sil and the detail panel follow, double-click / Enter opens the opportunity form. A load
 * error and an empty pipeline keep their explanatory states.
 */
export function CrmOpportunityGrid({
  items,
  fields,
  loading,
  error,
  query,
  filter,
  toolbarContainer,
  exportActionsRef,
  selection,
  footer,
  renderField,
  onRefresh,
  onCreate,
  onClearFilters,
}: Props) {
  if (error)
    return (
      <div className="crm-empty crm-error-state" role="alert">
        <b>Fırsatlar yüklenemedi</b>
        <span>Satış hattı şu anda alınamıyor: {error}</span>
        <span>Bağlantınızı kontrol edin ve tekrar deneyin.</span>
        <button type="button" className="secondary small-button" onClick={onRefresh}>
          Yeniden dene
        </button>
      </div>
    );
  if (!loading && items.length === 0)
    return <CrmOpportunityEmptyState query={query} filter={filter} onCreate={onCreate} onClearFilters={onClearFilters} />;
  return (
    <SalesDocumentGrid
      gridId="crm-opportunities-v2"
      ariaLabel="Fırsat kayıtları"
      fields={fields as BuiltInScreenLayoutField[]}
      items={items}
      loading={loading}
      loadingMessage="Fırsatlar yükleniyor…"
      emptyMessage="Satış hattınız henüz boş"
      search={query}
      searchEmptyMessage="Bu aramayla eşleşen fırsat yok"
      toolbarContainer={toolbarContainer}
      hideExport
      exportActionsRef={exportActionsRef}
      selection={selection}
      footer={footer}
      renderCell={(field, item) => renderField(item, field)}
      columnWidths={COLUMN_WIDTHS}
      numberFields={NUMBER_FIELDS}
      codeFields={CODE_FIELDS}
    />
  );
}
