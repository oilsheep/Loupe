# Changelog

## 0.5.0 - 2026-05-04

### Highlights

- Added review-stage video annotations, including rectangle, ellipse, arrow, freehand, and text overlays that are saved with markers and rendered into exported clips.
- Added an editor-style review timeline with zoom, viewport dragging, scrubbing, marker selection, and clip-range handles.
- Added imported-video analysis so existing recordings can be reviewed, annotated, transcribed, and exported without starting a live recording session.
- Added optional external tester audio for imported videos, with review-time audio offset adjustment.
- Added local STT-assisted review: audio auto-markers, marker note transcription, language defaults, and Traditional/Simplified Chinese output options.
- Added iOS recording support path through UxPlay/AirPlay mirroring and iOS tool-status checks.
- Added remote publishing flows for Slack, GitLab, and Google Drive/Sheets, including mention identity support.
- Added common session metadata for platform, project, tester, report title, build version, and test notes across session start, review, and export.
- Removed the eight-label limit and expanded marker labels to unlimited custom colored labels.
- Improved preferences for language, labels, STT, common metadata, publish settings, and license information.
- Improved evidence exports with annotated clips, six-frame sheets, HTML/PDF reports, `summery.txt`, progress feedback, cancellation, and no-marker export handling.
- Improved resilience for long sessions, missing linked videos, Android disconnects, and packaged tool discovery.

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
