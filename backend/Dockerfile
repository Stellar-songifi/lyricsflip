# syntax=docker/dockerfile:1

# ---- deps: install all dependencies (including dev) for the build ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The Nest 10 / websockets 11 peer mismatch predates this image; see package.json.
RUN npm ci --legacy-peer-deps

# ---- build: compile TypeScript to dist/ ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- prod-deps: install only production dependencies ----
FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# ---- runtime: only production deps and compiled output ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
# Contracts env file written by the contracts-init service into the shared
# volume. Sourced by the entrypoint before the Node process starts.
ENV CONTRACTS_ENV_FILE=/run/contracts/.env
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/dist ./dist
# Entrypoint: source contract IDs from the shared volume (if present), then
# exec the original command so PID 1 stays the Node process.
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["/bin/sh", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]