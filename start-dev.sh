#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE

echo
echo "=== Loupe dev launcher ==="
echo

ensure_pnpm() {
  local existing
  local pnpm_cjs
  local shim_dir
  local store_dir

  if existing="$(command -v pnpm 2>/dev/null)"; then
    if "$existing" --version >/dev/null 2>&1; then
      return 0
    fi
  fi

  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    if existing="$(command -v pnpm 2>/dev/null)"; then
      if "$existing" --version >/dev/null 2>&1; then
        return 0
      fi
    fi
  fi

  pnpm_cjs="${HOME}/.cache/node/corepack/v1/pnpm/9.12.0/dist/pnpm.cjs"
  if [[ -f "$pnpm_cjs" ]] && command -v node >/dev/null 2>&1; then
    shim_dir="${TMPDIR:-/tmp}/loupe-pnpm-shim"
    mkdir -p "$shim_dir"
    store_dir="$(awk -F': ' '/^storeDir:/ { print $2; exit }' "$(pwd)/node_modules/.modules.yaml" 2>/dev/null || true)"
    if [[ -n "$store_dir" ]]; then
      cat > "${shim_dir}/pnpm" <<EOF
#!/usr/bin/env sh
exec node "$pnpm_cjs" --store-dir "$store_dir" "\$@"
EOF
    else
      cat > "${shim_dir}/pnpm" <<EOF
#!/usr/bin/env sh
exec node "$pnpm_cjs" "\$@"
EOF
    fi
    chmod +x "${shim_dir}/pnpm"
    export PATH="${shim_dir}:${PATH}"
    return 0
  fi

  echo "pnpm was not found on PATH."
  echo "Install pnpm with: npm install -g pnpm"
  echo "Or enable Corepack with: corepack enable"
  return 1
}

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

ensure_pnpm || exit 1

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
