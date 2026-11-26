# syntax=docker/dockerfile:1
# contracts-init — builds the Soroban WASM contracts, deploys them to the
# local Stellar quickstart node, seeds the card catalogue, and writes all
# contract IDs to a shared volume so the backend and frontend can consume
# them without re-deploying on every restart.
#
# This image intentionally runs as root during the one-shot init phase because
# it needs to write to the shared volume and to ~/.config/stellar (CLI home).
# It exits with code 0 on success; Docker Compose treats it as a completed
# one-shot service (restart: "no").

# ---- builder: compile Rust contracts to WASM ----
FROM rust:1.82-slim AS builder

# Install build essentials (linker, etc.) and jq for the seed step.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      jq \
    && rm -rf /var/lib/apt/lists/*

# Install the wasm32v1-none target used by the Soroban release profile.
RUN rustup target add wasm32v1-none

WORKDIR /onchain
# Copy the whole onchain workspace so cargo can resolve the workspace Cargo.toml.
COPY onchain/ .
# Build all contracts. Output lands in target/wasm32v1-none/release/*.wasm.
RUN cargo build --target wasm32v1-none --release

# ---- runtime: stellar-cli + jq + the compiled WASMs ----
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      jq \
    && rm -rf /var/lib/apt/lists/*

# Install a pinned Stellar CLI release and verify it against the published
# SHA-256 before extracting, so the build never pipes remote code into a shell.
ARG STELLAR_CLI_VERSION=30.0.1
ARG STELLAR_CLI_SHA256=48c70074020e09af0a3ebbd2bf62d53c9aec47935e49a112d3cd90fb4e37658f
RUN curl -fsSL -o /tmp/stellar-cli.tar.gz \
      "https://github.com/stellar/stellar-cli/releases/download/v${STELLAR_CLI_VERSION}/stellar-cli-${STELLAR_CLI_VERSION}-x86_64-unknown-linux-gnu.tar.gz" \
    && echo "${STELLAR_CLI_SHA256}  /tmp/stellar-cli.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/stellar-cli.tar.gz -C /usr/local/bin \
    && rm -f /tmp/stellar-cli.tar.gz \
    && stellar --version

# Copy compiled WASMs from the builder stage.
WORKDIR /contracts
COPY --from=builder \
  /onchain/target/wasm32v1-none/release/lyricsflip.wasm \
  /onchain/target/wasm32v1-none/release/lyricsflip_nft.wasm \
  /onchain/target/wasm32v1-none/release/lyricsflip_escrow.wasm \
  ./

# Copy the seed data.
COPY seed/songs.json /seed/songs.json

# Copy the entrypoint script.
COPY docker/contracts-init/init.sh /init.sh
RUN chmod +x /init.sh

ENTRYPOINT ["/bin/bash", "/init.sh"]
