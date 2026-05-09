#!/bin/sh
set -eu

# Upload the just-built electron-updater channel files to the project's
# GitLab Generic Package registry under loupe/latest/. Run from build:mac
# and build:win after electron-builder finishes. Tag-only — no-op for
# release-branch pipelines so verification builds don't bump the latest
# update channel.

if [ -z "${CI_COMMIT_TAG:-}" ]; then
  echo "[publish-update] skip: CI_COMMIT_TAG empty"
  exit 0
fi

BASE="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/loupe/latest"

upload() {
  f="$1"
  [ -f "$f" ] || return 0
  name=$(basename "$f")
  # electron-builder filenames contain spaces (e.g. "Loupe QA Recorder...");
  # percent-encode them for the URL path component.
  name_enc=$(printf '%s' "$name" | sed 's/ /%20/g')
  echo "[publish-update] PUT $name"
  curl --silent --show-error --fail \
    --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
    --upload-file "$f" \
    "${BASE}/${name_enc}?select=package_file" >/dev/null
}

cd apps/desktop/dist

# Iterate the actual files in dist/ and filter by basename. Avoids the
# unmatched-glob-equals-literal-filename trap that previously skipped
# latest-mac.yml / latest.yml.
for f in *; do
  [ -f "$f" ] || continue
  case "$f" in
    __uninstaller-*) continue ;;
    *.dmg|*.exe|*.zip|latest-mac.yml|latest.yml|*.blockmap)
      upload "$f" ;;
  esac
done

echo "[publish-update] done"
