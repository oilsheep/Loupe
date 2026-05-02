Place bundled UxPlay builds here before producing an offline iOS AirPlay fallback build.

Expected layouts:

- `darwin-arm64/bin/uxplay`
- `darwin-x64/bin/uxplay`
- `win32-x64/bin/uxplay.exe`
- `linux-x64/bin/uxplay`

UxPlay is GPL-3.0. If this directory is populated for distribution, include the
corresponding license and source offer/source link with the packaged app.
The bundled source-link/source-offer notice lives in `SOURCE_OFFER.UxPlay.txt`.

Checked-in binaries under this directory are supported when source builds are
too fragile for Windows packaging or CI.

