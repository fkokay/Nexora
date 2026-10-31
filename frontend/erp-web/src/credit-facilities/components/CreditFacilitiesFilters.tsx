type Props = {
  search: string
  statusFilter: string
  currencyFilter: string
  currencies: string[]
  onSearchChange: (value:string)=>void
  onStatusChange: (value:string)=>void
  onCurrencyChange: (value:string)=>void
  onClear: ()=>void
}

export function CreditFacilitiesFilters({search,statusFilter,currencyFilter,currencies,onSearchChange,onStatusChange,onCurrencyChange,onClear}:Props) {
  return <div className="credit-filters" role="search" aria-label="Kredi kayıtlarını filtrele">
    <label className="credit-search">Ara<input type="search" value={search} onChange={event=>onSearchChange(event.target.value)} placeholder="Kod, kurum veya tür" aria-label="Kod, kurum, tür veya notta ara"/></label>
    <label>Durum<select value={statusFilter} onChange={event=>onStatusChange(event.target.value)}><option value="All">Tüm durumlar</option><option value="Active">Aktif</option><option value="Closed">Kapalı</option></select></label>
    <label>Para birimi<select value={currencyFilter} onChange={event=>onCurrencyChange(event.target.value)}><option value="All">Tüm para birimleri</option>{currencies.map(code=><option key={code} value={code}>{code}</option>)}</select></label>
    {(search||statusFilter!=='All'||currencyFilter!=='All')&&<button type="button" className="secondary small-button credit-clear-filters" onClick={onClear}>Filtreleri temizle</button>}
  </div>
}
