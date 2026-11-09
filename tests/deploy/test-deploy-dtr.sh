#!/usr/bin/env bash
# ============================================================
# Focused tests for deploy/deploy-dtr.sh (standard + WEB_ONLY=1).
#
# podman, curl and sleep are mocked — nothing is built, run or
# restarted. Run from anywhere:
#   bash tests/deploy/test-deploy-dtr.sh
# ============================================================
set -u

TEST_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$TEST_DIR/../.." && pwd)
DEPLOY="$REPO_ROOT/deploy/deploy-dtr.sh"
WORK=$(mktemp -d)
STATE="$WORK/state"
trap 'rm -rf "$WORK"' EXIT

PASS=0
FAIL=0

# Reviewed SHA-256 of the approved change (recorded out-of-band at review
# time). t8 re-verifies the repo file still matches — do not change this
# constant without a new review of the approved change.
APPROVED_SELECTOR_SHA256=490389232a4765c57454ed5b8df036b57b0505cf57cc6039a5876a83c1715093

# ---- mocks -------------------------------------------------
mkdir -p "$WORK/bin"

cat > "$WORK/bin/podman" <<'EOF'
#!/usr/bin/env bash
{ printf 'podman'; for a in "$@"; do printf ' %s' "$a"; done; printf '\n'; } >> "$PODMAN_LOG"
S="$PODMAN_STATE"; mkdir -p "$S"
img_id() { [ -f "$S/images" ] && awk -v t="$1" '$1==t{print $2; f=1; next} $2==t{print $2; f=1} END{exit f?0:1}' "$S/images"; }
set_img() {
  [ -f "$S/images" ] || : > "$S/images"
  awk -v t="$1" '$1!=t' "$S/images" > "$S/images.tmp"
  printf '%s %s\n' "$1" "$2" >> "$S/images.tmp"
  mv "$S/images.tmp" "$S/images"
}
case "${1:-}" in
  build)
    [ "${MOCK_BUILD_FAIL:-0}" = "1" ] && exit 1
    tag=""; prev=""
    for a in "$@"; do [ "$prev" = "-t" ] && tag="$a"; prev="$a"; done
    n=$(cat "$S/seq" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$S/seq"
    set_img "$tag" "img-build-$n"
    # optional mid-run snapshot mutation (regression: post-verify replacement)
    if [ -n "${MOCK_MUTATE_PATH:-}" ]; then
      if [ "${MOCK_MUTATE_MODE:-append}" = "symlink" ]; then
        rm -f "$MOCK_MUTATE_PATH"; ln -s /etc/hostname "$MOCK_MUTATE_PATH"
      else
        printf 'mutated-after-verify\n' >> "$MOCK_MUTATE_PATH"
      fi
    fi
    exit 0 ;;
  image)
    case "${2:-}" in
      exists)
        [ "${MOCK_NO_PREV_IMAGE:-0}" = "1" ] && exit 1
        img_id "${3:-}" >/dev/null && exit 0
        exit 1 ;;
      inspect)
        case "$*" in
          *'{{.Os}}'*) printf '%s\n' "${MOCK_IMAGE_PLATFORM:-linux/amd64}"; exit 0 ;;
        esac
        tag="${@: -1}"
        id=$(img_id "$tag") || exit 125
        printf '%s\n' "$id"
        exit 0 ;;
    esac
    exit 0 ;;
  load)
    [ "${MOCK_LOAD_FAIL:-0}" = "1" ] && exit 1
    lid="${MOCK_LOAD_ID:-img-prebuilt}"
    set_img "$lid" "$lid"
    printf 'Loaded image(s): %s\n' "$lid"
    exit 0 ;;
  tag)
    id=$(img_id "${2:-}") || exit 125
    [ "${MOCK_ID_DRIFT:-0}" = "1" ] && id="img-drifted"
    set_img "${3:-}" "$id"
    exit 0 ;;
  run)
    tag="${@: -1}"
    printf '%s\n' "$tag" > "$S/last_run_image"
    fail=0
    [ "${MOCK_RUN_FAIL:-0}" = "1" ] && fail=1
    if [ -n "${MOCK_RUN_FAIL_FOR:-}" ]; then case "$tag" in *"$MOCK_RUN_FAIL_FOR"*) fail=1 ;; esac; fi
    [ "$fail" = "1" ] && exit 1
    echo mock-container-id
    exit 0 ;;
  ps)
    n=$(cat "$S/ps_count" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$S/ps_count"
    if [ -n "${MOCK_PS_ALIVE_COUNT:-}" ] && [ "$n" -gt "$MOCK_PS_ALIVE_COUNT" ]; then exit 0; fi
    echo running
    exit 0 ;;
  *) exit 0 ;;
