# -------------------------------------------------------------
# Dockerfile for ApexPOS Backend API (Node.js 20 LTS)
# -------------------------------------------------------------
FROM node:20-alpine AS base

WORKDIR /app

# Install build dependencies if needed
RUN apk add --no-cache curl

# Copy package manifests first for caching layers
COPY package*.json ./

# Install dependencies (production-first)
RUN npm ci --only=production

# Copy source code
COPY . .

# Run as the non-root "node" user built into the official image instead of
# root (the default) — a container compromise no longer means a root
# compromise. Port 5000 is unprivileged so no capability grant is needed.
RUN chown -R node:node /app
USER node

# Expose backend port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:5000/api/health || exit 1

# Run server
CMD ["node", "server.js"]
