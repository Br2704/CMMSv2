FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
COPY frontend/package*.json ./frontend/
WORKDIR /app/frontend
RUN npm ci
WORKDIR /app
COPY frontend ./frontend
COPY scripts ./scripts
WORKDIR /app/frontend
RUN npm run build

FROM nginx:1.27-alpine
COPY frontend/nginx.prod.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
