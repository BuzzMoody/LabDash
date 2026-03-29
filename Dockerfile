# =============================================================================
#  Homelab Dashboard — Dockerfile
#  Multi-stage: Go binary compiled in builder, copied to bare Alpine runtime.
#  No PHP, no nginx, no FPM — just a single static binary + Alpine base.
# =============================================================================

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM golang:1.23-alpine AS builder

WORKDIR /build

# Download js-yaml for embedding (not committed to the repo)
RUN wget -q -O js-yaml.min.js \
        https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js

# Copy source and assets
COPY go.mod main.go index.html ./
COPY styles.css app.js VERSION release-notes.md ./
COPY api-managers/ api-managers/

# Compile — fully static binary, debug symbols stripped
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o labdash .

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM alpine:3.21

# CA certificates for outbound HTTPS status checks
RUN apk add --no-cache ca-certificates

COPY --from=builder /build/labdash     /labdash
COPY example.services.yaml             /example.services.yaml

# Runtime config directory (mount point for user data)
RUN mkdir -p /config/logos

# ── Default port (override with -e PORT=xxxx) ─────────────────────────────────
ENV PORT=6969
# ── Beta mode: disables caching (baked in at build time, overridable at runtime)
ARG BETA=false
ENV BETA=${BETA}

EXPOSE 6969

ENTRYPOINT ["/labdash"]
