FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src
ENV NUGET_PACKAGES=/tmp/aierp-nuget-packages
COPY . .
RUN dotnet restore AIERP.slnx && \
    rm -rf /tmp/aierp-nuget-packages/system.security.cryptography.pkcs/9.0.11 \
           /tmp/aierp-nuget-packages/system.security.cryptography.pkcs/10.0.12
RUN dotnet publish src/AI/AIERP.WorkspaceSandbox/AIERP.WorkspaceSandbox.csproj -c Release --no-restore -o /app/publish

FROM golang:1.26.9-alpine AS go-toolchain
RUN grep -q '^package unsafe$' /usr/local/go/src/unsafe/unsafe.go && \
    grep -q '^package runtime_test$' /usr/local/go/src/runtime/abi_test.go && \
    printf 'verified\n' > /usr/local/go/.aierp-toolchain-verified

FROM alpine:3.24 AS binutils-package
RUN apk add --no-cache alpine-sdk zlib-dev zstd-dev jansson-dev && \
    adduser -D builder && \
    mkdir -p /home/builder/binutils /var/cache/distfiles && \
    chown -R builder:builder /home/builder /var/cache/distfiles
WORKDIR /home/builder/binutils
COPY --chown=builder:builder deploy/docker/sandbox-overrides/binutils/APKBUILD ./APKBUILD
USER builder
RUN abuild-keygen -a -n
USER root
RUN cp /home/builder/.abuild/*.rsa.pub /etc/apk/keys/ && \
    chown -R builder:builder /home/builder /var/cache/distfiles
USER builder
RUN PACKAGER='Nexora Build <build@nexora.invalid>' abuild -F

FROM alpine:3.24 AS patch-package
RUN apk add --no-cache alpine-sdk diffutils ed && \
    adduser -D builder && \
    mkdir -p /home/builder/patch /var/cache/distfiles && \
    chown -R builder:builder /home/builder /var/cache/distfiles
WORKDIR /home/builder/patch
COPY --chown=builder:builder deploy/docker/sandbox-overrides/patch/APKBUILD ./APKBUILD
COPY --chown=builder:builder deploy/docker/sandbox-overrides/patch/CVE-2026-56288.patch deploy/docker/sandbox-overrides/patch/CVE-2026-56289.patch /var/cache/distfiles/
COPY --chown=builder:builder deploy/docker/sandbox-overrides/patch/CVE-2026-56288.patch deploy/docker/sandbox-overrides/patch/CVE-2026-56289.patch ./
USER builder
RUN abuild-keygen -a -n
USER root
RUN cp /home/builder/.abuild/*.rsa.pub /etc/apk/keys/ && \
    chown -R builder:builder /home/builder /var/cache/distfiles
USER builder
RUN PACKAGER='Nexora Build <build@nexora.invalid>' abuild -F

FROM alpine:3.24 AS libxml2-package
RUN apk add --no-cache alpine-sdk python3-dev zlib-dev xz-dev perl tar && \
    adduser -D builder && \
    mkdir -p /home/builder/libxml2 /var/cache/distfiles && \
    chown -R builder:builder /home/builder /var/cache/distfiles
WORKDIR /home/builder/libxml2
COPY --chown=builder:builder deploy/docker/sandbox-overrides/libxml2/APKBUILD ./APKBUILD
USER builder
RUN abuild-keygen -a -n
USER root
RUN cp /home/builder/.abuild/*.rsa.pub /etc/apk/keys/ && \
    chown -R builder:builder /home/builder /var/cache/distfiles
USER builder
RUN PACKAGER='Nexora Build <build@nexora.invalid>' abuild -F

FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine
# Alpine 3.24 does not yet provide the CVE-fixed libcurl package; update only libcurl from edge.
# Alpine edge carries upstream security patches for Cargo's dynamically linked libssh2.
COPY deploy/pip-patches/requirements.txt /tmp/pip-patches-requirements.txt
COPY deploy/pip-patches/update-vendored-sbom.py /tmp/update-pip-vendored-sbom.py
RUN apk upgrade --no-cache && apk add --no-cache util-linux ca-certificates nodejs npm python3 py3-pip py3-pytest rust cargo build-base && \
    rm -rf /usr/share/powershell /usr/bin/pwsh && \
    mkdir -p /test-jobs /tmp/test-jobs /opt/nuget-feed && chown app:app /test-jobs /tmp/test-jobs && chmod 0750 /test-jobs /tmp/test-jobs && \
    npm install --global npm@12.2.0 --ignore-scripts --no-audit --no-fund --loglevel=error && \
    test "$(/usr/local/bin/npm --version)" = "12.2.0" && \
    rm -rf /usr/lib/node_modules/npm && \
    apk del curl && \
    apk upgrade --no-cache --repository https://dl-cdn.alpinelinux.org/alpine/edge/main libcurl && \
    apk upgrade --no-cache --repository https://dl-cdn.alpinelinux.org/alpine/edge/main libssh2 && \
    python3 -m pip install --no-cache-dir --break-system-packages --upgrade --require-hashes -r /tmp/pip-patches-requirements.txt && \
    python3 -m pip install --no-cache-dir --break-system-packages --target /tmp/pip-vendor-patches --no-deps --require-hashes -r /tmp/pip-patches-requirements.txt --no-compile && \
    rm -rf /usr/lib/python3.14/site-packages/pip/_vendor/urllib3 /usr/lib/python3.14/site-packages/pip/_vendor/msgpack && \
    cp -R /tmp/pip-vendor-patches/urllib3 /usr/lib/python3.14/site-packages/pip/_vendor/urllib3 && \
    cp -R /tmp/pip-vendor-patches/msgpack /usr/lib/python3.14/site-packages/pip/_vendor/msgpack && \
    sed -i 's/^msgpack==1\.1\.2$/msgpack==1.2.1/; s/urllib3==2\.7\.0/urllib3==2.8.0/g' /usr/lib/python3.14/site-packages/pip/_vendor/vendor.txt && \
    python3 /tmp/update-pip-vendored-sbom.py /usr/lib/python3.14/site-packages/pip/_vendor/bom.cdx.json && \
    python3 -c 'import pip; from pip._vendor import msgpack, urllib3; assert pip.__version__ == "26.2.1"; assert msgpack.__version__ == "1.2.1"; assert urllib3.__version__ == "2.8.0"' && \
    rm -rf /tmp/pip-vendor-patches /tmp/pip-patches-requirements.txt /tmp/update-pip-vendored-sbom.py && \
    dotnet --list-sdks >/dev/null
COPY --from=binutils-package /home/builder/packages/builder/x86_64/binutils-2.47-r0.apk /tmp/binutils-2.47-r0.apk
COPY --from=binutils-package /home/builder/.abuild/*.rsa.pub /etc/apk/keys/
RUN apk add --no-cache /tmp/binutils-2.47-r0.apk && \
    test "$(apk list --installed binutils | sed -n '1s/.*binutils-\([^ ]*\).*/\1/p')" = '2.47-r0' && \
    test "$(realpath "$(gcc -print-prog-name=ld)")" = /usr/x86_64-alpine-linux-musl/bin/ld && \
    /usr/x86_64-alpine-linux-musl/bin/ld --version | grep -F 'GNU ld (GNU Binutils) 2.47' && \
    /usr/bin/readelf --version | grep -F 'GNU readelf (GNU Binutils) 2.47' && \
    printf 'int main(void) { return 0; }\n' | gcc -x c -o /tmp/aierp-ld-smoke - && \
    /tmp/aierp-ld-smoke && rm -f /tmp/aierp-ld-smoke /tmp/binutils-2.47-r0.apk && \
    rustc --version
