import { describe, expect, it } from 'vitest'
import { definitions, isDocKey, menu } from './definitions'
import { formatDate, formatMoney, matchesSearch } from './format'
import { documentTotals, lineTotal } from './lineMath'
import { countTabs, filterRows, paginate, sumByCurrency, toCsv } from './listLogic'
import { buildHash, parseHash, type DocRoute } from './route'
import { clearDraft, loadDraft, loadHiddenColumns, loadViews, saveDraft, saveHiddenColumns, saveViews, type DocScope } from './storage'

describe('format', () => {
  it('formats dates and money the Turkish way', () => {
    expect(formatDate('2026-11-12')).toBe('12.11.2026')
    expect(formatDate(null)).toBe('—')
    expect(formatMoney(184500, 'TRY')).toBe('184.500,00 TRY')
  })
  it('matches Turkish letters regardless of case and dotted i', () => {
    expect(matchesSearch(['Işık Ticaret'], 'ISIK')).toBe(true)
    expect(matchesSearch(['İnşaat Demiri'], 'insaat')).toBe(true)
    expect(matchesSearch(['Akın Yapı'], 'deniz')).toBe(false)
    expect(matchesSearch(['x'], '  ')).toBe(true)
    expect(matchesSearch([null, undefined], 'a')).toBe(false)
  })
})

describe('listLogic', () => {
  const rows = [
    { code: 'A-1', name: 'Işık Ticaret', date: '2026-11-01', total: 100.1, currency: 'TRY', status: 'Open' },
    { code: 'A-2', name: 'Deniz; "Mobilya"', date: '2026-11-10', total: 200.2, currency: 'EUR', status: 'Done' },
    { code: 'A-3', name: 'Kaya', date: '2026-11-20', total: 50, currency: 'TRY', status: 'Open' },
  ]
  type Row = typeof rows[number]
  const base = { query: '', today: '2026-11-13', searchText: (r: Row) => [r.code, r.name], date: (r: Row) => r.date }
  const tabs = [{ key: 'all', label: 'Tümü', match: () => true }, { key: 'open', label: 'Açık', match: (r: Row) => r.status === 'Open' }]

  it('counts rows per tab', () => {
    expect(countTabs(rows, tabs, '2026-11-13')).toEqual({ all: 3, open: 2 })
  })
  it('filters by tab, search and inclusive date range', () => {
    expect(filterRows(rows, { ...base, tab: tabs[1] }).map(r => r.code)).toEqual(['A-1', 'A-3'])
    expect(filterRows(rows, { ...base, query: 'ISIK' }).map(r => r.code)).toEqual(['A-1'])
    expect(filterRows(rows, { ...base, from: '2026-11-10', to: '2026-11-20' }).map(r => r.code)).toEqual(['A-2', 'A-3'])
  })
  it('never adds different currencies together', () => {
    expect(sumByCurrency(rows, r => r.total, r => r.currency)).toEqual([{ currency: 'EUR', total: 200.2 }, { currency: 'TRY', total: 150.1 }])
    expect(sumByCurrency(rows, () => null, r => r.currency)).toEqual([])
  })
  it('clamps pagination', () => {
    expect(paginate([], 3, 25)).toMatchObject({ items: [], page: 1, pageCount: 1, from: 0, to: 0 })
    expect(paginate(rows, 9, 2)).toMatchObject({ page: 2, pageCount: 2, from: 3, to: 3 })
    expect(paginate(rows, 0, 2).items).toHaveLength(2)
  })
  it('writes Excel-friendly CSV and quotes special characters', () => {
    const csv = toCsv(['Kod', 'Cari', 'Tutar'], [['A-2', 'Deniz; "Mobilya"', 200.2], ['A-3', 'satır\nsonu', null]])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain('A-2;"Deniz; ""Mobilya""";200,2')
    expect(csv).toContain('A-3;"satır\nsonu";')
  })
})

