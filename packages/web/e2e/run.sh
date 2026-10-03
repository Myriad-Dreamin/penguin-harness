#!/usr/bin/env bash
# End-to-end verification (Playwright + mock LLM): build core/server/web and the example plugins ->
# start mock Anthropic SSE -> for each plugin set, seed a fresh temp data root, start the server on
# it and run the specs that set is for. SKIP_BUILD=1 skips the build.
#
# What one Project lists in `[plugins]` is loaded for the whole server, so a plugin that changes
# the app for everyone gets a server of its own instead of changing it under every other spec:
#   default               plugins/example-hello-page (plugin-page.spec.mjs) and
#                         plugins/example-music (music-file.spec.mjs); every spec but those below
#   no-evaluation-center  plugins/example-hello-page and plugins/example-no-evaluation-center;
#                         page-removal.spec.mjs only
# E2E_PLUGIN_SET=<name> runs that set alone; unset runs both, one after the other. Which specs
# belong to which set is playwright.config.mjs's to say.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
MOCK_PORT="${MOCK_PORT:-8931}"
SRV_PORT="${SRV_PORT:-8930}"
# localhost, not 127.0.0.1: since the Workspace-preview split the server canonicalizes the
# App onto localhost and reserves 127.0.0.1 as the preview host, where /api answers 401.
export BASE_URL="http://localhost:$SRV_PORT"
export MOCK_URL="http://127.0.0.1:$MOCK_PORT"
DATA_ROOTS=()

stop_server() {
  [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null && wait "$SRV_PID" 2>/dev/null
  SRV_PID=""
}
cleanup() {
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null
  stop_server
  for d in "${DATA_ROOTS[@]}"; do rm -rf "$d"; done
}
trap cleanup EXIT

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  echo "== build core/server/web and the example plugins =="
  (cd "$ROOT" \
    && pnpm --filter @prismshadow/penguin-core build \
    && pnpm --filter @prismshadow/penguin-server build \
    && pnpm --filter @prismshadow/penguin-web build \
    && pnpm --filter @penguinharness/example-hello-page build \
    && pnpm --filter @penguinharness/example-music build \
    && pnpm --filter @penguinharness/example-no-evaluation-center build) \
    || { echo "BUILD FAILED"; exit 1; }
fi

# serve <plugin dir>...: a fresh data root whose default_project enables the named example plugins
# by their built entries' absolute paths — the loader's dev-checkout form — and the server on it.
# The server adopts an existing default_project without rewriting its plugin table. No route can
# enable them instead: installing over the API is limited to the plugins a build ships, and these
# are never shipped.
serve() {
  local data
  data="$(mktemp -d)"
  DATA_ROOTS+=("$data")
  mkdir -p "$data/default_project"
  {
    echo "[plugins]"
    for p in "$@"; do printf '"%s" = "*"\n' "$ROOT/plugins/$p/dist/index.js"; done
  } >"$data/default_project/.project_config.toml"
  # PENGUIN_SEED_ADMIN_PASSWORD pins the otherwise-random seeded admin password to the
  # constant the specs use (ADMIN_PASSWORD in auth.mjs).
  PENGUIN_HOME="$data" PORT=$SRV_PORT HOST=127.0.0.1 PENGUIN_WEB_DB="$data/web.db" \
    PENGUIN_WEB_DIST="$ROOT/packages/web/dist" \
    PENGUIN_SEED_ADMIN_PASSWORD=penguin-2026 \
    node "$ROOT/packages/server/dist/index.js" &
  SRV_PID=$!
  for _ in $(seq 1 40); do
    curl -sf "$BASE_URL/" >/dev/null 2>&1 && break
    sleep 0.5
  done
}

# round <set> <plugin dir>...: the set's specs against a server with those plugins.
STATUS=0
round() {
  local set="$1"
  shift
  [ -n "${E2E_PLUGIN_SET:-}" ] && [ "$E2E_PLUGIN_SET" != "$set" ] && return
  echo "== plugin set '$set': start server =="
  serve "$@"
  echo "== plugin set '$set': run playwright =="
  (cd "$ROOT/packages/web" && E2E_PLUGIN_SET="$set" npx playwright test -c "$HERE/playwright.config.mjs") \
    || STATUS=1
  stop_server
}

echo "== start mock LLM =="
MOCK_PORT=$MOCK_PORT node "$HERE/mock-llm.mjs" &
MOCK_PID=$!

round default example-hello-page example-music
round no-evaluation-center example-hello-page example-no-evaluation-center
exit $STATUS
