# Luna Studio Remote

Luna Studio Remote is a standalone macOS app for controlling Universal Audio LUNA from an iPhone, iPad, or another browser on the same local network.

## What It Does

- Starts its own bundled production server automatically
- Detects the Mac's LAN IP and shows a scannable QR code
- Opens a single-screen touch remote that mirrors the final production Luna UI
- Uses the macOS IAC Driver for MCU transport, focused-track controls, and LUNA feedback
- Keeps keyboard automation for commands that do not have a confirmed MCU mapping

## Downloads

Public release downloads are intended to be shared from GitHub Releases:

- `LUNA Studio Remote-1.0.0-arm64.dmg`
- `LUNA Studio Remote-1.0.0-arm64-mac.zip`

This release is currently built for Apple Silicon Macs.

## Installation

1. Download either the DMG or ZIP from the release page.
2. If you use the DMG, open it and drag `LUNA Studio Remote.app` into `Applications`.
3. If you use the ZIP, extract it and move `LUNA Studio Remote.app` into `Applications`.
4. Launch `LUNA Studio Remote.app`.

macOS may show a security warning because this app is not currently signed or notarized. Right-click the app and choose Open the first time you launch it.

## First Launch

When the app opens, it starts the bundled server automatically and shows:

- the LAN URL
- a QR code for phone or tablet access
- server controls for copy, open, restart, stop, and quit

Your iPhone or iPad must be on the same Wi-Fi or wired LAN as the Mac running Luna Studio Remote.

## Required macOS Permissions

Because Luna Studio Remote opens a local network remote and still uses keyboard automation for some non-MCU commands, macOS may prompt for:

- Accessibility permission
- Automation permission
- Local Network permission

If prompted, allow access so the remote can detect the network URL and send commands correctly.

## MIDI Setup

Luna Studio Remote is IAC-only. It does not create custom virtual MIDI ports.

In Audio MIDI Setup, enable the IAC Driver and create or rename buses exactly:

- `LUNA Remote To LUNA`
- `LUNA Remote From LUNA`

In LUNA's MIDI Control Surfaces setup:

- Input device: `LUNA Remote To LUNA`
- Output device: `LUNA Remote From LUNA`

The app expects:

- Input to app: `LUNA Remote From LUNA`
- Output from app: `LUNA Remote To LUNA`

## Troubleshooting

If Luna Studio Remote connects to the IAC ports but the MIDI Setup screen does not yet show MCU Receiving, Focused Track Selected, Track Name Received, or Focused Track Hydrated, return to LUNA and select a track. LUNA may wait for the track selection to change before sending fresh MCU focus and track-name state. Selecting a track should hydrate the remote.

## Important Limitations

- This app is a focused tracking remote, not a full mixer or hardware control surface.
- Play, Stop, Record, Loop/Cycle, Click, focused-track record arm, focused-track solo, and focused-track mute use MCU.
- LUNA sends MCU transport, select, and LCD feedback when available; already-open sessions may not resend LCD track names until LUNA initializes the control surface again.
- If LUNA focus changes, some shortcuts may behave differently until LUNA is active again.
- Commands without a confirmed MCU mapping still depend on LUNA's keyboard shortcut handling and macOS permission state.

## Operational Notes

- Same Wi-Fi is required for phone and tablet access.
- Pre-roll, post-roll, marker, navigation, zoom, and edit workflows use keyboard automation unless explicitly implemented through MCU.

## Local Development

```bash
npm install
npm run dev
```

Desktop packaging:

```bash
npm run desktop:package
```

## Release Artifacts

Packaged output is written to:

- `release/LUNA Studio Remote-1.0.0-arm64.dmg`
- `release/LUNA Studio Remote-1.0.0-arm64-mac.zip`
- `release/mac-arm64/LUNA Studio Remote.app`
