# Nexora Linux deployment bundle

This bundle publishes the Platform API, AI Service, ERP Web static site and separate AI Development Studio static site as one versioned release. It targets a systemd host with nginx and the .NET 10 ASP.NET Core Runtime. SQL Server remains external; this bundle does not install, migrate, seed or back up a database.

## Build a package

Run on a Linux build host with .NET 10 SDK, Node.js/npm and tar installed:

```bash
bash deploy/linux/package.sh 1.0.0
```

The archive is written to `artifacts/linux/aierp-linux-1.0.0.tar.gz` with a sibling SHA-256 file. It contains framework-dependent .NET publishes, both frontend `dist` directories, service/nginx configuration, installer and rollback tools. `npm ci` is used so each lockfile controls its frontend dependencies. Before extraction/install, verify the archive with `sha256sum --check aierp-linux-1.0.0.tar.gz.sha256`; installer also verifies every published release file and the release version against `release/SHA256SUMS`.

Before making host changes, `install.sh` runs the packaged `preflight.sh`. The archive sidecar SHA-256 must be checked before extraction; this binds the downloaded archive. The installer then verifies `BUNDLE-SHA256SUMS` across every extracted file (including the env examples and support scripts), plus exact `release/SHA256SUMS` coverage for the application payload. Unsafe paths, symlinks, changed or missing files, and unmanifested files fail closed. It also checks that both shipped examples contain the tenant and Studio runtime connections and explicitly enable per-company databases. After placing or loading the protected environment files, the installer runs `config-preflight.sh` locally to check secret placeholders, key lengths and separation, optional queue-key format, and matching token issuer/audience values for the Platform API and AI Service. It does not contact an identity provider, SQL Server or public host. `tests/deployment/Test-LinuxInstallerPreflight.ps1` exercises the checks against temporary fixtures only.

## Host prerequisites and secrets

Install .NET 10 ASP.NET Core Runtime, nginx, curl and systemd. Configure DNS names `erp.example.com` and `studio.example.com` (or replace both in the nginx file) and HTTPS termination before exposing the service publicly. The included nginx site listens on HTTP port 80 as a deployable starting point; add TLS certificates and HTTP-to-HTTPS redirection using the host's certificate management process. ERP Web is served on the ERP name; Studio UI is served on the Studio name. Both proxy `/api/*` to Platform API; Studio additionally proxies `/studio/*` to AI Service.

Extract the archive and run `sudo ./install.sh`. On first run, the installer places root-owned environment templates in `/etc/nexora/` and stops before activating a release. Edit both files and rerun. The installer sets the directory to `root:nexora` mode `0750` and each file to `root:nexora` mode `0640`, so only root and the dedicated service group can access the credentials; keep them outside release archives and source control. A host secret manager may render them at deploy time.

Set `ConnectionStrings__Platform` to the external SQL Server using a least-privilege runtime login and TLS certificate validation. The API's `Authentication__SigningKey` must contain at least 32 bytes; use the same value for the AI Service. `PluginHost__SigningKey` must be a distinct secret of at least 32 bytes. The installer checks these requirements before activating a release. If configured, `IntegrationQueue__EncryptionKey` must be base64 for exactly 32 random bytes. Example generation commands (store the outputs in a secret manager, never commit them):

```bash
openssl rand -base64 48
openssl rand -base64 48
```

New installs use the separated topology shown in both environment templates: PlatformDB for identity and tenant catalog, and one `AIERPTenant_<tenant-guid>` plus one `AIERPStudio_<tenant-guid>` database per company. Tenant and Studio endpoint connection strings contain only server/TLS settings; each tenant's unique SQL login is obtained from Vault. Set up Vault KV v2, the read-only tenant SQL AppRole and its two credential files before starting either service. Install the Vault CA in the host trust store. The Linux config preflight and both runtime hosts require `Database__SeparationEnabled=true` and fail closed if Vault is unavailable or its reader identity is missing. A legacy shared installation must be quiesced and migrated with the verified backup-and-copy procedure before installing this release; changing the flag alone does not move any data. The Linux installer does not perform that data migration. The web app and API share the nginx origin; set `Frontend__Origins__0` to that exact public origin.

