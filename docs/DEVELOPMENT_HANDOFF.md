# Development Handoff

## Current Status

This checkpoint is for the focused-strip UX and navigation investigation phase on branch `v2-focused-track-remote`.

## Working

- Focused strip UI is implemented.
- Focused track name and dB display update correctly.
- Focused fader display and taper mapping are working.
- Focused meter is rebuilt as a segmented LED-style display.
- Integrated peak indicator behavior is working and held visually in the focused meter.
- Record, Solo, Mute, and Plus button presentation has been polished.
- Plus opens a full-screen action modal.
- Action modal workflows are wired:
  - `New Track Version`
  - `Duplicate Track`
  - `Duplicate Without Content`
- Scribble-strip tap toggles focused Navigation Mode.
- Navigation Mode UI is present and visually improved.

## Focused Navigation Mode Investigation

### UI / Command Routing Status

- Focused Navigation Mode buttons are wired from the UI to backend command IDs:
  - `focusedBankLeft`
  - `focusedChannelLeft`
  - `focusedChannelRight`
  - `focusedBankRight`
- These commands are routed through the MCU navigation path, not keyboard `keyAction` fallback.
- The backend now keeps a diagnostic navigation send-mode switch for live testing.

### Navigation Note Mapping Under Test

- Bank Left: `90 2E 7F`
- Bank Right: `90 2F 7F`
- Channel Left: `90 30 7F`
- Channel Right: `90 31 7F`

These note numbers match the LUNA surface map entries:

- `/control/control_assign/bank_left_switch`
- `/control/control_assign/bank_right_switch`
- `/control/control_assign/channel_left_switch`
- `/control/control_assign/channel_right_switch`

### Tested Release Formats

- `90 note 00`
- `80 note 40`
- long hold `300ms`

### Tested Navigation Send Modes

- `noteOnZeroRelease`
- `noteOffRelease`
- `longHoldNoteOff`

Additional diagnostic modes remain available for future testing:

- `noteOnOnly`
- `longHoldNoteOnZero`

Set with:

```sh
MCU_NAV_SEND_MODE=noteOffRelease npm run desktop:dev
```

### Observed Result

- Backend logs show outbound MIDI is sent successfully to `IAC Luna Remote To Luna`.
- Example logged sequences:
  - Channel Right: `90 31 7F` then release
  - Channel Left: `90 30 7F` then release
  - Bank Left: `90 2E 7F` then release
  - Bank Right: `90 2F 7F` then release
- LUNA does not change focused track / bank.
- No follow-up LUNA feedback is received after these navigation commands.

### Current Conclusion

- This is no longer a focused-strip UI problem.
- It appears to be an MCU command acceptance / outbound control-path issue in how LUNA handles these navigation switch messages.
- The frontend Navigation Mode UI should be kept intact while the outbound MCU behavior is investigated further.

## MCU Navigation Debugging Notes

- Startup logs report the selected navigation send mode.
- Per-message outbound MIDI logging is available behind `MCU_DEBUG_MIDI=true`.
- Outbound log format:

```sh
MIDI OUT to LUNA (IAC Luna Remote To Luna): 90 30 7F
MIDI OUT to LUNA (IAC Luna Remote To Luna): 90 30 00
```

## Useful Commands

```sh
npm run build
MCU_DEBUG_MIDI=true npm run desktop:dev
MCU_NAV_SEND_MODE=noteOnZeroRelease npm run desktop:dev
MCU_NAV_SEND_MODE=noteOffRelease npm run desktop:dev
MCU_NAV_SEND_MODE=noteOnOnly npm run desktop:dev
MCU_NAV_SEND_MODE=longHoldNoteOnZero npm run desktop:dev
MCU_NAV_SEND_MODE=longHoldNoteOff npm run desktop:dev
```
