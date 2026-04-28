# Third-Party Notices

Loupe QA Recorder source code is licensed under the MIT License. Packaged builds may include third-party tools and libraries that keep their original licenses. These third-party components are not relicensed under MIT.

This notice summarizes the main third-party components used by Loupe. For exact license text and additional transitive notices, refer to the upstream projects and package files.

## Bundled Runtime Tools

| Component | Purpose | License / Terms | Source |
| --- | --- | --- | --- |
| scrcpy | Android screen mirroring and control | Apache License 2.0 | https://github.com/Genymobile/scrcpy |
| Android Debug Bridge (`adb`) / Android Platform Tools | Android device communication | Android SDK terms; AOSP components are generally Apache License 2.0 | https://developer.android.com/studio/command-line/adb |
| FFmpeg libraries included with scrcpy builds (`avcodec`, `avformat`, `avutil`, `swresample`) | Media decoding/encoding support used by scrcpy | FFmpeg licensing applies, commonly LGPL/GPL depending on build configuration | https://ffmpeg.org/legal.html |
| SDL2 | scrcpy windowing/input dependency | zlib License | https://www.libsdl.org/license.php |
| libusb | USB access dependency | LGPL 2.1 or later | https://github.com/libusb/libusb |

## npm Runtime Dependencies

| Component | Purpose | License |
| --- | --- | --- |
| Electron | Desktop application runtime | MIT, with bundled Chromium/Node notices |
| React | Renderer UI framework | MIT |
| React DOM | Renderer UI framework | MIT |
| React Router | Renderer routing | MIT |
| Zustand | Renderer state management | MIT |
| better-sqlite3 | Local SQLite database | MIT |
| @ffmpeg-installer/ffmpeg | FFmpeg binary path for export processing | LGPL 2.1 |

## Developer Dependencies

Loupe also uses development and build tooling such as TypeScript, Vite, electron-vite, electron-builder, Tailwind CSS, Vitest, and Testing Library. These are not part of Loupe's own license grant and retain their original package licenses.

## Distribution Note

If you redistribute a packaged Loupe installer, keep this notice with the distribution and do not remove upstream copyright, license, or notice files from third-party components.
