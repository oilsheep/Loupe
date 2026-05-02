#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="${ROOT_DIR}/apps/desktop/vendor"
GO_IOS_VERSION="${GO_IOS_VERSION:-latest}"
UXPLAY_REF="${UXPLAY_REF:-master}"
MODE="normal"
FORCE=0
WITH_UXPLAY=0
INSTALL_DEPS=0

usage() {
  cat <<'EOF'
Usage: scripts/prepare-vendor-binaries.sh [options]

Prepare platform-specific third-party binaries under apps/desktop/vendor.

Options:
  --best-effort       Skip unavailable optional binaries instead of failing.
  --ci                Fail when a requested binary cannot be prepared.
  --force             Replace existing prepared binaries.
  --with-uxplay       Build or unpack UxPlay for the current platform.
  --install-deps      Install UxPlay build dependencies where supported.
  -h, --help          Show this help.

Environment:
  GO_IOS_VERSION              npm go-ios version or dist-tag. Default: latest
  UXPLAY_REF                  UxPlay git branch/tag/ref. Default: master
  LOUPE_UXPLAY_ARCHIVE        tar/zip archive containing uxplay to unpack
  LOUPE_BUILD_UXPLAY=1        Build UxPlay from source on macOS
  LOUPE_UXPLAY_INSTALL_DEPS=1 Install UxPlay build dependencies on macOS
EOF
}

while (($# > 0)); do
  case "$1" in
    --best-effort) MODE="best-effort" ;;
    --ci) MODE="ci" ;;
    --force) FORCE=1 ;;
    --with-uxplay) WITH_UXPLAY=1 ;;
    --install-deps) INSTALL_DEPS=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

say() {
  printf '[vendor] %s\n' "$*"
}

warn() {
  printf '[vendor] warning: %s\n' "$*" >&2
}

fail_or_skip() {
  local message="$1"
  if [[ "$MODE" == "ci" ]]; then
    echo "[vendor] error: ${message}" >&2
    exit 1
  fi
  warn "$message"
}

platform_key() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "$os" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    *) echo "Unsupported OS: $os" >&2; return 1 ;;
  esac
  case "$arch" in
    arm64|aarch64) arch="arm64" ;;
    x86_64|amd64) arch="x64" ;;
    *) echo "Unsupported architecture: $arch" >&2; return 1 ;;
  esac
  printf '%s-%s\n' "$os" "$arch"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail_or_skip "$1 is required"
    return 1
  fi
}

extract_archive() {
  local archive="$1"
  local dest="$2"
  mkdir -p "$dest"
  case "$archive" in
    *.tar.gz|*.tgz) tar -xzf "$archive" -C "$dest" ;;
    *.zip)
      require_cmd unzip || return 1
      unzip -q "$archive" -d "$dest"
      ;;
    *) fail_or_skip "Unsupported archive format: $archive"; return 1 ;;
  esac
}

find_first_file() {
  local root="$1"
  local name="$2"
  find "$root" -type f -name "$name" -print -quit
}

prepare_go_ios() {
  local platform="$1"
  local dest_dir="${VENDOR_DIR}/go-ios/${platform}/bin"
  local dest="${dest_dir}/ios"
  local work_dir archive package_dir candidate license

  if [[ -x "$dest" && "$FORCE" != "1" ]]; then
    say "go-ios already prepared: ${dest}"
    return 0
  fi

  require_cmd npm || return 1
  require_cmd tar || return 1

  say "Preparing go-ios ${GO_IOS_VERSION} for ${platform}"
  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/loupe-go-ios.XXXXXX")"
  trap "rm -rf '$work_dir'; trap - RETURN" RETURN

  if ! npm pack "go-ios@${GO_IOS_VERSION}" --pack-destination "$work_dir" >/dev/null; then
    fail_or_skip "Failed to download go-ios npm package"
    return 1
  fi
  archive="$(find_first_file "$work_dir" '*.tgz')"
  if [[ -z "$archive" ]]; then
    fail_or_skip "npm did not produce a go-ios package archive"
    return 1
  fi

  if ! tar -xzf "$archive" -C "$work_dir"; then
    fail_or_skip "Failed to extract go-ios package"
    return 1
  fi
  package_dir="${work_dir}/package"

  candidate="$(find "$package_dir" -type f -name ios -path "*${platform}*" -print -quit)"
  if [[ -z "$candidate" ]]; then
    candidate="$(find "$package_dir" -type f -name ios -print -quit)"
  fi
  if [[ -z "$candidate" ]]; then
    fail_or_skip "go-ios package did not contain an ios binary"
    return 1
  fi

  mkdir -p "$dest_dir"
  cp "$candidate" "$dest"
  chmod +x "$dest"

  license="$(find "$package_dir" -maxdepth 2 -type f -iname 'LICENSE*' -print -quit)"
  if [[ -n "$license" ]]; then
    cp "$license" "${VENDOR_DIR}/go-ios/LICENSE.go-ios"
  fi

  say "go-ios ready: ${dest}"
}

