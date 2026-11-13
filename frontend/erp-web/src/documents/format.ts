export const trLower = (value: string) => value.toLocaleLowerCase('tr-TR')

/** Arama için: Türkçe küçültür ve noktalı/noktasız i ile aksanları eşitler ("ISIK" ↔ "Işık"). */
export function foldSearch(value: string): string {
  return trLower(value).replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [year, month, day] = iso.slice(0, 10).split('-')
  return year && month && day ? `${day}.${month}.${year}` : iso
}

export function formatNumber(value: number, minimumFractionDigits = 2, maximumFractionDigits = 2): string {
  return value.toLocaleString('tr-TR', { minimumFractionDigits, maximumFractionDigits })
}

export function formatQuantity(value: number): string {
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 4 })
}

export function formatMoney(value: number, currency?: string | null): string {
  return currency ? `${formatNumber(value)} ${currency}` : formatNumber(value)
}

export function matchesSearch(haystack: (string | null | undefined)[], query: string): boolean {
  const needle = foldSearch(query.trim())
  if (!needle) return true
  return haystack.some(text => !!text && foldSearch(text).includes(needle))
}

export const paymentMethodLabel = (method: string) =>
  method === 'Bank transfer' ? 'Havale / EFT' : method === 'Cash' ? 'Nakit' : method === 'Card' ? 'Kart' : 'Çek'
