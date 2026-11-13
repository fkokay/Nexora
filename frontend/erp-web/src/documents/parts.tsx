import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { api, localDateString } from '../lib/api'
import { Field } from './DocumentShell'
import { foldSearch, formatDate, formatMoney, formatNumber, formatQuantity, paymentMethodLabel } from './format'
import { lineTotal } from './lineMath'
import type { CustomerBalance, FinancialAccount, InventoryBalance, StockItem, StockItemUnitConversion, Warehouse } from './models'

/* ---------- işlem durumu ---------- */

export function useRunner() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const run = useCallback(async (action: () => Promise<string | void>) => {
    setBusy(true); setError(''); setNotice('')
    try { const message = await action(); if (message) setNotice(message); return true }
    catch (e) { setError((e as Error).message); return false }
    finally { setBusy(false) }
  }, [])
  const dismiss = useCallback(() => { setError(''); setNotice('') }, [])
  return { busy, error, notice, setError, setNotice, run, dismiss }
}

/* ---------- cari durumu ---------- */

export function PartyCard({ token, partyId, kind, pendingAmount = 0, currency }: { token: string; partyId: string; kind: 'customer' | 'supplier'; pendingAmount?: number; currency?: string }) {
  const [balance, setBalance] = useState<CustomerBalance | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!partyId) { setBalance(null); return }
    let active = true
    setFailed(false)
    api<CustomerBalance>(`/api/customers/${partyId}/balance`, token).then(item => { if (active) setBalance(item) }).catch(() => { if (active) { setBalance(null); setFailed(true) } })
    return () => { active = false }
  }, [partyId, token])

  const title = <div className="doc-section-title"><span>Cari durumu</span></div>
  if (!partyId) return <>{title}<p className="muted">{kind === 'customer' ? 'Müşteri' : 'Tedarikçi'} seçildiğinde bakiye ve risk limiti burada görünür.</p></>
  if (failed) return <>{title}<p className="muted">Cari bakiyesi görüntülenemedi.</p></>
  if (!balance) return <>{title}<p className="muted">Yükleniyor…</p></>

  const side = balance.balanceSide === 'Debit' ? 'borç' : balance.balanceSide === 'Credit' ? 'alacak' : ''
  const sameCurrency = !currency || currency === balance.currencyCode
  const exposure = (balance.balanceSide === 'Debit' ? balance.balance : -balance.balance) + (sameCurrency ? pendingAmount : 0)
  const ratio = kind === 'customer' && balance.riskLimit ? Math.max(0, exposure) / balance.riskLimit : null
  return <>{title}
    <div className="doc-side-row"><span>Bakiye</span><b>{formatMoney(Math.abs(balance.balance), balance.currencyCode)} {side}</b></div>
    {kind === 'customer' && <div className="doc-side-row"><span>Risk limiti</span><span>{balance.riskLimit ? formatMoney(balance.riskLimit, balance.currencyCode) : 'Tanımlı değil'}</span></div>}
    {ratio !== null && <>
      <div className={`doc-progress${ratio >= 1 ? ' danger' : ratio >= 0.8 ? ' warn' : ''}`} style={{ margin: '8px 0 6px' }}><span style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}/></div>
      <span className={ratio >= 1 ? 'doc-danger' : ratio >= 0.8 ? 'doc-warn' : 'doc-ok'}>
        {ratio >= 1 ? `Risk limiti aşılıyor (%${Math.round(ratio * 100)})` : `${pendingAmount > 0 ? 'Bu belgeyle limit kullanımı' : 'Limit kullanımı'} %${Math.round(ratio * 100)}`}
      </span>
    </>}
  </>
}

/* ---------- stok durumu ---------- */

