# Luna Studio Remote

Luna Studio Remote is a standalone macOS app for controlling Universal Audio LUNA from an iPhone, iPad, or another browser on the same local network.

## What It Does

- Starts its own bundled production server automatically
- Detects the Mac's LAN IP and shows a scannable QR code
- Opens a single-screen touch remote that mirrors the final production Luna UI
- Sends keystroke commands to LUNA through macOS Accessibility and Automation APIs

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

Because Luna Studio Remote sends keystrokes to LUNA, macOS may prompt for:

- Accessibility permission
- Automation permission
- Local Network permission

If prompted, allow access so the remote can detect the network URL and send commands correctly.

## Important Limitations

- This app is a keystroke remote, not a mixer or hardware control surface.
- It does not receive transport or state feedback directly from LUNA.
- If LUNA focus changes, some shortcuts may behave differently until LUNA is active again.
- Record/transport behavior depends on LUNA's own shortcut handling and macOS permission state.

## Operational Notes

- Same Wi-Fi is required for phone and tablet access.
- Pre-roll or post-roll workflows may require an extra stop press in some cases.
- If macOS Spotlight still owns `Command+Space`, remap that shortcut so Record reaches LUNA.

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
