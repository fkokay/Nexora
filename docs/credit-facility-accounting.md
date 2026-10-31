# Credit facility movement accounting

Credit facility drawdowns and repayments post a balanced general ledger entry in the same tenant transaction as the cash movement, credit movement, and audit event. The journal uses `CreditFacilityMovement` as its source type. Reversals create a new movement and an inverse journal under `CreditFacilityMovementReversal`; replay of the same request returns the existing journal and does not post a second financial effect.

Required mappings are tenant-scoped and must point to active tenant ledger accounts:

- `financial-account.{financialAccountId}` — the selected bank or cash ledger account.
- `credit-facility.principal` — the loan principal liability account.
- `credit-facility.interest-expense` — required when a repayment includes interest.
- `credit-facility.fee-expense` — required when a repayment includes fees or commissions.

Drawdown debits cash/bank and credits principal liability. Repayment debits principal liability, and debits mapped interest and fee expense accounts for nonzero amounts, then credits cash/bank for the full payment. A close-period guard applies to new drawdowns, repayments, and reversals. Reversal copies and inverts the original journal lines so subsequent mapping changes cannot alter the historical reversal.

The current interest/fee treatment posts paid amounts directly to expense. Accrual accounting, effective-interest amortization, capitalized fees, and currency revaluation for foreign-currency facilities remain outside this slice and need an explicit accounting policy before implementation. Existing movements created before journal posting must be reconciled before they can be reversed through this journal-aware flow.
