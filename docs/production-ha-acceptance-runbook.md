# Nexora production and high availability acceptance runbook

Use this runbook to accept the standalone IIS or Linux deployment, database release and recovery process, and multi-node failover in customer-equivalent staging. Production promotion requires an approved source revision, controlled package provenance, the named owners' evidence, and a recorded go/no-go decision.

## Current local evidence

The newest local source packages recorded in `docs/production-deployment-readiness.md` are under `artifacts/deployment-source-20261022-r1/` and use version `20261022-source-r1`. A fresh cross-package validation on 2026-10-23 failed because the Linux archive's Platform API environment template omits `ConnectionStrings__AIStudio`, required by the current source validator. IIS manifest integrity and the Linux outer archive SHA-256 passed, but this package is NO-GO for staging until it is rebuilt from an approved clean commit (or receives an approved provenance attestation) and the validator passes. Neither bundle has been installed on a Windows IIS or native Linux host. The older `local-preflight-20261022-r2` package and `docs/deployment-bundle-validation-20261022-acceptance-r2.json` are historical evidence only.

The local failure evidence is recorded in `docs/staging-validation-20261023.json`. Reproduce the package gate after rebuilding, using the controlled copies that will actually be promoted:

```powershell
./tests/deployment/Invoke-DeploymentBundleValidation.ps1 `
  -LinuxArchive <release-store>\aierp-linux-<approved-version>.tar.gz `
  -IisBundlePath <release-store>\iis-<approved-version> `
  -ReportPath <release-evidence>\deployment-bundle-validation.json
```

Do not proceed to either host installation gate while this validator fails or package provenance is unresolved.

The source-r1 output was built from the dirty checkout at base revision `b0e201c54bdf0391bccef1c541784fae12b1706f`; that base revision alone does not identify its uncommitted contents. The release owner must rebuild from the approved clean source revision or provide an approved provenance attestation, then copy the packages to the controlled release store before staging promotion.

The newest source-generated package is `artifacts/migrations/2026-10-23-r4/` with 136 Platform, 48 Tenant and 11 AIStudio migration IDs. It is marked `generated-not-applied`; Platform and Tenant scripts were regenerated from corrected context models, and independent review confirmed table ownership stays in the correct databases. Incrementals use the documented r3 history baseline and contain 12 Platform, 4 Tenant and 1 AIStudio migrations beyond that prefix. A previous `dotnet ef migrations list` command may have read `__EFMigrationsHistory`; its all-Pending Platform result is not authoritative target-history evidence. No migrations were applied or rehearsed. Do not treat the historical baseline or package generation as current target history or schema/data compatibility evidence.

The last locally applied and verified package remains `artifacts/migrations/2026-10-22-r3/` at the documented local histories 124/44/10. Its Tenant incremental was applied only to local Docker development after a verified D: COPY_ONLY CHECKSUM backup; full scripts passed twice on fresh scratch databases and incrementals passed twice on isolated restored copies. See the package application record and README. Current-source r4 adds 12 Platform, 4 Tenant and 1 AIStudio migration relative to those documented r3 prefixes; this does not establish actual target histories. Read actual target histories and rehearse r4 against isolated verified restores before release. No production database was accessed or migrated; production-target staging rehearsal remains required.

Offline package checks do not establish Windows Server or native Linux behavior, target SQL compatibility, backup recoverability, DNS/TLS, production credentials, or multi-node coordination. Keep these as staging acceptance gates.

## Owners and access required

| Work | Required access and owner | Required inputs |
| --- | --- | --- |
| Release identity | Release owner; approved source repository and controlled artifact store | Reviewed commit, package digests, version, target environment, expected active release ID, second-operator review |
| IIS acceptance | Windows Server host owner with elevated PowerShell and IIS administration | Supported Windows Server, .NET 10 Hosting Bundle, IIS 10, URL Rewrite 2.1, ARR 3.0, DNS, trusted certificate private key, protected secrets file, SQL staging connectivity |
| Linux acceptance | Linux host owner with sudo/root, systemd and nginx administration | Supported Linux, .NET 10 ASP.NET Core Runtime, nginx, DNS/TLS, protected environment files or secret manager, SQL staging connectivity |
| Database rehearsal | DBA with read access to target migration history and restore/admin access to an isolated SQL staging instance | SQL Server version, topology and separation flag, tenant database inventory, sanitized recent backup set, sufficient isolated storage |
| Backup evidence | DBA plus backup-storage owner | Write/read access to the backup target and an independent off-host copy, retention and checksum evidence |
| HA and monitoring | Operations owner with two deployer/host nodes, traffic manager/load balancer, shared coordination backend and SQL failover staging | Node identities, lock/fencing design, health probes, alert route, agreed RTO/RPO, maintenance window |

Do not place credentials, private keys, connection strings, customer data, or payment data in the evidence bundle. Attach redacted command output, IDs and hashes instead.

## Gate 1: identify and stage the release package

1. Check out the approved commit into a clean build workspace. Record `git rev-parse HEAD`, branch/tag, build time, builder identity and clean-worktree result. Rebuild both deployment formats from that source or attach an approved provenance attestation tying each package digest to the reviewed source. On the Windows build workstation, set a new unique version and output directory, then run:

```powershell
$Version = '<approved-version>'
./deploy/iis/Publish-IisBundle.ps1 -Version $Version -OutputPath "./artifacts/deployment-$Version/iis"
bash ./deploy/linux/package.sh $Version "./artifacts/deployment-$Version/linux"
```

The Linux package path is `artifacts/deployment-<approved-version>/linux/aierp-linux-<approved-version>.tar.gz`. Use a new output path; the publishers intentionally refuse to overwrite an existing package directory.
2. Copy the packages to the controlled release store. Preserve the Linux `.sha256` sidecar and IIS `bundle.json`; record independently distributed archive and manifest digests in the release record.
3. On the staging operator workstation, re-run the package validator against the copied artifacts:

```powershell
./tests/deployment/Invoke-DeploymentBundleValidation.ps1 `
  -LinuxArchive <path-to-linux-archive> `
  -IisBundlePath <path-to-iis-bundle> `
  -ReportPath <release-evidence>/deployment-bundle-validation.json
```

