# r4 rehearsal on a restored local tenant backup

Date: 2026-10-24  
Engine: Microsoft SQL Server 2025 Developer 17.0.1145.4 on local Windows  
Result: **passed for the restored local tenant backup**

## Backup and isolation

The source was `artifacts/local-db-backups/Nexora-tenant-pre-migration-20261022.bak`. Its SHA-256 was `607C04C989655D0D80C77FD707FA69532B7C12667E6AA6C3D458BC19B7A1AE3B`; SQL Server `RESTORE VERIFYONLY WITH CHECKSUM` passed. The source backup was restored to the uniquely named scratch database `NexoraR4RestoreTenant_20261024`. The source backup and the original local tenant database were not modified.

The restored database began at 43 tenant migrations, ending at `20261022130311_AddIntradayManufacturingScheduling`. Before migration it contained two customer/supplier accounts, zero posted purchase invoices, and one stock item. Only aggregate counts were recorded; account and item values were not read into the rehearsal report.

## Procedure and result

The Tenant incremental for r3 was applied first, adding migration 44 (`20261022145500_AddAnnualWorkCenterCapacityRules`). Then the r4 Tenant incremental was applied. Final history was 48/48, ending at `20261023240100_AddPurchaseInvoiceDrafts`. Both standalone supplier-invoice draft tables existed, and the original aggregate counts remained two accounts, zero posted purchase invoices, and one stock item. `DBCC CHECKDB WITH NO_INFOMSGS` completed successfully.

The scratch database was dropped after verification. This rehearsal changed neither the source backup nor the original development database.

## Limits

This verifies the Tenant migration path against one checksum-verified local development tenant backup. It does not verify Platform or AIStudio migrations, another tenant's schema/data, the current live development database history, production compatibility, application deployment, or production operation. Compare authoritative histories and rehearse each target's own backup before deploying there. The r4 package remains generated-not-applied to live databases.
