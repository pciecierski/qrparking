FROM node:20-bookworm-slim AS client-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
COPY --from=client-builder /app/client/dist ./client/dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