esac
EOF

cat > "$WORK/bin/curl" <<'EOF'
#!/usr/bin/env bash
{ printf 'curl'; for a in "$@"; do printf ' %s' "$a"; done; printf '\n'; } >> "$CURL_LOG"
S="$PODMAN_STATE"; mkdir -p "$S"
last=$(cat "$S/last_run_image" 2>/dev/null || true)
mode=""
if [ -n "${MOCK_HTTP_FAIL_FOR:-}" ] && [ -n "$last" ]; then
  case "$last" in *"$MOCK_HTTP_FAIL_FOR"*) mode="${MOCK_HTTP_MODE:-conn}" ;; esac
fi
[ "${MOCK_HTTP_FAIL_ALL:-0}" = "1" ] && mode="conn"
case "$mode" in
  conn)    exit 22 ;;
  code302) printf '%s\n302' '<html>redirect</html>'; exit 0 ;;
  nohtml)  printf '%s\n200' 'plain text'; exit 0 ;;
  *)       printf '%s\n200' '<!DOCTYPE html><html><body>ok</body></html>'; exit 0 ;;
esac
EOF

cat > "$WORK/bin/sleep" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

# Forbidden in this suite: any real transfer/remote-exec tool. If the
# deployment script ever invoked one, the run would fail loudly below.
for f in ssh scp rsync; do
  cat > "$WORK/bin/$f" <<'EOF'
#!/usr/bin/env bash
{ printf 'FORBIDDEN'; for a in "$@"; do printf ' %s' "$a"; done; printf '\n'; } >> "$FORBIDDEN_LOG"
exit 1
EOF
done

chmod +x "$WORK/bin/podman" "$WORK/bin/curl" "$WORK/bin/sleep" "$WORK/bin/ssh" "$WORK/bin/scp" "$WORK/bin/rsync"

# ---- helpers -----------------------------------------------
ok()   { PASS=$((PASS+1)); echo "ok - $1"; }
bad()  { FAIL=$((FAIL+1)); echo "NOT OK - $1"; }

log_has()   { if grep -qF -- "$2" "$WORK/podman.log"; then ok "$1"; else bad "$1"; fi; }
log_lacks() { if grep -qF -- "$2" "$WORK/podman.log"; then bad "$1"; else ok "$1"; fi; }
out_has()   { if grep -qF -- "$2" "$WORK/out.txt"; then ok "$1"; else bad "$1"; fi; }
out_lacks() { if grep -qF -- "$2" "$WORK/out.txt"; then bad "$1"; else ok "$1"; fi; }
log_empty() { if [ -s "$WORK/podman.log" ]; then bad "$1"; else ok "$1"; fi; }

img_of() { awk -v t="$1" '$1==t{print $2}' "$STATE/images" 2>/dev/null; }

assert_img() {
  # assert_img <tag> <expected-image-id> <desc> — asserts IMAGE IDENTITY,
  # not merely that a 'podman tag' call happened.
  local got
  got=$(img_of "$1")
  if [ "$got" = "$2" ]; then ok "$3"; else bad "$3 (image id: expected $2, got ${got:-<none>})"; fi
}

snap_hashes() {
  # fixture hashes, recorded out-of-band exactly as the runbook prescribes
  local d=${1:-$SNAP}
  SEL_SHA=$(sha256sum "$d/frontend/components/LogSourceSelector.tsx" | awk '{print $1}')
  MAN_SHA=$(sha256sum "$d/SNAPSHOT.sha256" | awk '{print $1}')
}

run_deploy() {
  # usage: run_deploy <expected_rc> [VAR=VAL ...]
  local expect=$1; shift
  : > "$WORK/podman.log"; : > "$WORK/curl.log"; : > "$WORK/out.txt"; : > "$WORK/forbidden.log"
  rm -rf "$STATE"; mkdir -p "$STATE"
  printf 'localhost/spc-dtr-web:latest img-original\n' > "$STATE/images"
  if [ -n "${TEST_SEED_IMAGES:-}" ]; then
    for pair in $TEST_SEED_IMAGES; do
      printf '%s %s\n' "${pair%%=*}" "${pair#*=}" >> "$STATE/images"
    done
    TEST_SEED_IMAGES=""
  fi
  env PATH="$WORK/bin:$PATH" PODMAN_LOG="$WORK/podman.log" CURL_LOG="$WORK/curl.log" \
    PODMAN_STATE="$STATE" FORBIDDEN_LOG="$WORK/forbidden.log" \
    "$@" bash "$DEPLOY" > "$WORK/out.txt" 2>&1
  RC=$?
  if [ "$RC" = "$expect" ]; then ok "exit code $expect"; else
    bad "exit code $expect (got $RC)"
    sed 's/^/    | /' "$WORK/out.txt"
  fi
  if [ -s "$WORK/forbidden.log" ]; then
    bad "no ssh/scp/rsync operations were invoked"
    sed 's/^/    | /' "$WORK/forbidden.log"
  else
    ok "no ssh/scp/rsync operations were invoked"
  fi
}

