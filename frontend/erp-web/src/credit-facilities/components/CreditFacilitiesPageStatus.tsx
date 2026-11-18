import { ListPageHeader } from "../../list-page/ListPageHeader";

type Props = {
  loading: boolean;
  error: string;
  notice: string;
  totalCount: number;
  onRefresh: () => void;
  onDismissNotice: () => void;
};

export function CreditFacilitiesPageStatus({
  loading,
  error,
  notice,
  totalCount,
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
      />
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
