import type { ComponentProps } from 'react'
import { InventoryPage } from './InventoryPage'

type Props = Omit<ComponentProps<typeof InventoryPage>, 'section'>

export default function InventoryTransfersPage(props: Props) {
  return <InventoryPage {...props} section="inventory-transfers"/>
}
