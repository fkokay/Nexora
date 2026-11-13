import type * as AppTypes from "./erp-types";
import { DocumentReturnsPage } from "./document-returns/DocumentReturnsPage";

type Props = { token: string; role: string; onNavigate: (page: AppTypes.SalesPageKey) => void };

export default function SalesReturnsPage({ token, role, onNavigate }: Props) {
  return <DocumentReturnsPage token={token} role={role} side="sales" onNavigate={onNavigate} />;
}
