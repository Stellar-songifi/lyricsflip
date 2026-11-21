# syntax=docker/dockerfile:1

# ---- deps: install all node dependencies ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ---- build: compile the Next.js app ----
# NEXT_PUBLIC_* variables are baked into the bundle at build time.
# The ARGs below receive their values from the Compose `build.args` stanza.
# Contract IDs are intentionally left empty here — SKIP_CONTRACT_ID_CHECK
# bypasses the production guard in next.config.js so the image can be built
# before contracts are deployed; the real IDs are sourced from the shared
# volume at run time by docker-entrypoint.sh.
FROM node:20-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID=""
ARG NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID=""
ARG NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID=""
ARG NEXT_PUBLIC_STELLAR_RPC_URL="http://localhost:8000/soroban/rpc"
ARG NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE="Standalone Network ; February 2017"
ARG NEXT_PUBLIC_STELLAR_HORIZON_URL="http://localhost:8000"
ARG NEXT_PUBLIC_API_URL="http://localhost:4000"
ARG NEXT_PUBLIC_WS_URL="http://localhost:4000"
ARG NEXT_PUBLIC_WAGER_ASSET_CODE="XLM"

ENV NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID=$NEXT_PUBLIC_LYRICSFLIP_CONTRACT_ID
ENV NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID=$NEXT_PUBLIC_LYRICSFLIP_NFT_CONTRACT_ID
ENV NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID=$NEXT_PUBLIC_LYRICSFLIP_ESCROW_CONTRACT_ID
ENV NEXT_PUBLIC_STELLAR_RPC_URL=$NEXT_PUBLIC_STELLAR_RPC_URL
ENV NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE=$NEXT_PUBLIC_STELLAR_NETWORK_PASSPHRASE
ENV NEXT_PUBLIC_STELLAR_HORIZON_URL=$NEXT_PUBLIC_STELLAR_HORIZON_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_WAGER_ASSET_CODE=$NEXT_PUBLIC_WAGER_ASSET_CODE
# Allow the production next build to succeed without contract IDs.
# The real IDs are injected via the shared volume at run time.
ENV SKIP_CONTRACT_ID_CHECK=true

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next.config.js does require('../deployments/testnet.json') which resolves
# one level above the Dockerfile context (./frontend). Create a stub at the
# path the module resolution expects so the build does not fail.
RUN mkdir -p ../deployments \
 && echo '{"lyricsflip":"","lyricsflipNft":"","lyricsflipEscrow":""}' \
      > ../deployments/testnet.json
RUN npm run build

# ---- runtime: standalone output with non-root user ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Contracts env file written by contracts-init into the shared volume.
# Sourced by docker-entrypoint.sh before the Node server starts.
ENV CONTRACTS_ENV_FILE=/run/contracts/.env

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy standalone output produced by `output: 'standalone'` in next.config.js.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static     ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public           ./public

COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"
ENTRYPOINT ["/bin/sh", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server.js"]
