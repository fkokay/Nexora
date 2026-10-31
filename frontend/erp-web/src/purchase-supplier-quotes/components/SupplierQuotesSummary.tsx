type Props = { totalCount: number }

export default function SupplierQuotesSummary({ totalCount }: Props) {
  return (
    <section className="customer-summary">
      <div>
        <b>{totalCount} tedarikçi teklifi</b>
        <small>Teklif oluşturma ve siparişe dönüştürme, ilgili talep kaydından yürütülür.</small>
      </div>
    </section>
  )
}
