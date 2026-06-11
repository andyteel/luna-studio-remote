# Luna Studio Remote v1.0.0

Luna Studio Remote is a standalone macOS app that starts its own local server, shows a LAN URL and QR code, and lets you control Universal Audio LUNA from an iPhone, iPad, or another browser on the same network.

## Installation

1. Download the DMG or ZIP for Apple Silicon Macs.
2. Move `LUNA Studio Remote.app` into `Applications`.
3. Launch the app.

macOS may show a security warning because this app is not currently signed or notarized. Right-click the app and choose Open the first time you launch it.

## MIDI Setup

Luna Studio Remote now uses the macOS IAC Driver as its only supported MIDI path. It does not create custom virtual MIDI ports.

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
- The remote receives MCU transport, select, LCD, and diagnostic feedback when LUNA sends it.
- Commands without a confirmed MCU mapping still use keyboard automation.
- Pre-roll or post-roll workflows may sometimes need a second stop press.
- Accessibility, Automation, and Local Network permission prompts may appear on first launch.