make_snapshot() {
  # $1 = snapshot dir; manifest excludes the approved change file,
  # mirroring deploy/WEB_ONLY-runbook.md
  rm -rf "$1"
  mkdir -p "$1/frontend/components" "$1/backend"
  echo 'pkg'  > "$1/frontend/package.json"
  echo 'lock' > "$1/frontend/package-lock.json"
  echo 'FROM node' > "$1/frontend/Containerfile"
  echo 'FROM node' > "$1/backend/Containerfile"
  cat > "$1/frontend/components/LogSourceSelector.tsx" <<'EOF'
const OPTIONS = [
  { value: "both", label: "Both / Summary" },
  { value: "online", label: "Online DTR" },
  { value: "biometrics", label: "Biometrics" },
];
EOF
  (cd "$1" && find . -type f ! -name 'SNAPSHOT.sha256' \
    ! -path './frontend/components/LogSourceSelector.tsx' -print0 \
    | sort -z | xargs -0 sha256sum > SNAPSHOT.sha256)
}

SNAP="$WORK/snap"

# ---- t0: scripts parse -------------------------------------
if bash -n "$DEPLOY" 2>/dev/null; then ok "deploy-dtr.sh passes bash -n"; else bad "deploy-dtr.sh passes bash -n"; fi
if bash -n "$0" 2>/dev/null; then ok "test suite passes bash -n"; else bad "test suite passes bash -n"; fi

# ---- t1: default mode = original deployment behavior --------
make_snapshot "$SNAP"
cat > "$WORK/expected-default.log" <<'EOF'
podman build -t localhost/spc-dtr-api:latest -f /srv/apps/smart-school/dtr/src/backend/Containerfile /srv/apps/smart-school/dtr/src/backend
podman build -t localhost/spc-dtr-web:latest --build-arg NEXT_PUBLIC_BASE_PATH=/dtr --build-arg NEXT_PUBLIC_API_URL=/dtr/api -f /srv/apps/smart-school/dtr/src/frontend/Containerfile /srv/apps/smart-school/dtr/src/frontend
podman rm -f ss-dtr-api ss-dtr-web
podman run -d --name ss-dtr-api --network smart-school -p 2004:5000 --env-file /srv/apps/smart-school/env/dtr-api.env -v /srv/apps/smart-school/dtr/sync-state:/app/sync-state --restart unless-stopped localhost/spc-dtr-api:latest
podman run -d --name ss-dtr-web --network smart-school -p 2003:3000 --restart unless-stopped localhost/spc-dtr-web:latest
podman exec ss-caddy caddy reload --config /etc/caddy/Caddyfile
podman ps --filter name=ss-dtr --format {{.Names}} | {{.Status}} | {{.Ports}}
EOF
echo "# t1 — default mode preserves the original deployment behavior (golden log)"
run_deploy 0
if diff -u "$WORK/expected-default.log" "$WORK/podman.log" > "$WORK/golden.diff" 2>&1; then
  ok "default-mode podman sequence matches golden exactly"
else
  bad "default-mode podman sequence matches golden exactly"
  sed 's/^/    | /' "$WORK/golden.diff"
fi

# ---- t2: WEB_ONLY builds/recreates web only -----------------
echo "# t2 — WEB_ONLY=1 never touches ss-dtr-api, DB, Caddy or tunnel"
make_snapshot "$SNAP"; snap_hashes
run_deploy 0 WEB_ONLY=1 SRC="$SNAP" \
  EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test
log_has   "web-only builds web image with established build args" \
  "podman build -t localhost/spc-dtr-web:latest --build-arg NEXT_PUBLIC_BASE_PATH=/dtr --build-arg NEXT_PUBLIC_API_URL=/dtr/api"
