#!/bin/sh
set -e

CONFIG_DIR="/config"
YAML_FILE="${CONFIG_DIR}/services.yaml"
LOGOS_DIR="${CONFIG_DIR}/logos"
WEB_ROOT="/var/www/html"
EXAMPLE_YAML="/usr/local/share/dashboard/example.services.yaml"

# ── Auto-generate services.yaml if missing ────────────────────────────────────
if [ ! -f "${YAML_FILE}" ]; then
    echo "[dashboard] No services.yaml found — creating example at ${YAML_FILE}"
    mkdir -p "${CONFIG_DIR}"
    cp "${EXAMPLE_YAML}" "${YAML_FILE}"
    echo "[dashboard] Edit ${YAML_FILE} to configure your services."
fi

# ── Create logos dir if missing ───────────────────────────────────────────────
mkdir -p "${LOGOS_DIR}"

# ── Symlink logos into web root so the browser can reach them ─────────────────
# (services.yaml stays in /config — NOT in web root — so it's never served)
ln -sf "${LOGOS_DIR}" "${WEB_ROOT}/logos"

# ── Template nginx config with current PORT ───────────────────────────────────
PORT="${PORT:-6969}"
sed "s/LABDASH_PORT/${PORT}/g" /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# ── Start PHP-FPM in the background ───────────────────────────────────────────
php-fpm -D

# ── Start nginx in the foreground (Docker PID 1) ──────────────────────────────
echo "[dashboard] Listening on http://0.0.0.0:${PORT}"
exec nginx -g 'daemon off;'
