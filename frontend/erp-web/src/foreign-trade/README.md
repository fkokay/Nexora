# Foreign trade UI components

`ForeignTradePage.tsx` owns loading, API requests, editing state, and operation callbacks. The feature components are presentation-only and receive typed data and callbacks:

- `components/ForeignTradeFilters.tsx` — reference search and direction filter.
- `components/ForeignTradeStageStrip.tsx` — one count tile per forward stage (click to filter, click again to clear) plus a Cancelled chip.
- `components/ForeignTradeGrid.tsx` — empty/loading states and foreign-trade case grid. Default columns are frontend-owned; a tenant-published screen view (`foreign-trade-files`) replaces them, and the frontend-only `dates` column is appended to it.
- `components/ForeignTradeDetail.tsx` — selected case panel: stage progress, key facts, the next step with its backend prerequisites (inputs collected inline), edit/cancel and the inventory-document link.
- `types.ts` — feature data and form types shared by the page and components, plus the stage flow order.

Stage prerequisites mirror `/api/foreign-trade/cases/{id}/transition`: Booked→Shipped needs a planned ship date, declared value > 0 and Incoterms (saved through the case PUT, allowed only while Draft/Booked); Shipped→CustomsClearance needs a customs reference (sent with the transition) and, for exports with inventory posting, a linked posted delivery; Arrived→Closed needs, for imports with inventory posting, a linked posted receipt.
