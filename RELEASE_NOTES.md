# Luna Studio Remote v2.0.0

Luna Studio Remote v2.0.0 is a focused tracking remote for Universal Audio LUNA. It starts a local server on the Mac, shows a LAN URL and QR code, and lets an iPhone, iPad, or another browser on the same network control the production tracking surface.

## What's New

- Focused channel strip UI for tracking sessions.
- Bidirectional focused fader control between LUNA and the remote.
- Focused meter and peak display with LUNA MCU feedback.
- Focused track arm, solo, and mute controls over MCU/IAC.
- Scribble-strip navigation mode for selected-track movement.
- Plus modal actions for new track version, duplicate track, and duplicate without content.
- Production cleanup removed hidden debug tabs and client-side test-lab UI.
- Packaging metadata and file lists were cleaned up for release.

## Installation

1. Download the DMG or ZIP for Apple Silicon Macs.
2. Move `LUNA Studio Remote.app` into `Applications`.
3. Launch the app.

macOS may show a security warning because this app is not currently signed or notarized. Right-click the app and choose Open the first time you launch it.

## MIDI Setup

Luna Studio Remote uses the macOS IAC Driver as its only supported MIDI path. It does not create custom virtual MIDI ports.

Create or rename IAC buses exactly:

- `LUNA Remote To LUNA`
- `LUNA Remote From LUNA`

In LUNA MIDI Control Surfaces, set:

- Input device: `LUNA Remote To LUNA`
- Output device: `LUNA Remote From LUNA`

## Notes

- Your phone or tablet must be on the same Wi-Fi network as the Mac.
- This app is a focused tracking remote; it is not a full mixer or hardware control surface.
- Play, Stop, Record, Loop/Cycle, Click, and focused-track mute/solo/record-arm use MCU over IAC.
- Focused fader, meter, peak, selected-strip, and track-name state depend on LUNA MCU feedback.
- Commands without a confirmed MCU mapping still use keyboard automation.
- Accessibility, Automation, and Local Network permission prompts may appear on first launch.
- Building distributable macOS artifacts requires full Xcode with `actool`; Apple Command Line Tools alone are not enough.
