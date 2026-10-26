# Zashita Desktop

[简体中文](README.md) · [Русский](README.ru.md)

A standalone Windows assistant for Russian thesis defenses. It transcribes Russian speech, extracts questions with recent context, retrieves relevant thesis passages locally and produces Russian answers with Chinese translations.

## Install

Download the x64 installer or portable executable from [Releases](https://github.com/Unlasting-M/Zashita-Desktop/releases). No GPT account, hosted website, Python installation or local speech model is required. Cloud recognition and answers require an internet connection and your own Alibaba Cloud Bailian and DeepSeek API keys.

Windows 10/11 x64 is the target. Desktop acrylic requires Windows 11 22H2 or later and compatible system effects. The current executables are unsigned.

## Use

1. Open Settings, enter both keys and click Save. Select the Bailian region matching your key (Beijing or Singapore). Recognition uses `qwen3-asr-flash-realtime` in Russian.
2. Choose a specific microphone or Windows system audio for an online meeting. The selected device is saved immediately, including when it is temporarily disconnected.
3. Import a text PDF, DOCX, UTF-8 TXT or Markdown file (20MB each; up to 250 PDF pages). Scans require OCR beforehand.
4. Start capture. Switch between the teacher and student roles manually. Speakers sharing one source are not automatically separated.
5. New questions remain in the background queue until you select Next. Questions can also be entered or extracted manually.

Question detection handles unpunctuated Russian, interrogatives, `ли` and academic imperative requests. Extraction includes five recent transcript entries; abbreviations are expanded only when supported by context. Answers show Russian and Chinese text and the retrieved evidence.

## Data and migration

Data stays in `%APPDATA%\ZashitaDesktop`. API keys are stored separately with Windows encryption through Electron `safeStorage` and excluded from JSON backups. Audio goes directly to Alibaba Cloud; questions, context and matching passages go directly to DeepSeek. The embedded server listens only on `127.0.0.1:18789` and checks a per-launch session credential.

Import JSON backups from the Zashita web app through Settings. The older 1.x Windows patch database is incompatible; reimport its thesis files. The old installation is not modified. Minimizing keeps capture running; sleep, lock, disconnection or device loss can interrupt it.

This is a complete new desktop source project based on the author's web client. It does not include the earlier Copy InterviewDog binary, proprietary backend, decompiled modules or offline Whisper models.

## Build

With Node.js 24 LTS and npm on Windows:

```powershell
npm ci
npm run build
npm start
npm test
npm run test:desktop
npm run package:win
```

Outputs are in `release/`. Initial builds download Electron and packaging tools. `test:desktop` uses an isolated profile, fake credentials and a local mock model, with real audio capture disabled. Hardware and paid cloud APIs still require manual acceptance testing. See [validation](docs/VALIDATION.md).

MIT License. Dependencies retain their [licenses](THIRD_PARTY_NOTICES.md).

by xinyu
