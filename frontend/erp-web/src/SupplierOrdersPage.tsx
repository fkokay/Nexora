import type { ComponentProps } from 'react'
import { SalesPage } from './SalesPage'

type Props = Omit<ComponentProps<typeof SalesPage>, 'section'>

export default function SupplierOrdersPage(props: Props) {
  return <SalesPage {...props} section="sales-purchasing"/>
}
