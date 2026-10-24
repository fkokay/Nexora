# Standalone supplier invoice design

## Scope

Implementation update (2026-10-24): the draft-only slice is present in `PurchaseInvoiceDraft` / `PurchaseInvoiceDraftLine`, `PurchaseInvoiceDraftEndpoints`, ERP Web, and Tenant migration r4. The focused regression test passed for create, idempotent replay, and absence of order, receipt, posted invoice, inventory, supplier-ledger, journal, and payment records. The API uses SQL Server key-range locks. The r4 Tenant migration passed a clean-schema incremental rehearsal, but remains unapplied to development/production and has not been rehearsed on a restored non-empty database. Tenant isolation, inactive-supplier rejection, and alternate role visibility still need focused coverage.

This is a separate supplier-document capture flow. It does not change the existing purchase invoice flow, which remains sourced from a posted goods receipt and its purchase-order lines. The new flow must not create inventory transactions, receipts, orders, or synthetic stock lines.

The agreed first deliverable is **draft capture only**. A standalone document records supplier-provided invoice data and is clearly labelled as unaccounted. A draft must never create a supplier ledger entry/payable, inventory movement, payment, return, or general-ledger journal. Draft data stays out of balances and aging reports. Accounting and later posting are out of scope for this slice.

## Domain and tenant persistence

Keep separate `PurchaseInvoiceDraft` and `PurchaseInvoiceDraftLine` entities rather than making receipt links nullable on `PurchaseInvoice` / `PurchaseInvoiceLine`.

- Header: `Id`, `TenantId`, `SupplierId`, supplier invoice number, document date, optional due date, currency, document-supplied subtotal/discount/tax/total, optional notes, `Draft` status, created/updated timestamps.
- Lines: `Id`, `TenantId`, parent invoice id, line number, description, optional quantity and unit label, and document-supplied amount fields. These are captured values only; the system does not infer VAT rates, expense classifications, or account codes.
- Every supplier FK is tenant-composite (`TenantId`, `SupplierId`). Parent/line keys and unique indexes are tenant-scoped. Restrict deletion of referenced suppliers and cascade only draft child lines with their parent.
- Validate nonnegative amounts, currency format, text lengths, and parent/child total consistency only where the document supplies those totals. Do not calculate tax or require line sums to equal header totals unless the source document explicitly supplies enough detail and an owner approves the rounding convention.
- Keep this entity out of purchase-payment, supplier-return, aging, ledger-posting, and journal-source queries until a posting lifecycle is designed. In particular, `SupplierPayment` requires a receipt-linked `PurchaseInvoice`; changing that relationship would broaden this feature and needs separate review.

## API boundary

Expose a separately named `/api/purchasing/standalone-invoices` route group in a dedicated endpoint file, registered alongside the current receipt-entry routes after the API owner releases `Program.cs`.

- `GET /` returns tenant-scoped drafts, with supplier visibility filtered by `erp.purchase-invoices.read` and bounded pagination/search.
- `GET /suppliers` returns active tenant suppliers visible under `erp.purchase-invoices.create`, with bounded pagination/search.
- `GET /{id}` returns one tenant-scoped draft and its lines.
- `POST /` creates a draft, validates an active supplier in the same tenant, and uses a request id for idempotency.
- No post, void, payment, return, or journal endpoint in this slice. Audit draft creation without exposing drafts in liability or stock reports.

The API must not accept client-supplied `TenantId`, ledger direction, account ids, stock ids, receipt ids, journal data, or calculated tax. Supplier identity and access checks come from the authenticated tenant and existing purchase-invoice permissions. The permission catalog must explicitly map the supplier picker GET to `erp.purchase-invoices.create`, the draft collection/detail GETs to `erp.purchase-invoices.read`, and draft POST to `erp.purchase-invoices.create`; detail authorization must resolve the draft's supplier id from its tenant-scoped row. Non-admin collection filters must apply supplier-scope rules before returning either draft or supplier rows.

## Migration and verification

Add one tenant migration for the two new tables, tenant-composite foreign keys, bounded string columns, amount precision, checks, and indexes. Update the tenant model snapshot and generated migration package through the migration owner’s serial queue. Do not apply the migration to any database as part of this source change.

Tests should cover tenant isolation, inactive/non-supplier rejection, idempotent create, editing only drafts, amount validation, and the absence of inventory, ledger, payment, and journal records. Run tests only with the serial coordinator slot; do not use a shared database or test fixture that applies the migration outside that queue.

## Owner decisions before posting

If a later phase is to post these drafts and create supplier liability, the product owner/accounting owner must define:

1. Whether header-only invoices and non-stock lines are valid, and the accepted line/tax breakdown.
2. Expense, recoverable-tax, nonrecoverable-tax, rounding, and exchange-rate treatment for the general ledger.
3. Whether supplier payments and returns may reference standalone invoices, including partial payment/return constraints and cancellation behavior.
4. Supplier document-number uniqueness scope and duplicate handling.

Until those decisions are recorded, a posted standalone invoice must not be exposed as payable or treated as a supplier liability. No GL account mapping is inferred by this design.
