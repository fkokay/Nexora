type Props = {
  loading: boolean
  error: string
  notice: string
  isAdmin: boolean
  onCreateFacility: () => void
  onRefresh: () => void
  onDismissNotice: () => void
}

export function CreditFacilitiesPageStatus({ loading, error, notice, isAdmin, onCreateFacility, onRefresh, onDismissNotice }: Props) {
  return <>
    <div className="credit-page-actions">
      <span>{loading ? 'Kayıtlar yükleniyor' : 'Kredi ve ödeme planı kayıtları'}</span>
      <div className="credit-page-action-buttons">
        {isAdmin && <button type="button" className="primary small-button" onClick={onCreateFacility}>Yeni kredi / limit</button>}
        <button className="secondary small-button" onClick={onRefresh} disabled={loading} aria-label="Kredi kayıtlarını yenile">{loading ? 'Yükleniyor…' : 'Yenile'}</button>
      </div>
    </div>
    {error && <div className="alert inline-alert" role="alert"><span>{error}</span><button type="button" className="secondary small-button" onClick={onRefresh} disabled={loading}>Tekrar dene</button></div>}
    {notice && <div className="notice" role="status" aria-live="polite">{notice}<button type="button" aria-label="Bildirimi kapat" onClick={onDismissNotice}>×</button></div>}
  </>
}