COPY --from=libxml2-package /home/builder/packages/builder/x86_64/libxml2-2.13.9-r3.apk /tmp/libxml2-2.13.9-r3.apk
COPY --from=libxml2-package /home/builder/.abuild/*.rsa.pub /etc/apk/keys/
RUN apk add --no-cache /tmp/libxml2-2.13.9-r3.apk && \
    test "$(apk list --installed libxml2 | sed -n '1s/.*libxml2-\([^ ]*\).*/\1/p')" = '2.13.9-r3' && \
    /usr/bin/readelf -d /usr/lib/libxml2.so.2 | grep -F '[libxml2.so.2]' && \
    apk info --who-owns /usr/lib/libxml2.so.2 | grep -F 'libxml2-2.13.9-r3' && \
    ldd /usr/bin/rustc | grep -F 'libxml2.so.2' && \
    rustc --version && rm -f /tmp/libxml2-2.13.9-r3.apk
COPY --from=patch-package /home/builder/packages/builder/x86_64/patch-2.8-r1.apk /tmp/patch-2.8-r1.apk
COPY --from=patch-package /home/builder/.abuild/*.rsa.pub /etc/apk/keys/
RUN apk add --no-cache /tmp/patch-2.8-r1.apk && \
    apk list --installed patch | grep -F 'patch-2.8-r1' && \
    patch --version | grep -F 'GNU patch 2.8' && \
    rm -f /tmp/patch-2.8-r1.apk
COPY deploy/npm-patches /tmp/npm-patches
RUN npm ci --prefix /tmp/npm-patches --ignore-scripts --no-audit --no-fund && \
    cp -R /tmp/npm-patches/node_modules/brace-expansion /usr/local/lib/node_modules/npm/node_modules/ && \
    cp -R /tmp/npm-patches/node_modules/http-cache-semantics /usr/local/lib/node_modules/npm/node_modules/ && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/ip-address && cp -R /tmp/npm-patches/node_modules/ip-address /usr/local/lib/node_modules/npm/node_modules/ && \
    rm -rf /usr/local/lib/node_modules/npm/node_modules/postcss-selector-parser && cp -R /tmp/npm-patches/node_modules/postcss-selector-parser /usr/local/lib/node_modules/npm/node_modules/ && \
    cp -R /tmp/npm-patches/node_modules/undici /usr/local/lib/node_modules/npm/node_modules/ && \
    rm -rf /tmp/npm-patches && \
    /usr/local/bin/npm ls --global --all brace-expansion undici http-cache-semantics ip-address postcss-selector-parser
COPY --from=go-toolchain /usr/local/go /usr/local/go
RUN grep -q '^package unsafe$' /usr/local/go/src/unsafe/unsafe.go && \
    grep -q '^package runtime_test$' /usr/local/go/src/runtime/abi_test.go && \
    /usr/local/go/bin/go version >/dev/null
ENV PATH="/usr/local/bin:/usr/local/go/bin:${PATH}"
COPY --from=build /tmp/aierp-nuget-packages /opt/nuget-feed
WORKDIR /app
COPY --from=build /app/publish .
USER 1654:1654
ENTRYPOINT ["dotnet", "AIERP.WorkspaceSandbox.dll"]