out_has   "rollback image preserved before build" "preserved known-good web image as localhost/spc-dtr-web:rollback-test"
out_has   "original/rollback image identity verified" "verified identical before any build"
assert_img "localhost/spc-dtr-web:rollback-test" "img-original" "rollback tag retains the exact original image ID"
assert_img "localhost/spc-dtr-web:latest" "img-build-1" "new image built under the primary tag"
log_has   "web-only recreates only ss-dtr-web" "podman rm -f ss-dtr-web"
log_has   "web-only runtime args/network/port preserved" \
  "podman run -d --name ss-dtr-web --network smart-school -p 2003:3000 --restart unless-stopped localhost/spc-dtr-web:latest"
out_has   "deploy reports success with image identity" "WEB_ONLY: done."
out_has   "snapshot re-verified before container swap" "re-verifying snapshot before container swap"
for term in ss-dtr-api ss-mysql ss-caddy caddy mysql env-file tunnel cloudflared; do
  log_lacks "web-only performs no '$term' operation" "$term"
done

# ---- t3: missing/unverified inputs = safe refusal -----------
echo "# t3 — missing or unverified inputs are refused (no podman calls)"
run_deploy 1 WEB_ONLY=1
out_has   "refuses without explicit SRC" "explicitly identified source snapshot"
log_empty "no podman calls without explicit SRC"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP"
out_has   "refuses without EXPECTED_SELECTOR_SHA256" "requires EXPECTED_SELECTOR_SHA256"
log_empty "no podman calls without selector hash pin"

run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA"
out_has   "refuses without EXPECTED_MANIFEST_SHA256" "requires EXPECTED_MANIFEST_SHA256"
log_empty "no podman calls without manifest hash pin"

make_snapshot "$SNAP"; snap_hashes
rm "$SNAP/frontend/components/LogSourceSelector.tsx"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses when approved selector is missing" "approved change file missing"
log_empty "no podman calls when selector is missing"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256=deadbeef EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses changed (unapproved) selector content" "approved file content mismatch"
log_empty "no podman calls on selector content mismatch"

make_snapshot "$SNAP"; snap_hashes
rm "$SNAP/SNAPSHOT.sha256"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses without snapshot manifest" "snapshot manifest not found"
log_empty "no podman calls without manifest"

make_snapshot "$SNAP"
echo '0000000000000000000000000000000000000000000000000000000000000000  ./frontend/components/LogSourceSelector.tsx' >> "$SNAP/SNAPSHOT.sha256"
snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses manifest covering the approved change file" "manifest must exclude the approved change file"
log_empty "no podman calls when manifest covers the approved file"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" \
  EXPECTED_MANIFEST_SHA256=0000000000000000000000000000000000000000000000000000000000000000
out_has   "refuses manifest not matching the out-of-band pin" "manifest hash mismatch"
log_empty "no podman calls on manifest pin mismatch"

make_snapshot "$SNAP"; snap_hashes
echo 'tampered' >> "$SNAP/frontend/package.json"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses tampered snapshot content" "checksum verification"
log_empty "no podman calls on checksum failure"

make_snapshot "$SNAP"; snap_hashes
echo 'unmanifested' > "$SNAP/frontend/extra.js"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses unmanifested build-context files" "inventory does not match the manifest"
log_empty "no podman calls on inventory mismatch"

make_snapshot "$SNAP"; snap_hashes
touch "$SNAP/.git"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses snapshot containing a .git file" "Git working tree"
log_empty "no podman calls on .git file refusal"

mkdir -p "$WORK/gitparent/.git"
make_snapshot "$WORK/gitparent/snap"; snap_hashes "$WORK/gitparent/snap"
run_deploy 1 WEB_ONLY=1 SRC="$WORK/gitparent/snap" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses snapshot inside a parent Git worktree" "Git working tree"
log_empty "no podman calls on parent worktree refusal"

# ---- t4: rollback-image preservation (identity, not just a tag call) ----
echo "# t4 — rollback image preservation and build-failure safety"
make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_BUILD_FAIL=1
out_has   "build failure is reported" "web image build failed"
log_lacks "no web container removal after build failure" "rm -f ss-dtr-web"
log_lacks "no web container recreation after build failure" "run -d --name ss-dtr-web"
assert_img "localhost/spc-dtr-web:latest" "img-original" "build failure leaves the original web image intact"
assert_img "localhost/spc-dtr-web:rollback-test" "img-original" "rollback tag retains the exact original image ID after build failure"

