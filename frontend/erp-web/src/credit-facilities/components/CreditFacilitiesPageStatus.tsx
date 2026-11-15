import { Download, Plus } from "lucide-react";
import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  loading: boolean;
  error: string;
  notice: string;
  isAdmin: boolean;
  totalCount: number;
  onCreateFacility: () => void;
  /** Downloads the visible credits as XLSX; omit to hide the button. */
  onExport?: () => void;
  exportDisabled?: boolean;
  onRefresh: () => void;
  onDismissNotice: () => void;
};

export function CreditFacilitiesPageStatus({
  loading,
  error,
  notice,
  isAdmin,
  totalCount,
  onCreateFacility,
  onExport,
  exportDisabled = false,
  onRefresh,
  onDismissNotice,
}: Props) {
  return (
    <>
      <ListPageHeader
        title="Krediler ve finansman"
        description="Kredi limitlerini, kullandırımları ve ödeme planlarını yönetin."
        count={loading && totalCount === 0 ? null : totalCount}
        countLabel="kredi"
      >
        {onExport && (
          <button
            type="button"
            className="secondary"
            onClick={onExport}
            disabled={exportDisabled}
            title="Listelenen kredileri XLSX olarak indir"
          >
            <Download size={15} aria-hidden="true" /> XLSX
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className="primary"
            onClick={onCreateFacility}
          >
            <Plus size={16} aria-hidden="true" /> Yeni kredi / limit
          </button>
        )}
      </ListPageHeader>
      {error && (
        <div className="alert inline-alert" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="secondary small-button"
            onClick={onRefresh}
            disabled={loading}
          >
            Tekrar dene
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status" aria-live="polite">
          {notice}
          <button
            type="button"
            aria-label="Bildirimi kapat"
            onClick={onDismissNotice}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
