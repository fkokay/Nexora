FROM docker:29.9.1-cli AS docker
FROM golang:1.26.9-alpine AS compose-build
ARG COMPOSE_VERSION=v5.6.0
ARG COMPOSE_COMMIT=42f48072bbf92ee9b0e43f9fdf2008d03546e7ca
RUN apk add --no-cache git make
WORKDIR /src
RUN git clone --depth 1 --branch ${COMPOSE_VERSION} https://github.com/docker/compose.git . && \
    test "$(git rev-parse HEAD)" = "${COMPOSE_COMMIT}" && \
    go mod edit -go=1.26.9 -require=golang.org/x/net@v0.60.0 && go mod tidy && \
    make

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY . .
RUN dotnet publish src/AI/AIERP.ReleaseDeployer/AIERP.ReleaseDeployer.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
RUN apk upgrade --no-cache
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=compose-build /src/bin/build/docker-compose /usr/local/libexec/docker/cli-plugins/docker-compose
WORKDIR /app
COPY --from=build /app/publish .
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "AIERP.ReleaseDeployer.dll"]
