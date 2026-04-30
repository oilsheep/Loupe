# Changelog

## 0.1.0 - 2026-04-30

### Highlights

- Added a customizable marker label system with editable names and colors.
- Supports four hotkey labels plus up to four additional mouse-only labels.
- Updated default marker labels to `Note`, `Polish`, `Bug`, and `Critical`.
- Recording view now uses colored label buttons directly for marker creation.
- Added a reset flow for restoring default marker labels and hotkeys.
- Improved marker creation responsiveness by showing markers immediately and filling thumbnails asynchronously.
- Added PC full-screen recording for selected monitors, with green selection and red recording frames.
- Improved landscape-aware exports for PC and rotated Android sessions.
- Export now produces MP4 clips, six-frame evidence sheets, HTML/PDF reports, and a compact `summery.txt`.
- Export output is organized into `records/` and `report/` folders.
- Added configurable report title, tester, test note, and build metadata during export.
- Improved large-session loading and batch export progress feedback.
- Added localized UI support, including Traditional Chinese and Simplified Chinese.

### Notes

- PC recording currently supports full-monitor capture only.
- Window/application capture is hidden until it is reliable enough for QA handoff.
