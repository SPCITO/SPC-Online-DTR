#!/usr/bin/env bash
# ============================================================
# SPC Online DTR — (re)deploy app containers on spcwebhost
#
# Prereq: source tree extracted at /srv/apps/smart-school/dtr/src
#         (see SERVER.md §7 "Deploying the SPC Online DTR").
# Note:   ss-mysql is NOT touched here — it is persistent infra
#         created once (see SERVER.md §6 "Shared MySQL").
#
# Usage: bash deploy/deploy-dtr.sh
#
#        WEB_ONLY=1 SRC=<snapshot> \
#          EXPECTED_SELECTOR_SHA256=<sha256> EXPECTED_MANIFEST_SHA256=<sha256> \
#          bash deploy/deploy-dtr.sh
#        (opt-in web-only release — see deploy/WEB_ONLY-runbook.md)
#
#        WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE=<tar> EXPECTED_IMAGE_ID=<id> \
#          (added to the WEB_ONLY arguments — imports a pinned prebuilt web
#           image instead of building on-host; optional WEB_TMPDIR=<dir>)
# ============================================================
set -euo pipefail

# WEB_ONLY=1 — opt-in web-only release (see deploy/WEB_ONLY-runbook.md).
# Requires an explicitly identified, out-of-band hash-pinned source snapshot
# so neither a dirty working tree nor unapproved content is ever deployed.
WEB_ONLY=${WEB_ONLY:-0}
if [ "$WEB_ONLY" = "1" ] && [ -z "${SRC:-}" ]; then
  echo "ERROR: WEB_ONLY=1 requires an explicitly identified source snapshot, e.g. SRC=/srv/apps/smart-school/dtr/src-snapshot-YYYYMMDD-HHMM" >&2
  exit 1
fi

SRC=${SRC:-/srv/apps/smart-school/dtr/src}
BASE_PATH=${BASE_PATH:-/dtr}
API_IMAGE=localhost/spc-dtr-api:latest
WEB_IMAGE=localhost/spc-dtr-web:latest

