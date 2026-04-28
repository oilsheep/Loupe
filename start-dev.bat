@echo off
setlocal
cd /d "%~dp0"

echo.
echo === Loupe dev launcher ===
echo.

REM Kill any stale Electron processes (file-locks the native bindings on Windows)
echo [1/3] Cleaning up stale Electron processes...
taskkill /F /IM electron.exe /T 2>nul
taskkill /F /IM Loupe.exe /T 2>nul

REM Make sure better-sqlite3 is compiled for Electron's Node ABI.
REM On a fresh clone or after a `pnpm install` / `pnpm rebuild:node`, this is required.
REM On subsequent runs the rebuild is a no-op (~5s) so it's safe to always run.
echo [2/3] Ensuring better-sqlite3 is built for Electron ABI...
call pnpm rebuild:electron
if errorlevel 1 goto :error

echo [3/3] Starting dev server...
echo.
call pnpm desktop:dev

goto :end

:error
echo.
echo Setup failed. Try running steps manually:
echo   pnpm install
echo   pnpm rebuild:electron
echo   pnpm desktop:dev
echo.
pause
exit /b 1

:end
endlocal
