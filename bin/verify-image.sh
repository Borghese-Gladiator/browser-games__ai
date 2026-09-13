#!/usr/bin/env bash
# Reproduces the render.com deploy on this machine. Builds the Docker image from
# the repo root, starts the container, and proves that the deployed artifact
# serves every built page and accepts a socket connection.
#
# A local `npm run build` does not catch a Dockerfile or .dockerignore mistake,
# because it reads the whole repo instead of the Docker context. This script
# does. Run it before a push that touches Dockerfile, .dockerignore, render.yaml,
# a tsconfig, or the workspace layout.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${IMAGE:-browser-games:verify}"
NAME="${NAME:-browser-games-verify}"
PORT="${PORT:-8080}"
BASE="http://localhost:${PORT}"

failures=0

pass() { printf '  PASS  %s\n' "$1"; }
fail() {
  printf '  FAIL  %s\n' "$1"
  failures=$((failures + 1))
}

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "==> Build ${IMAGE}"
docker build -t "$IMAGE" "$ROOT"

echo "==> Start ${NAME} on port ${PORT}"
cleanup
docker run -d --name "$NAME" -p "${PORT}:8080" "$IMAGE" >/dev/null

echo "==> Wait for the health check"
if curl -fsS -o /dev/null --retry 30 --retry-all-errors --retry-delay 1 "${BASE}/healthz" 2>/dev/null; then
  pass "/healthz"
else
  echo "  FAIL  /healthz never answered. Container log:"
  docker logs "$NAME" 2>&1 | tail -30
  exit 1
fi

echo "==> Probe every built page"
# Derive the page list from dist/ so a new game needs no edit here.
pages=$(docker run --rm "$IMAGE" sh -c 'cd dist && find . -name index.html' |
  sed -e 's|^\./||' -e 's|index.html$||' -e 's|^|/|' | sort)

for path in $pages /api/leaderboard /history/reversi; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "${BASE}${path}")
  if [ "$code" = "200" ]; then
    pass "${path} ${code}"
  else
    fail "${path} ${code}"
  fi
done

echo "==> Check the bundle for a hard-coded dev gateway"
if docker run --rm "$IMAGE" sh -c 'grep -rq "localhost:3001" dist'; then
  fail "dist/ contains localhost:3001; the deployed client will not reach the gateway"
else
  pass "no localhost:3001 in dist/"
fi

echo "==> Socket smoke test"
if docker exec "$NAME" node bin/socket-smoke.mjs http://localhost:8080; then
  pass "socket create room"
else
  fail "socket create room"
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "All checks passed. The image is safe to push."
else
  echo "${failures} check(s) failed. Container log:"
  docker logs "$NAME" 2>&1 | tail -30
  exit 1
fi
