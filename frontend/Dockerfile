# -------------------------------------------------------------
# Stage 1: Build React/Vite SPA Application
# -------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# Copy package specifications
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build production bundle
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Serve with lightweight Nginx
# -------------------------------------------------------------
FROM nginx:1.25-alpine

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build artifacts from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Run as the non-root "nginx" user already built into the image instead of
# root (the default). Binding port 80 requires root, so nginx.conf listens on
# 8080 instead — docker-compose/Kubernetes map the container's 8080 to the
# usual external port 80, so nothing changes for anyone hitting the site.
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx && \
    sed -i 's,/var/run/nginx.pid,/tmp/nginx.pid,' /etc/nginx/nginx.conf && \
    touch /tmp/nginx.pid && chown nginx:nginx /tmp/nginx.pid
USER nginx

# Expose HTTP port (unprivileged — see nginx.conf)
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
