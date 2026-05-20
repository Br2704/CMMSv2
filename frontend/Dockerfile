FROM node:22-alpine AS build
WORKDIR /app/frontend
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY frontend/package*.json ./
RUN npm install --loglevel=error
COPY frontend/ ./
COPY scripts/ /app/scripts/
RUN npm run build

FROM nginx:1-alpine-slim
RUN apk upgrade --no-cache
COPY frontend/nginx.prod.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