/** Aktif depolardaki kullanılabilir miktarların stok kartı başına toplamı. */
export function useStockAvailability(token: string, warehouses: Warehouse[], enabled = true) {
  const [available, setAvailable] = useState<Record<string, number> | null>(null)
  const ids = useMemo(() => warehouses.filter(warehouse => warehouse.isActive).map(warehouse => warehouse.id).join(','), [warehouses])
  useEffect(() => {
    if (!enabled || !ids) { setAvailable(null); return }
    let active = true
    Promise.all(ids.split(',').map(id => api<InventoryBalance[]>(`/api/warehouses/${id}/balances`, token)))
      .then(lists => {
        if (!active) return
        const totals: Record<string, number> = {}
        for (const balance of lists.flat()) totals[balance.stockItemId] = (totals[balance.stockItemId] ?? 0) + balance.availableQuantity
        setAvailable(totals)
      })
      .catch(() => { if (active) setAvailable(null) })
    return () => { active = false }
  }, [ids, token, enabled])
  return available
}

export function StockHint({ available, stockItemId, needed, unit }: { available: Record<string, number> | null; stockItemId: string; needed: number; unit: string }) {
  if (!available || !stockItemId) return null
  const onHand = available[stockItemId] ?? 0
  return onHand >= needed
    ? <small className="doc-ok">Kullanılabilir {formatQuantity(onHand)} {unit}</small>
    : <small className="doc-danger">Kullanılabilir {formatQuantity(onHand)} {unit} · {formatQuantity(needed - onHand)} {unit} eksik</small>
}

/* ---------- salt okunur satır tablosu ---------- */

export type LineColumn<L> = { label: string; align?: 'right'; render: (line: L) => React.ReactNode }
export type BasicLine = { stockCode: string; stockName: string; unitCode: string; quantity: number }
export type PricedDocLine = BasicLine & { unitPrice: number; discountPercent: number; vatPercent: number; lineTotal: number }

export function LinesTable<L extends BasicLine>({ lines, columns, rowKey, hint }: { lines: L[]; columns: LineColumn<L>[]; rowKey: (line: L, index: number) => string | number; hint?: (line: L) => React.ReactNode }) {
  return <div className="doc-table-wrap"><table className="doc-table">
    <thead><tr><th style={{ width: 44 }}>#</th><th>Stok</th>{columns.map(column => <th key={column.label} className={column.align === 'right' ? 'num' : undefined}>{column.label}</th>)}</tr></thead>
    <tbody>
      {lines.length === 0 && <tr><td colSpan={columns.length + 2} className="table-empty">Satır yok.</td></tr>}
      {lines.map((line, index) => <tr key={rowKey(line, index)}>
        <td>{index + 1}</td>
        <td><b>{line.stockCode}</b> · {line.stockName}{hint?.(line)}</td>
        {columns.map(column => <td key={column.label} className={column.align === 'right' ? 'num' : undefined}>{column.render(line)}</td>)}
      </tr>)}
    </tbody>
  </table></div>
}

export const quantityColumn = <L extends BasicLine>(label = 'Miktar'): LineColumn<L> => ({ label, align: 'right', render: line => `${formatQuantity(line.quantity)} ${line.unitCode}` })
export function pricedColumns<L extends PricedDocLine>(): LineColumn<L>[] {
  return [
    { label: 'Birim fiyat', align: 'right', render: line => formatNumber(line.unitPrice, 2, 4) },
    { label: 'İsk %', align: 'right', render: line => formatQuantity(line.discountPercent) },
    { label: 'KDV %', align: 'right', render: line => formatQuantity(line.vatPercent) },
    { label: 'Tutar', align: 'right', render: line => formatNumber(line.lineTotal) },
  ]
}

/* ---------- hızlı satır girişi ---------- */

export type DraftLine = { stockItemId: string; quantity: string; unitPrice: string; discountPercent: string; vatPercent: string; unitCode: string }
export const emptyLine = (): DraftLine => ({ stockItemId: '', quantity: '1', unitPrice: '0', discountPercent: '0', vatPercent: '20', unitCode: '' })

