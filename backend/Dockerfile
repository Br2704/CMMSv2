FROM node:22-alpine3.22 AS build
WORKDIR /app
RUN apk upgrade --no-cache
COPY package*.json ./
RUN npm install --include=dev --loglevel=error
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine3.22
WORKDIR /app
RUN apk upgrade --no-cache
ENV NODE_ENV=production
COPY package*.json ./
RUN npm install --omit=dev --loglevel=error
COPY --from=build /app/dist ./dist
EXPOSE 3001
USER node
CMD ["node", "dist/server.js"]
