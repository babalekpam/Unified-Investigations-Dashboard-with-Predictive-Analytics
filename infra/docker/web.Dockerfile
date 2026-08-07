# Dashboard SPA, served by nginx.

FROM node:22-alpine AS build
WORKDIR /build
COPY web/package*.json ./
RUN npm ci
COPY web .
ARG VITE_API_BASE_URL=http://localhost:8080
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /build/dist /usr/share/nginx/html
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
