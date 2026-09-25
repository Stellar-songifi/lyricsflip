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
RUN npm run build && npm prune --omit=dev --legacy-peer-deps

# ---- runtime: only production deps and compiled output ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/main"]
