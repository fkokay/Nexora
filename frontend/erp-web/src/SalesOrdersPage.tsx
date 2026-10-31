import type { ComponentProps } from 'react'
import { SalesOrdersPageContent } from './sales-orders/components/SalesOrdersPageContent'

type Props = ComponentProps<typeof SalesOrdersPageContent>

export default function SalesOrdersPage(props: Props) {
  return <SalesOrdersPageContent {...props}/>
}
