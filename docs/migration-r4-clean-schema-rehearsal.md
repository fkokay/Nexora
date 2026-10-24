# r4 clean-schema migration rehearsal

**Date:** 2026-10-24  
**Environment:** local SQL Server 2025 Developer, version 17.0.1145.4  
**Scope:** isolated clean-schema incremental rehearsal only

For each context, a uniquely named temporary database was created, the matching r3 idempotent SQL was applied to establish the 124/44/10 baseline, and the r4 incremental SQL was applied. The run enabled SQLCMD quoted identifiers (`-I`), which is required by migrations that create filtered indexes. Each resulting migration history was checked against the r4 latest migration, and `DBCC CHECKDB` completed with zero allocation and consistency errors. All three temporary databases were dropped after verification.

| Context | r3 baseline | r4 result | Latest migration | Integrity check |
|---|---:|---:|---|---|
| Platform | 124 | 136 | `20261023240000_AddTenantProvisioningJobsAndPlatformAdminRefreshSessions` | Clean |
| Tenant | 44 | 48 | `20261023240100_AddPurchaseInvoiceDrafts` | Clean |
| AIStudio | 10 | 11 | `20261023150000_AddStudioModuleSourceMappings` | Clean |

This run proves that the clean-schema r3 baseline plus the r4 incrementals execute on the current local SQL Server. It did not restore a backup, use non-empty platform or tenant data, establish the actual target migration history, or apply anything to development or production. Those checks remain release gates. The historical `dotnet ef migrations list` observation is still not accepted as target-history evidence.
