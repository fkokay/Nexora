# Nexora IIS deployment bundle

This bundle publishes two ASP.NET Core services and two independent Vite frontends:

| IIS site | Bundle directory | Binding / purpose |
| --- | --- | --- |
| `Nexora-PlatformApi` | `platform-api` | Loopback HTTP `127.0.0.1:5080` |
| `Nexora-AIService` | `ai-service` | Loopback HTTP `127.0.0.1:5081` |
| `Nexora-ERP` | `erp-web` | ERP frontend, HTTPS `erp.example.com` |
| `Nexora-Studio` | `development-studio` | Studio frontend, HTTPS `studio.example.com` |

The Studio is a separate frontend service. Configure its public GitHub redirect to `https://studio.example.com/?app=studio`. IIS does not select static applications based on query parameters; using a dedicated Studio hostname keeps `/studio/*` reserved for the AI API and sends `/api/*` to Platform API. Both frontend sites share the API proxy rules, but serve different static build output. Use a certificate valid for both hostnames (or extend the installer for separate certificates).

## Build

Build on a machine with the .NET 10 SDK, Node.js/npm, and network or package-cache access:

```powershell
.\Publish-IisBundle.ps1 -Version 1.0.0 -OutputPath C:\build\Nexora-IIS-1.0.0
```

The publisher creates a fresh output directory, runs framework-dependent `dotnet publish` for Platform API and AIService, then runs `npm ci` and `npm run build` for both frontends in temporary copies. It never writes generated frontend output into the source tree. The target server needs the .NET 10 ASP.NET Core Hosting Bundle, IIS 10, IIS URL Rewrite 2.1, and IIS ARR 3.0 with proxy enabled.

## Install or upgrade

1. Create `C:\ProgramData\Nexora\deployment\nexora-secrets.psd1` from the bundled `secrets.example.psd1`. Replace every placeholder. `IntegrationQueue__EncryptionKey` must be base64 encoding of exactly 32 random bytes; `Authentication__SigningKey` and `PluginHost__SigningKey` must each be at least 32 bytes and distinct. Protect the file so only Administrators and SYSTEM can read it. Use SQL least-privilege credentials and a secret store or managed credential process for operational use.
2. Make DNS for `erp.example.com` and `studio.example.com` resolve to the IIS host. Install a trusted certificate with a private key in `LocalMachine\My`; it must cover both names.
3. From an elevated PowerShell session:

```powershell
./Install-IisBundle.ps1 `
  -BundlePath C:\build\Nexora-IIS-1.0.0 `
  -InstallRoot D:\Nexora\iis `
  -HostName erp.example.com `
  -StudioHostName studio.example.com `
  -CertificateThumbprint 0123456789ABCDEF0123456789ABCDEF01234567 `
  -SecretsFile C:\ProgramData\Nexora\deployment\nexora-secrets.psd1
```

The installer copies each version into an immutable `releases/<version>` directory, injects settings into the ASP.NET Core Module `web.config` files, grants each app pool read/execute access to its release, sets production mode with startup migrations disabled, and switches the four IIS site roots. Secret values are not placed in the publish bundle; the installed API `web.config` files contain them and therefore must remain readable only by Administrators, SYSTEM, and the corresponding app pool. For stricter secret-at-rest requirements, inject environment variables from an approved machine secret provider instead of the example PSD1.

The installer health-checks the ERP and Studio origins, Platform `/health`, and AI API `/health` proxied as `/ai-health`. Health readiness requires reachable database dependencies. API migrations are intentionally not run by deployment; apply the matching reviewed migrations as a separate controlled operation before upgrading when required.

## Rollback

The previous version directory is retained. To switch to the newest previous release:

```powershell
./Rollback-IisBundle.ps1 -InstallRoot D:\Nexora\iis `
  -HostName erp.example.com -StudioHostName studio.example.com
```

Or specify `-Version <retained-version>`. `Switch-IisRelease.ps1` changes all four site roots as one operation, recycles their pools, checks both public sites and API readiness, and restores the previous physical paths if a check fails. Do not remove a release while it is current or needed for rollback. Database schema rollback is deliberately outside this script.

## External services and limitations

This bundle includes Platform API, AIService, ERP Web, and Development Studio. Workspace Runner, Release Deployer, Plugin Host, Integration Host, SQL Server, telemetry infrastructure, and any reverse proxy/WAF not listed here remain separately deployed services; set their `*__BaseUrl` and connection settings in the protected configuration. Studio's `/api/*` goes to Platform API; `/studio/*`, `/ai-health`, and GitHub setup callback routes go to AIService. Static routes fall through to each app's `index.html`.

The scripts target Windows Server IIS and are not tested against a live IIS installation here. HTTPS certificate binding, ARR/Rewrite module installation, DNS, ACL behavior, app pool startup, database connectivity, and production traffic must be validated in a staging IIS environment before production use. Configure a separate certificate per hostname manually if a single SAN certificate is not appropriate.
