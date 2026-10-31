import type { ComponentProps } from 'react'
import ManufacturingPage from './ManufacturingPage'

type Props = Omit<ComponentProps<typeof ManufacturingPage>, 'section'>

export default function ManufacturingMrpPage(props: Props) {
  return <ManufacturingPage {...props} section="manufacturing-mrp"/>
}
