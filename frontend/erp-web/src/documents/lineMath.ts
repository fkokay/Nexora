export type PricedLine = { quantity: number; unitPrice: number; discountPercent: number; vatPercent: number }

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const safe = (value: number) => (Number.isFinite(value) ? value : 0)

/** Sunucudaki hesapla aynı sıra: brüt → iskonto → KDV; her adım 2 haneye yuvarlanır. */
export function lineTotal(line: PricedLine) {
  const subtotal = round2(safe(line.quantity) * safe(line.unitPrice))
  const discount = round2(subtotal * safe(line.discountPercent) / 100)
  const net = round2(subtotal - discount)
  const tax = round2(net * safe(line.vatPercent) / 100)
  return { subtotal, discount, net, tax, total: round2(net + tax) }
}

export function documentTotals(lines: PricedLine[]) {
  const totals = { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 }
  for (const line of lines) {
    const row = lineTotal(line)
    totals.subtotal = round2(totals.subtotal + row.subtotal)
    totals.discountTotal = round2(totals.discountTotal + row.discount)
    totals.taxTotal = round2(totals.taxTotal + row.tax)
    totals.grandTotal = round2(totals.grandTotal + row.total)
  }
  return totals
}
