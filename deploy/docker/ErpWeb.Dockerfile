FROM node:22-alpine AS build
WORKDIR /workspace/frontend/erp-web
COPY frontend/erp-web/package.json frontend/erp-web/package-lock.json ./
RUN npm ci
COPY frontend/erp-web/ ./
ARG VITE_STUDIO_URL=http://localhost:5174/
ENV VITE_STUDIO_URL=${VITE_STUDIO_URL}
RUN npm run build

FROM nginx:1.30-alpine3.24-slim
RUN apk upgrade --no-cache
COPY deploy/docker/erp-web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/erp-web/dist /usr/share/nginx/html
EXPOSE 80
