import type { ComponentProps } from 'react'
import { InventoryPage } from './InventoryPage'

type Props = Omit<ComponentProps<typeof InventoryPage>, 'section'> & { section?: 'inventory-stock' | 'inventory-stock-create' }

export default function InventoryStockPage(props: Props) {
  return <InventoryPage {...props} section={props.section||'inventory-stock'} onNavigate={props.onNavigate}/>
}