TEST_SEED_IMAGES="localhost/spc-dtr-web:rollback-test=img-older-known-good"
make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test
out_has   "refuses to overwrite an existing rollback tag" "refusing to overwrite a known-good image"
assert_img "localhost/spc-dtr-web:rollback-test" "img-older-known-good" "existing known-good rollback image is never overwritten"
log_lacks "no build attempted when rollback tag exists" "podman build"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" MOCK_NO_PREV_IMAGE=1
out_has   "refuses when no previous image exists to preserve" "no existing web image"
log_lacks "no build attempted without a preserved image" "podman build"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_ID_DRIFT=1
out_has   "refuses when rollback image identity cannot be verified" "rollback image identity mismatch"
log_lacks "no container removal on identity mismatch" "rm -f ss-dtr-web"
log_lacks "no container recreation on identity mismatch" "run -d --name ss-dtr-web"

# ---- t5: failure handling and verified rollback -------------
echo "# t5 — failure paths roll back to the original image and report honestly"
make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_RUN_FAIL_FOR=:latest
out_has   "run failure triggers rollback" "new container failed to start"
out_has   "rollback verified healthy after run failure" "rollback verified healthy"
assert_img "localhost/spc-dtr-web:rollback-test" "img-original" "rollback serves the exact original image ID after run failure"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_HTTP_FAIL_FOR=:latest
out_has   "health failure triggers rollback" "new container failed the health probe"
out_has   "rollback verified healthy after health failure" "rollback verified healthy"
assert_img "localhost/spc-dtr-web:rollback-test" "img-original" "health failure restores the original image ID"
log_has   "rollback container run with preserved image" \
  "podman run -d --name ss-dtr-web --network smart-school -p 2003:3000 --restart unless-stopped localhost/spc-dtr-web:rollback-test"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_HTTP_FAIL_FOR=:latest MOCK_HTTP_MODE=code302
out_has   "non-200 response is treated as unhealthy" "new container failed the health probe"
out_has   "rollback verified healthy after non-200 response" "rollback verified healthy"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_HTTP_FAIL_FOR=:latest MOCK_HTTP_MODE=nohtml
out_has   "non-HTML body is treated as unhealthy" "new container failed the health probe"
out_has   "rollback verified healthy after non-HTML body" "rollback verified healthy"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_PS_ALIVE_COUNT=1
out_has   "post-probe liveness failure is detected" "not running after the health probe"
out_has   "manual recovery reported when rollback is unhealthy" "manual recovery required"
out_lacks "no success claim when the container died after the probe" "rollback verified healthy"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_HTTP_FAIL_ALL=1
out_has   "manual recovery reported when rollback is not healthy" "manual recovery required"
out_lacks "no success claim when rollback is not healthy" "rollback verified healthy"
out_lacks "no done claim when rollback is not healthy" "WEB_ONLY: done."

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_HTTP_FAIL_FOR=:latest MOCK_RUN_FAIL_FOR=:rollback
out_has   "failed rollback start reported accurately" "manual recovery required"
out_lacks "no success claim after failed rollback start" "rollback verified healthy"

# ---- t6: established runtime args preserved in both modes ---
echo "# t6 — established runtime arguments preserved"
make_snapshot "$SNAP"; snap_hashes
run_deploy 0 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
log_has "web-only run line is byte-identical to standard mode" \
  "podman run -d --name ss-dtr-web --network smart-school -p 2003:3000 --restart unless-stopped localhost/spc-dtr-web:latest"

# ---- t7: no secrets in any output ---------------------------
echo "# t7 — no secret values are logged"
make_snapshot "$SNAP"; snap_hashes
run_deploy 0 DTR_API_SECRET=SECRET_MARKER_7f3a
out_lacks "standard mode logs no secret values" "SECRET_MARKER_7f3a"
log_lacks "standard mode podman args leak no secrets" "SECRET_MARKER_7f3a"
run_deploy 0 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  DTR_API_SECRET=SECRET_MARKER_7f3a
out_lacks "web-only mode logs no secret values" "SECRET_MARKER_7f3a"
log_lacks "web-only mode podman args leak no secrets" "SECRET_MARKER_7f3a"

# ---- t8: approved file pin and option order -----------------
echo "# t8 — approved selector file matches the reviewed change"
if [ "$(sha256sum "$REPO_ROOT/frontend/components/LogSourceSelector.tsx" | awk '{print $1}')" = "$APPROVED_SELECTOR_SHA256" ]; then
  ok "repo selector file matches the reviewed SHA-256 (unchanged)"
else
  bad "repo selector file matches the reviewed SHA-256 (unchanged)"
