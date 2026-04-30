# Loupe QA Recorder User Guide

This guide explains how to install Loupe, record PC/Mac screens, single windows, or Android devices, mark bugs, review markers, and export clips.

## 1. Install Loupe

1. Run `Loupe QA Recorder-0.1.0.exe`.
2. If Windows shows a SmartScreen warning, select **More info** and then **Run anyway**.
3. Open **Loupe QA Recorder** from the desktop shortcut or Start menu.

Loupe ships with the required Windows binaries for Android control, screen mirroring, recording, and export. Users do not need to install `adb`, `scrcpy`, or ffmpeg manually.

## 2. Choose What to Record

Loupe supports two recording source types:

- **PC/Mac screen or window**: record one full monitor, or capture a single application window. This is useful for PC builds, browser tests, admin tools, or workflows that are not on an Android device.
- **Android device**: record and control an Android device over USB or Wi-Fi debugging.

### PC/Mac Screen Or Window Recording

1. In the left panel, locate **PC recording**.
2. Choose the **Entire Screen** or **Window** tab.
3. Select the screen or window card you want to record.
4. For full-screen capture, confirm the thin green frame appears on that monitor.
5. Enter the build or test version in the session form.
6. Press **Start session**.
7. Loupe changes the full-screen frame to red while recording. Single-window capture does not show a frame.
8. Add markers with the hotkeys or colored label buttons.
9. Press **Stop** when finished.

Single-window capture records only the selected window. If that window is minimized, hidden by the system, or using protected content, the recording may turn black or stop updating.

### macOS Permission

The first time macOS records a screen or window, it may require Screen Recording permission:

1. Open **System Settings**.
2. Go to **Privacy & Security > Screen Recording**.
3. Allow the Loupe app, or allow the Terminal / development tool that launched Loupe.
4. Restart Loupe.

If recording starts but no image is captured, check this permission first.

## 3. Prepare an Android Device

Official Android references with screenshots:

- [Configure on-device developer options](https://developer.android.com/studio/debug/dev-options)
- [Connect to your device using Wi-Fi](https://developer.android.com/studio/run/device#wireless)

### Enable Developer Options

1. Open Android **Settings**.
2. Go to **About phone**.
3. Find **Build number**.
4. Tap **Build number** seven times until Android says you are now a developer.
5. Enter the phone PIN/password if prompted.
6. Go back to Settings and open **System > Developer options**. On some brands this location can be slightly different.

### USB Connection

1. In **Developer options**, enable **USB debugging**.
2. Connect the phone to the PC with a USB data cable.
3. Approve the **Allow USB debugging?** prompt on the device.
4. In Loupe, select the detected USB device from the left panel.

### Wi-Fi Connection

Android 11 or later is required for Wireless debugging.

1. Make sure the PC and phone are on the same Wi-Fi network.
2. In **Developer options**, enable **Wireless debugging**.
3. Tap **Wireless debugging** to open its detail page.
4. Tap **Pair device with pairing code**.
5. Keep this phone screen open. Android shows an IP:port and a six-digit pairing code.
6. In Loupe, click **Scan Wi-Fi devices**.
7. If a `needs pairing` entry appears, click **Pair**, enter the six-digit code from the phone, and submit.
8. Click **Scan Wi-Fi devices** again if needed.
9. Click **Connect** on the `ready` Wi-Fi entry.
10. Loupe shows the device as connected in the left panel.

If auto-discovery does not find the phone, type the Wireless debugging IP:port into **Add Wi-Fi device** and click **connect**.

## 4. Start a Session

1. Select a PC/Mac screen, PC/Mac window, or Android device.
2. Enter the build or test version.
3. Optionally enter a test note.
4. Press **Start session**.

Loupe begins recording and shows a recording indicator. Android sessions open a controllable mirror window; PC/Mac sessions record the selected full monitor or single window.

## 5. Add Markers While Recording

Use the default hotkeys:

- `F6`: Note
- `F7`: Polish
- `F8`: Bug
- `F9`: Critical

You can also click the colored label buttons in the recording panel to create a marker of the matching type. Four more custom labels can be added for mouse-only marking.

Markers are created immediately. Thumbnail capture runs in the background so testing is not blocked.

Hotkeys are ignored while typing inside text fields to avoid interrupting note input.

## 6. Review Markers

After stopping the session, Loupe opens the review screen. In this screen, you can:

- change marker type
- write multi-line notes
- adjust the export start and end range
- select or deselect markers
- record voice notes
- delete markers
- replay the exact export range

Clicking a marker card seeks the video to the clip start, plays to the clip end, and then pauses. Clicking it again replays the same range.

## 7. Export Clips

1. Select one or more markers.
2. Press **Export**.
3. Confirm or choose the output folder.
4. Enter or edit **Tester** and **Test note** if needed.
5. Confirm export.

For each selected marker, Loupe creates:

- an MP4 clip
- a six-frame preview image sheet

The file name is based on the marker note, build version, and date.

## 8. Caption and Preview Layout

Exported clips and preview sheets include a caption area with:

```text
Severity / Marker note
Build / Android OS, Windows, or macOS / Device, PC screen, or window
Tester / Computer timestamp
```

The marker note is bold and wraps automatically when it is too long.

Preview sheets preserve orientation:

- landscape recordings export landscape evidence sheets
- portrait recordings export portrait evidence sheets

## 9. Session Files

Loupe saves sessions as `.loupe` files. Reopen a saved session to restore:

- markers
- marker types
- notes
- clip ranges
- voice notes
- linked video path

If the linked video is missing, Loupe asks the user to locate it manually.

## Troubleshooting

### PC screen recording selects the wrong area

- Re-select the target monitor in the left panel.
- Confirm the green frame appears only on the intended monitor.
- If the recording still clips incorrectly, check Windows display scaling and monitor arrangement.

### Window recording is black or stops updating

- Make sure the target window is not minimized.
- On macOS, confirm Screen Recording permission is granted.
- Avoid protected video or elevated/admin windows when possible.

### The Android device is not detected

- Confirm USB debugging is enabled.
- Confirm the phone authorized this computer.
- Try another USB data cable or port.
- For Wi-Fi, confirm both devices are on the same network.

### Wi-Fi scan does not find the phone

- Keep the Android Wireless debugging screen open.
- Try **Scan Wi-Fi devices** again.
- Use **Add Wi-Fi device** with the IP:port shown on the phone.

### Hotkeys do not create markers

- Confirm a recording session is active.
- Make sure the cursor is not inside a text field.
- If another app captures the function keys, change the marker key settings.

### Exported clips have unexpected duration

- Check the marker export range in review mode.
- Loupe clamps clip windows at the beginning and end of the recording to avoid invalid ranges.

### Windows shows an unknown publisher warning

The current installer is unsigned. This is expected for local builds. For public distribution, use Windows code signing.