function StockPicker({ stockItems, value, onPick, autoFocus }: { stockItems: StockItem[]; value: string; onPick: (item: StockItem) => void; autoFocus?: boolean }) {
  const selected = stockItems.find(item => item.id === value)
  const [text, setText] = useState(selected ? `${selected.code} · ${selected.name}` : '')
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  useEffect(() => { setText(selected ? `${selected.code} · ${selected.name}` : '') }, [selected?.id])
  const options = useMemo(() => {
    const needle = foldSearch(text.trim())
    const active = stockItems.filter(item => item.isActive)
    const matches = !needle || (selected && text === `${selected.code} · ${selected.name}`) ? active : active.filter(item => foldSearch(`${item.code} ${item.name} ${item.barcode ?? ''}`).includes(needle))
    return matches.slice(0, 30)
  }, [text, stockItems, selected])
  function pick(item: StockItem) { onPick(item); setText(`${item.code} · ${item.name}`); setOpen(false) }
  return <div className="doc-stock-picker">
    <input value={text} autoFocus={autoFocus} placeholder="Stok kodu veya adı yazın…" aria-label="Stok" role="combobox" aria-expanded={open} aria-autocomplete="list"
      onChange={e => { setText(e.target.value); setOpen(true); setIndex(0) }} onFocus={e => { setOpen(true); e.target.select() }}
      onBlur={() => window.setTimeout(() => { setOpen(false); setText(selected ? `${selected.code} · ${selected.name}` : '') }, 150)}
      onKeyDown={e => {
        if (!open) return
        if (e.key === 'ArrowDown') { e.preventDefault(); setIndex(current => Math.min(options.length - 1, current + 1)) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex(current => Math.max(0, current - 1)) }
        else if (e.key === 'Enter' && options[index]) { e.preventDefault(); e.stopPropagation(); pick(options[index]) }
        else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
      }}/>
    {open && <div className="doc-stock-options" role="listbox">
      {options.length === 0 && <button type="button" disabled><small>Eşleşen stok kartı yok</small></button>}
      {options.map((item, optionIndex) => <button type="button" role="option" aria-selected={optionIndex === index} key={item.id} className={optionIndex === index ? 'active' : undefined} onMouseDown={e => { e.preventDefault(); pick(item) }}>
        <span><b>{item.code}</b> · {item.name}</span><small>{item.unitCode}</small>
      </button>)}
    </div>}
  </div>
}

type LineEditorProps = {
  token: string
  lines: DraftLine[]
  onChange: (lines: DraftLine[]) => void
  stockItems: StockItem[]
  priced: boolean
  available?: Record<string, number> | null
}

