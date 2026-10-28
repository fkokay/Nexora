FROM node:22-alpine AS build
WORKDIR /workspace
COPY frontend/development-studio/package.json frontend/development-studio/package-lock.json ./frontend/development-studio/
WORKDIR /workspace/frontend/development-studio
RUN npm ci
WORKDIR /workspace
COPY frontend/development-studio ./frontend/development-studio
RUN npm --prefix frontend/development-studio run build

FROM nginx:1.30-alpine3.24-slim
ARG OCI_IMAGE_REVISION=unknown
ARG OCI_IMAGE_VERSION=unknown
RUN apk upgrade --no-cache
COPY deploy/docker/development-studio.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/development-studio/dist /usr/share/nginx/html
LABEL org.opencontainers.image.source="https://github.com/fkokay/Nexora" \
      org.opencontainers.image.revision="${OCI_IMAGE_REVISION}" \
      org.opencontainers.image.version="${OCI_IMAGE_VERSION}"
EXPOSE 80
