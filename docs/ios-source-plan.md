# iOS Recording Source Plan

This plan captures the current direction for adding iOS as a Loupe recording source.

## Goal

Add an iOS source that can, as much as possible, match the Android QA workflow:

- show the iPhone screen on the desktop
- record the mirrored iPhone session
- support wireless operation where practical
- support mouse/keyboard control where the platform allows it
- collect useful iOS logs and crash data for exported evidence

## Current Direction

Do not build the first version on top of `quicktime_video_hack` / qvh.

qvh originally looked like the best USB path because it follows the QuickTime-style iPhone capture protocol and can produce low-latency H.264 video. However, it is no longer a good first implementation target:

- macOS 26 appears to block the old path behind Apple-only entitlements.
- The qvh author has explicitly given up on Windows support.
- Making this viable would require a deeper custom protocol and transport implementation.

Keep qvh only as research material for a future R&D track.

## Preferred Paths

### 1. macOS: iPhone Mirroring

Use Apple iPhone Mirroring as the first macOS iOS source.

Expected role:

- primary macOS iOS source
- wireless mirroring
- mouse and keyboard control through Apple's official app
- capture the iPhone Mirroring app window using Loupe's existing PC/window capture pipeline

Why this is first:

- It is the closest match to the desired iOS QA workflow.
- It gives control, not only viewing.
- It appears as a normal macOS app window, which should fit the existing window recording model better than system AirPlay surfaces.

Known limits:

- macOS only.
- Requires Apple account/device compatibility and Apple's pairing flow.
- Loupe cannot fully own the mirroring protocol; it orchestrates and records the official app window.

Implementation notes:

- Add an `iOS` source tab/section.
- Detect macOS availability and show this option only where supported.
- Guide the user to open/pair iPhone Mirroring if it is not already running.
- Reuse the existing window capture stack to select and record the iPhone Mirroring window.
- Reuse the red recording frame and bring-to-front behavior where possible.

### 2. Windows/macOS: UxPlay AirPlay Receiver

Use UxPlay as the cross-platform wireless projection fallback, especially for Windows.

Expected role:

- primary Windows iOS projection path
- optional macOS fallback
- wireless screen mirroring through AirPlay
- record the UxPlay receiver window using Loupe's existing PC/window capture pipeline

Why this is useful:

- It gives Windows a practical iOS screen projection path.
- The user can start mirroring from iPhone Control Center with no iOS-side tooling.

Known limits:

- No reliable iOS control. Treat this as view/record only.
- Latency is expected to be higher than USB or iPhone Mirroring.
- Requires the iPhone and computer to be on the same network, with no AP isolation.
- AirPlay compatibility can break when Apple changes behavior.
- UxPlay is GPL-3.0, so treat it as an external optional process/dependency rather than a linked library.

Implementation notes:

- Bundle or locate UxPlay as a helper binary where license review allows.
- Launch it as a child process with a predictable receiver/window name.
- Detect whether the receiver window appears in Electron `desktopCapturer`.
- Record that window through the existing PC/window capture flow.
- Clearly label this mode as "view and record only" until control is solved.

### 3. macOS: Built-in AirPlay Receiver

Treat macOS's built-in AirPlay Receiver as a spike/fallback, not the main path.

Expected role:

- optional macOS fallback for wireless projection
- view/record only

Why this is not first:

- The receiver may be rendered as a system-managed surface rather than a stable app window.
- It may not reliably appear in Electron's capturable window list.
- It does not provide mouse/keyboard control of iOS.

Spike questions:

- Does the AirPlay Receiver surface appear in `desktopCapturer.getSources({ types: ['window', 'screen'] })`?
- Does it have a stable title, app owner, or source id?
- Can it be brought forward or framed like a regular window?
- Does capture keep updating during active mirroring?

Only add it as a product option if these checks are reliable enough.

Spike command:

```bash
pnpm --dir apps/desktop run spike:airplay
```

Test flow:

1. On macOS, enable **System Settings > General > AirDrop & Handoff / AirDrop & Continuity > AirPlay Receiver**.
2. Start the spike command.
3. On iPhone, open **Control Center > Screen Mirroring** and select this Mac.
4. Watch the console for added `desktopCapturer` sources or suspicious matches such as `AirPlay`, the iPhone name, `Receiver`, `Continuity`, or `Mirroring`.
5. Stop mirroring and confirm whether the source disappears or the display list changes back.

The script defaults to a 30-minute watch window and polls every 5 seconds. To adjust:

```bash
pnpm --dir apps/desktop run spike:airplay -- --minutes=10 --interval=2
```

## Logs And Device Tooling

Use `pymobiledevice3` as the likely iOS logs/tooling backend.

Expected role:

- device discovery
- syslog / OS log capture
- crash log collection
- device metadata
- app metadata where useful
- possible support for newer iOS tunnel workflows

Important distinction:

- `pymobiledevice3` is not the video/mirroring backend.
- It complements iPhone Mirroring or AirPlay by collecting logs and device evidence.

Licensing note:

- `pymobiledevice3` is GPL-3.0.
- Prefer invoking it as an external CLI/helper process instead of importing/linking it into Loupe code.

## Suggested Roadmap

1. Add the iOS source section and source type plumbing.
2. Implement macOS iPhone Mirroring source by recording the iPhone Mirroring app window.
3. Add iOS log capture using `pymobiledevice3` over USB first.
4. Add Windows UxPlay projection as a view/record-only iOS mode.
5. Spike macOS built-in AirPlay Receiver capture reliability.
6. Decide whether AirPlay Receiver deserves a user-facing fallback option.
7. Keep qvh in research notes only unless a future R&D cycle explicitly targets custom iOS capture protocol work.

## Product Positioning

Initial UI wording should be honest about capability:

- macOS iPhone Mirroring: "Wireless, controllable, records the iPhone Mirroring window."
- UxPlay/AirPlay: "Wireless viewing and recording. Control is not supported."
- Built-in macOS AirPlay Receiver: "Experimental fallback, if capture reliability is confirmed."