export function LineEditor({ token, lines, onChange, stockItems, priced, available }: LineEditorProps) {
  const [units, setUnits] = useState<Record<string, StockItemUnitConversion[]>>({})
  const requested = useRef(new Set<string>())
  const [focusRow, setFocusRow] = useState<number | null>(null)

  useEffect(() => {
    for (const line of lines) {
      if (!line.stockItemId || requested.current.has(line.stockItemId)) continue
      requested.current.add(line.stockItemId)
      const id = line.stockItemId
      api<{ conversions: StockItemUnitConversion[] }>(`/api/stock/items/${id}/units`, token)
        .then(result => setUnits(current => ({ ...current, [id]: result.conversions })))
        .catch(() => setUnits(current => ({ ...current, [id]: [] })))
    }
  }, [lines, token])

  const update = (index: number, patch: Partial<DraftLine>) => onChange(lines.map((line, i) => i === index ? { ...line, ...patch } : line))
  const add = () => { onChange([...lines, emptyLine()]); setFocusRow(lines.length) }
  const remove = (index: number) => onChange(lines.length > 1 ? lines.filter((_, i) => i !== index) : [emptyLine()])
  function onRowKey(event: React.KeyboardEvent, index: number) {
    if (event.key !== 'Enter' || event.defaultPrevented || (event.target as HTMLElement).tagName === 'BUTTON') return
    event.preventDefault()
    if (index === lines.length - 1) { if (lines[index].stockItemId) add() } else setFocusRow(index + 1)
  }

  return <div>
    <div className="doc-table-wrap" style={{ overflow: 'visible' }}><table className="doc-table doc-line-editor">
      <thead><tr><th style={{ width: 34 }}>#</th><th>Stok</th><th style={{ width: 110 }} className="num">Miktar</th><th style={{ width: 100 }}>Birim</th>
        {priced && <><th style={{ width: 120 }} className="num">Birim fiyat</th><th style={{ width: 80 }} className="num">İsk %</th><th style={{ width: 80 }} className="num">KDV %</th><th style={{ width: 120 }} className="num">Tutar</th></>}
        <th style={{ width: 40 }}/></tr></thead>
      <tbody>{lines.map((line, index) => {
        const item = stockItems.find(stock => stock.id === line.stockItemId)
        const total = lineTotal({ quantity: Number(line.quantity), unitPrice: Number(line.unitPrice), discountPercent: Number(line.discountPercent), vatPercent: Number(line.vatPercent) }).total
        const baseUnit = item?.unitCode ?? ''
        const factor = line.unitCode && line.unitCode !== baseUnit ? units[line.stockItemId]?.find(unit => unit.unitCode === line.unitCode)?.factorToBase ?? 1 : 1
        return <tr key={index} onKeyDown={event => onRowKey(event, index)}>
          <td style={{ paddingTop: 14 }}>{index + 1}</td>
          <td>
            <StockPicker key={`${index}-${focusRow === index}`} stockItems={stockItems} value={line.stockItemId} autoFocus={focusRow === index} onPick={stock => update(index, { stockItemId: stock.id, unitCode: stock.unitCode })}/>
            {available && item && <StockHint available={available} stockItemId={item.id} needed={(Number(line.quantity) || 0) * factor} unit={baseUnit}/>}
          </td>
          <td><input type="number" min="0.0001" step="0.0001" required value={line.quantity} onChange={e => update(index, { quantity: e.target.value })} aria-label={`${index + 1}. satır miktar`}/></td>
          <td><select value={line.unitCode || baseUnit} disabled={!item} onChange={e => update(index, { unitCode: e.target.value })} aria-label={`${index + 1}. satır birim`}>
            {baseUnit && <option value={baseUnit}>{baseUnit}</option>}
            {(units[line.stockItemId] ?? []).filter(unit => unit.isActive && unit.unitCode !== baseUnit).map(unit => <option key={unit.id} value={unit.unitCode}>{unit.unitCode}</option>)}
          </select></td>
          {priced && <>
            <td><input type="number" min="0" step="0.0001" required value={line.unitPrice} onChange={e => update(index, { unitPrice: e.target.value })} aria-label={`${index + 1}. satır birim fiyat`}/></td>
            <td><input type="number" min="0" max="100" step="0.01" required value={line.discountPercent} onChange={e => update(index, { discountPercent: e.target.value })} aria-label={`${index + 1}. satır iskonto yüzdesi`}/></td>
            <td><input type="number" min="0" max="100" step="0.01" required value={line.vatPercent} onChange={e => update(index, { vatPercent: e.target.value })} aria-label={`${index + 1}. satır KDV yüzdesi`}/></td>
            <td className="num" style={{ paddingTop: 14 }}><b>{formatNumber(total)}</b></td>
          </>}
          <td><button type="button" className="icon-button" onClick={() => remove(index)} aria-label={`${index + 1}. satırı sil`} title="Satırı sil"><Trash2 size={15}/></button></td>
        </tr>
      })}</tbody>
    </table></div>
    <div className="doc-hint">
      <button type="button" className="doc-text-button" onClick={add}><Plus size={13}/> Satır ekle</button>
      <span><span className="doc-kbd">Enter</span> yeni satır · <span className="doc-kbd">Tab</span> sonraki alan</span>
    </div>
  </div>
}

export const draftLinesValid = (lines: DraftLine[]) => lines.length > 0 && lines.every(line => line.stockItemId && Number(line.quantity) > 0)

/* ---------- kaynak satırlardan miktar girişi (irsaliye, mal kabul, iade) ---------- */

export type QuantityRow = { key: string; stockItemId: string; stockCode: string; stockName: string; unitCode: string; remaining: number; info: string }