4. Attach the report, both package hashes, the source revision and the second-operator review. Reject a package if its version, hash, source identity or target environment differs from the promotion record.

## Gate 2: install and recover on the IIS staging host

Before installation, the host owner records Windows Server build, installed IIS/.NET Hosting Bundle/URL Rewrite/ARR versions, site bindings, certificate thumbprint and expiry, DNS resolution, firewall rules, SQL endpoint certificate validation, service identities and current release paths. Prepare the secrets file outside the bundle and protect its ACL; do not include its contents in evidence.

From an elevated PowerShell session on the IIS host, use the approved bundle and staging names:

```powershell
./Install-IisBundle.ps1 `
  -BundlePath <approved-bundle-path> `
  -InstallRoot <release-root> `
  -HostName <staging-erp-hostname> `
  -StudioHostName <staging-studio-hostname> `
  -CertificateThumbprint <staging-certificate-thumbprint> `
  -SecretsFile <protected-secrets-file>

./Test-IisHealth.ps1 `
  -BaseUri https://<staging-erp-hostname>/ `
  -StudioUri https://<staging-studio-hostname>/ `
  -TimeoutSeconds 90
```

Record the installed version, all four IIS physical paths, app-pool states, site bindings, effective ACL checks, health output for ERP, Studio, Platform API and AI Service, Windows event/application logs, SQL readiness, and an authenticated representative business read. Confirm startup migrations remain disabled.

In staging only, test a controlled failed health switch and verify the installer restores the prior site paths and the old version remains healthy. Then test an explicit application rollback:

```powershell
./Rollback-IisBundle.ps1 `
  -InstallRoot <release-root> `
  -HostName <staging-erp-hostname> `
  -StudioHostName <staging-studio-hostname> `
  -Version <known-good-version>