fi
order=$(grep -o 'value: "[a-z]*"' "$REPO_ROOT/frontend/components/LogSourceSelector.tsx" | tr '\n' ' ')
if [ "$order" = 'value: "both" value: "online" value: "biometrics" ' ]; then
  ok "option order is Both / Summary, Online DTR, Biometrics"
else
  bad "option order is Both / Summary, Online DTR, Biometrics (got: $order)"
fi
for p in frontend/app/dashboard/logs/page.tsx frontend/app/dashboard/monthly/page.tsx \
         frontend/app/admin/departments/page.tsx 'frontend/app/admin/departments/[id]/page.tsx'; do
  if grep -q 'useState<SourceMode>("online")' "$REPO_ROOT/$p"; then
    ok "default source remains online in $p"
  else
    bad "default source remains online in $p"
  fi
done

# ---- t9: symlink, special-file and manifest-entry hardening --
echo "# t9 — symlinks, special files and hostile manifest entries are refused"

make_snapshot "$SNAP"; snap_hashes
ln -s /etc/passwd "$SNAP/frontend/link"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects an unexpected symlink" "non-regular entries"
log_empty "no podman calls on symlink rejection"

make_snapshot "$SNAP"; snap_hashes
ln -s / "$SNAP/frontend/outside"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects a symlink targeting outside the snapshot" "non-regular entries"
log_empty "no podman calls on outside-target symlink rejection"

make_snapshot "$SNAP"; snap_hashes
rm "$SNAP/frontend/package.json"
ln -s ../backend/Containerfile "$SNAP/frontend/package.json"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects a symlink replacing an expected regular file" "non-regular entries"
log_empty "no podman calls on file-replacing symlink rejection"

make_snapshot "$SNAP"; snap_hashes
ln -s ../../../etc "$SNAP/frontend/components/nested"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects a nested symlink" "non-regular entries"
log_empty "no podman calls on nested symlink rejection"

make_snapshot "$SNAP"; snap_hashes
mkfifo "$SNAP/frontend/afifo"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects a FIFO" "non-regular entries"
log_empty "no podman calls on FIFO rejection"

make_snapshot "$SNAP"; snap_hashes
if command -v python3 >/dev/null 2>&1 && \
   python3 -c 'import socket,sys; s=socket.socket(socket.AF_UNIX); s.bind(sys.argv[1])' "$SNAP/frontend/asock" 2>/dev/null; then
  run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
  out_has   "rejects a unix socket" "non-regular entries"
  log_empty "no podman calls on socket rejection"
else
  echo "skip - unix socket creation unsupported on this platform"
fi

make_snapshot "$SNAP"; snap_hashes
if mknod "$SNAP/frontend/ablk" b 7 200 2>/dev/null; then
  run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
  out_has   "rejects a device node" "non-regular entries"
  log_empty "no podman calls on device-node rejection"
else
  echo "skip - device node creation requires elevated privileges"
fi

make_snapshot "$SNAP"; snap_hashes
rm "$SNAP/backend/Containerfile"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects a missing manifest-listed file" "inventory does not match the manifest"
log_empty "no podman calls on missing-file rejection"

make_snapshot "$SNAP"
echo 'this-is-not-a-manifest-line' >> "$SNAP/SNAPSHOT.sha256"
snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects a malformed manifest entry" "empty or malformed entries"
log_empty "no podman calls on malformed-entry rejection"

make_snapshot "$SNAP"
echo '0000000000000000000000000000000000000000000000000000000000000000  ./frontend/package.json' >> "$SNAP/SNAPSHOT.sha256"
snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects duplicate manifest entries" "duplicate entries"
log_empty "no podman calls on duplicate-entry rejection"

make_snapshot "$SNAP"
echo '0000000000000000000000000000000000000000000000000000000000000000  ../escape.txt' >> "$SNAP/SNAPSHOT.sha256"
snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects path-traversing manifest entries" "traverses outside the snapshot"
log_empty "no podman calls on traversal-entry rejection"

make_snapshot "$SNAP"
echo '0000000000000000000000000000000000000000000000000000000000000000  /etc/passwd' >> "$SNAP/SNAPSHOT.sha256"
snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "rejects absolute manifest entries" "absolute or escaped"
log_empty "no podman calls on absolute-entry rejection"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  MOCK_MUTATE_PATH="$SNAP/SNAPSHOT.sha256"
out_has   "re-verification catches post-verify manifest replacement" "snapshot changed after verification"
log_lacks "no container swap after post-verify replacement" "rm -f ss-dtr-web"
log_lacks "no container run after post-verify replacement" "run -d --name ss-dtr-web"

