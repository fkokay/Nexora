/**
 * Screen keys that have a standard system page definition (`src/Hosts/AIERP.Api/SystemPages/Standards/<key>.json`).
 * The runtime map only ever lists these keys, so any other built-in screen renders its legacy page without waiting for
 * the map. `systemPageKeys.test.ts` keeps this list in sync with the API's standards folder.
 */
export const systemPageScreenKeys: ReadonlySet<string> = new Set(["crm-opportunities", "crm-opportunity-create", "customer-create", "customer-ledger", "customers", "finance-account-create", "finance-accounts", "finance-banks", "finance-journal-ledger", "finance-journal-vouchers", "finance-ledger-chart", "finance-trial-balance", "fixed-asset-card", "fixed-asset-create", "fixed-assets", "hr-attendance", "hr-employee-create", "hr-employees", "hr-leave-requests", "hr-period-summary", "inventory-cost", "inventory-locations", "inventory-stock", "inventory-stock-create", "inventory-stock-movements", "inventory-tracking", "inventory-transfers", "inventory-warehouses", "sales-deliveries", "sales-invoices", "sales-orders", "sales-purchase-delivery-notes", "sales-purchase-invoice-entry", "sales-purchase-invoices", "sales-purchase-quotes", "sales-purchase-receipts", "sales-purchase-returns", "sales-purchasing", "sales-quotes", "sales-requests"]);

/**
 * Built-in keys a standard declares as `aliases` (e.g. `customer-edit` opens `customer-create` with `customerId`). They
 * wait for the runtime map like system-page keys; `systemPageKeys.test.ts` keeps this list in sync with the standards.
 */
export const systemPageAliasKeys: ReadonlySet<string> = new Set(["customer-edit"]);

export const canBeSystemPage = (key: string) => systemPageScreenKeys.has(key);
export const canBeSystemPageAlias = (key: string) => systemPageAliasKeys.has(key);