describe('storage', () => {
  const memory = () => {
    const data = new Map<string, string>()
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } }
  }
  const scope: DocScope = { tenantId: 't1', userId: 'u1', docKey: 'sales-orders' }

  it('round-trips views, columns and drafts', () => {
    const store = memory()
    const view = { id: '1', name: 'Geciken', tab: 'late', query: '', from: '', to: '' }
    saveViews(scope, [view], store); saveHiddenColumns(scope, ['lineCount'], store); saveDraft(scope, { code: 'X' }, store)
    expect(loadViews(scope, store)).toEqual([view])
    expect(loadHiddenColumns(scope, store)).toEqual(['lineCount'])
    expect(loadDraft(scope, store)).toEqual({ code: 'X' })
    clearDraft(scope, store)
    expect(loadDraft(scope, store)).toBeNull()
  })
  it('keeps tenants and users apart', () => {
    const store = memory()
    saveHiddenColumns(scope, ['a'], store)
    expect(loadHiddenColumns({ ...scope, tenantId: 't2' }, store)).toEqual([])
    expect(loadHiddenColumns({ ...scope, userId: 'u2' }, store)).toEqual([])
  })
  it('falls back when storage is broken or unavailable', () => {
    const store = memory()
    store.data.set('aierp.docs.t1.u1.sales-orders.views', '{not json')
    store.data.set('aierp.docs.t1.u1.sales-orders.columns', '{"a":1}')
    expect(loadViews(scope, store)).toEqual([])
    expect(loadHiddenColumns(scope, store)).toEqual([])
    const throwing = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') }, removeItem: () => { throw new Error('x') } }
    expect(loadViews(scope, throwing)).toEqual([])
    expect(() => { saveViews(scope, [], throwing); clearDraft(scope, throwing) }).not.toThrow()
    expect(loadViews(scope, null)).toEqual([])
  })
})

describe('lineMath', () => {
  it('matches the server calculation order', () => {
    expect(lineTotal({ quantity: 400, unitPrice: 285, discountPercent: 5, vatPercent: 20 }))
      .toEqual({ subtotal: 114000, discount: 5700, net: 108300, tax: 21660, total: 129960 })
  })
  it('totals a document and tolerates bad numbers', () => {
    expect(documentTotals([])).toEqual({ subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 })
    expect(documentTotals([
      { quantity: 400, unitPrice: 285, discountPercent: 5, vatPercent: 20 },
      { quantity: 2, unitPrice: 22725, discountPercent: 0, vatPercent: 20 },
      { quantity: NaN, unitPrice: 10, discountPercent: 0, vatPercent: 20 },
    ])).toEqual({ subtotal: 159450, discountTotal: 5700, taxTotal: 30750, grandTotal: 184500 })
  })
})

describe('route', () => {
  const id = '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
  it('round-trips every route shape', () => {
    const routes: DocRoute[] = [
      { key: 'sales-orders', view: 'list' }, { key: 'sales-orders', view: 'doc', id },
      { key: 'sales-quotes', view: 'new' }, { key: 'sales-deliveries', view: 'new', sourceId: id },
    ]
    for (const route of routes) expect(parseHash(buildHash(route))).toEqual(route)
  })
  it('rejects unknown or malformed hashes', () => {
    for (const hash of ['', '#/', '#/unknown', '#/sales-orders/not-a-guid', `#/sales-orders/${id}/extra`, '#/sales-orders/new/bad', '#/constructor'])
      expect(parseHash(hash)).toBeNull()
  })
})