# ---- t10: manifest path handling (symlink-ordering regressions) ----
echo "# t10 — manifest path validation happens before canonicalisation"

make_snapshot "$SNAP"; snap_hashes
ln -s "$SNAP/SNAPSHOT.sha256" "$WORK/manifest.link"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  SNAPSHOT_MANIFEST="$WORK/manifest.link"
out_has   "refuses a manifest supplied through a symlink (external override)" "not a symbolic link"
log_empty "no podman calls on external symlinked-manifest rejection"

make_snapshot "$SNAP"; snap_hashes
rm "$SNAP/SNAPSHOT.sha256"
ln -s "$WORK/does-not-exist" "$SNAP/SNAPSHOT.sha256"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses an in-snapshot symlinked manifest (even dangling)" "not a symbolic link"
log_empty "no podman calls on in-snapshot symlinked-manifest rejection"

make_snapshot "$SNAP"; snap_hashes
mkdir -p "$WORK/evil"; cp "$SNAP/SNAPSHOT.sha256" "$WORK/evil/SNAPSHOT.sha256"
ln -s "$WORK/evil" "$SNAP/mfdir"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  SNAPSHOT_MANIFEST="$SNAP/mfdir/SNAPSHOT.sha256"
out_has   "refuses a manifest escaping via a symlinked directory" "resolves outside the snapshot"
log_empty "no podman calls on symlinked-directory escape"

make_snapshot "$SNAP"; snap_hashes
mkdir -p "$WORK/evil2"; cp "$SNAP/SNAPSHOT.sha256" "$WORK/evil2/SNAPSHOT.sha256"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  SNAPSHOT_MANIFEST="$SNAP/../evil2/SNAPSHOT.sha256"
out_has   "refuses a manifest path escaping via .." "resolves outside the snapshot"
log_empty "no podman calls on .. escape"

make_snapshot "$SNAP"; snap_hashes
mv "$SNAP/SNAPSHOT.sha256" "$WORK/ext-manifest.sha256"
run_deploy 0 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  SNAPSHOT_MANIFEST="$WORK/ext-manifest.sha256"
out_has   "regular external manifest at an allowed path is accepted" "WEB_ONLY: done."

make_snapshot "$SNAP"; snap_hashes
chmod 000 "$SNAP/SNAPSHOT.sha256"
if [ ! -r "$SNAP/SNAPSHOT.sha256" ]; then
  run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
  out_has   "refuses an unreadable manifest" "not readable"
  log_empty "no podman calls on unreadable-manifest rejection"
else
  echo "skip - privileges ignore file modes on this platform"
fi

make_snapshot "$SNAP"; snap_hashes
rm "$SNAP/SNAPSHOT.sha256"
mkfifo "$SNAP/SNAPSHOT.sha256"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA"
out_has   "refuses a non-regular (FIFO) manifest" "not a regular file"
log_empty "no podman calls on FIFO-manifest rejection"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  MOCK_MUTATE_PATH="$SNAP/SNAPSHOT.sha256" MOCK_MUTATE_MODE=symlink
out_has   "re-verification catches a manifest replaced by a symlink mid-run" "snapshot changed after verification"
log_lacks "no container swap after manifest symlink swap" "rm -f ss-dtr-web"
log_lacks "no container run after manifest symlink swap" "run -d --name ss-dtr-web"

# ---- t11: prebuilt WEB_ONLY mode (M.82 design) ----------------
echo "# t11 — WEB_PREBUILT=1 imports a pinned image and never builds"

make_snapshot "$SNAP"; snap_hashes
: > "$WORK/web-image.tar"
run_deploy 0 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE="$WORK/web-image.tar" EXPECTED_IMAGE_ID=img-prebuilt \
  WEB_TMPDIR="$WORK/tmp83" WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test
log_has   "prebuilt mode imports the archive" "podman load -i $WORK/web-image.tar"
log_lacks "prebuilt mode never builds" "podman build"
log_lacks "prebuilt mode never touches the API" "ss-dtr-api"
log_has   "imported image staged under the web tag" "podman tag img-prebuilt localhost/spc-dtr-web:latest"
out_has   "prebuilt deploy completes" "WEB_ONLY: done."
assert_img "localhost/spc-dtr-web:latest" "img-prebuilt" "web tag serves the pinned prebuilt image ID"
assert_img "localhost/spc-dtr-web:rollback-test" "img-original" "rollback tag still holds the original image ID"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 EXPECTED_IMAGE_ID=img-prebuilt WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test
out_has   "refuses prebuilt mode without archive+ID pin" "requires WEB_IMAGE_ARCHIVE and EXPECTED_IMAGE_ID"
log_lacks "no import attempted without required env" "podman load"
log_lacks "no container swap without required env" "rm -f ss-dtr-web"

