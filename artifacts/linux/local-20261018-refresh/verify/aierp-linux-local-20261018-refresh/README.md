# Nexora Linux deployment bundle

This bundle publishes the Platform API, AI Service, ERP Web static site and separate AI Development Studio static site as one versioned release. It targets a systemd host with nginx and the .NET 10 ASP.NET Core Runtime. SQL Server remains external; this bundle does not install, migrate, seed or back up a database.

## Build a package

Run on a Linux build host with .NET 10 SDK, Node.js/npm and tar installed:

```bash
bash deploy/linux/package.sh 1.0.0
```

The archive is written to `artifacts/linux/aierp-linux-1.0.0.tar.gz` with a sibling SHA-256 file. It contains framework-dependent .NET publishes, both frontend `dist` directories, service/nginx configuration, installer and rollback tools. `npm ci` is used so each lockfile controls its frontend dependencies. Before extraction/install, verify the archive with `sha256sum --check aierp-linux-1.0.0.tar.gz.sha256`; installer also verifies every published release file and the release version against `release/SHA256SUMS`.

## Host prerequisites and secrets

Install .NET 10 ASP.NET Core Runtime, nginx, curl and systemd. Configure DNS names `erp.example.com` and `studio.example.com` (or replace both in the nginx file) and HTTPS termination before exposing the service publicly. The included nginx site listens on HTTP port 80 as a deployable starting point; add TLS certificates and HTTP-to-HTTPS redirection using the host's certificate management process. ERP Web is served on the ERP name; Studio UI is served on the Studio name. Both proxy `/api/*` to Platform API; Studio additionally proxies `/studio/*` to AI Service.

Extract the archive and run `sudo ./install.sh`. On first run, the installer places root-owned environment templates in `/etc/nexora/` and stops before activating a release. Edit both files and rerun. The installer sets the directory to `root:nexora` mode `0750` and each file to `root:nexora` mode `0640`, so only root and the dedicated service group can access the credentials; keep them outside release archives and source control. A host secret manager may render them at deploy time.

Set `ConnectionStrings__Platform` to the external SQL Server using a least-privilege runtime login and TLS certificate validation. The API's `Authentication__SigningKey` must contain at least 32 bytes; use the same value for the AI Service. `PluginHost__SigningKey` must be a distinct secret of at least 32 bytes. The installer checks these requirements before activating a release. If configured, `IntegrationQueue__EncryptionKey` must be base64 for exactly 32 random bytes. Example generation commands (store the outputs in a secret manager, never commit them):

```bash
openssl rand -base64 48
openssl rand -base64 48
```

When database separation is enabled, provision the Tenant and AIStudio databases and set their connection strings before setting `Database__SeparationEnabled=true`. Do not enable separation against an unprovisioned topology. The web app and API share the nginx origin; set `Frontend__Origins__0` to that exact public origin.

The services listen only on loopback: Platform API on `127.0.0.1:5080`, AI Service on `127.0.0.1:5081`. nginx publishes ERP Web and Studio UI on their respective host names, proxies `/api/*` and `/health` to Platform API, and proxies `/studio/*` on the Studio host to AI Service. The API's AI Service URL and AI Service's Platform API URL are explicitly set to loopback in the env templates.

PluginHost, IntegrationHost, WorkspaceRunner and ReleaseDeployer are separate support services and are not included in this bundle. Their BaseUrl settings are blank in the templates. Features that call those services stay unavailable until the services are separately installed, secured and their respective `*_BaseUrl` values are configured. Do not set them to Docker-only DNS names on a standalone systemd host. Check API and AI Service health with `sudo /opt/nexora/bin/health-check.sh 30` and inspect logs with `journalctl -u aierp-platform-api -u aierp-ai-service`.

## Install, upgrade and rollback

Before the first install, edit the extracted bundle's `nginx/nexora.conf` to use real host names (both example names must be replaced), and complete TLS setup. The installer copies that site only if `/etc/nginx/sites-available/nexora` does not already exist, validates nginx syntax, preserves existing site and secret files, installs immutable release files under `/opt/nexora/releases/<version>`, enables both systemd services and switches `/opt/nexora/current` only after health checks pass. A failed health check restores the previous symlink and restarts the old services. The prior release is retained under `/opt/nexora/previous`.

For an upgrade, unpack the new bundle and run its installer. The current release is preserved and the new version is activated as one unit. To roll back, run `sudo /opt/nexora/bin/rollback.sh`; optionally pass a retained version name. To inspect the active release, use `readlink -f /opt/nexora/current`.

Database migrations require a separate, reviewed maintenance operation: take and verify a SQL Server backup, inspect the generated migration SQL for destructive changes, apply with the approved migration process, verify database readiness, then install the app release. This installer deliberately does not apply migrations or change live data. Application rollback does not reverse database schema changes; use a compatible forward fix or the separately approved database recovery procedure.

## Runtime configuration

The systemd units run as the dedicated `nexora` user, read secrets from `/etc/nexora/*.env`, restart on failure and apply systemd filesystem/process hardening. `systemctl status aierp-platform-api aierp-ai-service` reports process state; `/health` checks additionally validate SQL connectivity. nginx serves SPA fallback routes from the active release and forwards client address/protocol headers to the API.
