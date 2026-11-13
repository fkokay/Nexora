import { matchesSearch } from './format'

export type ListTab<T> = { key: string; label: string; match: (row: T, today: string) => boolean }

export function countTabs<T>(rows: T[], tabs: ListTab<T>[], today: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const tab of tabs) counts[tab.key] = rows.reduce((sum, row) => sum + (tab.match(row, today) ? 1 : 0), 0)
  return counts
}

export type FilterOptions<T> = {
  tab?: ListTab<T>
  query: string
  from?: string
  to?: string
  today: string
  searchText: (row: T) => (string | null | undefined)[]
  date: (row: T) => string
}

export function filterRows<T>(rows: T[], options: FilterOptions<T>): T[] {
  const { tab, query, from, to, today, searchText, date } = options
  return rows.filter(row => {
    if (tab && !tab.match(row, today)) return false
    const day = date(row).slice(0, 10)
    if (from && day < from) return false
    if (to && day > to) return false
    return matchesSearch(searchText(row), query)
  })
}

export function sumByCurrency<T>(
  rows: T[],
  amount: (row: T) => number | null,
  currency: (row: T) => string | null,
): { currency: string; total: number }[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const value = amount(row)
    const code = currency(row)
    if (value === null || !code) continue
    totals.set(code, (totals.get(code) ?? 0) + value)
  }
  return [...totals.entries()]
    .map(([code, total]) => ({ currency: code, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => a.currency.localeCompare(b.currency))
}

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount)
  const start = (current - 1) * pageSize
  const items = rows.slice(start, start + pageSize)
  return { items, page: current, pageCount, from: items.length ? start + 1 : 0, to: start + items.length }
}

function csvCell(value: string | number | null): string {
  if (value === null) return ''
  const text = typeof value === 'number' ? String(value).replace('.', ',') : value
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Excel'in Türkçe ayarlarla doğrudan açtığı biçim: UTF-8 BOM, ";" ayraç, ondalık virgül. */
export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return '﻿' + [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n')
}
