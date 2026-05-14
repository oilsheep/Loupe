; NSIS one-click installer invokes the old uninstaller silently before
; extracting, and the default uninstaller does `RMDir /r $INSTDIR`. Run BEFORE
; that fires to rescue user data into stable user-profile locations. The
; destinations match what app.getPath('userData') and the new paths.ts read.

!macro customInit
  IfFileExists "$INSTDIR\recordings\meta.sqlite" 0 loupeMigrationDone

  DetailPrint "Loupe: rescuing session data out of install dir before upgrade..."

  CreateDirectory "$APPDATA\${PRODUCT_NAME}"
  CreateDirectory "$PROFILE\Videos\Loupe"

  ; Skip each destination if it's already populated — the user may have already
  ; upgraded once; don't clobber whatever state the new code wrote.
  IfFileExists "$APPDATA\${PRODUCT_NAME}\meta.sqlite" loupeSkipDb 0
    Rename "$INSTDIR\recordings\meta.sqlite"     "$APPDATA\${PRODUCT_NAME}\meta.sqlite"
    Rename "$INSTDIR\recordings\meta.sqlite-wal" "$APPDATA\${PRODUCT_NAME}\meta.sqlite-wal"
    Rename "$INSTDIR\recordings\meta.sqlite-shm" "$APPDATA\${PRODUCT_NAME}\meta.sqlite-shm"
  loupeSkipDb:

  IfFileExists "$APPDATA\${PRODUCT_NAME}\settings.json" loupeSkipSettings 0
    Rename "$INSTDIR\recordings\settings.json" "$APPDATA\${PRODUCT_NAME}\settings.json"
  loupeSkipSettings:

  IfFileExists "$PROFILE\Videos\Loupe\sessions" loupeSkipSessions 0
    Rename "$INSTDIR\recordings\sessions" "$PROFILE\Videos\Loupe\sessions"
  loupeSkipSessions:

  loupeMigrationDone:
!macroend