export function useLineUnits(token: string, rows: { key: string; stockItemId: string }[], enabled: boolean) {
  const [units, setUnits] = useState<Record<string, StockItemUnitConversion[]>>({})
  const signature = rows.map(row => `${row.key}:${row.stockItemId}`).join('|')
  useEffect(() => {
    if (!enabled || !signature) return
    let active = true
    Promise.all(rows.map(async row => [row.key, (await api<{ conversions: StockItemUnitConversion[] }>(`/api/stock/items/${row.stockItemId}/units`, token)).conversions] as const))
      .then(entries => { if (active) setUnits(Object.fromEntries(entries)) })
      .catch(() => { if (active) setUnits({}) })
    return () => { active = false }
  }, [signature, token, enabled])
  return units
}

export function QuantityEntry({ rows, units, quantities, onQuantity, enteredUnits, onUnit, quantityLabel }: {
  rows: QuantityRow[]; units: Record<string, StockItemUnitConversion[]>; quantities: Record<string, string>; onQuantity: (key: string, value: string) => void
  enteredUnits: Record<string, string>; onUnit: (key: string, value: string) => void; quantityLabel: string
}) {
  return <div className="doc-table-wrap"><table className="doc-table doc-line-editor">
    <thead><tr><th>Stok</th><th className="num">Kalan</th><th style={{ width: 110 }}>Birim</th><th style={{ width: 130 }} className="num">{quantityLabel}</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.key}>
      <td style={{ paddingTop: 10 }}><b>{row.stockCode}</b> · {row.stockName}<small>{row.info}</small></td>
      <td className="num" style={{ paddingTop: 14 }}>{formatQuantity(row.remaining)} {row.unitCode}</td>
      <td><select value={enteredUnits[row.key] || row.unitCode} onChange={e => onUnit(row.key, e.target.value)} aria-label={`${row.stockCode} birim`}>
        <option value={row.unitCode}>{row.unitCode}</option>
        {(units[row.key] ?? []).filter(unit => unit.isActive && unit.unitCode !== row.unitCode).map(unit => <option key={unit.id} value={unit.unitCode}>{unit.unitCode}</option>)}
      </select></td>
      <td><input type="number" min="0" step="0.0001" disabled={row.remaining <= 0} value={quantities[row.key] ?? ''} onChange={e => onQuantity(row.key, e.target.value)} aria-label={`${row.stockCode} ${quantityLabel}`}/></td>
    </tr>)}</tbody>
  </table></div>
}

export function WarehouseSelect({ warehouses, value, onChange, activeOnly = true }: { warehouses: Warehouse[]; value: string; onChange: (value: string) => void; activeOnly?: boolean }) {
  return <select value={value} onChange={e => onChange(e.target.value)} required>
    <option value="">Depo seçin</option>
    {warehouses.filter(warehouse => !activeOnly || warehouse.isActive || warehouse.id === value).map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}
  </select>
}

/* ---------- tahsilat / ödeme ---------- */

type PaymentMethod = 'Cash' | 'Bank transfer' | 'Card' | 'Check'
export type SettlementItem = { id: string; code: string; date: string; amount: number; currencyCode: string; paymentMethod: PaymentMethod; reference: string | null; status: 'Posted' | 'Voided' }
export type SettlementInput = { requestId: string; date: string; amount: number; paymentMethod: PaymentMethod; reference: string | null; financialAccountId: string | null }

