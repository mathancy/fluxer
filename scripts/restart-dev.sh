#!/usr/bin/env bash
# Fully restart all Fluxer dev services and open the app in the browser.
# Usage: ./scripts/restart-dev.sh

set -euo pipefail

COMPOSE_FILE=".devcontainer/process-compose.yml"
APP_URL="http://localhost:48763"
HEALTH_URL="http://localhost:48763/_caddy_health"
TIMEOUT=60  # seconds to wait for Caddy to become healthy

cd "$(dirname "$0")/.."

echo "==> Stopping any running process-compose instance..."
if pkill -f "process-compose.*process-compose.yml" 2>/dev/null; then
    # Give child processes (erlang, node, etc.) a moment to exit cleanly
    sleep 3
else
    echo "    (none was running)"
fi

echo "==> Starting process-compose..."
process-compose -f "$COMPOSE_FILE" up --tui=false &
PC_PID=$!

echo "==> Waiting for Caddy to become healthy (timeout: ${TIMEOUT}s)..."
deadline=$(( $(date +%s) + TIMEOUT ))
while true; do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
        echo "    Caddy is healthy."
        break
    fi
    if [[ $(date +%s) -ge $deadline ]]; then
        echo "ERROR: Caddy did not become healthy within ${TIMEOUT}s." >&2
        echo "       Check dev/logs/caddy.log and dev/logs/fluxer_server.log for details." >&2
        exit 1
    fi
    sleep 1
done

echo "==> Opening $APP_URL ..."
if [[ -n "${BROWSER:-}" ]]; then
    "$BROWSER" "$APP_URL" &
elif command -v xdg-open &>/dev/null; then
    xdg-open "$APP_URL" &
elif command -v open &>/dev/null; then
    open "$APP_URL" &
else
    echo "    (could not detect a browser command — open $APP_URL manually)"
fi

echo "==> Attaching TUI..."
exec process-compose -f "$COMPOSE_FILE" attach
