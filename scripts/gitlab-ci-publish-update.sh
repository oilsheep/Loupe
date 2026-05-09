#!/bin/sh
set -eu

# Upload the just-built electron-updater channel files to the project's
# GitLab Generic Package registry. Each tag pipeline writes to TWO paths:
#   loupe/<version>/   immutable archive of this exact build (rollback source)
#   loupe/latest/      mutable pointer to the most recent release
# Tag-only — no-op for release-branch verification pipelines.

if [ -z "${CI_COMMIT_TAG:-}" ]; then
  echo "[publish-update] skip: CI_COMMIT_TAG empty"
  exit 0
fi

VERSION="${CI_COMMIT_TAG#v}"
BASE_API="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/loupe"

upload_to() {
  channel="$1"
  f="$2"
  [ -f "$f" ] || return 0
  name=$(basename "$f")
  # GitLab generic-package filenames must satisfy ^[\w\.-]+$ (no spaces);
  # we already use space-free artifactName overrides so this is a sanity guard.
  name_enc=$(printf '%s' "$name" | sed 's/ /%20/g')
  echo "[publish-update] PUT loupe/$channel/$name"
  curl --silent --show-error --fail \
    --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
    --upload-file "$f" \
    "${BASE_API}/${channel}/${name_enc}?select=package_file" >/dev/null
}

cd apps/desktop/dist
for f in *; do
  [ -f "$f" ] || continue
  case "$f" in
    __uninstaller-*) continue ;;
    *.dmg|*.exe|*.zip|latest-mac.yml|latest.yml|*.blockmap)
      upload_to "$VERSION" "$f"
      upload_to latest "$f"
      ;;
  esac
done

echo "[publish-update] done — version=$VERSION + latest"

echo "[publish-update] done"
