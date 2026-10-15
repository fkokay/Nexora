FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet restore AIERP.slnx
RUN dotnet publish src/AI/AIERP.WorkspaceSandbox/AIERP.WorkspaceSandbox.csproj -c Release --no-restore -o /app/publish

FROM mcr.microsoft.com/dotnet/sdk:10.0
RUN apt-get update && apt-get install -y --no-install-recommends util-linux ca-certificates nodejs python3 python3-pytest golang-go rustc cargo && rm -rf /var/lib/apt/lists/* && \
    mkdir -p /test-jobs /tmp/test-jobs /opt/nuget-feed && chmod 0750 /test-jobs && \
    dotnet --list-sdks >/dev/null
COPY --from=build /root/.nuget/packages /opt/nuget-feed
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "AIERP.WorkspaceSandbox.dll"]
