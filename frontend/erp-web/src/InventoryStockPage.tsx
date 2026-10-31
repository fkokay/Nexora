import type { ComponentProps } from 'react'
import { InventoryPage } from './InventoryPage'

type Props = Omit<ComponentProps<typeof InventoryPage>, 'section'>

export default function InventoryStockPage(props: Props) {
  return <InventoryPage {...props} section="inventory-stock"/>
}
