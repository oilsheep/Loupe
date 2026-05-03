# macOS 簽名與 Notarization

這個專案可以產生未簽名的 macOS build，適合本機測試。但如果要放到 GitHub Release 讓其他人下載，就需要做 **Developer ID 簽名** 和 **notarization**。不然使用者下載後，macOS Gatekeeper 可能會顯示「App 已損毀，無法打開」。

重點：GitHub / 官網下載版要用 **Developer ID Application** 憑證，不是 **Apple Distribution**。`Apple Distribution` 通常是 App Store / Mac App Store 發佈流程用的。

## 需要準備什麼

- Apple Developer Program 會員資格。
- 一張 **Developer ID Application** certificate。
- 從 Keychain 匯出的 `.p12` 檔，裡面要包含 certificate 和 private key。
- Apple notarization 憑證，二選一：
  - Apple ID + app-specific password + Team ID
  - App Store Connect API key

## 建立 Developer ID Application Certificate

1. 打開 Apple Developer Certificates：
   `https://developer.apple.com/account/resources/certificates/list`
2. 點 `+`。
3. 選 `Developer ID Application`。
4. Apple 會要求上傳 Certificate Signing Request。
   - 可以用 macOS Keychain Access 建立：
     `Keychain Access -> Certificate Assistant -> Request a Certificate From a Certificate Authority...`
   - 選擇存到磁碟，然後把產生的檔案上傳。
5. 下載 Apple 產生的 certificate。
6. 雙擊下載的 certificate，安裝到 Keychain。
7. 在 Keychain Access 裡確認它長得像：
   `Developer ID Application: <Name> (<TEAMID>)`

## 匯出 `.p12`

1. 打開 `Keychain Access`。
2. 選 `login` keychain。
3. 左側或上方分類選 `My Certificates`。
4. 找到：
   `Developer ID Application: <Name> (<TEAMID>)`
5. 展開 certificate，確認底下有 private key。
6. 選 certificate 那一列。
7. 右鍵選 `Export`。
8. 存成 `DeveloperID.p12`。
9. 設定一組強密碼。

`.p12` 很敏感。任何人拿到 `.p12` 和密碼，都可以用你的 Developer ID 簽 app。

### 如果沒有 `.p12` 選項或看不到 private key

這代表你目前 Keychain 裡只有 Apple 發給你的 certificate，沒有建立 CSR 時產生的 private key。沒有 private key 就無法匯出 `.p12`，也不能拿來做 CI signing。

常見原因：

- certificate 是在另一台 Mac 建 CSR 後產生的。
- CSR 不是用目前這台 Mac 的 Keychain Access 建的。
- certificate 被安裝到 `Certificates`，但 private key 在別的 keychain 或不存在。

先檢查：

1. 在 Keychain Access 搜尋 `Developer ID Application`。
2. 左側選 `login`，分類選 `My Certificates`。
3. 如果可以展開 certificate，且底下有 private key，才可以匯出 `.p12`。
4. 如果只能在 `Certificates` 分類看到它，或不能展開，就代表這台 Mac 沒有 private key。

解法是重新建立 certificate：

1. 在 Keychain Access 建新的 CSR：
   `Keychain Access -> Certificate Assistant -> Request a Certificate From a Certificate Authority...`
2. 填 Email 和 Common Name。
3. 選 `Saved to disk`。
4. 不要選 `Let me specify key pair information`，除非你確定要自訂 key size。
5. 到 Apple Developer Certificates 頁面重新建立 `Developer ID Application` certificate，並上傳這個新的 CSR。
6. 下載新的 certificate，雙擊安裝。
7. 回到 Keychain Access 的 `login -> My Certificates`，確認它可以展開並看到 private key。
8. 這時右鍵 `Export` 應該就可以選 `.p12` / `Personal Information Exchange (.p12)`。

## 把 `.p12` 轉成 GitHub Secret

在本機執行：

```bash
base64 -i DeveloperID.p12 | tr -d '\n' | pbcopy
```

到 GitHub repo 建立這兩個 Repository Secrets：

```text
CSC_LINK
CSC_KEY_PASSWORD
```

- `CSC_LINK`：貼上剛剛複製的 base64 內容。
- `CSC_KEY_PASSWORD`：匯出 `.p12` 時設定的密碼。

