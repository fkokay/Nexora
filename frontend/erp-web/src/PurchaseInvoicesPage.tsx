import type { ComponentProps } from 'react'
import { SalesPage } from './SalesPage'

type Props = Omit<ComponentProps<typeof SalesPage>, 'section'>

export default function PurchaseInvoicesPage(props: Props) {
  return <SalesPage {...props} section="sales-purchase-invoices"/>
}
