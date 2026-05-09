#!/bin/sh
set -eu

# Repoint the loupe/latest/ update channel at a previously-released version.
# Triggered manually from the GitLab UI on the `rollback:update-channel`
# pipeline job; operator passes ROLLBACK_VERSION as a job-scoped variable
# (e.g. "0.5.1" — without the leading 'v').
#
# Copies every file currently under loupe/<ROLLBACK_VERSION>/ into
# loupe/latest/?select=package_file, overwriting the latest pointer.
# Installed apps' next Check-for-Updates resolves the older version, and
# electron-updater treats the version mismatch as an available "update"
# (downgrade is intentional for rollback).

: "${ROLLBACK_VERSION:?Set ROLLBACK_VERSION (e.g. '0.5.1') when triggering this job}"

BASE_API="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/loupe"
SRC="${BASE_API}/${ROLLBACK_VERSION}"
DST="${BASE_API}/latest"

# List files currently in loupe/<version>/ via the GitLab packages API.
# Find the package matching name=loupe and version=ROLLBACK_VERSION,
# then list its package_files.
PKG_ID=$(curl --silent --fail \
  --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages?package_name=loupe&package_version=${ROLLBACK_VERSION}&per_page=10" \
  | python3 -c "import sys, json; arr=json.load(sys.stdin); print(arr[0]['id'] if arr else '')")

if [ -z "$PKG_ID" ]; then
  echo "[rollback] no package found for loupe/$ROLLBACK_VERSION" >&2
  exit 1
fi

FILES=$(curl --silent --fail \
  --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
  "${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/${PKG_ID}/package_files?per_page=50" \
  | python3 -c "import sys, json; [print(f['file_name']) for f in {f['file_name']: f for f in json.load(sys.stdin)}.values()]")

if [ -z "$FILES" ]; then
  echo "[rollback] package $PKG_ID has no files" >&2
  exit 1
fi

mkdir -p /tmp/rollback
echo "[rollback] copying loupe/$ROLLBACK_VERSION/ -> loupe/latest/"
echo "$FILES" | while IFS= read -r name; do
  [ -n "$name" ] || continue
  echo "  - $name"
  # Download from versioned path (follows redirect to MinIO storage).
  curl --silent --show-error --fail --location \
    --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
    "${SRC}/${name}" \
    --output "/tmp/rollback/${name}"
  # Re-upload to latest with overwrite.
  curl --silent --show-error --fail \
    --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
    --upload-file "/tmp/rollback/${name}" \
    "${DST}/${name}?select=package_file" >/dev/null
  rm -f "/tmp/rollback/${name}"
done

echo "[rollback] done — loupe/latest/ now mirrors loupe/$ROLLBACK_VERSION/"
