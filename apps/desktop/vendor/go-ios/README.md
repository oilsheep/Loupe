Place bundled go-ios builds here before producing an offline iOS tooling build.

Expected layouts:

- `darwin-arm64/bin/ios`
- `darwin-x64/bin/ios`
- `win32-x64/bin/ios.exe`
- `linux-x64/bin/ios`

go-ios is MIT licensed. Bundled releases should include its license notice.

For iOS 17+ workflows, a bundled binary removes the npm dependency but does not
remove device/tunnel permission requirements such as `ios tunnel start`.
