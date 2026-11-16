#!/usr/bin/env bash
# Install the server's dependencies, without ever leaving it with none.
#
#   scripts/install-deps.sh runtime   # --omit=dev, what the deploy uses
#   scripts/install-deps.sh all       # --include=dev, for building by hand
#
# WHY THIS IS NOT JUST `npm ci`
#
# On 28 Sep a deploy hung for ten minutes on `npm ci --omit=dev` and was cut
# off — and the SITE WENT DOWN, 502, until somebody re-ran the deploy. Nothing
# had changed about the packages; the same command took eight seconds on the
# retry. It was a stall reaching the registry.
#
# A stall should not be able to do that, and `npm ci` is why it could: it
# DELETES node_modules before it fetches anything. Interrupt it and the app is
# left with no dependencies at all, so the next restart finds nothing to run.
# The deploy's own promise — "a red deploy leaves the previous version
# running" — was not true of that one step.
#
# So:
#   - Nothing is installed at all when package-lock.json has not moved, which
#     is almost every deploy. The fastest step is the one that does not run,
#     and a step that does not run cannot fail.
#   - When it has moved, `npm install` rather than `npm ci`: it is incremental,
#     so a failure half-way leaves the previous node_modules in place and the
#     app still able to start. It honours the lockfile just as `ci` does; what
#     it gives up is pruning packages no longer listed, which is worth far less
#     than a site that stays up.
#   - A time limit, so a stalled registry costs a minute and a clear message
#     instead of ten minutes and a broken pipe with nothing in the log.
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-runtime}"
case "$MODE" in
  runtime) NPM_ARGS=(--omit=dev) ;;
  all)     NPM_ARGS=(--include=dev) ;;
  *) echo "usage: $0 [runtime|all]" >&2; exit 2 ;;
esac

# How long an install may take before we call it stalled. Generous for a cold
# cache on a small VPS, short enough that a hang is reported rather than
# waited out.
TIMEOUT="${INSTALL_TIMEOUT:-420}"

# The stamp lives INSIDE node_modules on purpose: if that directory is ever
# wiped, the stamp goes with it and the next run installs, rather than trusting
# a marker for a tree that is no longer there.
STAMP="node_modules/.deploy-lock-${MODE}"

lock_hash() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum package-lock.json | cut -d' ' -f1
  else shasum -a 256 package-lock.json | cut -d' ' -f1
  fi
}

want="$(lock_hash)"
have="$(cat "$STAMP" 2>/dev/null || true)"

if [ -d node_modules ] && [ -n "$have" ] && [ "$want" = "$have" ]; then
  echo "→ dependencies unchanged — nothing to install"
  exit 0
fi

echo "→ installing ($MODE)"
# The time limit is a nicety, not a requirement. `timeout` is GNU coreutils:
# it is on the server and absent on a Mac, and an early version of this script
# turned that absence into "install failed" on every run — a guard that breaks
# the thing it guards. Missing, we simply install without a limit.
RUNNER=()
if command -v timeout >/dev/null 2>&1; then RUNNER=(timeout "$TIMEOUT")
elif command -v gtimeout >/dev/null 2>&1; then RUNNER=(gtimeout "$TIMEOUT")
else echo "  (no timeout command here — installing without a time limit)"
fi

# `timeout` returns 124 when it fires; say which it was, because "npm failed"
# and "npm never answered" want different things done about them.
set +e
# ${arr[@]+...}: bash 3.2 (every Mac) calls an empty array "unbound" under
# set -u, and this script must run there too.
# Low priority for CPU and disk: the box is shared, and an install is never
# urgent enough to slow the other projects down. ionice is Linux-only.
NICE=(nice -n 15)
command -v ionice >/dev/null 2>&1 && NICE+=(ionice -c3)
${RUNNER[@]+"${RUNNER[@]}"} "${NICE[@]}" npm install "${NPM_ARGS[@]}" --no-audit --no-fund
code=$?
set -e

if [ "$code" -eq 124 ]; then
  echo "✘ npm install got nowhere in ${TIMEOUT}s — the registry is probably unreachable from here." >&2
  echo "  The dependencies already on this box are untouched, so the app still runs." >&2
  echo "  Try the deploy again; if it keeps happening, check the server's network and disk." >&2
  exit 1
fi
if [ "$code" -ne 0 ]; then
  echo "✘ npm install failed (exit $code). The previous dependencies are untouched." >&2
  exit "$code"
fi

printf '%s' "$want" > "$STAMP"
echo "→ dependencies are current"