export function Settlements({ token, kind, items, canAdd, outstanding, currency, busy, onCreate, onVoid }: {
  token: string; kind: 'collection' | 'payment'; items: SettlementItem[]; canAdd: boolean; outstanding: number; currency: string; busy: boolean
  onCreate: (input: SettlementInput) => Promise<boolean>; onVoid: (item: SettlementItem) => void
}) {
  const noun = kind === 'collection' ? 'Tahsilat' : 'Ödeme'
  const [accounts, setAccounts] = useState<FinancialAccount[]>([])
  const [date, setDate] = useState(localDateString()), [amount, setAmount] = useState(''), [method, setMethod] = useState<PaymentMethod>('Bank transfer')
  const [reference, setReference] = useState(''), [accountId, setAccountId] = useState(''), [requestId, setRequestId] = useState(() => crypto.randomUUID())
  useEffect(() => { api<FinancialAccount[]>('/api/finance/accounts', token).then(setAccounts).catch(() => setAccounts([])) }, [token])
  useEffect(() => { setAmount(outstanding > 0 ? String(outstanding) : '') }, [outstanding])
  const needsAccount = method === 'Cash' || method === 'Bank transfer'
  const eligible = accounts.filter(account => account.isActive && account.currencyCode === currency && account.type === (method === 'Cash' ? 'Cash' : 'Bank'))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const ok = await onCreate({ requestId, date, amount: Number(amount), paymentMethod: method, reference: reference || null, financialAccountId: needsAccount ? accountId : null })
    if (ok) { setRequestId(crypto.randomUUID()); setReference('') }
  }

  return <div className="doc-stack">
    <div className="doc-table-wrap"><table className="doc-table">
      <thead><tr><th>Fiş no</th><th>Tarih</th><th>Yöntem</th><th>Referans</th><th className="num">Tutar</th><th>Durum</th><th/></tr></thead>
      <tbody>
        {items.length === 0 && <tr><td colSpan={7} className="table-empty">Henüz {noun.toLocaleLowerCase('tr-TR')} kaydı yok.</td></tr>}
        {items.map(item => <tr key={item.id}>
          <td><span className="doc-code">{item.code}</span></td><td>{formatDate(item.date)}</td><td>{paymentMethodLabel(item.paymentMethod)}</td><td>{item.reference || '—'}</td>
          <td className="num">{formatMoney(item.amount, item.currencyCode)}</td>
          <td><span className={`doc-pill ${item.status === 'Posted' ? 'success' : ''}`}>{item.status === 'Posted' ? (kind === 'collection' ? 'Alındı' : 'Ödendi') : 'İptal'}</span></td>
          <td className="num">{item.status === 'Posted' && <button className="doc-text-button danger" disabled={busy} onClick={() => onVoid(item)}>İptal et</button>}</td>
        </tr>)}
      </tbody>
    </table></div>
    {canAdd && outstanding > 0 && <form className="doc-card" onSubmit={submit}>
      <div className="doc-section-title"><span>{noun} kaydet</span><small>En fazla {formatMoney(outstanding, currency)}</small></div>
      <div className="doc-grid">
        <Field label={`${noun} tarihi`}><input type="date" value={date} onChange={e => setDate(e.target.value)} required/></Field>
        <Field label={`Tutar (${currency})`}><input type="number" min="0.01" max={outstanding} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required/></Field>
        <Field label="Ödeme yöntemi"><select value={method} onChange={e => { setMethod(e.target.value as PaymentMethod); setAccountId('') }}>
          <option value="Bank transfer">Havale / EFT</option><option value="Cash">Nakit</option><option value="Card">Kart</option><option value="Check">Çek</option>
        </select></Field>
        {needsAccount && <Field label={method === 'Cash' ? 'Kasa hesabı' : 'Banka hesabı'}><select value={accountId} onChange={e => setAccountId(e.target.value)} required>
          <option value="">Hesap seçin</option>
          {eligible.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name} ({formatMoney(account.balance, account.currencyCode)})</option>)}
        </select></Field>}
        <Field label="Referans" optional className="wide"><input value={reference} onChange={e => setReference(e.target.value)} maxLength={100} placeholder="Dekont veya işlem numarası"/></Field>
      </div>
      <div className="doc-form-foot">
        <span>{needsAccount && eligible.length === 0 ? `${currency} para biriminde aktif ${method === 'Cash' ? 'kasa' : 'banka'} hesabı yok. Önce Finans ekranından hesap açın.` : `${noun} cari hesaba ve fatura bakiyesine işlenir.`}</span>
        <button className="primary" disabled={busy || (needsAccount && eligible.length === 0)}>{busy ? 'Kaydediliyor…' : `${noun} kaydet`}</button>
      </div>
    </form>}
  </div>
}

/* ---------- iade ---------- */

