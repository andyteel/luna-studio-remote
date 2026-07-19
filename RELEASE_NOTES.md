# Luna Companion v2.0.1

Luna Companion v2.0.1 is a focused reliability update for Universal Audio LUNA sessions with active meters, buses, mixed track types, and larger track counts.

## What's New

- Correctly decodes MCU meter messages for all eight local surface strips.
- Prevents active buses or neighboring tracks from driving the selected track's remote meter.
- Clears stale meter values when LUNA refreshes or reassigns the current surface bank.
- Adds automated regression coverage for packed strip levels, zero-level clears, and peak-hold diagnostics.
- Adds the complete verified LUNA controller configuration to the desktop MIDI Setup panel and README.

## Installation

1. Download the DMG or ZIP for Apple Silicon Macs.
2. Move `Luna Companion.app` into `Applications`.
3. Launch the app.

The release build is signed and notarized for macOS.

## MIDI Setup

Luna Companion uses the macOS IAC Driver as its only supported MIDI path. It does not create custom virtual MIDI ports.

Create or rename IAC buses exactly:

- `LUNA Companion To LUNA`
- `LUNA Companion From LUNA`

In LUNA MIDI Control Surfaces, set:

- Input device: `LUNA Companion To LUNA`
- Output device: `LUNA Companion From LUNA`
- Surface Shows Tracks From: `Focused Window`
- Bank to Selected Track: `On`
- Scroll LUNA When Banking: `On`
- Show Main Track: `On`
- Use Surface Fader Taper: `On`

## Notes

- Your phone or tablet must be on the same Wi-Fi network as the Mac.
- This app is a focused tracking remote; it is not a full mixer or hardware control surface.
- Play, Stop, Record, Loop/Cycle, Click, and focused-track mute/solo/record-arm use MCU over IAC.
- Focused fader, meter, peak, selected-strip, and track-name state depend on LUNA MCU feedback.
- Commands without a confirmed MCU mapping still use keyboard automation.
- Accessibility, Automation, and Local Network permission prompts may appear on first launch.
- Building distributable macOS artifacts requires full Xcode with `actool`; Apple Command Line Tools alone are not enough.
