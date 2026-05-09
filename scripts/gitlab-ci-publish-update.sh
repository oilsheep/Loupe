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
  echo "[publish-update] PUT $name"
  curl --silent --show-error --fail \
    --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
    --upload-file "$f" \
    "${BASE}/${name}?select=package_file" >/dev/null
}

cd apps/desktop/dist

for pat in '*.dmg' '*.exe' '*.zip' 'latest-mac.yml' 'latest.yml' '*.blockmap'; do
  for f in $pat; do
    case "$(basename "$f")" in
      __uninstaller-*) continue ;;
      "$pat") continue ;;  # unmatched glob expanded to literal pattern
    esac
    upload "$f"
  done
done

echo "[publish-update] done"
