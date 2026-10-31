import type { ComponentProps } from 'react'
import { SalesPage } from './SalesPage'

type Props = Omit<ComponentProps<typeof SalesPage>, 'section'>

export default function SupplierInvoiceDraftsPage(props: Props) {
  return <SalesPage {...props} section="sales-purchase-invoice-drafts"/>
}
