# AI assistant: lot and serial genealogy

The read-only ERP assistant can answer a trace question when the user supplies an exact stock item code and an exact lot or serial code. It calls `search_inventory_genealogy`, which is protected by the tenant's `erp.inventory-tracking.read` permission and reads the existing `/api/inventory-tracking/genealogy` endpoint.

The endpoint accepts either a stock item ID for existing callers or an exact stock item code for the assistant, never both. Both the item lookup and every movement, warehouse, and source-document lookup are constrained to the authenticated tenant. The assistant path requests at most 50 events.

The AI projection includes the stock code, lot/serial mode and code, unit, event date, receipt/issue direction, quantity, warehouse code, and resolved source document type/code when available. It does not include internal IDs, item names, descriptions, costs, or unresolved source codes. `coverage` is `incomplete` if an event source cannot be resolved or the result is truncated; the assistant must not describe such a trace as complete.

No schema change or migration is required. The capability uses the existing inventory transaction trace records and permission catalog entry. The focused API integration test covers code-based item selection and tenant isolation; AIService unit tests cover permission gating, bounds, coverage consistency, and sensitive-field removal. Tests use synthetic in-memory records and do not call an external AI provider or read live financial data.
