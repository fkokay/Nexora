import type { ComponentProps } from "react";
import ManufacturingPage from "./ManufacturingPage";

type Props = Omit<ComponentProps<typeof ManufacturingPage>, "section" | "createOrderPage">;

export default function ManufacturingOrderCreatePage(props: Props) {
  return <ManufacturingPage {...props} section="manufacturing-orders" createOrderPage />;
}
