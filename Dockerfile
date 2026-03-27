# =============================================================================
#  Homelab Dashboard — Dockerfile
#  Lightweight PHP CLI + built-in server on Alpine
# =============================================================================

FROM php:8.5-cli-alpine

# Install wget (for js-yaml) and curl-dev (for PHP curl extension)
RUN apk add --no-cache wget curl-dev \
 && docker-php-ext-install curl \
 && wget -q -O /tmp/js-yaml.min.js \
        https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js \
 && apk del wget curl-dev

# ── Web root ──────────────────────────────────────────────────────────────────
RUN mkdir -p /var/www/html

COPY index.php      /var/www/html/index.php
COPY proxy.php      /var/www/html/proxy.php
COPY styles.css     /var/www/html/styles.css
COPY app.js         /var/www/html/app.js
COPY VERSION        /var/www/html/VERSION
COPY api-managers/  /var/www/html/api-managers/
RUN  cp /tmp/js-yaml.min.js /var/www/html/js-yaml.min.js && rm /tmp/js-yaml.min.js

# ── Example config (copied to /config on first run if absent) ─────────────────
RUN mkdir -p /usr/local/share/dashboard
COPY example.services.yaml /usr/local/share/dashboard/example.services.yaml

# ── Runtime config directory (mount point) ────────────────────────────────────
#  Volume: /config
#    /config/services.yaml  ← user config (NOT web-accessible)
#    /config/logos/         ← optional logo images (web-accessible via symlink)
RUN mkdir -p /config/logos

# ── Permissions ───────────────────────────────────────────────────────────────
RUN chown -R www-data:www-data /var/www/html /config

# ── Default port (override with -e PORT=xxxx) ─────────────────────────────────
ENV PORT=6969
EXPOSE 6969

# ── Entrypoint ────────────────────────────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
RUN  chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
