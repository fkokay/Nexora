FROM mcr.microsoft.com/dotnet/sdk:10.0
WORKDIR /app
COPY tests/IntegrationTests/bin/Release/net10.0/ ./
COPY deploy/sql/Install-TenantProvisioningBoundary.sql /app/Install-TenantProvisioningBoundary.sql
ENTRYPOINT ["dotnet", "vstest", "/app/AIERP.Api.IntegrationTests.dll", "--TestCaseFilter:FullyQualifiedName~AIERP.Api.IntegrationTests.TenantSqlVaultIsolationAcceptanceTests|FullyQualifiedName~AIERP.Api.IntegrationTests.TenantProvisioningSqlBoundaryAcceptanceTests", "--logger:console;verbosity=normal"]