```

Capture before/after physical paths, selected versions, health results, event logs and elapsed recovery time. Do not run the negative health test against production.

## Gate 3: install and recover on the Linux staging host

Record the distribution/kernel, .NET 10 ASP.NET Core Runtime, nginx/systemd versions, DNS/TLS configuration, SQL TLS validation, firewall rules, service identities, secret-file ownership/modes, and current release symlink. Verify the transferred archive before extraction:

```bash
sha256sum --check aierp-linux-<version>.tar.gz.sha256
mkdir -p /var/tmp/nexora-stage
tar -xzf aierp-linux-<version>.tar.gz -C /var/tmp/nexora-stage
cd /var/tmp/nexora-stage/aierp-linux-<version>
./preflight.sh .
```

Run the installer as root. On first installation it may create environment templates and fail configuration preflight until the host owner fills them using the secret manager; keep the files outside the release tree and rerun after review.

```bash
sudo ./install.sh
sudo nginx -t
sudo systemctl status aierp-platform-api aierp-ai-service --no-pager
sudo /opt/nexora/bin/health-check.sh 30
curl --fail --silent --show-error https://<staging-erp-hostname>/
curl --fail --silent --show-error https://<staging-studio-hostname>/
readlink -f /opt/nexora/current
```

Record the archive and manifest hashes, `release/VERSION`, config preflight result, nginx validation, unit state, current/previous symlink targets, API and AI Service health, representative business read, `journalctl` excerpts with secrets redacted, and elapsed install time.

In staging only, exercise health-check failure and confirm the previous symlink and services are restored. Then verify the manual rollback path:

```bash
sudo /opt/nexora/bin/rollback.sh <known-good-version>
sudo /opt/nexora/bin/health-check.sh 30
readlink -f /opt/nexora/current
```

Attach the before/after symlink targets, service status, logs and recovery time. Application rollback does not reverse database schema.

## Gate 4: database identity, backup and isolated restore

The DBA records SQL Server version and server identity, encryption/certificate validation, and confirms `Database:SeparationEnabled=true`. Production runtime supports the separated topology only: `AIERPPlatform`, every provisioned `AIERPTenant_<tenant-guid>` database, and `AIERPStudio`. Record each tenant catalog/database pair and export each database's ordered `__EFMigrationsHistory` from the actual staging target; do not edit an export to make a preflight pass. A legacy shared database may be used only as a separately rehearsed migration source, never as the target runtime topology.

The following read-only query exports the migration IDs for each named staging database. Repeat the Tenant command for every database in the tenant catalog. Run through the DBA's approved authenticated `sqlcmd` session; `-b` makes SQL errors fail the command, and `-h -1` suppresses column headers.

```powershell
sqlcmd -S <staging-sql-instance> -d AIERPPlatform -E -b -h -1 -W `
  -Q "SET NOCOUNT ON; SELECT MigrationId FROM dbo.__EFMigrationsHistory ORDER BY MigrationId;" `
  -o <release-evidence>\platform-history.txt

sqlcmd -S <staging-sql-instance> -d <tenant-database-name> -E -b -h -1 -W `
  -Q "SET NOCOUNT ON; SELECT MigrationId FROM dbo.__EFMigrationsHistory ORDER BY MigrationId;" `
  -o <release-evidence>\tenant-<tenant-guid>-history.txt

sqlcmd -S <staging-sql-instance> -d AIERPStudio -E -b -h -1 -W `
  -Q "SET NOCOUNT ON; SELECT MigrationId FROM dbo.__EFMigrationsHistory ORDER BY MigrationId;" `
  -o <release-evidence>\aistudio-history.txt
```

Build one history JSON for each tenant rehearsal using the three corresponding exports. The context keys and arrays must be preserved exactly as shown; keep raw text exports with the evidence.

```powershell
$history = @{
  PlatformDbContext = @(Get-Content <release-evidence>\platform-history.txt | Where-Object { $_.Trim() })
  TenantDbContext = @(Get-Content <release-evidence>\tenant-<tenant-guid>-history.txt | Where-Object { $_.Trim() })
  AIStudioDbContext = @(Get-Content <release-evidence>\aistudio-history.txt | Where-Object { $_.Trim() })
}
$history | ConvertTo-Json -Depth 4 | Set-Content <release-evidence>\migration-history-<tenant-guid>.json -Encoding utf8
```

Use the migration readiness check on each database history file and the exact release bundle:

```powershell
./tests/deployment/Test-MigrationReleaseReadiness.ps1 `
  -BundlePath ./artifacts/migrations/2026-10-23-r4 `
  -TargetHistoryPath <exported-target-history.json> `
  | Tee-Object <release-evidence>/migration-preflight.json
```

This checks package integrity and ordered history only. It does not connect to SQL Server or establish schema/data compatibility. Run it with actual exported histories for Platform and AIStudio, and separately for every tenant database. r4 is `generated-not-applied`; its historical r3 baseline evidence is not a substitute for current target histories. Never apply Tenant or AIStudio scripts to PlatformDB or a legacy shared database.

Before migration rehearsal, the DBA takes a checksum-protected full backup of every affected database and verifies each source backup with `RESTORE VERIFYONLY WITH CHECKSUM`. Confirm `@@SERVERNAME` and the database list before running the template; use a unique file name for each database and make sure the SQL Server service identity can write to the backup path.

