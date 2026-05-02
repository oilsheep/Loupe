Place a bundled faster-whisper Python runtime here before producing an offline
speech-to-text build.

Expected layouts:

- `darwin-arm64/bin/python`
- `darwin-x64/bin/python`
- `win32-x64/Scripts/python.exe`
- `linux-x64/bin/python`

If this directory is empty, Loupe can create a managed venv at
`~/.loupe/tools/faster-whisper-venv` from Tool Status.

Bundled models can be placed at:

- `models/small`
- `<platform-arch>/models/small`

The model directory should contain files such as `config.json`, `model.bin`,
and `tokenizer.json`. If no bundled model is present, Tool Status can download
`Systran/faster-whisper-small` into
`~/.loupe/tools/faster-whisper/models/small`.
