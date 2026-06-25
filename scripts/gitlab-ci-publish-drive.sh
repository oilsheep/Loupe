#!/bin/sh
set -eu

# Upload built Loupe artifacts to the public-distribution Shared Drive folder.
# Auto-update channel (gitlab-ci-publish-update.sh -> GitLab Generic Package
# Registry on the original repo) is independent of this script and is
# unaffected.
#
# Tag pipelines only -- no-op on non-tag invocations.
#
# Authentication is keyless: the SRE GCP WIF template (.setup-gcp-adc /
# .use-gcp-adc in .gitlab-ci.yml) exchanges this job's OIDC token for
# short-lived Application Default Credentials and points
# GOOGLE_APPLICATION_CREDENTIALS at the resulting config. rclone's env_auth
# reads it -- no service-account key on disk.
#
# Required env:
#   CI_COMMIT_TAG                  release tag, e.g. v0.6.0-rayark.3
#   GOOGLE_APPLICATION_CREDENTIALS [from setup-gcp-adc dotenv] ADC config path
#   LOUPE_DRIVE_FOLDER_ID          [CI var] destination folder ID
#   LOUPE_DRIVE_SHARED_DRIVE_ID    [CI var, OPTIONAL] Shared Drive ID -- only set
#                                  it for whole-drive (team_drive) access; leave
#                                  unset when the SA is granted directly on the
#                                  destination folder (see below).

if [ -z "${CI_COMMIT_TAG:-}" ]; then
  echo "[publish-drive] skip: CI_COMMIT_TAG empty"
  exit 0
fi

: "${GOOGLE_APPLICATION_CREDENTIALS:?missing -- expected from setup-gcp-adc (needs: artifacts)}"
: "${LOUPE_DRIVE_FOLDER_ID:?missing -- set as CI variable in loupe-qa-recorder}"

DIST="apps/desktop/dist"

# rclone config via environment, no on-disk config file needed.
# Remote name "drive" => referenced as drive: in rclone paths.
# env_auth=true makes rclone resolve credentials via ADC (Go's
# FindDefaultCredentials reads GOOGLE_APPLICATION_CREDENTIALS); only takes effect
# while service_account_file/credentials are blank, which they are here.
#
# The destination folder lives in a Shared Drive, but the service account is
# granted Content-manager on the FOLDER directly (not made a Shared Drive
# member). So we address the folder by root_folder_id alone and deliberately do
# NOT set team_drive: team_drive forces a drives.get membership check that 404s
# for a non-member, whereas root_folder_id + rclone's supportsAllDrives reaches
# the folder using only the folder-level grant -- least privilege. team_drive is
# honored only if LOUPE_DRIVE_SHARED_DRIVE_ID is explicitly set (legacy
# whole-drive setups).
export RCLONE_CONFIG_DRIVE_TYPE=drive
export RCLONE_CONFIG_DRIVE_SCOPE=drive
export RCLONE_CONFIG_DRIVE_ENV_AUTH=true
export RCLONE_CONFIG_DRIVE_ROOT_FOLDER_ID="$LOUPE_DRIVE_FOLDER_ID"
if [ -n "${LOUPE_DRIVE_SHARED_DRIVE_ID:-}" ]; then
  export RCLONE_CONFIG_DRIVE_TEAM_DRIVE="$LOUPE_DRIVE_SHARED_DRIVE_ID"
fi

# Best-effort access probe: surface a clear message if keyless auth/permission
# didn't resolve, but do NOT gate the upload on it. The uploads below have their
# own retries; a transient list error must not abort the publish and burn the
# already-spent release tag.
echo "[publish-drive] checking keyless Drive access (non-fatal)..."
if rclone lsd drive: >/dev/null 2>&1; then
  echo "[publish-drive] Drive access OK"
else
  echo "[publish-drive] WARN: access probe failed; attempting upload anyway"
fi

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
