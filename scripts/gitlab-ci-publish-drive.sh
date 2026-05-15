#!/bin/sh
set -eu

# Upload built Loupe artifacts to the public-distribution Shared Drive folder.
# Auto-update channel (gitlab-ci-publish-update.sh -> GitLab Generic Package
# Registry on the original repo) is independent of this script and is
# unaffected.
#
# Tag pipelines only -- no-op on non-tag invocations.
#
# Required env (CI-provided / variables panel):
#   CI_COMMIT_TAG                 release tag, e.g. v0.6.0-rayark.3
#   LOUPE_DRIVE_SA_JSON           [File-type CI var] path to service account JSON
#   LOUPE_DRIVE_SHARED_DRIVE_ID   [CI var] Shared Drive ID
#   LOUPE_DRIVE_FOLDER_ID         [CI var] destination folder ID

if [ -z "${CI_COMMIT_TAG:-}" ]; then
  echo "[publish-drive] skip: CI_COMMIT_TAG empty"
  exit 0
fi

: "${LOUPE_DRIVE_SA_JSON:?missing -- set as File-type CI variable in loupe-qa-recorder}"
: "${LOUPE_DRIVE_SHARED_DRIVE_ID:?missing -- set as CI variable in loupe-qa-recorder}"
: "${LOUPE_DRIVE_FOLDER_ID:?missing -- set as CI variable in loupe-qa-recorder}"

DIST="apps/desktop/dist"

# rclone config via environment, no on-disk config file needed.
# Remote name "drive" => referenced as drive: in rclone paths.
# scope=drive (full access) is fine because the SA only has access to this one
# folder via Shared Drive membership; it cannot reach anything else.
export RCLONE_CONFIG_DRIVE_TYPE=drive
export RCLONE_CONFIG_DRIVE_SCOPE=drive
export RCLONE_CONFIG_DRIVE_SERVICE_ACCOUNT_FILE="$LOUPE_DRIVE_SA_JSON"
export RCLONE_CONFIG_DRIVE_TEAM_DRIVE="$LOUPE_DRIVE_SHARED_DRIVE_ID"
export RCLONE_CONFIG_DRIVE_ROOT_FOLDER_ID="$LOUPE_DRIVE_FOLDER_ID"

upload() {
  src="$1"
  dst_name="$2"
  if [ ! -f "$src" ]; then
    echo "[publish-drive] skip: $src not present (build:mac or build:win likely failed)"
    return
  fi
  echo "[publish-drive] uploading $(basename "$src") -> $dst_name"
  rclone copyto --drive-acknowledge-abuse "$src" "drive:$dst_name"
}

upload "$DIST/loupe-macos.dmg"       "loupe-macos-${CI_COMMIT_TAG}.dmg"
upload "$DIST/loupe-windows-x64.exe" "loupe-windows-x64-${CI_COMMIT_TAG}.exe"

echo "[publish-drive] done -- Drive folder updated for ${CI_COMMIT_TAG}"
