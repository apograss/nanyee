FROM node:22-alpine AS build

ARG VITE_AMAP_KEY
ARG VITE_AMAP_SECURITY_CODE
ENV VITE_AMAP_KEY=${VITE_AMAP_KEY} \
    VITE_AMAP_SECURITY_CODE=${VITE_AMAP_SECURITY_CODE}

WORKDIR /app
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM nginx:1.28-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY infra/nginx/nanyee.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
