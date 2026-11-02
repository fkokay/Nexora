import { FinancePage } from "./FinancePages";
import type { FinancePageKey } from "./erp-types";

export default function LedgerOverviewPage({
  token,
  role,
  section = "finance-ledger",
  onNavigate,
}: {
  token: string;
  role: string;
  section?: FinancePageKey;
  onNavigate?: (page: string) => void;
}) {
  return (
    <FinancePage
      token={token}
      role={role}
      section={section}
      onNavigate={onNavigate}
    />
  );
}
