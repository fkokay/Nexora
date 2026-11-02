# r4 migration rehearsal with seeded data

Date: 2026-10-24  
Engine: Microsoft SQL Server 2025 Developer 17.0.1145.4 on local Windows  
Result: **passed on an isolated, reconstructed r3 baseline with synthetic legacy rows**

## Scope and safety

The rehearsal used only three randomly named databases created for this run:

- `NexoraR4Platform_e928dbafb00245d4a73c2ca6ae6b827e`
- `NexoraR4Tenant_e928dbafb00245d4a73c2ca6ae6b827e`
- `NexoraR4Studio_e928dbafb00245d4a73c2ca6ae6b827e`

The baseline was reconstructed by applying the full idempotent scripts from `artifacts/migrations/2026-10-22-r3/`; it was **not** restored from a checksum-verified database backup. Before r4, the databases reported the exact documented baseline histories: Platform 124 through `20261022130452_AddIntradayManufacturingScheduling`, Tenant 44 through `20261022145500_AddAnnualWorkCenterCapacityRules`, and AIStudio 10 through `20261017134712_AddStudioKnowledgeRefreshConsentAIStudio`.

All package SQL was applied with `sqlcmd -I -b`. The r4 package passed `tests/deployment/Test-MigrationReleaseReadiness.ps1` against its packaged r3 history: Platform 12 pending, Tenant 4 pending, AIStudio 1 pending; all script checksums, migration IDs, and history prefixes matched.

## Seeded legacy rows

Before applying r4, the Platform baseline received one tenant, one user, one `TenantUser` membership, and one existing tenant permission rule. The Tenant baseline received the corresponding tenant row and one active supplier account. AIStudio was left at the r3 baseline because its r4 change is additive and has no dependency on tenant business rows.

These rows exercised the Platform permission backfills and the Tenant composite foreign key used by standalone supplier invoice drafts. No customer or production data was used.

## Results

The r4 incremental scripts completed successfully against all three seeded databases. After migration:

| Context | History | Latest migration | Verified data/schema |
|---|---:|---|---|
| Platform | 136 | `20261023240000_AddTenantProvisioningJobsAndPlatformAdminRefreshSessions` | Seed tenant, user, membership, and prior permission rule remained. The migrations added exactly one `erp.manufacturing.read` and one `erp.operational-projects.time-entries.create` rule for the seeded `TenantUser`. The provisioning-job and platform-admin refresh-session tables exist. |
| Tenant | 48 | `20261023240100_AddPurchaseInvoiceDrafts` | Seed tenant and supplier remained. Purchase delivery-note and standalone-draft tables exist. A post-migration draft and line inserted successfully against the existing supplier/tenant, and the returned draft rowversion was 8 bytes. |
| AIStudio | 11 | `20261023150000_AddStudioModuleSourceMappings` | The new module-source-mapping table exists. |

`DBCC CHECKDB WITH NO_INFOMSGS` completed with SQLCMD exit code 0 for each database and produced no error messages. The three named rehearsal databases were then dropped; a catalog query confirmed all three were absent.

## Limits

This proves that the generated r4 incrementals run on the reconstructed r3 schema with representative synthetic tenant, membership, permission, and supplier rows. It does **not** prove compatibility with a restored non-empty target backup, actual development or production data, production configuration, or production deployment. No existing development or production database was queried or changed.
