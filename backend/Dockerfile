FROM node:22-alpine3.22 AS build
WORKDIR /app
RUN apk upgrade --no-cache
COPY package*.json ./
RUN npm ci --include=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine3.22
WORKDIR /app
RUN apk upgrade --no-cache
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 3001
USER node
CMD ["node", "dist/server.js"]
