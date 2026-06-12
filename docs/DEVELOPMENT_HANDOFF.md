# Development Handoff

## Current Status

This checkpoint is for the Focused Track UI phase on branch `v2-focused-track-remote`.

## Working

- Focused-channel strip implemented.
- Track navigation mode implemented.
- Fader gain display calibrated and working.
- MCU fader taper mapping working.
- Focused track name updating correctly.
- Meter parsing working.
- Meter rendering/masking working.
- Meter clears correctly after playback stops.
- dB formatting corrected.
- Test signal generator created under:
  - `tools/meter-calibration/`

## Current Open Issue

- Server detects clip correctly.
- `D0 0F` confirmed as clip event.
- Terminal logs show:
  - `clip=true`
  - confirmed `D0` clip
- Meter fill behavior is correct.
- Clip lamp was not visible in the UI during the confirmed hardware test.
- Remaining issue appears to be frontend rendering/state propagation only.

Latest frontend work moved the clip lamp into the active meter region, keeps the clip image mounted, and toggles visibility with `focusedTrack.meter.clip === true`. A forced-visible browser check confirmed the asset path, dimensions, z-index, opacity, and position. The next session should re-test this against a live `D0 0F` event from LUNA.

## Recent Findings

- `D0 00` through `D0 0C` = meter levels.
- `D0 0F` = confirmed clip event.
- `D0 0D` and `D0 0E` remain unconfirmed.
- Clip should not drive meter fill.
- Clip should only drive clip lamp visibility.

## Suggested Next Investigation

- Verify `focusedTrack.meter.clip` reaches React state during a live clipped playback test.
- Verify clip lamp render condition.
- Verify z-index, opacity, dimensions, overflow, and asset path.
- Temporarily force clip lamp visible if necessary.
- If live state does not reach React, inspect `/api/state` polling timing versus the clip hold/reset window.

## Useful Commands

```sh
MCU_DEBUG_MIDI=true npm run desktop:dev
npm run build
```
