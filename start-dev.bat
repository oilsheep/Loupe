@echo off
setlocal
cd /d "%~dp0"

echo.
echo === Loupe launcher ===
echo.

set "MODE=%~1"
if "%MODE%"=="" set "MODE=dev"
if /I "%MODE%"=="--check" set "MODE=check"
if /I "%MODE%"=="check" set "MODE=check"
if /I "%MODE%"=="build" set "MODE=build"
if /I "%MODE%"=="dist" set "MODE=build"
if /I "%MODE%"=="vendor" set "MODE=vendor"
if /I "%MODE%"=="prepare-vendor" set "MODE=vendor"
if /I "%MODE%"=="dev" set "MODE=dev"

set "VENDOR_ARGS=-BestEffort"
if /I "%MODE%"=="build" set "VENDOR_ARGS=-Ci -WithUxPlay -InstallDeps"
if /I "%MODE%"=="vendor" set "VENDOR_ARGS=-Ci -WithUxPlay -InstallDeps"
if /I "%~2"=="uxplay" set "VENDOR_ARGS=-BestEffort -WithUxPlay -InstallDeps"

set "PNPM=pnpm"
where pnpm >nul 2>nul
if errorlevel 1 (
  where corepack >nul 2>nul
  if errorlevel 1 (
    echo pnpm/corepack was not found. Install Node.js, then run:
    echo   corepack enable
    echo   corepack prepare pnpm@9.12.0 --activate
    goto :error
  )
  echo [setup] pnpm was not found on PATH; using corepack pnpm.
  set "PNPM=corepack pnpm"
)

if not exist "node_modules\.modules.yaml" (
  echo [setup] Installing dependencies for current master...
  call %PNPM% install --frozen-lockfile
  if errorlevel 1 goto :error
) else (
  echo [setup] Dependencies found.
)

echo [setup] Preparing vendored third-party binaries...
where powershell >nul 2>nul
if not errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\prepare-vendor-binaries.ps1" %VENDOR_ARGS%
  if errorlevel 1 goto :error
) else (
  if /I "%MODE%"=="build" (
    echo [setup] PowerShell was not found; cannot prepare vendored binaries for build.
    goto :error
  )
  if /I "%MODE%"=="vendor" (
    echo [setup] PowerShell was not found; cannot prepare vendored binaries.
    goto :error
  )
  echo [setup] PowerShell was not found; skipping best-effort vendored binary preparation.
)

if /I "%MODE%"=="vendor" (
  echo.
  echo Vendored binary preparation complete.
  goto :end
)

if /I "%MODE%"=="check" (
  echo.
  echo Check complete. Use start-dev.bat to run, or start-dev.bat build to package.
  goto :end
)

REM Kill any stale Electron processes (file-locks the native bindings on Windows)
echo [1/3] Cleaning up stale Electron processes...
taskkill /F /IM electron.exe /T 2>nul
taskkill /F /IM Loupe.exe /T 2>nul

REM Make sure better-sqlite3 is compiled for Electron's Node ABI.
REM On a fresh clone or after a `pnpm install` / `pnpm rebuild:node`, this is required.
REM On subsequent runs the rebuild is a no-op (~5s) so it's safe to always run.
echo [2/3] Ensuring better-sqlite3 is built for Electron ABI...
call %PNPM% rebuild:electron
if errorlevel 1 goto :error

if /I "%MODE%"=="build" (
  echo [3/3] Building Windows package from current master...
  echo.
  call %PNPM% --filter desktop dist:win
  if errorlevel 1 goto :error
  echo.
  echo Build complete. Outputs are in:
  echo   apps\desktop\dist
  goto :end
)

echo [3/3] Starting current master in dev mode...
echo.
call %PNPM% desktop:dev

goto :end

:error
echo.
echo Launcher failed. Try running steps manually:
echo   pnpm install
echo   pnpm rebuild:electron
echo   pnpm desktop:dev
echo.
echo To build a package:
echo   start-dev.bat build
echo.
echo To prepare third-party binaries only:
echo   start-dev.bat vendor
echo.
echo To try building UxPlay during dev startup:
echo   start-dev.bat dev uxplay
echo.
pause
exit /b 1

:end
endlocal
