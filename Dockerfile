# =============================================================================
#  Homelab Dashboard — Dockerfile
#  nginx + PHP-FPM on Alpine for production-grade request handling.
#  Replaces the PHP built-in server which forked a process per request.
# =============================================================================

FROM php:8.5-fpm-alpine

# Install nginx + libcurl (runtime), build PHP curl extension, then clean up
RUN apk add --no-cache nginx libcurl wget \
 && apk add --no-cache --virtual .build-deps curl-dev \
 && docker-php-ext-install curl \
 && apk del .build-deps \
 && wget -q -O /tmp/js-yaml.min.js \
        https://cdn.jsdelivr.net/npm/js-yaml@4/dist/js-yaml.min.js \
 && apk del wget

# ── Web root ──────────────────────────────────────────────────────────────────
RUN mkdir -p /var/www/html

COPY index.php          /var/www/html/index.php
COPY ping.php           /var/www/html/ping.php
COPY batch-ping.php     /var/www/html/batch-ping.php
COPY styles.css         /var/www/html/styles.css
COPY app.js             /var/www/html/app.js
COPY VERSION            /var/www/html/VERSION
COPY release-notes.md   /var/www/html/release-notes.md
COPY api-managers/      /var/www/html/api-managers/
RUN  cp /tmp/js-yaml.min.js /var/www/html/js-yaml.min.js && rm /tmp/js-yaml.min.js

# ── Example config (copied to /config on first run if absent) ─────────────────
RUN mkdir -p /usr/local/share/dashboard
COPY example.services.yaml /usr/local/share/dashboard/example.services.yaml

# ── Runtime config directory (mount point) ────────────────────────────────────
#  Volume: /config
#    /config/services.yaml  ← user config (NOT web-accessible)
#    /config/logos/         ← optional logo images (web-accessible via symlink)
RUN mkdir -p /config/logos

# ── nginx config template (PORT substituted at container start) ───────────────
COPY nginx.conf.template /etc/nginx/nginx.conf.template

# ── PHP-FPM pool config (static 4-worker pool) ────────────────────────────────
COPY php-fpm-www.conf /usr/local/etc/php-fpm.d/www.conf

# ── Permissions ───────────────────────────────────────────────────────────────
RUN chown -R www-data:www-data /var/www/html /config

# ── Default port (override with -e PORT=xxxx) ─────────────────────────────────
ENV PORT=6969
# ── Beta mode: disables caching (baked in at build time, overridable at runtime)
ARG BETA=false
ENV BETA=${BETA}

EXPOSE 6969

# ── Entrypoint ────────────────────────────────────────────────────────────────
COPY entrypoint.sh /entrypoint.sh
RUN  chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
