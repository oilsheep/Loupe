#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname "$0")"

echo
echo "=== Loupe dev launcher ==="
echo

resolve_tool_path() {
  local tool="$1"
  local exe="$tool"
  local candidate

  if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
    exe="${tool}.exe"
  fi

  if [[ -n "${LOUPE_TOOLS_DIR:-}" && -x "${LOUPE_TOOLS_DIR}/${exe}" ]]; then
    printf '%s\n' "${LOUPE_TOOLS_DIR}/${exe}"
    return 0
  fi

  for candidate in \
    "$(pwd)/vendor/scrcpy/${exe}" \
    "$(pwd)/apps/desktop/vendor/scrcpy/${exe}"
  do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  if command -v "$tool" >/dev/null 2>&1; then
    command -v "$tool"
    return 0
  fi

  return 1
}

missing_tools=()
for tool in adb scrcpy; do
  if ! resolve_tool_path "$tool" >/dev/null; then
    missing_tools+=("$tool")
  fi
done

if (( ${#missing_tools[@]} > 0 )); then
  echo "Missing required recording tools: ${missing_tools[*]}"
  echo
  if [[ "$(uname -s)" == "Darwin" ]]; then
    if [[ " ${missing_tools[*]} " == *" adb "* ]]; then
      echo "Install adb with: brew install android-platform-tools"
    fi
    if [[ " ${missing_tools[*]} " == *" scrcpy "* ]]; then
      echo "Install scrcpy with: brew install scrcpy"
    fi
  else
    echo "Install the missing tools and ensure they are on PATH, or set LOUPE_TOOLS_DIR to a folder containing adb and scrcpy."
  fi
  echo
  echo "See README.md for the full developer setup."
  echo
  exit 1
fi

# Best-effort cleanup for stale Loupe/Electron dev processes.
# Keep the match narrow so we do not kill unrelated Electron apps.
echo "[1/3] Cleaning up stale Electron processes..."
pkill -f "$(pwd)/apps/desktop" >/dev/null 2>&1 || true
pkill -f "Loupe QA Recorder" >/dev/null 2>&1 || true

echo "[2/3] Ensuring better-sqlite3 is built for Electron ABI..."
if ! pnpm rebuild:electron; then
  echo
  echo "Setup failed. Try running steps manually:"
  echo "  pnpm install"
  echo "  pnpm rebuild:electron"
  echo "  pnpm desktop:dev"
  echo
  exit 1
fi

echo "[3/3] Starting dev server..."
echo
pnpm desktop:dev