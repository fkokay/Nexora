FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src
ENV NUGET_PACKAGES=/tmp/aierp-nuget-packages
COPY . .
RUN dotnet restore AIERP.slnx && \
    rm -rf /tmp/aierp-nuget-packages/system.security.cryptography.pkcs/9.0.11
RUN dotnet publish src/AI/AIERP.WorkspaceSandbox/AIERP.WorkspaceSandbox.csproj -c Release --no-restore -o /app/publish

FROM golang:1.26.9-alpine AS go-toolchain
RUN grep -q '^package unsafe$' /usr/local/go/src/unsafe/unsafe.go && \
    grep -q '^package runtime_test$' /usr/local/go/src/runtime/abi_test.go && \
    printf 'verified\n' > /usr/local/go/.aierp-toolchain-verified

FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine
# Alpine 3.24 does not yet provide the CVE-fixed libcurl package; update only libcurl from edge.
RUN apk upgrade --no-cache && apk add --no-cache util-linux ca-certificates nodejs npm python3 py3-pip py3-pytest rust cargo build-base && \
    rm -rf /usr/share/powershell /usr/bin/pwsh && \
    mkdir -p /test-jobs /tmp/test-jobs /opt/nuget-feed && chmod 0750 /test-jobs && \
    npm install --global npm@12.2.0 --ignore-scripts --no-audit --no-fund --loglevel=error && \
    test "$(/usr/local/bin/npm --version)" = "12.2.0" && \
    rm -rf /usr/lib/node_modules/npm && \
    apk del curl && \
    apk upgrade --no-cache --repository https://dl-cdn.alpinelinux.org/alpine/edge/main libcurl && \
    dotnet --list-sdks >/dev/null
COPY deploy/npm-patches /tmp/npm-patches
RUN npm ci --prefix /tmp/npm-patches --ignore-scripts --no-audit --no-fund && \
    cp -R /tmp/npm-patches/node_modules/brace-expansion /usr/local/lib/node_modules/npm/node_modules/ && \
    cp -R /tmp/npm-patches/node_modules/http-cache-semantics /usr/local/lib/node_modules/npm/node_modules/ && \
    cp -R /tmp/npm-patches/node_modules/undici /usr/local/lib/node_modules/npm/node_modules/ && \
    rm -rf /tmp/npm-patches && \
    /usr/local/bin/npm ls --global --all brace-expansion undici http-cache-semantics
COPY --from=go-toolchain /usr/local/go /usr/local/go
RUN grep -q '^package unsafe$' /usr/local/go/src/unsafe/unsafe.go && \
    grep -q '^package runtime_test$' /usr/local/go/src/runtime/abi_test.go && \
    /usr/local/go/bin/go version >/dev/null
ENV PATH="/usr/local/bin:/usr/local/go/bin:${PATH}"
COPY --from=build /tmp/aierp-nuget-packages /opt/nuget-feed
WORKDIR /app
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "AIERP.WorkspaceSandbox.dll"]
