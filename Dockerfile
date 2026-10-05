# Multi-stage build
# Stage 1: Build the frontend bundle
FROM node:22-alpine AS builder

WORKDIR /app

# Copy manifests first — install layer caches unless deps change
COPY package.json package-lock.json ./
RUN npm ci

# Build the production bundle into dist/
COPY . .
RUN npm run build

# Stage 2: Serve — the static bundle plus the zero-dep file server
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY server.mjs ./

# Railway assigns PORT
EXPOSE 8080
CMD ["node", "server.mjs"]
