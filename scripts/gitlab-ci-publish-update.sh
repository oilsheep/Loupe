#!/bin/sh
set -eu

# Upload electron-updater channel files to the project's GitLab Generic
# Package registry. Each tag pipeline writes:
#   loupe/<version>/      full archive (binaries + ymls). Permanent.
#   loupe/latest/         only the two yml files, with file URLs rewritten
#                         to `../<version>/<filename>` so updater requests
#                         resolve back into the versioned archive.
#
# That means rollback is just two tiny re-uploads, not gigabytes of copy.
# Tag-only — release-branch verifies are no-ops.

if [ -z "${CI_COMMIT_TAG:-}" ]; then
  echo "[publish-update] skip: CI_COMMIT_TAG empty"
  exit 0
fi

VERSION="${CI_COMMIT_TAG#v}"
DIST="apps/desktop/dist"
BASE_API="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/loupe"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

put() {
  channel="$1"
  src="$2"
  remote_name="$3"
  echo "[publish-update] PUT loupe/$channel/$remote_name"
  curl --silent --show-error --fail \
    --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
    --upload-file "$src" \
    "${BASE_API}/${channel}/${remote_name}?select=package_file" >/dev/null
}

# 1) Full archive at loupe/<version>/
for f in "$DIST"/*; do
  [ -f "$f" ] || continue
  name=$(basename "$f")
  case "$name" in
    __uninstaller-*) continue ;;
    *.dmg|*.exe|*.zip|latest-mac.yml|latest.yml|*.blockmap)
      put "$VERSION" "$f" "$name" ;;
  esac
done

# 2) loupe/latest/ — only the ymls, with relative URLs to ../<version>/
for yml in latest-mac.yml latest.yml; do
  src="$DIST/$yml"
  [ -f "$src" ] || continue
  tmp="/tmp/${yml}.latest"
  python3 "$SCRIPT_DIR/gitlab-ci-yml-prefix.py" "$VERSION" < "$src" > "$tmp"
  put latest "$tmp" "$yml"
  rm -f "$tmp"
done

echo "[publish-update] done — version=$VERSION archive + latest pointer"
