internal static class StagingTemplates {
internal static string DotnetDockerfile(string project, string assembly, bool addCurl, bool addImageMetadata = false) => $"""
    FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
    WORKDIR /src
    COPY . .
    RUN dotnet publish {project} -c Release -o /app/publish
    FROM mcr.microsoft.com/dotnet/aspnet:10.0
    {(addImageMetadata ? "ARG OCI_IMAGE_REVISION=unknown\nARG OCI_IMAGE_VERSION=unknown\nLABEL org.opencontainers.image.source=\"https://github.com/fkokay/Nexora\" org.opencontainers.image.revision=\"${OCI_IMAGE_REVISION}\" org.opencontainers.image.version=\"${OCI_IMAGE_VERSION}\"" : "")}
    {(addCurl ? "RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*" : "RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates && rm -rf /var/lib/apt/lists/* && mkdir -p /workspaces /test-jobs && chown -R app:app /workspaces /test-jobs")}
    WORKDIR /app
    COPY --from=build /app/publish .
    HEALTHCHECK --interval=10s --timeout=3s --retries=15 --start-period=30s CMD curl -fsS http://127.0.0.1:8080/health || exit 1
    USER app
    ENV ASPNETCORE_URLS=http://+:8080
    EXPOSE 8080
    ENTRYPOINT ["dotnet", "{assembly}"]
    """;

internal const string SandboxDockerfile = """
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore AIERP.slnx && dotnet publish src/AI/AIERP.WorkspaceSandbox/AIERP.WorkspaceSandbox.csproj -c Release --no-restore -o /app/publish
FROM mcr.microsoft.com/dotnet/sdk:10.0
RUN apt-get update && apt-get install -y --no-install-recommends util-linux ca-certificates nodejs python3 python3-pytest golang-go rustc cargo && rm -rf /var/lib/apt/lists/* && mkdir -p /test-jobs /tmp/test-jobs /opt/nuget-feed && chmod 0750 /test-jobs && dotnet --list-sdks >/dev/null
COPY --from=build /root/.nuget/packages /opt/nuget-feed
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "AIERP.WorkspaceSandbox.dll"]
""";

internal const string StudioDockerfile = """
FROM node:22-alpine AS build
WORKDIR /workspace
COPY frontend/development-studio/package.json frontend/development-studio/package-lock.json ./frontend/development-studio/
WORKDIR /workspace/frontend/development-studio
RUN npm ci
WORKDIR /workspace
COPY frontend/development-studio ./frontend/development-studio
COPY .aierp-deploy/development-studio.nginx.conf /workspace/frontend/development-studio/deploy-studio.nginx.conf
RUN npm --prefix frontend/development-studio run build
FROM nginx:1.27-alpine
ARG OCI_IMAGE_REVISION=unknown
ARG OCI_IMAGE_VERSION=unknown
LABEL org.opencontainers.image.source="https://github.com/fkokay/Nexora" \
      org.opencontainers.image.revision="${OCI_IMAGE_REVISION}" \
      org.opencontainers.image.version="${OCI_IMAGE_VERSION}"
COPY .aierp-deploy/development-studio.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/development-studio/dist /usr/share/nginx/html
HEALTHCHECK --interval=10s --timeout=3s --retries=15 --start-period=10s CMD wget -q --spider http://127.0.0.1/ || exit 1
EXPOSE 80
""";

internal const string StudioNginxConfig = """
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location /api/ { proxy_pass http://platform-api:8080/api/; proxy_http_version 1.1; proxy_set_header Host $host; }
    location /studio/ { proxy_pass http://ai-service:8080/studio/; proxy_http_version 1.1; proxy_set_header Host $host; }
    location /health { proxy_pass http://platform-api:8080/health; }
    location / { try_files $uri $uri/ /index.html; }
}
""";

internal const string StagingCompose = """
services:
  sql-backup-volume-init:
    image: busybox:1.37.0
    command: ["sh", "-c", "chown 10001:0 /backups && chmod 0775 /backups"]
    volumes: [sql-backups:/backups]
    network_mode: none
    user: "0:0"
    read_only: true
    cap_drop: [ALL]
    cap_add: [CHOWN, FOWNER]
    security_opt: [no-new-privileges:true]
    restart: "no"
  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_PID: Developer
      MSSQL_SA_PASSWORD: ${MSSQL_SA_PASSWORD}
    healthcheck:
      test: ["CMD-SHELL", "/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P \"$${MSSQL_SA_PASSWORD}\" -C -Q 'SELECT 1' >/dev/null 2>&1"]
      interval: 10s
      timeout: 5s
      retries: 15
      start_period: 30s
    volumes: [sql-data:/var/opt/mssql, sql-backups:/var/opt/mssql/backups]
    depends_on:
      sql-backup-volume-init: { condition: service_completed_successfully }
    mem_limit: 2g
    cpus: 1.5
    pids_limit: 512
    restart: unless-stopped
  sql-runtime-init:
    image: mcr.microsoft.com/mssql/server:2022-latest
    entrypoint: ["/bin/bash", "-c"]
    command: ["until /opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -P \"$$MSSQL_SA_PASSWORD\" -C -Q 'SELECT 1' >/dev/null 2>&1; do sleep 2; done; /opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -P \"$$MSSQL_SA_PASSWORD\" -C -b -Q \"IF DB_ID(N'AIERPPlatform') IS NULL CREATE DATABASE [AIERPPlatform]\" && /opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -P \"$$MSSQL_SA_PASSWORD\" -C -b -Q \"IF SUSER_ID(N'aierp_platform_runtime') IS NULL CREATE LOGIN [aierp_platform_runtime] WITH PASSWORD=N'$$AIERP_PLATFORM_RUNTIME_PASSWORD', CHECK_POLICY=OFF; IF SUSER_ID(N'aierp_platform_migrator') IS NULL CREATE LOGIN [aierp_platform_migrator] WITH PASSWORD=N'$$AIERP_PLATFORM_MIGRATOR_PASSWORD', CHECK_POLICY=OFF\" && /opt/mssql-tools18/bin/sqlcmd -S sqlserver -U sa -P \"$$MSSQL_SA_PASSWORD\" -C -b -d AIERPPlatform -Q \"IF USER_ID(N'aierp_platform_runtime') IS NULL CREATE USER [aierp_platform_runtime] FOR LOGIN [aierp_platform_runtime]; IF IS_ROLEMEMBER(N'db_datareader', N'aierp_platform_runtime') = 0 ALTER ROLE [db_datareader] ADD MEMBER [aierp_platform_runtime]; IF IS_ROLEMEMBER(N'db_datawriter', N'aierp_platform_runtime') = 0 ALTER ROLE [db_datawriter] ADD MEMBER [aierp_platform_runtime]; IF USER_ID(N'aierp_platform_migrator') IS NULL CREATE USER [aierp_platform_migrator] FOR LOGIN [aierp_platform_migrator]; IF NOT EXISTS (SELECT 1 FROM sys.database_role_members WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'db_owner') AND member_principal_id=DATABASE_PRINCIPAL_ID(N'aierp_platform_migrator')) ALTER ROLE [db_owner] ADD MEMBER [aierp_platform_migrator]\""]
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: ${MSSQL_SA_PASSWORD}
      AIERP_PLATFORM_RUNTIME_PASSWORD: ${AIERP_PLATFORM_RUNTIME_PASSWORD}
      AIERP_PLATFORM_MIGRATOR_PASSWORD: ${AIERP_PLATFORM_MIGRATOR_PASSWORD:?Set AIERP_PLATFORM_MIGRATOR_PASSWORD}
    depends_on:
      sqlserver: { condition: service_healthy }
    restart: "no"
  platform-api:
    build:
      context: ${SOURCE_ROOT}
      dockerfile: .aierp-deploy/Platform.Api.Dockerfile
      args:
        OCI_IMAGE_REVISION: ${OCI_IMAGE_REVISION:-unknown}
        OCI_IMAGE_VERSION: ${OCI_IMAGE_VERSION:-unknown}
    environment:
      ASPNETCORE_ENVIRONMENT: Staging
      ASPNETCORE_URLS: http://+:8080
      ConnectionStrings__Platform: Server=sqlserver,1433;Database=AIERPPlatform;User Id=aierp_platform_runtime;Password=${AIERP_PLATFORM_RUNTIME_PASSWORD};Encrypt=True;TrustServerCertificate=True
      ConnectionStrings__Tenant: Server=sqlserver,1433;Database=AIERPPlatform;Encrypt=True;TrustServerCertificate=True
      Database__PlatformRuntimeLogin: aierp_platform_runtime
      Database__SeparationEnabled: "true"
      Database__SeparationBackupPath: ${DATABASE_SEPARATION_BACKUP_PATH:-}
      Authentication__SigningKey: ${AUTH_SIGNING_KEY}
      PluginHost__SigningKey: ${PLUGIN_HOST_SIGNING_KEY}
      PluginHost__BaseUrl: http://plugin-host:8080
      PluginHost__Issuer: AIERP
      ModulePackages__RootPath: /module-packages
      Database__ApplyMigrationsOnStartup: "false"
      Bootstrap__Email: ${BOOTSTRAP_EMAIL}
      Bootstrap__Password: ${BOOTSTRAP_PASSWORD}
      Bootstrap__DisplayName: Staging Administrator
      Bootstrap__TenantName: ${BOOTSTRAP_TENANT_NAME}
      StagingBootstrap__Enabled: "true"
      StagingBootstrap__TenantId: ${AIERP_STAGING_TENANT_ID}
      Vault__Address: ${VAULT_ADDRESS:?Set VAULT_ADDRESS}
      Vault__Mount: ${VAULT_MOUNT:-secret}
      Vault__TenantSqlCredentialReader__RoleIdFile: /run/secrets/vault_tenant_sql_reader_role_id
      Vault__TenantSqlCredentialReader__SecretIdFile: /run/secrets/vault_tenant_sql_reader_secret_id
      Vault__AllowHttpForLocalDevelopment: "false"
      SSL_CERT_FILE: /tmp/nexora-ca-bundle.crt
      Frontend__Origins__0: http://localhost:${STAGING_PORT}
      Frontend__Origins__1: http://127.0.0.1:${STAGING_PORT}
    volumes: [module-packages:/module-packages]
    secrets:
      - vault_tenant_sql_reader_role_id
      - vault_tenant_sql_reader_secret_id
      - source: vault_ca_cert
        target: vault-ca.crt
    entrypoint: ["sh", "-c"]
    command: ["cat /etc/ssl/certs/ca-certificates.crt /run/secrets/vault-ca.crt > /tmp/nexora-ca-bundle.crt && exec dotnet AIERP.Api.dll"]
    depends_on:
      platform-migrator: { condition: service_completed_successfully }
      plugin-host: { condition: service_healthy }
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
      - /home/app/.aspnet/DataProtection-Keys:rw,noexec,nosuid,size=16m,uid=1654,gid=1654,mode=0700
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 768m
    cpus: 1.0
    pids_limit: 256
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8080/health || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 15
      start_period: 30s
    restart: unless-stopped
  plugin-host:
    build:
      context: ${SOURCE_ROOT}
      dockerfile: .aierp-deploy/PluginHost.Dockerfile
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      ASPNETCORE_URLS: http://+:8080
      PluginHost__SigningKey: ${PLUGIN_HOST_SIGNING_KEY}
      PluginHost__Issuer: AIERP
      PluginHost__Audience: AIERP.PluginHost
      ModulePackages__RootPath: /module-packages
    volumes: [module-packages:/module-packages:ro]
    read_only: true
    tmpfs: ["/tmp:rw,noexec,nosuid,nodev,size=16m"]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 512m
    cpus: 0.50
    pids_limit: 64
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8080/health || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 15
      start_period: 15s
    restart: unless-stopped
  platform-migrator:
    build:
      context: ${SOURCE_ROOT}
      dockerfile: .aierp-deploy/Platform.Api.Dockerfile
      args:
        OCI_IMAGE_REVISION: ${OCI_IMAGE_REVISION:-unknown}
        OCI_IMAGE_VERSION: ${OCI_IMAGE_VERSION:-unknown}
    command: ["--migrate-platform-only"]
    environment:
      ASPNETCORE_ENVIRONMENT: Staging
      ConnectionStrings__Platform: Server=sqlserver,1433;Database=AIERPPlatform;User Id=aierp_platform_migrator;Password=${AIERP_PLATFORM_MIGRATOR_PASSWORD:?Set AIERP_PLATFORM_MIGRATOR_PASSWORD};Encrypt=True;TrustServerCertificate=True
      Database__SeparationEnabled: "true"
      AIERP_PLATFORM_MIGRATION_TARGET: AIERPPlatform
    depends_on:
      sql-runtime-init: { condition: service_completed_successfully }
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
      - /home/app/.aspnet/DataProtection-Keys:rw,noexec,nosuid,size=16m,uid=1654,gid=1654,mode=0700
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 768m
    cpus: 1.0
    pids_limit: 256
    restart: "no"
  tenant-provisioning-worker:
    build:
      context: ${SOURCE_ROOT}
      dockerfile: .aierp-deploy/TenantProvisioningWorker.Dockerfile
      args:
        OCI_IMAGE_REVISION: ${OCI_IMAGE_REVISION:-unknown}
        OCI_IMAGE_VERSION: ${OCI_IMAGE_VERSION:-unknown}
    environment:
      DOTNET_ENVIRONMENT: Staging
      ConnectionStrings__ProvisioningFile: /run/provisioning-secrets/tenant_provisioning_sql_connection
      Database__SeparationEnabled: "true"
      Database__SeparationBackupPath: ${DATABASE_SEPARATION_BACKUP_PATH:-}
      Vault__Address: ${VAULT_ADDRESS:?Set VAULT_ADDRESS}
      Vault__Mount: ${VAULT_MOUNT:-secret}
      Vault__TenantSqlCredentialReader__RoleIdFile: /run/provisioning-secrets/vault_tenant_sql_reader_role_id
      Vault__TenantSqlCredentialReader__SecretIdFile: /run/provisioning-secrets/vault_tenant_sql_reader_secret_id
      Vault__TenantSqlCredentialWriter__RoleIdFile: /run/provisioning-secrets/vault_tenant_sql_writer_role_id
      Vault__TenantSqlCredentialWriter__SecretIdFile: /run/provisioning-secrets/vault_tenant_sql_writer_secret_id
      Vault__AllowHttpForLocalDevelopment: "false"
      SSL_CERT_FILE: /tmp/nexora-ca-bundle.crt
    volumes:
      - tenant-provisioning-secrets:/run/provisioning-secrets:ro
    depends_on:
      tenant-provisioning-secrets-init: { condition: service_completed_successfully }
      sqlserver: { condition: service_healthy }
      platform-api: { condition: service_healthy }
    read_only: true
    tmpfs: ["/tmp:rw,noexec,nosuid,nodev,size=64m"]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 512m
    cpus: 1.0
    pids_limit: 128
    restart: "on-failure:3"
  tenant-provisioning-secrets-init:
    image: busybox:1.37.0
    command:
      - sh
      - -c
      - >-
        set -eu;
        for name in tenant_provisioning_sql_connection vault_tenant_sql_reader_role_id
        vault_tenant_sql_reader_secret_id vault_tenant_sql_writer_role_id
        vault_tenant_sql_writer_secret_id vault-ca.crt; do
        test -s "/run/secrets/$$name";
        cp "/run/secrets/$$name" "/prepared/$$name";
        chown 1654:1654 "/prepared/$$name";
        chmod 0440 "/prepared/$$name";
        done;
        chown 1654:1654 /prepared;
        chmod 0550 /prepared
    volumes:
      - tenant-provisioning-secrets:/prepared
    secrets:
      - vault_tenant_sql_reader_role_id
      - vault_tenant_sql_reader_secret_id
      - vault_tenant_sql_writer_role_id
      - vault_tenant_sql_writer_secret_id
      - tenant_provisioning_sql_connection
      - source: vault_ca_cert
        target: vault-ca.crt
    network_mode: none
    user: "0:0"
    read_only: true
    cap_drop: [ALL]
    cap_add: [CHOWN, DAC_OVERRIDE, FOWNER]
    security_opt: [no-new-privileges:true]
    pids_limit: 16
    mem_limit: 64m
    restart: "no"
  workspace-runner:
    build:
      context: ${SOURCE_ROOT}
      dockerfile: .aierp-deploy/WorkspaceRunner.Dockerfile
    environment:
      ASPNETCORE_URLS: http://+:8080
      Authentication__SigningKey: ${AUTH_SIGNING_KEY}
      Authentication__Issuer: AIERP
      Authentication__Audience: AIERP.WorkspaceRunner
      Workspace__RootPath: /workspaces
    volumes: [workspace-data:/workspaces, test-jobs:/test-jobs, release-packages:/release-packages]
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
      - /home/app/.aspnet/DataProtection-Keys:rw,noexec,nosuid,size=16m,uid=1654,gid=1654,mode=0700
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 1g
    cpus: 1.5
    pids_limit: 256
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8080/health || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 15
      start_period: 15s
    restart: unless-stopped
  ai-service:
    build:
      context: ${SOURCE_ROOT}
      dockerfile: .aierp-deploy/AIService.Dockerfile
      args:
        OCI_IMAGE_REVISION: ${OCI_IMAGE_REVISION:-unknown}
        OCI_IMAGE_VERSION: ${OCI_IMAGE_VERSION:-unknown}
    environment:
      ASPNETCORE_ENVIRONMENT: Staging
      ASPNETCORE_URLS: http://+:8080
      ConnectionStrings__Platform: Server=sqlserver,1433;Database=AIERPPlatform;User Id=aierp_platform_runtime;Password=${AIERP_PLATFORM_RUNTIME_PASSWORD};Encrypt=True;TrustServerCertificate=True
      ConnectionStrings__AIStudio: Server=sqlserver,1433;Database=AIERPStudio;Encrypt=True;TrustServerCertificate=True
      Database__SeparationEnabled: "true"
      Vault__Address: ${VAULT_ADDRESS:?Set VAULT_ADDRESS}
      Vault__Mount: ${VAULT_MOUNT:-secret}
      Vault__TenantSqlCredentialReader__RoleIdFile: /run/secrets/vault_tenant_sql_reader_role_id
      Vault__TenantSqlCredentialReader__SecretIdFile: /run/secrets/vault_tenant_sql_reader_secret_id
      Vault__AllowHttpForLocalDevelopment: "false"
      Authentication__SigningKey: ${AUTH_SIGNING_KEY}
      Authentication__Issuer: AIERP
      Authentication__Audience: AIERP
      Frontend__Origins__0: http://localhost:${STAGING_PORT}
      Frontend__Origins__1: http://127.0.0.1:${STAGING_PORT}
      WorkspaceRunner__BaseUrl: http://workspace-runner:8080
      SSL_CERT_FILE: /tmp/nexora-ca-bundle.crt
    secrets:
      - vault_tenant_sql_reader_role_id
      - vault_tenant_sql_reader_secret_id
      - source: vault_ca_cert
        target: vault-ca.crt
    entrypoint: ["sh", "-c"]
    command: ["cat /etc/ssl/certs/ca-certificates.crt /run/secrets/vault-ca.crt > /tmp/nexora-ca-bundle.crt && exec dotnet AIERP.AIService.dll"]
    depends_on:
      sqlserver: { condition: service_healthy }
      sql-runtime-init: { condition: service_completed_successfully }
      workspace-runner: { condition: service_healthy }
      platform-api: { condition: service_healthy }
    read_only: true
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=64m
      - /home/app/.aspnet/DataProtection-Keys:rw,noexec,nosuid,size=16m,uid=1654,gid=1654,mode=0700
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    mem_limit: 768m
    cpus: 1.0
    pids_limit: 256
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://127.0.0.1:8080/health || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 15
      start_period: 30s
    restart: unless-stopped
  development-studio:
    build:
      context: ${SOURCE_ROOT}
      dockerfile: .aierp-deploy/DevelopmentStudio.Dockerfile
      args:
        OCI_IMAGE_REVISION: ${OCI_IMAGE_REVISION:-unknown}
        OCI_IMAGE_VERSION: ${OCI_IMAGE_VERSION:-unknown}
    ports: ["127.0.0.1:${STAGING_PORT}:80"]
    mem_limit: 128m
    cpus: 0.5
    pids_limit: 128
    depends_on:
      platform-api: { condition: service_healthy }
      ai-service: { condition: service_healthy }
    restart: unless-stopped
  workspace-sandbox:
    build:
      context: ${SOURCE_ROOT}
      dockerfile: .aierp-deploy/WorkspaceSandbox.Dockerfile
    environment:
      WorkspaceSandbox__JobRoot: /test-jobs
      WorkspaceSandbox__TempRoot: /tmp/test-jobs
    depends_on: [workspace-runner]
    network_mode: none
    read_only: true
    tmpfs: ["/tmp/test-jobs:rw,exec,nosuid,nodev,size=2g"]
    cap_drop: [ALL]
    cap_add: [DAC_OVERRIDE, KILL, CHOWN, SETPCAP, SETUID, SETGID]
    security_opt: [no-new-privileges:true]
    pids_limit: 256
    mem_limit: 2g
    cpus: 2.0
    volumes: [test-jobs:/test-jobs]
    restart: unless-stopped
volumes:
  sql-data:
  sql-backups:
  tenant-provisioning-secrets:
  workspace-data:
  test-jobs:
  release-packages:
  module-packages:
    external: true
    name: aierp-module-packages
secrets:
  vault_tenant_sql_reader_role_id:
    file: ${VAULT_TENANT_SQL_READER_ROLE_ID_FILE:?Set VAULT_TENANT_SQL_READER_ROLE_ID_FILE}
  vault_tenant_sql_reader_secret_id:
    file: ${VAULT_TENANT_SQL_READER_SECRET_ID_FILE:?Set VAULT_TENANT_SQL_READER_SECRET_ID_FILE}
  vault_tenant_sql_writer_role_id:
    file: ${VAULT_TENANT_SQL_WRITER_ROLE_ID_FILE:?Set VAULT_TENANT_SQL_WRITER_ROLE_ID_FILE}
  vault_tenant_sql_writer_secret_id:
    file: ${VAULT_TENANT_SQL_WRITER_SECRET_ID_FILE:?Set VAULT_TENANT_SQL_WRITER_SECRET_ID_FILE}
  vault_ca_cert:
    file: ${VAULT_CA_CERT_FILE:?Set VAULT_CA_CERT_FILE}
  tenant_provisioning_sql_connection:
    file: ${TENANT_PROVISIONER_SQL_CONNECTION_FILE:?Set TENANT_PROVISIONER_SQL_CONNECTION_FILE}
networks:
  default:
    internal: true
""";


}
