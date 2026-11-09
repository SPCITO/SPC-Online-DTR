# WEB_ONLY Deployment Runbook — `ss-dtr-web` only

Scope: deploy **only** the approved `frontend/components/LogSourceSelector.tsx`
change (selector order **Both / Summary → Online DTR → Biometrics**, default
`online`) to `ss-dtr-web`, without touching `ss-dtr-api`, `ss-mysql`, Caddy,
Cloudflare Tunnel, environment files, or any database state.

**The only file allowed to differ from the captured baseline is
`frontend/components/LogSourceSelector.tsx`.** The deployment script refuses
any other altered or unmanifested file.

Mode flag: `WEB_ONLY=1`. When unset, `deploy-dtr.sh` behaves exactly as before.

## Integrity model (read first)

Digest classes — never conflated:

1. **Computed digests** — values the script derives from the snapshot at run
   time (`actual_selector`, `actual_manifest`). Evidence only.
2. **Trusted expected digests** — `EXPECTED_SELECTOR_SHA256` (approved file,
   recorded at review time) and `EXPECTED_MANIFEST_SHA256` (manifest, recorded
   at capture time **before** the approved file is copied in), supplied
   out-of-band in the change ticket / review notes, never inside the
   snapshot. These are the **only** authenticity anchors.
3. **Self-consistent data** — a manifest that matches its own files but has no
   independent pin proves nothing about provenance and is refused by policy.

The script fails closed when any trusted value is absent or inconsistent.

**File-type policy:** only regular files and directories are allowed anywhere
in the snapshot. Symbolic links are enumerated (never followed) and rejected,
as are FIFOs, sockets and device nodes. Manifest entries must be well-formed
`<sha256> <path>` lines with relative, non-traversing, non-duplicated paths;
the full file inventory must match the manifest exactly. This covers every
file entering the frontend build context.

**Manifest path policy:** the manifest is validated at its *supplied* path
before any canonicalisation — a symlink there is refused outright, including
for `SNAPSHOT_MANIFEST` overrides (`realpath` would resolve and hide it). It
must be a readable regular file; a supplied path under the snapshot must
*resolve* under the snapshot (no `..` or symlinked-directory escape); and its
resolved location must not change between the pre-build and pre-swap
verifications. An explicitly external `SNAPSHOT_MANIFEST` (supported custody
workflow — e.g. the manifest kept beside the snapshot instead of inside it)
remains allowed; its authenticity is anchored solely by
`EXPECTED_MANIFEST_SHA256`.

**Residual limitation:** verification and the later container swap are not an
atomic transaction. The script re-verifies the entire snapshot immediately
before the swap to narrow the replacement window, but concurrent write access
to the snapshot during the run cannot be fully excluded by shell alone — keep
the snapshot directory under exclusive operator control.

Approved selector content hash (recorded at review):

```
490389232a4765c57454ed5b8df036b57b0505cf57cc6039a5876a83c1715093  frontend/components/LogSourceSelector.tsx
```

---

## Part A — Local preparation (dev machine; no production access needed)

1. Run the focused test suite (mocked podman/curl; nothing is built or run):
   ```bash
   bash tests/deploy/test-deploy-dtr.sh
   ```
2. Run `bash -n deploy/deploy-dtr.sh` and frontend lint/build checks.
3. Record the approved selector hash (must equal the value above):
   ```bash
   sha256sum frontend/components/LogSourceSelector.tsx
   ```
4. Place the approved `LogSourceSelector.tsx` and the patched `deploy-dtr.sh`
   in a staging area for the operator. The patched script must end up on the
   host **outside** the source snapshot.

## Part B — Production operator actions (spcwebhost)

Prerequisites: `podman`, `curl`, `sha256sum`, `realpath`, `find`, `sort`,
`diff`, `sed`, `awk`, `grep`, `mktemp`, `date` on the host.