prepare_uxplay_from_archive() {
  local platform="$1"
  local archive="${LOUPE_UXPLAY_ARCHIVE:-}"
  local dest_dir="${VENDOR_DIR}/uxplay/${platform}/bin"
  local dest="${dest_dir}/uxplay"
  local work_dir candidate

  [[ -n "$archive" ]] || return 2
  if [[ ! -f "$archive" ]]; then
    fail_or_skip "LOUPE_UXPLAY_ARCHIVE does not exist: $archive"
    return 1
  fi

  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/loupe-uxplay.XXXXXX")"
  trap "rm -rf '$work_dir'; trap - RETURN" RETURN
  extract_archive "$archive" "$work_dir" || return 1
  candidate="$(find "$work_dir" -type f -name uxplay -print -quit)"
  if [[ -z "$candidate" ]]; then
    fail_or_skip "UxPlay archive did not contain uxplay"
    return 1
  fi

  mkdir -p "$dest_dir"
  cp "$candidate" "$dest"
  chmod +x "$dest"
  say "UxPlay ready: ${dest}"
}

install_uxplay_deps_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail_or_skip "Automatic UxPlay dependency installation is supported on macOS only"
    return 1
  fi
  require_cmd brew || return 1
  say "Installing UxPlay build dependencies with Homebrew"
  HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 \
    brew install cmake git libplist openssl@3 pkg-config gstreamer
}

configure_uxplay_build_env_macos() {
  local brew_prefix openssl_prefix
  if [[ "$(uname -s)" != "Darwin" ]] || ! command -v brew >/dev/null 2>&1; then
    return 0
  fi
  brew_prefix="$(brew --prefix 2>/dev/null || true)"
  openssl_prefix="$(brew --prefix openssl@3 2>/dev/null || true)"
  if [[ -n "$openssl_prefix" ]]; then
    export OPENSSL_ROOT_DIR="${OPENSSL_ROOT_DIR:-$openssl_prefix}"
    export PKG_CONFIG_PATH="${openssl_prefix}/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
  fi
  if [[ -n "$brew_prefix" ]]; then
    export PKG_CONFIG_PATH="${brew_prefix}/lib/pkgconfig:${PKG_CONFIG_PATH:-}"
  fi
}

prepare_uxplay_from_source() {
  local platform="$1"
  local dest_dir="${VENDOR_DIR}/uxplay/${platform}/bin"
  local dest="${dest_dir}/uxplay"
  local work_dir source_dir build_dir candidate

  if [[ "$(uname -s)" != "Darwin" ]]; then
    fail_or_skip "UxPlay source build is currently wired for macOS only"
    return 1
  fi

  if [[ "$INSTALL_DEPS" == "1" || "${LOUPE_UXPLAY_INSTALL_DEPS:-0}" == "1" ]]; then
    install_uxplay_deps_macos || return 1
  fi

  require_cmd git || return 1
  require_cmd cmake || return 1
  configure_uxplay_build_env_macos

  say "Building UxPlay ${UXPLAY_REF} from source for ${platform}"
  work_dir="$(mktemp -d "${TMPDIR:-/tmp}/loupe-uxplay-src.XXXXXX")"
  trap "rm -rf '$work_dir'; trap - RETURN" RETURN
  source_dir="${work_dir}/UxPlay"
  build_dir="${work_dir}/build"

  if ! git clone --depth 1 --branch "$UXPLAY_REF" https://github.com/FDH2/UxPlay.git "$source_dir"; then
    fail_or_skip "UxPlay source download failed"
    return 1
  fi
  if ! cmake -S "$source_dir" -B "$build_dir" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$work_dir/install"; then
    fail_or_skip "UxPlay configure failed"
    return 1
  fi
  if ! cmake --build "$build_dir" --parallel; then
    fail_or_skip "UxPlay build failed"
    return 1
  fi
  if ! cmake --install "$build_dir"; then
    fail_or_skip "UxPlay install failed"
    return 1
  fi

  candidate="$(find "$work_dir/install" -type f -name uxplay -print -quit)"
  if [[ -z "$candidate" ]]; then
    fail_or_skip "UxPlay build did not produce uxplay"
    return 1
  fi

  mkdir -p "$dest_dir"
  cp "$candidate" "$dest"
  chmod +x "$dest"
  cp "${source_dir}/LICENSE" "${VENDOR_DIR}/uxplay/LICENSE.UxPlay" 2>/dev/null || true
  say "UxPlay ready: ${dest}"
}

prepare_uxplay() {
  local platform="$1"
  local dest="${VENDOR_DIR}/uxplay/${platform}/bin/uxplay"

  if [[ -x "$dest" && "$FORCE" != "1" ]]; then
    say "UxPlay already prepared: ${dest}"
    return 0
  fi

  if prepare_uxplay_from_archive "$platform"; then
    return 0
  fi

  if [[ "${LOUPE_BUILD_UXPLAY:-0}" == "1" || "$WITH_UXPLAY" == "1" ]]; then
    prepare_uxplay_from_source "$platform"
    return $?
  fi

  fail_or_skip "UxPlay not prepared. Set LOUPE_UXPLAY_ARCHIVE, or pass --with-uxplay / LOUPE_BUILD_UXPLAY=1 on macOS."
}

main() {
  local platform
  platform="$(platform_key)"
  say "Target platform: ${platform}"
  mkdir -p "$VENDOR_DIR"

  prepare_go_ios "$platform" || true
  prepare_uxplay "$platform" || true

  say "Done"
}

main "$@"
