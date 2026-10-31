import type { ComponentProps } from 'react'
import ManufacturingPage from './ManufacturingPage'

type Props = Omit<ComponentProps<typeof ManufacturingPage>, 'section'>

export default function ManufacturingOrdersPage(props: Props) {
  return <ManufacturingPage {...props} section="manufacturing-orders"/>
}
