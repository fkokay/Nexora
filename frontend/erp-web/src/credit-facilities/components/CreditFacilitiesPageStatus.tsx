type Props = {
  loading: boolean;
  error: string;
  notice: string;
  isAdmin: boolean;
  totalCount: number;
  activeCount: number;
  visibleCount: number;
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
  activeCount,
  visibleCount,
  onCreateFacility,
  onCreateSchedule,
  onCreateMovement,
  onRefresh,
  onDismissNotice,
}: Props) {
  return (
    <>
      <header className="credit-page-actions">
        <div className="credit-page-heading-copy">
          <p className="eyebrow">FİNANS YÖNETİMİ · KREDİLER &amp; FİNANSMAN</p>
          <h1>Krediler &amp; Finansman</h1>
          <p className="muted">Kredi limitlerini, kullandırımları ve ödeme planlarını yönetin.</p>
        </div>
        <div className="credit-page-action-buttons">
          {isAdmin && (
            <>
              <button
                type="button"
                className="secondary small-button"
                onClick={onCreateSchedule}
              >
                Taksit planla
              </button>
              <button
                type="button"
                className="secondary small-button"
                onClick={onCreateMovement}
              >
                Hareket kaydet
              </button>
              <button
                type="button"
                className="primary small-button"
                onClick={onCreateFacility}
              >
                Yeni kredi / limit
              </button>
            </>
          )}
          <button
            className="secondary small-button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Kredi kayıtlarını yenile"
          >
            {loading ? "Yükleniyor…" : "Yenile"}
          </button>
        </div>
      </header>
      <section className="credit-list-summary" aria-label="Kredi özeti">
        <article><span>Toplam kredi</span><strong>{totalCount}</strong></article>
        <article><span>Aktif kredi</span><strong>{activeCount}</strong></article>
        <article><span>Filtreye uyan</span><strong>{visibleCount}</strong></article>
      </section>
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
