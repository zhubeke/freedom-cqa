FROM node:22.14.0-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL=/api
ARG VITE_ROUTER_BASE=/
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_ROUTER_BASE=$VITE_ROUTER_BASE
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27.4-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
