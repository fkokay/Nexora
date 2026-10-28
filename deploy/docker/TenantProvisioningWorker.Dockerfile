FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/Hosts/AIERP.TenantProvisioningWorker/AIERP.TenantProvisioningWorker.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
ARG OCI_IMAGE_REVISION=unknown
ARG OCI_IMAGE_VERSION=unknown
WORKDIR /app
COPY --from=build /app/publish .
COPY deploy/docker/tenant-provisioning-worker-entrypoint.sh /usr/local/bin/tenant-provisioning-worker-entrypoint
RUN chmod 0555 /usr/local/bin/tenant-provisioning-worker-entrypoint
LABEL org.opencontainers.image.source="https://github.com/fkokay/Nexora" \
      org.opencontainers.image.revision="${OCI_IMAGE_REVISION}" \
      org.opencontainers.image.version="${OCI_IMAGE_VERSION}"
USER 1654:1654
ENTRYPOINT ["/usr/local/bin/tenant-provisioning-worker-entrypoint"]