### Existing tenant SQL credential cutover

For already isolated tenants, use the one-shot Tenant Provisioning Worker command documented in [tenant SQL credential isolation](../../docs/tenant-sql-credential-isolation.md#existing-ready-tenant-credential-cutover). It rotates each tenant's ERP and Studio SQL passwords, writes and reads back the tenant-scoped Vault secrets, and checks that each identity is limited to its own database. Stop Platform API, AI Service, and every tenant-aware worker for the whole operation. The command requires a separate DBA-approved provisioning SQL connection file and a temporary Vault writer AppRole; do not reuse the API runtime account or a SQL administrator. Restart services only after the Worker verifies every Ready tenant. Then check authenticated ERP and Studio operations. This installer does not run the cutover.

Create `/etc/nexora/secrets` for the runtime reader files, owned by `nexora:nexora` with directory mode `0700`; each non-empty RoleId and SecretId file must be owned by `nexora` and mode `0600`. Use the same read-only AppRole for the two runtime services, keep its policy limited to tenant SQL paths, and do not copy the provisioning writer identity to the API or AI Service.

The services listen only on loopback: Platform API on `127.0.0.1:5080`, AI Service on `127.0.0.1:5081`. nginx publishes ERP Web and Studio UI on their respective host names, proxies `/api/*` and `/health` to Platform API, and proxies `/studio/*` on the Studio host to AI Service. The API's AI Service URL and AI Service's Platform API URL are explicitly set to loopback in the env templates.

PluginHost, IntegrationHost, WorkspaceRunner and ReleaseDeployer are separate support services and are not included in this bundle. Their BaseUrl settings are blank in the templates. Features that call those services stay unavailable until the services are separately installed, secured and their respective `*_BaseUrl` values are configured. Do not set them to Docker-only DNS names on a standalone systemd host. Check API and AI Service health with `sudo /opt/nexora/bin/health-check.sh 30` and inspect logs with `journalctl -u aierp-platform-api -u aierp-ai-service`.

## Install, upgrade and rollback

Before the first install, edit the extracted bundle's `nginx/nexora.conf` to use real host names (both example names must be replaced), and complete TLS setup. The installer copies that site only if `/etc/nginx/sites-available/nexora` does not already exist, validates nginx syntax, preserves existing site and secret files, installs immutable release files under `/opt/nexora/releases/<version>`, enables both systemd services and switches `/opt/nexora/current` only after health checks pass. A failed health check restores the previous symlink and restarts the old services. The prior release is retained under `/opt/nexora/previous`.

For an upgrade, unpack the new bundle and run its installer. The current release is preserved and the new version is activated as one unit. To roll back, run `sudo /opt/nexora/bin/rollback.sh`; optionally pass a retained version name. To inspect the active release, use `readlink -f /opt/nexora/current`.

Database migrations require a separate, reviewed maintenance operation. This installer deliberately does not apply migrations or change live data. Production runtime requires the separated topology: PlatformDB, one `AIERPTenant_<tenant-guid>` database per company, and `AIERPStudio`; shared-company runtime is unsupported. Review the matching Platform, Tenant and AIStudio scripts against the target schema/data, take and verify a full backup set for every affected database, and rehearse against isolated restores before applying. For a legacy shared installation, use only the approved backup-and-copy cutover procedure; changing the separation flag does not move data. Choose migration/deployment order based on compatibility: for expand/migrate/contract, deploy compatible code before backfilling and switching reads; do not assume every migration is safe before or after the application switch. Keep the previous package and verified backups through the rollback window. Application rollback does not reverse schema changes; use a compatible forward fix or the separately approved database recovery procedure. See [production deployment and recovery readiness](../../docs/production-deployment-readiness.md).

## Runtime configuration

The systemd units run as the dedicated `nexora` user, read secrets from `/etc/nexora/*.env`, restart on failure and apply systemd filesystem/process hardening. `systemctl status aierp-platform-api aierp-ai-service` reports process state; `/health` checks additionally validate SQL connectivity. nginx serves SPA fallback routes from the active release and forwards client address/protocol headers to the API.
