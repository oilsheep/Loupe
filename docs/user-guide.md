# Loupe QA Recorder User Guide

This guide explains how to install Loupe, connect an Android device, record a QA session, mark bugs, review markers, and export clips.

## 1. Install Loupe

1. Run `Loupe QA Recorder-0.0.0-Setup.exe`.
2. If Windows shows a SmartScreen warning, select **More info** and then **Run anyway**.
3. Open **Loupe QA Recorder** from the desktop shortcut or Start menu.

Loupe ships with the required Windows binaries for Android control and recording. Users do not need to install `adb`, `scrcpy`, or ffmpeg manually.

## 2. Prepare the Android Device

### USB Connection

1. Open Android **Settings**.
2. Enable **Developer options**.
3. Enable **USB debugging**.
4. Connect the phone to the PC with a USB data cable.
5. Approve the debugging prompt on the device.
6. In Loupe, select the detected device.

### Wi-Fi Connection

1. Enable **Wireless debugging** in Android Developer options.
2. Make sure the PC and phone are on the same network.
3. Use the Wi-Fi pairing option in Loupe.
4. After the connection succeeds, Loupe shows the connected device name.

## 3. Start a Session

1. Confirm the connected device.
2. Enter the build or test version.
3. Optionally enter tester information later during export.
4. Press **Start**.

Loupe begins recording the session and shows a recording indicator. The Android device remains controllable from the PC.

## 4. Add Markers While Recording

Use the default hotkeys:

- `F6`: improvement
- `F7`: minor
- `F8`: normal
- `F9`: major

Markers are created immediately. Loupe may show a loading state while it captures the thumbnail, but the marker itself is added first so testing is not blocked.

Hotkeys are ignored while typing inside text fields to avoid interrupting note input.

## 5. Review Markers

After stopping the session, Loupe opens the review screen. In this screen, you can:

- change marker type
- write multi-line notes
- adjust the export start and end range
- select or deselect markers
- record voice notes
- delete markers
- replay the exact export range

Clicking a marker card seeks the video to the clip start, plays to the clip end, and then pauses. Clicking it again replays the same range.

## 6. Export Clips

1. Select one or more markers.
2. Press **Export**.
3. Confirm or choose the output folder.
4. Enter or edit **Tester** and **Test note** if needed.
5. Confirm export.

For each selected marker, Loupe creates:

- an MP4 clip
- a 3x3 preview image sheet

The file name is based on the marker note, build version, and date.

## 7. Caption Layout

Exported clips and preview sheets include a caption area with:

```text
Marker note
Build / Android OS / Device
Tester / Computer timestamp
```

The marker note is bold and wraps automatically when it is too long.

## 8. Session Files

Loupe saves sessions as `.loupe` files. Reopen a saved session to restore:

- markers
- marker types
- notes
- clip ranges
- voice notes
- linked video path

If the linked video is missing, Loupe asks the user to locate it manually.

## Troubleshooting

### The device is not detected

- Confirm USB debugging is enabled.
- Confirm the phone authorized this computer.
- Try another USB data cable or port.
- For Wi-Fi, confirm both devices are on the same network.

### Hotkeys do not create markers

- Confirm a recording session is active.
- Make sure the cursor is not inside a text field.
- If another app captures the function keys, change the marker key settings.

### Exported clips have unexpected duration

- Check the marker export range in review mode.
- Loupe clamps clip windows at the beginning and end of the recording to avoid invalid ranges.

### Windows shows an unknown publisher warning

The current installer is unsigned. This is expected for local builds. For public distribution, use Windows code signing.
