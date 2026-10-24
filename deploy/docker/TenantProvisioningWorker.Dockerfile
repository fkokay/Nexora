FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/Hosts/AIERP.TenantProvisioningWorker/AIERP.TenantProvisioningWorker.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/runtime:10.0
WORKDIR /app
COPY --from=build /app/publish .
USER 1654:1654
ENTRYPOINT ["dotnet", "AIERP.TenantProvisioningWorker.dll"]
