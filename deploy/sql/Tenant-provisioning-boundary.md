# Tenant provisioning SQL boundary (SQL Server 2022)

`Install-TenantProvisioningBoundary.sql` installs three signed procedures in
`master` for the Worker. Run it with `sqlcmd` as a DBA after the platform
migrations are current and `AIERPPlatform` is online. Do not run it against a
production server until it has been reviewed and exercised in an isolated SQL
Server 2022 instance.

The only SQLCMD substitution is the existing server principal name:

```powershell
sqlcmd -S <server> -E -d master -v TenantProvisioningLoginName="<worker-login>" -i .\deploy\sql\Install-TenantProvisioningBoundary.sql
```

The script requires a pre-created/openable `master` database master key. Have
the DBA provision that key from the organization’s secret manager before the
script runs. No key or login password belongs in this repository or the
SQLCMD command line. On first install, the script transfers only the signer’s
public certificate in-memory from `master` to `AIERPPlatform`; it does not use
a host-specific filesystem path. The certificate private key stays in
`master`.

The signer certificate login receives only `CREATE ANY DATABASE` and
`ALTER ANY LOGIN`. A matching certificate user in `AIERPPlatform` has `SELECT`
only on `Tenants`, `TenantProvisioningJobs`, `TenantDatabaseCatalog`, and
`DatabaseSeparationComponentStates`, the exact tables read by the state gates.
The Worker receives `EXECUTE` only on the three procedures in `master`; it is
not made `dbcreator`, `securityadmin`, `db_owner`, or `sysadmin`. The Worker
still needs separately reviewed, narrow permissions for its ordinary
`AIERPPlatform` provisioning job/catalog updates and tenant migrations. This
script deliberately does not grant those unrelated permissions.

The Docker Compose Worker runs as UID/GID `1654:1654`. Windows host ACLs on
file-backed Compose secrets do not necessarily grant that Linux identity read
access. The `tenant-provisioning-secrets-init` service therefore reads the
host-mounted files as a constrained, one-shot root helper, copies them into a
Docker-managed volume, and changes each file to owner `1654:1654`, mode `0440`
(directory `0550`). The Worker mounts only that volume read-only and stays
non-root. The helper fails closed if any source is missing or empty. When a
source secret is rotated, recreate the helper and Worker so the volume is
refreshed; do not edit the volume contents from the running Worker.

## Gate and contract

The SQL procedure contract uses component values `1 = ERP`, `2 = AIStudio`.
The current C# enum is zero-based (`Erp = 0`, `AiStudio = 1`), so the application
adapter must map explicitly (`(byte)component + 1`) when invoking these SQL
procedures. The procedures derive the only
valid database/login names from the tenant GUID (`AIERPTenant_<guidN>`,
`AIERPStudio_<guidN>`, `aierp_t_<guidN>`, `aierp_s_<guidN>`). The caller cannot
choose names, catalog states, or job identifiers. Database creation always
requires an existing inactive tenant and a `Running` (`2`), unexpired
provisioning job.
ERP operations additionally require that tenant’s canonical ERP catalog row
to be `Copying` (`2`) when the database is absent; an existing canonical DB
may be retried when its row has advanced to `Ready` (`3`). AIStudio operations
require the ERP row `Ready` (`3`) and the
`DatabaseSeparationComponentStates` row `AIStudio:<guidN>` to be `Copying`
(`2`) while absent, or `Ready` (`3`) when the canonical Studio database is
already present. This allows crash retries without creating a database from a
Ready row that has no corresponding database. These state values match the
current C# enum mappings.

The procedures are:

- `master.dbo.NexoraEnsureTenantDatabase(@TenantId, @Component)`
- `master.dbo.NexoraEnsureTenantSqlLogin(@TenantId, @Component, @Password)`
- `master.dbo.NexoraTenantDatabaseExists(@TenantId, @Component)` (one bit result)

The read-only existence procedure also permits checks for an active tenant
when its canonical catalog row is `Ready` and the database is present. This is
needed for the maintenance credential cutover and does not grant database
creation. The login procedure permits password rotation for the canonical
login of an active tenant only when its canonical database is already present
and its catalog row is `Ready`; for inactive tenants it continues to require a
live provisioning lease and the component state gate. Run credential cutover
only while API, AI Service, and tenant-aware workers are stopped. The login
procedure requires the canonical database to exist and resets that canonical
login’s password and default database. Avoid SQL tracing/auditing configurations that capture
procedure parameter values; the password is needed to issue SQL Server’s
`CREATE LOGIN`/`ALTER LOGIN` statement.

## Re-signing and rollout

`CREATE OR ALTER` changes a module signature, so the script drops any previous
signature from each procedure and signs it again with the existing certificate.
It never drops/recreates the certificate, certificate login, or certificate
user. Keep the master certificate backed up securely according to DBA policy;
the exported `.cer` is public material only. During later script runs, the
existing Platform certificate prevents another public-cert export/import.

This SQL boundary alone does not change the current C# provisioner. Application
deployment must call these exact procedures and remove direct `CREATE
DATABASE`, `CREATE LOGIN`, and `ALTER LOGIN` calls before the Worker’s broad
server permissions are removed. This script does not test or mutate a live
database. Validate ownership/default access for newly created databases,
tenant migrations, retries, expired leases, active tenants, and both component
paths in a disposable SQL Server environment before rollout.