make_snapshot "$SNAP"; snap_hashes
: > "$WORK/web-image.tar"
ln -s "$WORK/web-image.tar" "$WORK/web-image-link.tar"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE="$WORK/web-image-link.tar" EXPECTED_IMAGE_ID=img-prebuilt \
  WEB_TMPDIR="$WORK/tmp83" WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test
out_has   "refuses a symlinked image archive" "not a symbolic link"
log_lacks "no import of a symlinked archive" "podman load"

make_snapshot "$SNAP"; snap_hashes
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE="$WORK/missing.tar" EXPECTED_IMAGE_ID=img-prebuilt \
  WEB_TMPDIR="$WORK/tmp83" WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test
out_has   "refuses a missing image archive" "image archive must be a regular file"
log_lacks "no import of a missing archive" "podman load"

make_snapshot "$SNAP"; snap_hashes
: > "$WORK/web-image.tar"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE="$WORK/web-image.tar" EXPECTED_IMAGE_ID=img-prebuilt \
  WEB_TMPDIR=/proc/webonly-nope WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test
out_has   "refuses an unusable designated temp root" "temp root is not usable"
log_lacks "no import through an affected filesystem" "podman load"

make_snapshot "$SNAP"; snap_hashes
: > "$WORK/web-image.tar"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE="$WORK/web-image.tar" EXPECTED_IMAGE_ID=img-prebuilt \
  WEB_TMPDIR="$WORK/tmp83" WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_LOAD_FAIL=1
out_has   "reports import failure without touching the container" "image import failed"
log_lacks "no container removal after failed import" "rm -f ss-dtr-web"
log_lacks "no container run after failed import" "run -d --name ss-dtr-web"
assert_img "localhost/spc-dtr-web:latest" "img-original" "web image intact after failed import"
assert_img "localhost/spc-dtr-web:rollback-test" "img-original" "rollback tag intact after failed import"

make_snapshot "$SNAP"; snap_hashes
: > "$WORK/web-image.tar"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE="$WORK/web-image.tar" EXPECTED_IMAGE_ID=img-prebuilt \
  WEB_TMPDIR="$WORK/tmp83" WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_LOAD_ID=img-OTHER
out_has   "refuses an image whose ID does not match the pin" "imported image ID mismatch"
log_lacks "no container removal on ID mismatch" "rm -f ss-dtr-web"
log_lacks "no container run on ID mismatch" "run -d --name ss-dtr-web"

make_snapshot "$SNAP"; snap_hashes
: > "$WORK/web-image.tar"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE="$WORK/web-image.tar" EXPECTED_IMAGE_ID=img-prebuilt \
  WEB_TMPDIR="$WORK/tmp83" WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_IMAGE_PLATFORM=linux/arm64
out_has   "refuses an image with the wrong platform" "linux/arm64"
log_lacks "no container removal on platform mismatch" "rm -f ss-dtr-web"

make_snapshot "$SNAP"; snap_hashes
: > "$WORK/web-image.tar"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE="$WORK/web-image.tar" EXPECTED_IMAGE_ID=img-prebuilt \
  WEB_TMPDIR="$WORK/tmp83" WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_RUN_FAIL_FOR=:latest
out_has   "prebuilt run failure rolls back to the original image" "rollback verified healthy"
assert_img "localhost/spc-dtr-web:rollback-test" "img-original" "rollback serves the original image after prebuilt run failure"

make_snapshot "$SNAP"; snap_hashes
: > "$WORK/web-image.tar"
run_deploy 1 WEB_ONLY=1 SRC="$SNAP" EXPECTED_SELECTOR_SHA256="$SEL_SHA" EXPECTED_MANIFEST_SHA256="$MAN_SHA" \
  WEB_PREBUILT=1 WEB_IMAGE_ARCHIVE="$WORK/web-image.tar" EXPECTED_IMAGE_ID=img-prebuilt \
  WEB_TMPDIR="$WORK/tmp83" WEB_ROLLBACK_IMAGE=localhost/spc-dtr-web:rollback-test MOCK_HTTP_FAIL_ALL=1
out_has   "prebuilt health failure reports manual recovery when rollback is unhealthy" "manual recovery required"
out_lacks "no success claim when rollback is unhealthy (prebuilt)" "WEB_ONLY: done."

# ---- summary -----------------------------------------------
echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" = "0" ]