```sql
-- Run against the approved database host after confirming @@SERVERNAME and the target database.
SELECT @@SERVERNAME AS ServerName, DB_NAME() AS ConnectedDatabase;
GO

BACKUP DATABASE [AIERPPlatform]
  TO DISK = N'D:\SqlBackups\AIERPPlatform-release-stage-20261022T120000Z.bak'
  WITH COPY_ONLY, CHECKSUM, INIT;
GO

RESTORE VERIFYONLY
  FROM DISK = N'D:\SqlBackups\AIERPPlatform-release-stage-20261022T120000Z.bak'
  WITH CHECKSUM;
GO
```

Repeat the backup and verification for every affected database, including every provisioned tenant and AIStudio when the separated topology requires them. For the real change window, the DBA uses the approved target and unique release-specific filenames; the sample path and database are illustrative. Use `sqlcmd` with `-b` and `-o`, or an equivalent controlled client, so execution errors stop the script and output is preserved. Copy the complete set to an independent off-host destination, verify hashes there, and record backup IDs, sizes, hashes, timestamps and restore owner. SQL Server's checksum option verifies backup data during backup/restore; `RESTORE VERIFYONLY` checks completeness and readability but does not restore the database or validate its data structure, so it does not replace an actual isolated restore. [Microsoft Learn: backup checksums](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/enable-or-disable-backup-checksums-during-backup-or-restore-sql-server), [RESTORE VERIFYONLY](https://learn.microsoft.com/en-us/sql/t-sql/statements/restore-statements-verifyonly-transact-sql?view=sql-server-ver17), [sqlcmd options](https://learn.microsoft.com/en-us/sql/tools/sqlcmd/sqlcmd-use-utility?view=sql-server-ver17).

Restore the verified copy only on the isolated SQL staging instance, under a new database name and new file paths. First list the logical files, then add one `MOVE` for every data and log file returned:

```sql
RESTORE FILELISTONLY
  FROM DISK = N'D:\SqlBackups\AIERPPlatform-release-stage-20261022T120000Z.bak';
GO

-- Replace each logical name and path from FILELISTONLY; use a unique drill database.
RESTORE DATABASE [AIERPPlatform_RestoreDrill_20261022]
  FROM DISK = N'D:\SqlBackups\AIERPPlatform-release-stage-20261022T120000Z.bak'
  WITH MOVE N'<logical-data-file>' TO N'E:\SqlData\AIERPPlatform_RestoreDrill_20261022.mdf',
       MOVE N'<logical-log-file>'  TO N'E:\SqlLogs\AIERPPlatform_RestoreDrill_20261022.ldf',
       CHECKSUM, RECOVERY, STATS = 5;
GO

DBCC CHECKDB ([AIERPPlatform_RestoreDrill_20261022]) WITH NO_INFOMSGS, ALL_ERRORMSGS;
GO
```

Add `MOVE` entries for any additional files and use the target SQL Server's approved data/log directories. Never use `WITH REPLACE` or a production database name for a recovery drill. Verify `DBCC CHECKDB` and representative ERP reads against each restored copy. [Microsoft Learn: restore files to a new location](https://learn.microsoft.com/en-us/sql/relational-databases/backup-restore/restore-a-database-to-a-new-location-sql-server), [DBCC CHECKDB](https://learn.microsoft.com/en-us/sql/t-sql/database-console-commands/dbcc-checkdb-transact-sql?view=sql-server-linux-ver17).

Rehearse the exact reviewed r4 SQL against the isolated restored copies using the target SQL Server version and the migration order approved for the compatibility plan. The r4 package contains 136 Platform, 48 Tenant and 11 AIStudio migrations. Its incremental scripts are usable only when the isolated database history exactly matches the documented r3 prefix: Platform 124 migrations through `20261022130452_AddIntradayManufacturingScheduling`, Tenant 44 migrations through `20261022145500_AddAnnualWorkCenterCapacityRules`, and AIStudio 10 migrations through `20261017134712_AddStudioKnowledgeRefreshConsentAIStudio`. First capture before histories and validate each prefix; if any target differs, stop and have the DBA choose and review the appropriate full idempotent or other recovery plan. Never edit history exports to force a prefix match.

After static history preflight and SQL review, the examples below rehearse incremental scripts only if the isolated restored databases exactly match their recorded prefixes:

```powershell
sqlcmd -S <isolated-sql-instance> -d <isolated-platform-database> -E -b `
  -i .\artifacts\migrations\2026-10-23-r4\platform-incremental.sql `
  -o <release-evidence>\platform-migration-rehearsal.log

sqlcmd -S <isolated-sql-instance> -d <isolated-tenant-database> -E -b `
  -i .\artifacts\migrations\2026-10-23-r4\tenant-incremental.sql `
  -o <release-evidence>\tenant-migration-rehearsal.log

sqlcmd -S <isolated-sql-instance> -d <isolated-aistudio-database> -E -b `
  -i .\artifacts\migrations\2026-10-23-r4\aistudio-incremental.sql `
  -o <release-evidence>\aistudio-migration-rehearsal.log
```

The incrementals contain 9 pending Platform, 3 pending Tenant and 1 pending AIStudio migration against those exact r3 prefixes. They do not prove that a staging target has those prefixes. Use full idempotent scripts only when the DBA has reviewed their history guards and confirmed the intended target database. Run Tenant preflight and rehearsal for every tenant database. Include AIStudio in identity, backup, restore and application checks. Capture SQL output/errors, lock and blocking duration, before/after histories, schema/data checks, app compatibility results and DBA review. Do not infer migration safety from connectivity health.

After rehearsal, start the matching application package on the isolated staging topology and validate readiness plus representative tenant-scoped reads/writes agreed for the rehearsal. Record any compatibility issue and stop before production if an unreviewed schema difference, unexpected migration, failed check, or failed restore appears. This runbook does not authorize production migration or restore.

After rehearsal passes, retain the reviewed scripts, backup set and restore test for the rollback window. Any production migration or restore is a separate change with its own DBA, business-owner and release approvals. This runbook does not authorize or perform either operation.

## Gate 5: multi-node high availability and failover

Run this gate only in an isolated staging environment that matches the intended production topology. Record the two or more node names, deployer version, shared lock/lease backend, fencing token or equivalent stale-owner rejection, load balancer health policy, SQL primary/secondary topology, monitoring destination and approved RTO/RPO.

1. Confirm all nodes and the SQL staging service are healthy; capture active release IDs and baseline traffic/error/latency rates.
2. Start a release operation on node A and hold its coordination lease. Attempt a concurrent operation from node B. The second operation must not publish while A owns the lease. Capture both operation IDs and lock/fencing evidence.
3. Stop or isolate node A while it owns the lease. Confirm node B takes over only after the lease/fence permits it; verify the old node cannot publish with a stale token after it returns.
4. Remove one API node from service through the staging load balancer. Confirm readiness probes remove it, existing requests drain or fail within the agreed threshold, remaining nodes serve traffic, and alerts reach the on-call route.
5. Trigger the planned SQL staging failover using the database team's procedure. Confirm client reconnection, health recovery, data consistency and measured RTO/RPO. Record whether a migration was in progress and follow the operator review path if schema change may have started.
6. Restore the original node and SQL roles through the approved procedure. Reconcile active release IDs, lock state, service health, monitoring and test data. Preserve logs and timestamps for every transition.

Mark HA accepted only when concurrent-promotion exclusion, stale-owner fencing, traffic failover, SQL failover, alert delivery and recovery objectives all have evidence and the operations owner signs the result. A single-node package check or SQL restore drill is not HA acceptance.

## Evidence record and release decision

Attach one redacted evidence folder to the release record with this index:

- [ ] Approved source commit, clean-worktree result, package versions, independent hashes and second-operator review
- [ ] IIS host prerequisites, installation, health, permissions, controlled failed-switch recovery and rollback
- [ ] Linux host prerequisites, checksum/preflight, installation, health, permissions, controlled failed-switch recovery and rollback
- [ ] SQL topology, per-database histories, static migration preflight, SQL review and compatibility plan
- [ ] Full and incremental migration script hashes, ordered migration IDs and exact r3 prefix match where incrementals are selected
- [ ] Current approved-source package validator report and source provenance attached; historical package reports are not used for a newer build
- [ ] r4 manifest and `SHA256SUMS.txt` verified; target history exports and r4 static preflight reports attached per Platform, AIStudio and every Tenant database
- [ ] Full checksummed backup set, independent-copy hashes, isolated restore, DBCC and representative application reads
- [ ] Migration rehearsal output, before/after histories, schema/data checks, blocking duration and DBA sign-off
- [ ] HA topology, lock/fencing, node and SQL failover, alert delivery, measured RTO/RPO and operations sign-off
- [ ] Release owner go/no-go, target environment, maintenance window, rollback owner and incident escalation contact

The release owner records `GO` only when every required item for the chosen topology is attached and the host owner, DBA and operations owner have signed their gates. Record each accepted exception with an owner and due date; unresolved database compatibility, backup recoverability, host rollback or HA fencing evidence keeps the release at `NO-GO`.


