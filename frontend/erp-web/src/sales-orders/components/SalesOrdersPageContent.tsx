import type { ComponentProps } from 'react'
import { SalesPage } from '../../SalesPage'

type Props = Omit<ComponentProps<typeof SalesPage>, 'section'>

export function SalesOrdersPageContent(props: Props) {
  return <SalesPage {...props} section="sales-orders"/>
}
