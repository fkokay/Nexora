# Finance presentation components

The finance page container keeps API requests, screen state, and mutation handlers. Feature components under `components/` receive typed values and callbacks so Studio users can adjust list and report presentation without editing data flow.

- `FinanceAccountsToolbar.tsx`: search, type/status filters, and refresh action.
- `FinanceAccountsGrid.tsx`: account table and row actions.
- `CashFlowReportPanel.tsx`: date controls, classification note, and cash-flow report table.