export type ReturnItem = { id: string; code: string; returnDate: string; warehouseName: string; lineCount: number; grandTotal: number; status: 'Posted' | 'Voided' }
export type ReturnInput = { requestId: string; warehouseId: string; returnDate: string; lines: { lineId: string; quantity: number; unitCode: string }[] }

export function Returns({ token, kind, items, currency, rows, warehouses, canAdd, busy, onCreate, onVoid, onOpen }: {
  token: string; kind: 'sales' | 'purchase'; items: ReturnItem[]; currency: string; rows: QuantityRow[]; warehouses: Warehouse[]; canAdd: boolean; busy: boolean
  onCreate: (input: ReturnInput) => Promise<boolean>; onVoid: (item: ReturnItem) => void; onOpen?: (id: string) => void
}) {
  const [warehouseId, setWarehouseId] = useState(''), [returnDate, setReturnDate] = useState(localDateString())
  const [quantities, setQuantities] = useState<Record<string, string>>({}), [enteredUnits, setEnteredUnits] = useState<Record<string, string>>({})
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const units = useLineUnits(token, rows, canAdd)
  const hasQuantity = rows.some(row => Number(quantities[row.key] || 0) > 0)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const lines = rows.map(row => ({ lineId: row.key, quantity: Number(quantities[row.key] || 0), unitCode: enteredUnits[row.key] || row.unitCode })).filter(line => line.quantity > 0)
    const ok = await onCreate({ requestId, warehouseId, returnDate, lines })
    if (ok) { setRequestId(crypto.randomUUID()); setQuantities({}) }
  }

  return <div className="doc-stack">
    <div className="doc-table-wrap"><table className="doc-table">
      <thead><tr><th>İade no</th><th>Tarih</th><th>Depo</th><th className="num">Satır</th><th className="num">Tutar</th><th>Durum</th><th/></tr></thead>
      <tbody>
        {items.length === 0 && <tr><td colSpan={7} className="table-empty">Henüz iade yok.</td></tr>}
        {items.map(item => <tr key={item.id}>
          <td>{onOpen ? <button className="doc-link" onClick={() => onOpen(item.id)}>{item.code}</button> : <span className="doc-code">{item.code}</span>}</td><td>{formatDate(item.returnDate)}</td><td>{item.warehouseName}</td><td className="num">{item.lineCount}</td>
          <td className="num">{formatMoney(item.grandTotal, currency)}</td>
          <td><span className={`doc-pill ${item.status === 'Posted' ? 'success' : ''}`}>{item.status === 'Posted' ? 'İşlendi' : 'İptal'}</span></td>
          <td className="num">{item.status === 'Posted' && <button className="doc-text-button danger" disabled={busy} onClick={() => onVoid(item)}>İptal et</button>}</td>
        </tr>)}
      </tbody>
    </table></div>
    {canAdd && <form className="doc-card" onSubmit={submit}>
      <div className="doc-section-title"><span>İade oluştur</span></div>
      <div className="doc-grid" style={{ marginBottom: 12 }}>
        <Field label="İade tarihi"><input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} required/></Field>
        <Field label={kind === 'sales' ? 'İadenin alınacağı depo' : 'İadenin çıkacağı depo'}><WarehouseSelect warehouses={warehouses} value={warehouseId} onChange={setWarehouseId}/></Field>
      </div>
      <QuantityEntry rows={rows} units={units} quantities={quantities} enteredUnits={enteredUnits} quantityLabel="İade miktarı"
        onQuantity={(key, value) => setQuantities(current => ({ ...current, [key]: value }))} onUnit={(key, value) => setEnteredUnits(current => ({ ...current, [key]: value }))}/>
      <div className="doc-form-foot">
        <span>{kind === 'sales' ? 'İade seçilen depoya stok girişi yapar ve müşteri cari hesabına alacak yazar.' : 'İade stoktan düşülür ve tedarikçi borcunu azaltır.'}</span>
        <button className="primary" disabled={busy || !hasQuantity}>{busy ? 'Kaydediliyor…' : 'İadeyi kaydet'}</button>
      </div>
    </form>}
  </div>
}