describe('definitions', () => {
  const today = '2026-11-13'
  const tab = (key: keyof typeof definitions, tabKey: string) => definitions[key].tabs.find(t => t.key === tabKey)!
  it('gives every menu entry a definition starting with the "all" tab', () => {
    for (const group of menu) for (const key of group.keys) {
      expect(isDocKey(key)).toBe(true)
      expect(definitions[key].tabs[0].key).toBe('all')
      expect(definitions[key].side).toBe(group.side)
    }
    expect(isDocKey('dashboard')).toBe(false)
  })
  it('flags late sales orders only while open', () => {
    const late = tab('sales-orders', 'late')
    expect(late.match({ status: 'Open', requestedDeliveryDate: '2026-11-12' }, today)).toBe(true)
    expect(late.match({ status: 'Open', requestedDeliveryDate: today }, today)).toBe(false)
    expect(late.match({ status: 'Fulfilled', requestedDeliveryDate: '2026-11-01' }, today)).toBe(false)
    expect(late.match({ status: 'Open', requestedDeliveryDate: null }, today)).toBe(false)
  })
  it('flags late purchase orders, overdue invoices, uninvoiced deliveries and expiring quotes', () => {
    expect(tab('purchase-orders', 'late').match({ status: 'PartiallyReceived', expectedReceiptDate: '2026-11-01' }, today)).toBe(true)
    expect(tab('purchase-orders', 'late').match({ status: 'Received', expectedReceiptDate: '2026-11-01' }, today)).toBe(false)
    expect(tab('purchase-invoices', 'overdue').match({ status: 'Posted', outstandingAmount: 10, dueDate: '2026-11-01' }, today)).toBe(true)
    expect(tab('purchase-invoices', 'overdue').match({ status: 'Posted', outstandingAmount: 0, dueDate: '2026-11-01' }, today)).toBe(false)
    expect(tab('sales-deliveries', 'uninvoiced').match({ status: 'Posted', hasSalesInvoice: false }, today)).toBe(true)
    expect(tab('sales-deliveries', 'uninvoiced').match({ status: 'Voided', hasSalesInvoice: false }, today)).toBe(false)
    expect(tab('sales-quotes', 'expiring').match({ status: 'Sent', validUntil: '2026-11-01' }, today)).toBe(true)
    expect(tab('sales-quotes', 'expiring').match({ status: 'Accepted', validUntil: '2026-11-01' }, today)).toBe(false)
  })
  it('offers the same six steps on both sides, in flow order', () => {
    expect(menu.map(group => group.keys.map(key => definitions[key].step))).toEqual([
      ['request', 'quote', 'order', 'delivery', 'invoice', 'return'],
      ['request', 'quote', 'order', 'delivery', 'invoice', 'return'],
    ])
    expect(menu[0].keys.map(key => definitions[key].menuLabel)).toEqual(menu[1].keys.map(key => definitions[key].menuLabel))
    for (const group of menu) expect(new Set(group.keys.map(key => definitions[key].menuLabel)).size).toBe(group.keys.length)
  })
  it('flags uninvoiced receipts and expiring supplier quotes', () => {
    expect(tab('purchase-receipts', 'uninvoiced').match({ status: 'Posted', invoiceId: null }, today)).toBe(true)
    expect(tab('purchase-receipts', 'uninvoiced').match({ status: 'Posted', invoiceId: 'x' }, today)).toBe(false)
    expect(tab('purchase-receipts', 'uninvoiced').match({ status: 'Voided', invoiceId: null }, today)).toBe(false)
    expect(tab('purchase-quotes', 'expiring').match({ status: 'Submitted', validUntil: '2026-11-01' }, today)).toBe(true)
    expect(tab('purchase-quotes', 'expiring').match({ status: 'Submitted', validUntil: null }, today)).toBe(false)
    expect(tab('purchase-quotes', 'expiring').match({ status: 'Selected', validUntil: '2026-11-01' }, today)).toBe(false)
  })
  it('flags open sales requests whose needed-by date has passed', () => {
    const late = tab('sales-requests', 'late')
    expect(late.match({ status: 'Open', neededByDate: '2026-11-12' }, today)).toBe(true)
    expect(late.match({ status: 'Quoted', neededByDate: '2026-11-12' }, today)).toBe(false)
    expect(late.match({ status: 'Open', neededByDate: null }, today)).toBe(false)
  })
  it('points purchase invoices at their receipt and returns at their invoice', () => {
    expect(definitions['purchase-invoices'].source({ receiptCode: 'GR-1', purchaseReceiptId: 'r1' })).toEqual({ label: 'GR-1', target: { key: 'purchase-receipts', id: 'r1' } })
    expect(definitions['sales-returns'].source({ invoiceCode: 'INV-1', salesInvoiceId: 'i1' })).toEqual({ label: 'INV-1', target: { key: 'sales-invoices', id: 'i1' } })
    expect(definitions['purchase-returns'].source({ invoiceCode: 'P-1', purchaseInvoiceId: 'p1' })).toEqual({ label: 'P-1', target: { key: 'purchase-invoices', id: 'p1' } })
  })
})
