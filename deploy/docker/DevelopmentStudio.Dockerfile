FROM node:22-alpine AS build
WORKDIR /workspace
COPY frontend/development-studio/package.json frontend/development-studio/package-lock.json ./frontend/development-studio/
WORKDIR /workspace/frontend/development-studio
RUN npm ci
WORKDIR /workspace
COPY frontend/development-studio ./frontend/development-studio
RUN npm --prefix frontend/development-studio run build

FROM nginx:1.27-alpine
COPY deploy/docker/development-studio.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/frontend/development-studio/dist /usr/share/nginx/html
EXPOSE 80
