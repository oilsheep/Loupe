Place whisper.cpp runtime files here before producing an offline STT build.

Expected layout:

```text
vendor/whisper/
  win-x64/whisper-cli.exe
  darwin-arm64/whisper-cli
  darwin-x64/whisper-cli
  models/ggml-small.bin
```

The app can also use a custom model path selected in Preferences.
