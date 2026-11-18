FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# --- Shared .NET build prefix: keep byte-identical in every .NET service Dockerfile
# (ApplicationServiceImpactTests checks this). BuildKit then restores and compiles the
# shared libraries once per commit for all services, and reuses them across commits
# while their sources are unchanged. Only project files are copied before restore.
COPY src/Platform/AIERP.Platform.Domain/AIERP.Platform.Domain.csproj src/Platform/AIERP.Platform.Domain/
COPY src/Platform/AIERP.Platform.Application/AIERP.Platform.Application.csproj src/Platform/AIERP.Platform.Application/
COPY src/Platform/AIERP.Platform.Infrastructure/AIERP.Platform.Infrastructure.csproj src/Platform/AIERP.Platform.Infrastructure/
COPY src/Observability/AIERP.Observability/AIERP.Observability.csproj src/Observability/AIERP.Observability/
COPY src/Extensions/AIERP.ModuleSDK/AIERP.ModuleSDK.csproj src/Extensions/AIERP.ModuleSDK/
COPY src/Extensions/AIERP.IntegrationSDK/AIERP.IntegrationSDK.csproj src/Extensions/AIERP.IntegrationSDK/
COPY src/Hosts/AIERP.Api/AIERP.Api.csproj src/Hosts/AIERP.Api/
COPY src/AI/AIERP.AIService/AIERP.AIService.csproj src/AI/AIERP.AIService/
COPY src/Extensions/AIERP.PluginHost/AIERP.PluginHost.csproj src/Extensions/AIERP.PluginHost/
COPY src/Extensions/AIERP.IntegrationHost/AIERP.IntegrationHost.csproj src/Extensions/AIERP.IntegrationHost/
COPY src/Hosts/AIERP.TenantProvisioningWorker/AIERP.TenantProvisioningWorker.csproj src/Hosts/AIERP.TenantProvisioningWorker/
COPY src/AI/AIERP.WorkspaceRunner/AIERP.WorkspaceRunner.csproj src/AI/AIERP.WorkspaceRunner/
RUN for project in src/Hosts/AIERP.Api/AIERP.Api.csproj src/AI/AIERP.AIService/AIERP.AIService.csproj src/Extensions/AIERP.PluginHost/AIERP.PluginHost.csproj src/Extensions/AIERP.IntegrationHost/AIERP.IntegrationHost.csproj src/Hosts/AIERP.TenantProvisioningWorker/AIERP.TenantProvisioningWorker.csproj src/AI/AIERP.WorkspaceRunner/AIERP.WorkspaceRunner.csproj; do dotnet restore "$project" || exit 1; done
COPY src/Platform/ src/Platform/
COPY src/Observability/ src/Observability/
COPY src/Extensions/AIERP.ModuleSDK/ src/Extensions/AIERP.ModuleSDK/
COPY src/Extensions/AIERP.IntegrationSDK/ src/Extensions/AIERP.IntegrationSDK/
RUN for project in src/Platform/AIERP.Platform.Domain/AIERP.Platform.Domain.csproj src/Platform/AIERP.Platform.Application/AIERP.Platform.Application.csproj src/Platform/AIERP.Platform.Infrastructure/AIERP.Platform.Infrastructure.csproj src/Observability/AIERP.Observability/AIERP.Observability.csproj src/Extensions/AIERP.ModuleSDK/AIERP.ModuleSDK.csproj src/Extensions/AIERP.IntegrationSDK/AIERP.IntegrationSDK.csproj; do dotnet build "$project" -c Release --no-restore || exit 1; done
# --- End of shared .NET build prefix
COPY . .
# Shared libraries are already compiled from identical sources above.
RUN dotnet publish src/Hosts/AIERP.Api/AIERP.Api.csproj -c Release --no-restore -p:BuildProjectReferences=false -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
ARG OCI_IMAGE_REVISION=unknown
ARG OCI_IMAGE_VERSION=unknown
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .
LABEL org.opencontainers.image.source="https://github.com/fkokay/Nexora" \
      org.opencontainers.image.revision="${OCI_IMAGE_REVISION}" \
      org.opencontainers.image.version="${OCI_IMAGE_VERSION}"
EXPOSE 8080
ENTRYPOINT ["dotnet", "AIERP.Api.dll"]
