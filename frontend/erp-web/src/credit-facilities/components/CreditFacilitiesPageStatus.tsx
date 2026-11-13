import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  loading: boolean;
  error: string;
  notice: string;
  isAdmin: boolean;
  totalCount: number;
  onCreateFacility: () => void;
  onCreateSchedule?: () => void;
  onCreateMovement?: () => void;
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
  onCreateSchedule,
  onCreateMovement,
  onRefresh,
  onDismissNotice,
}: Props) {
  return (
    <>
      <ListPageHeader
        title="Krediler & Finansman"
        description="Kredi limitlerini, kullandırımları ve ödeme planlarını yönetin."
        count={loading && totalCount === 0 ? null : totalCount}
      >
        {isAdmin && (
          <>
            <button
              type="button"
              className="secondary"
              onClick={onCreateSchedule}
            >
              Taksit planla
            </button>
            <button
              type="button"
              className="secondary"
              onClick={onCreateMovement}
            >
              Hareket kaydet
            </button>
            <button
              type="button"
              className="primary"
              onClick={onCreateFacility}
            >
              Yeni kredi / limit
            </button>
          </>
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
