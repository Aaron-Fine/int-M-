#!/usr/bin/env bash
# Runs the advisory screenshot suite (playwright.visual.config.ts) inside the
# pinned Playwright container, the same image as CI's browser job. Baselines
# are only meaningful there: fonts and anti-aliasing differ between hosts.
# Extra arguments go to Playwright, e.g. --update-snapshots=all.
set -euo pipefail

image='mcr.microsoft.com/playwright:v1.64.1-noble'
engine="${CONTAINER_ENGINE:-}"
if [[ -z "$engine" ]]; then
  if command -v podman >/dev/null; then
    engine=podman
  elif command -v docker >/dev/null; then
    engine=docker
  else
    echo 'run-visual-container: install podman or docker, or set CONTAINER_ENGINE' >&2
    exit 2
  fi
fi
user_args=()
if [[ "$(basename "$engine")" == docker ]]; then
  # Rootful Docker would leave root-owned files in the checkout.
  user_args=(--user "$(id -u):$(id -g)" --env HOME=/tmp)
fi
root="$(git rev-parse --show-toplevel)"

# The checkout is copied into the container without node_modules (a worktree's
# may be a symlink to the host's), installed there, and only the baselines and
# the report are copied back.
# :z (shared) relabels for SELinux; the host uses this checkout too, so the
# private :Z category would lock it out.
exec "$engine" run --rm --init --ipc=host "${user_args[@]}" \
  --env MI_VISUAL_CONTAINER=1 \
  --volume "$root:/src:z" \
  "$image" \
  bash -euo pipefail -c '
    mkdir -p /tmp/work
    tar -C /src --exclude=./node_modules --exclude=./.git --exclude="./dist*" \
      --exclude=./test-results --exclude="./playwright-report*" --exclude=./.evidence-build \
      -cf - . | tar -C /tmp/work -xf -
    cd /tmp/work
    echo "node $(node --version), npm $(npm --version)"
    npm ci --no-audit --no-fund --loglevel=error
    status=0
    npx playwright test -c playwright.visual.config.ts "$@" || status=$?
    mkdir -p /src/tests/visual/__screenshots__
    cp -R tests/visual/__screenshots__/. /src/tests/visual/__screenshots__/ || true
    rm -rf /src/playwright-report-visual
    cp -R playwright-report-visual /src/ 2>/dev/null || true
    exit "$status"
  ' bash "$@"
