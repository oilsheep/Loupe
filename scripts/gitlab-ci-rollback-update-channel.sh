#!/bin/sh
set -eu

# Repoint loupe/latest/ at a previously-archived version. Triggered manually
# from the GitLab UI (rollback:update-channel job); operator passes
# ROLLBACK_VERSION as a job-scoped variable (e.g. "0.5.1" — no leading 'v').
#
# Implementation: download the two ymls from loupe/<ROLLBACK_VERSION>/,
# rewrite their relative file URLs to ../<ROLLBACK_VERSION>/, upload to
# loupe/latest/. Two ~1KB uploads — no binary copying.

: "${ROLLBACK_VERSION:?Set ROLLBACK_VERSION (e.g. '0.5.1') when triggering this job}"

BASE_API="${CI_API_V4_URL}/projects/${CI_PROJECT_ID}/packages/generic/loupe"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p /tmp/rollback
echo "[rollback] loupe/latest -> ../${ROLLBACK_VERSION}/"

for yml in latest-mac.yml latest.yml; do
  src="${BASE_API}/${ROLLBACK_VERSION}/${yml}"
  in="/tmp/rollback/${yml}.in"
  out="/tmp/rollback/${yml}.out"

  if ! curl --silent --show-error --fail --location \
       --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
       "$src" --output "$in"; then
    echo "[rollback] $yml not found in loupe/${ROLLBACK_VERSION}/ — skipping"
    continue
  fi

  python3 "$SCRIPT_DIR/gitlab-ci-yml-prefix.py" "$ROLLBACK_VERSION" < "$in" > "$out"

  echo "[rollback] PUT loupe/latest/$yml"
  curl --silent --show-error --fail \
    --header "JOB-TOKEN: ${CI_JOB_TOKEN}" \
    --upload-file "$out" \
    "${BASE_API}/latest/${yml}?select=package_file" >/dev/null

  rm -f "$in" "$out"
done

echo "[rollback] done — installed apps' next Check-for-Updates resolves ${ROLLBACK_VERSION}"