# ── WEB_ONLY=1 ──────────────────────────────────────────────────────────
# Web-only release: rebuilds and recreates ONLY ss-dtr-web from a verified
# source snapshot. ss-dtr-api, ss-mysql, Caddy, Cloudflare Tunnel, env files
# and the database are never touched in this mode. When WEB_ONLY is unset,
# the standard deployment below runs exactly as before.
#
# Required env (fail-closed):
#   SRC                      explicit snapshot dir (must NOT be inside any
#                            Git worktree — .git dir or file, any level)
#   EXPECTED_SELECTOR_SHA256 SHA-256 of the APPROVED
#                            frontend/components/LogSourceSelector.tsx,
#                            recorded out-of-band at review time
#   EXPECTED_MANIFEST_SHA256 SHA-256 of the snapshot manifest, recorded
#                            out-of-band at capture time. The manifest lives
#                            inside the snapshot and alone proves nothing
#                            about authenticity — only the separately
#                            recorded hash pins it.
#
# Snapshot file-type policy: only regular files and directories are allowed —
# symbolic links (enumerated, never followed), FIFOs, sockets and device nodes
# are all rejected before any image or container operation.
#
# Digest taxonomy (never conflated): (1) digests COMPUTED from the snapshot
# are evidence only; (2) the TRUSTED EXPECTED digests supplied out-of-band via
# EXPECTED_* below are the only authenticity anchors; (3) SELF-CONSISTENT data
# (a manifest matching its files without an independent pin) proves nothing.
if [ "$WEB_ONLY" = "1" ]; then
  for tool in podman curl sha256sum realpath find sort diff sed awk grep mktemp date; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "ERROR: WEB_ONLY=1 requires '$tool' on this host" >&2
      exit 1
    fi
  done

  SELECTOR_REL=frontend/components/LogSourceSelector.tsx

  if [ -z "${EXPECTED_SELECTOR_SHA256:-}" ]; then
    echo "ERROR: WEB_ONLY=1 requires EXPECTED_SELECTOR_SHA256 (recorded out-of-band at review time)" >&2
    exit 1
  fi
  if [ -z "${EXPECTED_MANIFEST_SHA256:-}" ]; then
    echo "ERROR: WEB_ONLY=1 requires EXPECTED_MANIFEST_SHA256 (recorded out-of-band at capture time)" >&2
    exit 1
  fi
  if [ ! -d "$SRC" ]; then
    echo "ERROR: SRC is not a directory: $SRC" >&2
    exit 1
  fi
  SRC=$(realpath "$SRC")

  # The snapshot must not sit inside a Git worktree (.git dir OR file) —
  # checked for SRC itself and every parent directory.
  d=$SRC
  while [ "$d" != "/" ] && [ -n "$d" ]; do
    if [ -e "$d/.git" ]; then
      echo "ERROR: snapshot is inside a Git working tree ($d/.git) — refusing" >&2
      exit 1
    fi
    d=${d%/*}
    [ -z "$d" ] && d=/
  done

  # ---- snapshot verification (fail-closed; re-run before the swap) ----
  work=$(mktemp -d)
  trap 'rm -rf "$work"' EXIT
  MANIFEST_RAW=${SNAPSHOT_MANIFEST:-$SRC/SNAPSHOT.sha256}
  MANIFEST=""    # canonical path, fixed at the first successful resolution
  MANIFEST_REL=""

  verify_snapshot() {
    local path actual_selector actual_manifest non_regular manifest_now

    # (0) manifest path policy — validated on the SUPPLIED path BEFORE any
    # canonicalisation (realpath would resolve a symlink and hide it), then
    # bound to the trust boundary, then held stable across both runs.
    if [ -L "$MANIFEST_RAW" ]; then
      echo "ERROR: manifest path must be a regular file, not a symbolic link: $MANIFEST_RAW" >&2
      return 1
    fi
    if [ ! -e "$MANIFEST_RAW" ]; then
      echo "ERROR: snapshot manifest not found: $MANIFEST_RAW" >&2
      echo "       capture it before applying the approved change — see deploy/WEB_ONLY-runbook.md" >&2
      return 1
    fi
    if [ ! -f "$MANIFEST_RAW" ]; then
      echo "ERROR: manifest is not a regular file: $MANIFEST_RAW" >&2
      return 1
    fi
    if [ ! -r "$MANIFEST_RAW" ]; then
      echo "ERROR: manifest is not readable: $MANIFEST_RAW" >&2
      return 1
    fi
    manifest_now=$(realpath "$MANIFEST_RAW")
    case "$MANIFEST_RAW" in
      "$SRC"|"$SRC"/*)
        case "$manifest_now" in
          "$SRC"|"$SRC"/*) ;;
          *)
            echo "ERROR: manifest resolves outside the snapshot: $manifest_now (from $MANIFEST_RAW) — refusing" >&2
            return 1 ;;
        esac ;;
    esac
    if [ -z "$MANIFEST" ]; then
      MANIFEST=$manifest_now
      MANIFEST_REL=${MANIFEST#"$SRC"/}
    elif [ "$manifest_now" != "$MANIFEST" ]; then
      echo "ERROR: manifest path changed after verification — refusing" >&2
      return 1
    fi

    # (a) file types: reject symlinks (enumerated without following), FIFOs,
    # sockets and device nodes anywhere in the snapshot.
    non_regular=$(cd "$SRC" && find . -mindepth 1 \( -type l -o -type p -o -type s -o -type b -o -type c \) -print)
    if [ -n "$non_regular" ]; then
      echo "ERROR: snapshot contains non-regular entries (symlinks/FIFOs/sockets/devices) — refusing" >&2
      printf '%s\n' "$non_regular" | sed 's/^/       /' >&2
      return 1
    fi

    # (b) approved file: computed digest vs the trusted expected digest
    if [ ! -f "$SRC/$SELECTOR_REL" ]; then
      echo "ERROR: approved change file missing from snapshot: $SRC/$SELECTOR_REL" >&2
      return 1
    fi
    actual_selector=$(sha256sum "$SRC/$SELECTOR_REL" | awk '{print $1}')
    if [ "$actual_selector" != "$EXPECTED_SELECTOR_SHA256" ]; then
      echo "ERROR: approved file content mismatch — expected $EXPECTED_SELECTOR_SHA256 (trusted), got $actual_selector (computed)" >&2
      echo "       ($SELECTOR_REL is the ONLY file allowed to differ from the baseline, and only as approved)" >&2
      return 1
    fi

    # (c) manifest policy + trusted expected digest (self-consistency alone
    # is NOT authenticity)
    if [ ! -f "$MANIFEST" ]; then
      echo "ERROR: snapshot manifest not found: $MANIFEST" >&2
      return 1
    fi
    if grep -q 'LogSourceSelector' "$MANIFEST"; then
      echo "ERROR: manifest must exclude the approved change file ($SELECTOR_REL)" >&2
      return 1
    fi
    actual_manifest=$(sha256sum "$MANIFEST" | awk '{print $1}')
    if [ "$actual_manifest" != "$EXPECTED_MANIFEST_SHA256" ]; then
      echo "ERROR: manifest hash mismatch — expected $EXPECTED_MANIFEST_SHA256 (trusted), got $actual_manifest (computed)" >&2
      echo "       (a self-consistent manifest is NOT authenticity — it must be pinned out-of-band)" >&2
      return 1
    fi

    # (d) manifest entry shape: exactly '<64 hex><space><space|*><path>'
    if ! grep -qE '^[0-9a-f]{64} [ *].+' "$MANIFEST" || grep -qvE '^[0-9a-f]{64} [ *].+' "$MANIFEST"; then
      echo "ERROR: manifest contains empty or malformed entries — refusing" >&2
      return 1
    fi

    # (e) manifest entry paths: no absolute paths, '..' traversal, escapes
    sed 's/^[0-9a-f]\{64\} [ *]//; s|^\./||' "$MANIFEST" > "$work/paths"
    while IFS= read -r path; do
      if [ -z "$path" ]; then
        echo "ERROR: manifest contains an empty path entry — refusing" >&2
        return 1
      fi
      case "$path" in
        /*|\\*)
          echo "ERROR: manifest entry is absolute or escaped: $path — refusing" >&2
          return 1 ;;
      esac
      case "/$path/" in
        */../*)
          echo "ERROR: manifest entry traverses outside the snapshot: $path — refusing" >&2
          return 1 ;;
      esac
    done < "$work/paths"

    # (f) duplicated entries (after './' normalisation) are refused
    sort "$work/paths" > "$work/expected"
    if uniq -d "$work/expected" | grep -q .; then
      echo "ERROR: manifest contains duplicate entries — refusing" >&2
      uniq -d "$work/expected" | sed 's/^/       /' >&2
      return 1
    fi

    # (g) complete inventory: every regular file must be manifest-listed
    # (except the manifest itself and the one approved change file); this
    # covers the whole frontend build context. Unmanifested additions fail.
    # Exact-string filtering (not find -path globs) so metacharacters in
    # names cannot mis-exclude entries.
    (cd "$SRC" && find . -type f | sed 's|^\./||' \
      | awk -v k1="$SELECTOR_REL" -v k2="$MANIFEST_REL" '$0 != k1 && $0 != k2' \
      | sort) > "$work/actual"
    if ! diff -u "$work/expected" "$work/actual" > "$work/inventory.diff"; then
      echo "ERROR: snapshot inventory does not match the manifest (unmanifested or missing files) — refusing" >&2
      echo "       $SELECTOR_REL is the ONLY file allowed to differ from the baseline" >&2
      sed 's/^/       /' "$work/inventory.diff" >&2
      return 1
    fi

    # (h) every listed file must exist and match its manifest digest
    if ! (cd "$SRC" && sha256sum --quiet -c "$MANIFEST"); then
      echo "ERROR: snapshot failed checksum verification — refusing" >&2
      return 1
    fi
    return 0
  }

  if ! verify_snapshot; then
    echo "ERROR: snapshot verification failed — refusing before any image or container operation" >&2
    exit 1
  fi

  # ---- preserve the known-good web image BEFORE any build can replace it ----
  if ! podman image exists "$WEB_IMAGE"; then
    echo "ERROR: no existing web image ($WEB_IMAGE) to preserve — refusing before touching the running container" >&2
    exit 1
  fi
  ORIGINAL_IMAGE_ID=$(podman image inspect --format '{{.Id}}' "$WEB_IMAGE")
  if [ -z "$ORIGINAL_IMAGE_ID" ]; then
    echo "ERROR: could not resolve the current web image ID — refusing before touching the running container" >&2
    exit 1
  fi

  WEB_ROLLBACK_IMAGE=${WEB_ROLLBACK_IMAGE:-${WEB_IMAGE%:*}:rollback-$(date -u +%Y%m%d-%H%M%S)}
  if podman image exists "$WEB_ROLLBACK_IMAGE"; then
    echo "ERROR: rollback tag already exists ($WEB_ROLLBACK_IMAGE) — refusing to overwrite a known-good image" >&2
    exit 1
  fi
  podman tag "$WEB_IMAGE" "$WEB_ROLLBACK_IMAGE"
  ROLLBACK_IMAGE_ID=$(podman image inspect --format '{{.Id}}' "$WEB_ROLLBACK_IMAGE")
  if [ -z "$ROLLBACK_IMAGE_ID" ] || [ "$ROLLBACK_IMAGE_ID" != "$ORIGINAL_IMAGE_ID" ]; then
    echo "ERROR: rollback image identity mismatch — original ${ORIGINAL_IMAGE_ID}, rollback ${ROLLBACK_IMAGE_ID:-<none>}" >&2
    echo "       refusing to modify the running container without a verified preserved image" >&2
    exit 1
  fi
  echo "==> WEB_ONLY: preserved known-good web image as ${WEB_ROLLBACK_IMAGE}"
  echo "    original image id: ${ORIGINAL_IMAGE_ID}"
  echo "    rollback image id: ${ROLLBACK_IMAGE_ID} (verified identical before any build)"

  # ---- image acquisition (only after a verified preserved image exists) ----
  # WEB_PREBUILT=1 (M.82 design): import a pinned, prebuilt web image instead
  # of building on-host. Import staging uses a designated, writability-checked
  # temp root so Podman never writes to an affected filesystem. Normal mode
  # (build) below is unchanged.
  if [ "${WEB_PREBUILT:-0}" = "1" ]; then
    BUILD_TMPDIR=${WEB_TMPDIR:-/srv/apps/smart-school/dtr/tmp}
    if [ -z "${WEB_IMAGE_ARCHIVE:-}" ] || [ -z "${EXPECTED_IMAGE_ID:-}" ]; then
      echo "ERROR: WEB_PREBUILT=1 requires WEB_IMAGE_ARCHIVE and EXPECTED_IMAGE_ID" >&2
      exit 1
    fi
    if [ -L "$WEB_IMAGE_ARCHIVE" ] || [ ! -f "$WEB_IMAGE_ARCHIVE" ]; then
      echo "ERROR: image archive must be a regular file, not a symbolic link: $WEB_IMAGE_ARCHIVE" >&2
      exit 1
    fi
    if ! mkdir -p "$BUILD_TMPDIR" 2>/dev/null || ! ( : > "$BUILD_TMPDIR/.webonly-write-test" ) 2>/dev/null; then
      echo "ERROR: designated temp root is not usable: $BUILD_TMPDIR" >&2
      echo "       (refusing to import through an affected filesystem)" >&2
      exit 1
    fi
    rm -f "$BUILD_TMPDIR/.webonly-write-test"
    echo "==> WEB_ONLY(prebuilt): importing ${WEB_IMAGE_ARCHIVE} (temp root: ${BUILD_TMPDIR})"
    if ! TMPDIR="$BUILD_TMPDIR" podman load -i "$WEB_IMAGE_ARCHIVE"; then
      echo "ERROR: image import failed — running container untouched" >&2
      echo "       preserved known-good image: ${WEB_ROLLBACK_IMAGE} (${ROLLBACK_IMAGE_ID})" >&2
      exit 1
    fi
    if [ "$(podman image inspect --format '{{.Id}}' "$EXPECTED_IMAGE_ID" 2>/dev/null)" != "$EXPECTED_IMAGE_ID" ]; then
      echo "ERROR: imported image ID mismatch — expected ${EXPECTED_IMAGE_ID}; refusing before any container operation" >&2
      exit 1
    fi
    imported_platform=$(podman image inspect --format '{{.Os}}/{{.Architecture}}' "$EXPECTED_IMAGE_ID" 2>/dev/null)
    if [ "$imported_platform" != "linux/amd64" ]; then
      echo "ERROR: imported image platform ${imported_platform} != linux/amd64 — refusing before any container operation" >&2
      exit 1
    fi
    podman tag "$EXPECTED_IMAGE_ID" "$WEB_IMAGE"
    echo "==> WEB_ONLY(prebuilt): imported image ${EXPECTED_IMAGE_ID} staged as ${WEB_IMAGE}"
  else
    echo "==> WEB_ONLY: building web image (basePath=${BASE_PATH})"
    if ! podman build -t "$WEB_IMAGE" \
        --build-arg "NEXT_PUBLIC_BASE_PATH=${BASE_PATH}" \
        --build-arg "NEXT_PUBLIC_API_URL=${BASE_PATH}/api" \
        -f "$SRC/frontend/Containerfile" "$SRC/frontend"; then
      echo "ERROR: web image build failed — running container untouched" >&2
      echo "       preserved known-good image: ${WEB_ROLLBACK_IMAGE} (${ROLLBACK_IMAGE_ID})" >&2
      exit 1
    fi
  fi

  web_probe() {
    # GET the app under the base path. Expected: HTTP 200 with an HTML body
    # (Next.js serves the app shell at ${BASE_PATH}/; auth redirects are
    # client-side). curl -L follows any server-side redirect, which must
    # resolve to 200. Bounded: 2s connect / 5s total per attempt.
    local out code body
    out=$(curl -sS -L --connect-timeout 2 --max-time 5 -w '\n%{http_code}' \
      "http://127.0.0.1:2003${BASE_PATH}/" 2>/dev/null) || return 1
    code=${out##*$'\n'}
    body=${out%$'\n'*}
    [ "$code" = "200" ] || return 1
    printf '%s' "$body" | grep -qi '<html' || return 1
    return 0
  }

  web_running() {
    podman ps -q --filter name=ss-dtr-web 2>/dev/null | grep -q .
  }

  web_healthy() {
    # Bounded: 15 attempts x (<=5s probe + 2s pause).
    local i
    for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
      web_probe && web_running && return 0
      web_running || return 1
      sleep 2
    done
    return 1
  }

  web_rollback() {
    # $1 = failure reason. Claims success only if the rollback image is
    # actually serving; every path exits non-zero.
    echo "==> WEB_ONLY: deployment failed ($1) — rolling back to ${WEB_ROLLBACK_IMAGE} (${ROLLBACK_IMAGE_ID})" >&2
    podman rm -f ss-dtr-web >/dev/null 2>&1 || true
    if podman image exists "$WEB_ROLLBACK_IMAGE"; then
      if podman run -d --name ss-dtr-web --network smart-school -p 2003:3000 \
          --restart unless-stopped "$WEB_ROLLBACK_IMAGE" >/dev/null; then
        if web_healthy; then
          echo "==> WEB_ONLY: rollback verified healthy — serving ${WEB_ROLLBACK_IMAGE} (${ROLLBACK_IMAGE_ID}); new image NOT kept" >&2
          exit 1
        fi
      fi
    fi
    cat >&2 <<MANUAL
ERROR: rollback did NOT come up healthy — manual recovery required:
  1) podman rm -f ss-dtr-web
  2) podman run -d --name ss-dtr-web --network smart-school -p 2003:3000 --restart unless-stopped ${WEB_ROLLBACK_IMAGE}
  3) verify: curl -sS -L --connect-timeout 2 --max-time 5 -o /dev/null -w '%{http_code}\n' http://127.0.0.1:2003${BASE_PATH}/   (expect 200)
  4) if ${WEB_ROLLBACK_IMAGE} is unusable, rebuild from the verified snapshot: ${SRC}
ss-dtr-api, the database, Caddy and the tunnel were NOT modified by WEB_ONLY.
MANUAL
    exit 1
  }

  # Re-verify the snapshot immediately before touching the container so the
  # manifest, the approved file, or any snapshot file cannot be silently
  # replaced after the first verification (residual race documented in the
  # runbook).
  echo "==> WEB_ONLY: re-verifying snapshot before container swap"
  if ! verify_snapshot; then
    echo "ERROR: snapshot changed after verification — refusing to swap containers" >&2
    exit 1
  fi

  echo "==> WEB_ONLY: recreating ss-dtr-web only (ss-dtr-api untouched)"
  podman rm -f ss-dtr-web >/dev/null 2>&1 || true
  if ! podman run -d --name ss-dtr-web --network smart-school -p 2003:3000 \
      --restart unless-stopped "$WEB_IMAGE" >/dev/null; then
    web_rollback "new container failed to start"
  fi
  if ! web_healthy; then
    web_rollback "new container failed the health probe"
  fi
  if ! web_running; then
    web_rollback "new container is not running after the health probe"
  fi

  NEW_IMAGE_ID=$(podman image inspect --format '{{.Id}}' "$WEB_IMAGE")
  echo "==> WEB_ONLY: done. ss-dtr-web serves image ${NEW_IMAGE_ID}"
  echo "==> WEB_ONLY: rollback preserved at ${WEB_ROLLBACK_IMAGE} (${ROLLBACK_IMAGE_ID})"
  echo "==> WEB_ONLY: Caddy not reloaded (routes and ports unchanged). Containers:"
  podman ps --filter name=ss-dtr --format '{{.Names}} | {{.Status}} | {{.Ports}}'
  exit 0
fi

echo "==> Building API image"
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  podman build -t "$API_IMAGE" -f "$SRC/backend/Containerfile" "$SRC/backend"

  echo "==> Building web image (basePath=${BASE_PATH})"
  podman build -t "$WEB_IMAGE" \
    --build-arg "NEXT_PUBLIC_BASE_PATH=${BASE_PATH}" \
    --build-arg "NEXT_PUBLIC_API_URL=${BASE_PATH}/api" \
    -f "$SRC/frontend/Containerfile" "$SRC/frontend"
else
  echo "==> SKIP_BUILD=1 — reusing existing images"
fi

echo "==> Recreating containers"
podman rm -f ss-dtr-api ss-dtr-web >/dev/null 2>&1 || true

podman run -d --name ss-dtr-api \
  --network smart-school \
  -p 2004:5000 \
  --env-file /srv/apps/smart-school/env/dtr-api.env \
  -v /srv/apps/smart-school/dtr/sync-state:/app/sync-state \
  --restart unless-stopped \
  "$API_IMAGE"

podman run -d --name ss-dtr-web \
  --network smart-school \
  -p 2003:3000 \
  --restart unless-stopped \
  "$WEB_IMAGE"

echo "==> Reloading Caddy"
podman exec ss-caddy caddy reload --config /etc/caddy/Caddyfile

echo "==> Done. Containers:"
podman ps --filter name=ss-dtr --format '{{.Names}} | {{.Status}} | {{.Ports}}'