## Notarization 方式 A：Apple ID

先建立 app-specific password：

1. 打開 `https://account.apple.com/account/manage`
2. 用 Apple Developer 的 Apple ID 登入。
3. 建立一組 app-specific password。

到 GitHub repo 建立這三個 Repository Secrets：

```text
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
```

- `APPLE_ID`：你的 Apple Developer Apple ID email。
- `APPLE_APP_SPECIFIC_PASSWORD`：剛剛建立的 app-specific password。
- `APPLE_TEAM_ID`：你的 Apple Developer Team ID。

Team ID 可以在這裡找到：
`https://developer.apple.com/account`

## Notarization 方式 B：App Store Connect API Key

這個方式比較適合 CI。

1. 打開 App Store Connect API keys：
   `https://appstoreconnect.apple.com/access/integrations/api`
2. 建立一個 **Team Key**。
3. 權限選 `App Manager`。
4. 記下：
   - Key ID
   - Issuer ID
   - 下載到的 `.p8` 檔

把 `.p8` 轉成 base64：

```bash
base64 -i AuthKey_<KEYID>.p8 | tr -d '\n' | pbcopy
```

到 GitHub repo 建立這三個 Repository Secrets：

```text
APPLE_API_KEY_BASE64
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

- `APPLE_API_KEY_BASE64`：貼上 `.p8` 的 base64 內容。
- `APPLE_API_KEY_ID`：Key ID。
- `APPLE_API_ISSUER`：Issuer ID。

## GitHub Actions Release Build

目前 workflow 在以下情況會自動簽名、notarize macOS build：

- GitHub Actions 手動執行 `Build desktop binaries`。
- 推送 `v*` tag，並建立 GitHub Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

macOS release 必備 secrets：

```text
CSC_LINK
CSC_KEY_PASSWORD
```

再加上 Apple ID notarization secrets：

```text
APPLE_ID
APPLE_APP_SPECIFIC_PASSWORD
APPLE_TEAM_ID
```

或 App Store Connect API key secrets：

```text
APPLE_API_KEY_BASE64
APPLE_API_KEY_ID
APPLE_API_ISSUER
```

## 本機 Signed Build

一般本機測試用未簽名 build 即可：

```bash
./start-dev.sh build
```

如果要在本機做 signed + notarized build：

```bash
LOUPE_SIGN_MAC=1 \
CSC_LINK=/absolute/path/to/DeveloperID.p12 \
CSC_KEY_PASSWORD='p12-password' \
APPLE_ID='you@example.com' \
APPLE_APP_SPECIFIC_PASSWORD='app-specific-password' \
APPLE_TEAM_ID='TEAMID' \
./start-dev.sh build
```

或使用 App Store Connect API key：

```bash
LOUPE_SIGN_MAC=1 \
CSC_LINK=/absolute/path/to/DeveloperID.p12 \
CSC_KEY_PASSWORD='p12-password' \
APPLE_API_KEY=/absolute/path/to/AuthKey_<KEYID>.p8 \
APPLE_API_KEY_ID='<KEYID>' \
APPLE_API_ISSUER='<ISSUER_UUID>' \
./start-dev.sh build
```

## 驗證 Build

檢查 app 簽名：

```bash
codesign --verify --deep --strict --verbose=2 "apps/desktop/dist/mac-arm64/Loupe QA Recorder.app"
spctl --assess --type execute --verbose "apps/desktop/dist/mac-arm64/Loupe QA Recorder.app"
```

檢查 notarization ticket：

```bash
xcrun stapler validate "apps/desktop/dist/mac-arm64/Loupe QA Recorder.app"
```

檢查 DMG：

```bash
spctl --assess --type open --verbose "apps/desktop/dist/Loupe QA Recorder-0.1.0-arm64.dmg"
```

## 常見問題

- 選到 `Apple Distribution` certificate：
  GitHub / 官網下載版要用 `Developer ID Application`。
- Gatekeeper 顯示 app 已損毀：
  通常代表 app 未簽名、未 notarize，或 notarization ticket 沒有 staple。
- Notarization credentials 缺少：
  設定 Apple ID secrets，或設定 App Store Connect API key secrets。
- 匯出的 `.p12` 沒有 private key：
  請在 Keychain Access 的 `My Certificates` 匯出，並確認 certificate 展開後底下有 private key。
