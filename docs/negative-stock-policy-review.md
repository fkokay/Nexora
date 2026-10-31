# Negative stock policy review

Reviewed 2026-10-23. This is a source review only; no tests or builds were run.

## Current behavior

`TenantOperationalSettings` is stored in each tenant database, keyed by `TenantId` and linked to that tenant. The setting read is tenant-filtered, and a missing row resolves to `false`. This makes a newly migrated or legacy tenant with no settings row strict by default. The company settings read endpoint also reports `false` for a missing row. Updating the setting requires the exact `TenantAdmin` role; updates to an existing row require its SQL Server rowversion and report concurrent edits as HTTP 409.

The shared eligibility rule allows an overdraw only when `AllowNegativeStock` is true, no active quantity remains reserved, the item has no lot/serial tracking, and the request does not select a warehouse location. Selected-location balances and tracked lot/serial allocations are checked independently and remain nonnegative. Enabling the setting does not bypass those controls.

The setting is checked in all five current stock-issue posting flows:

- Manual warehouse issue: `Program.cs`, `/api/warehouses/{warehouseId}/stock/{stockItemId}/transactions`.
- Warehouse transfer source leg: `Program.cs`, `/api/warehouses/transfers`.
- Sales delivery: `Program.cs`, `/api/sales/orders/{id}/deliveries`.
- Supplier purchase return: `Program.cs`, `/api/purchasing/invoices/{id}/returns`.
- Manufacturing component consumption: `ManufacturingEndpoints.cs`, manufacturing order completion.

These flows execute in a database transaction and take an update/hold lock on the relevant warehouse row before reading balances and writing movements. Thus two competing postings for the same warehouse serialize around their balance check. Transfer locks both warehouses in sorted ID order. Manufacturing and manual issues also lock stock rows; sales delivery and supplier returns serialize on the warehouse lock. The policy read now uses SQL Server `HOLDLOCK` inside that transaction, retaining a shared lock on the setting row (or its missing-key range) until the movement commits. An admin toggle therefore waits for an in-flight posting, and a posting that starts after the toggle commits reads the new value. A reversal or void that would create an issue direction has its own balance guard and remains strict even when the setting is enabled.

## Coverage and known limits

`SqlServerNegativeStockAcceptanceTests` covers strict rejection and enabled posting for manual issues, transfers, sales deliveries, and supplier returns, with SQL balance readback. It now also contains a SQL-backed assertion that a setting update waits for a transaction holding the policy read lock. `ManufacturingEndpointsIntegrationTests` covers the manufacturing setting behavior. The tests do not exercise simultaneous competing stock issues; their safety follows from the shared warehouse row-lock pattern. The new SQL acceptance assertion was added during this review but was not run.

Negative-stock permission applies to the five posting flows above. Inventory reversals, transfer voids, and purchase receipt voids use separate nonnegative-balance checks and do not consult `AllowNegativeStock`; this preserves the documented reversal invariant. Receipt and return-to-stock flows increase inventory and do not need the allowance. There are no additional direct `InventoryDirection.Issue` posting constructors in the API host beyond these business flows and the guarded reversal/void flows found in this review.

## Conclusion

The source review found a race where an admin could disable the setting after a posting read `true` but before that posting committed. The policy read now holds a SQL Server lock through the inventory transaction, and the SQL acceptance source includes a regression assertion for the toggle race. The new assertion and all other tests/builds remain unrun per task scope. No setting bypass or cross-tenant lookup was found; legacy/missing settings fail closed. Simultaneous competing stock issues still lack dedicated SQL concurrency coverage.