1. **Capture the production-true snapshot** (never a local Git checkout or
   `HEAD f36d597`):
   ```bash
   cp -a /srv/apps/smart-school/dtr/src /srv/apps/smart-school/dtr/src-snapshot-YYYYMMDD-HHMM
   ```
2. **Generate the manifest** (baseline inventory; excludes the approved file
   and the manifest itself):
   ```bash
   cd /srv/apps/smart-school/dtr/src-snapshot-YYYYMMDD-HHMM && \
     find . -type f ! -name 'SNAPSHOT.sha256' \
       ! -path './frontend/components/LogSourceSelector.tsx' -print0 \
       | sort -z | xargs -0 sha256sum > SNAPSHOT.sha256
   ```
3. **Record the manifest hash out-of-band** (ticket/notes outside the
   snapshot), then copy **only** `frontend/components/LogSourceSelector.tsx`
   into the snapshot:
   ```bash
   sha256sum SNAPSHOT.sha256          # record this value as EXPECTED_MANIFEST_SHA256
   ```
4. **Deploy** (build args are fixed in the script and match the established
   deployment; the script preserves and identity-verifies the current web
   image under a fresh rollback tag **before** any build):
   ```bash
   WEB_ONLY=1 SRC=/srv/apps/smart-school/dtr/src-snapshot-YYYYMMDD-HHMM \
     EXPECTED_SELECTOR_SHA256=490389232a4765c57454ed5b8df036b57b0505cf57cc6039a5876a83c1715093 \
     EXPECTED_MANIFEST_SHA256=<hash recorded in step 3> \
     bash /srv/apps/smart-school/dtr/deploy-dtr-webonly.sh
   ```
   Optional overrides: `BASE_PATH` (default `/dtr`), `WEB_ROLLBACK_IMAGE`
   (default `localhost/spc-dtr-web:rollback-<UTC timestamp>`; the script
   refuses to reuse an existing tag), `SNAPSHOT_MANIFEST`.

## Prebuilt WEB_ONLY mode (host cannot build)

When the host cannot run `podman build` (e.g. a read-only filesystem blocks
build staging), a reviewed prebuilt-image path is available. Interface
(additive; normal WEB_ONLY is unchanged):

```bash
WEB_ONLY=1 WEB_PREBUILT=1 \
  SRC=/srv/apps/smart-school/dtr/src-snapshot-YYYYMMDD-HHMM \
  EXPECTED_SELECTOR_SHA256=<approved selector hash> \
  EXPECTED_MANIFEST_SHA256=<manifest hash recorded at capture> \
  WEB_IMAGE_ARCHIVE=/srv/apps/smart-school/dtr/web-image.tar \
  EXPECTED_IMAGE_ID=<image id recorded at build time> \
  bash /srv/apps/smart-school/dtr/deploy-dtr-webonly.sh
```

Optional: `WEB_TMPDIR=<dir>` (default `/srv/apps/smart-school/dtr/tmp`) — the
designated import-staging root. It must be on a healthy volume; the script
creates and writability-probes it and refuses to import through an affected
filesystem.

Build recipe (healthy authorized machine, from the verified snapshot):

```bash
podman build -t spc-dtr-web-m83:prebuilt \
  --build-arg NEXT_PUBLIC_BASE_PATH=/dtr \
  --build-arg NEXT_PUBLIC_API_URL=/dtr/api \
  -f <snapshot>/frontend/Containerfile <snapshot>/frontend
podman save --compress -o web-image.tar spc-dtr-web-m83:prebuilt
podman image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' spc-dtr-web-m83:prebuilt   # record both
```

Transfer the archive to `/srv` (healthy volume), verify its `sha256sum`
matches the recorded value, then run the command above.

Fail-closed conditions (all before any container operation): missing env or
pins, symlink/non-regular archive, unusable temp root, import failure, image
ID mismatch against `EXPECTED_IMAGE_ID`, platform other than `linux/amd64`.
The prebuilt image's content is bound to the approved change by the recorded
image ID; the snapshot pins continue to verify the source provenance.

