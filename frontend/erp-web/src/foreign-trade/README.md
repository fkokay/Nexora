# Foreign trade UI components

`ForeignTradePage.tsx` owns loading, API requests, editing state, and operation callbacks. The feature components are presentation-only and receive typed data and callbacks:

- `components/ForeignTradeFilters.tsx` — reference search and direction filter.
- `components/ForeignTradeGrid.tsx` — empty/loading states and foreign-trade case grid.
- `components/ForeignTradeDetail.tsx` — selected case details and inventory-document/status actions.
- `types.ts` — feature data and form types shared by the page and components.
