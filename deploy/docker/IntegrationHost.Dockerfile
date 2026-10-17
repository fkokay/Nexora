FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/Extensions/AIERP.IntegrationHost/AIERP.IntegrationHost.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/publish .
USER 1654:1654
EXPOSE 8080
ENTRYPOINT ["dotnet", "AIERP.IntegrationHost.dll"]