## What the mode does / refuses / never touches

Does: verify snapshot (type policy, hash pins, entry validation, full
inventory) → preserve current web image under a unique rollback tag and
verify its image ID matches the original before any build → build web image
(same `NEXT_PUBLIC_BASE_PATH` / `NEXT_PUBLIC_API_URL` args) → **re-verify the
whole snapshot immediately before the container swap** → recreate **only**
`ss-dtr-web` (same `--network smart-school -p 2003:3000 --restart
unless-stopped` flags) → bounded health probe → post-probe liveness check.

Refuses before any podman call when: `SRC`/`EXPECTED_SELECTOR_SHA256`/
`EXPECTED_MANIFEST_SHA256` missing; `SRC` missing or inside a Git worktree
(`.git` dir **or** file, at any parent level); any symlink, FIFO, socket or
device node exists in the snapshot; the approved file is missing or its
content hash differs; the manifest is missing, covers the approved file, is a
symlink, or fails its pinned hash; any manifest entry is empty, malformed,
duplicated, absolute or `..`-traversing; any checksum mismatch or
unmanifested/missing file. Refuses before the container swap if anything in
the snapshot changed after the first verification.

Refuses before touching the running container when: no existing web image to
preserve; the rollback tag already exists; rollback image ID ≠ original image
ID. Build failure also leaves the running container untouched.

Never: build/remove/run `ss-dtr-api`, touch `ss-mysql`, reload Caddy
(routes/ports unchanged), read or modify env files, database, or tunnel.

## Health-check contract

Probe: `GET http://127.0.0.1:2003/dtr/` with `curl -sS -L --connect-timeout 2
--max-time 5`, bounded to 15 attempts (2s pause between).

Expected response: **HTTP 200 with an HTML body** (Next.js serves the app
shell under `/dtr/`; authentication redirects are client-side). `curl -L`
follows any server-side redirect, which must resolve to 200. Non-200 status,
empty/non-HTML body, timeouts, and connection failures are all unhealthy. The
container must additionally still be running after the probe passes.

## Verify after deployment

- `podman ps --filter name=ss-dtr` — web recreated; API uptime unchanged
  (`podman inspect --format '{{.State.StartedAt}}' ss-dtr-api` before/after).
- `curl -sI https://spc.gschools.net/dtr` → HTTP 200.
- Live order **Both / Summary, Online DTR, Biometrics** and default
  **Online DTR** on: dashboard Logs, dashboard Monthly, Admin Departments list,
  Admin Department detail — desktop segmented control and mobile dropdown
  (real credentials required).

## Rollback

Automatic: on start/health failure the script recreates `ss-dtr-web` from the
preserved rollback image and **verifies it healthy before reporting success**;
the deployment still exits non-zero. If the rollback itself is not healthy the
script prints exact manual recovery commands and exits non-zero without
claiming success.

Manual recovery:

```bash
podman rm -f ss-dtr-web && podman run -d --name ss-dtr-web \
  --network smart-school -p 2003:3000 --restart unless-stopped \
  <WEB_ROLLBACK_IMAGE printed by the script>
# verify: curl -sS -L --connect-timeout 2 --max-time 5 -o /dev/null \
#   -w '%{http_code}\n' http://127.0.0.1:2003/dtr/   # expect 200
```

If the rollback image is unusable, rebuild from the verified snapshot.

## Tests

`bash tests/deploy/test-deploy-dtr.sh` — stateful mocked podman/curl. Covers:
default-mode golden sequence; WEB_ONLY isolation (no API/DB/Caddy/tunnel
operations); rollback tag retaining the exact original image ID; build failure
leaving container and image intact; health failure restoring the original
image and confirming it healthy; accurate failed-rollback reporting; changed or
missing approved selector refused; altered manifest, unmanifested files,
parent worktree and `.git`-file refusals; runtime-argument preservation;
no-secret-logging.
