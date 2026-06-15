# Development Handoff

## Current Status

This checkpoint is for the focused-strip UX and navigation investigation phase on branch `v2-focused-track-remote`.

## Working

- Focused strip UI is implemented and polished.
- Focused track name and dB display update correctly.
- Focused fader display and taper mapping are working.
- Focused meter is considered complete.
- Meter parsing, rendering, masking, clearing, and peak-hold behavior are working.
- Record, Solo, Mute, and Plus button behavior is working outside Navigation Mode.
- Plus modal is completed for:
  - `New Track Version`
  - `Duplicate Track`
  - `Duplicate Without Content`
- Scribble-strip tap toggles focused Navigation Mode.
- Navigation Mode UI is completed with two secondary buttons for selected-track movement.

## Navigation Status

- Navigation commands are currently the next priority.
- Live testing showed MCU channel/bank navigation can change the MCU/control-surface target and trigger LCD SysEx updates, but it does not reliably change LUNA's actual selected track.
- Plus modal actions operate on LUNA's actual selected track, so Navigation Mode now uses keyboard selected-track movement instead of MCU bank/channel navigation.
- Current Navigation Mode behavior:
  - Track Up sends `P`
  - Track Down sends `;`
- The previous Channel Left and Channel Right secondary-row buttons have been removed.
- Focused-sync investigation logs remain available behind `MCU_DEBUG_MIDI=true`.

## MCU Navigation Findings

- Tested MCU note formats:
  - Channel Left: `90 2E 7F` then `90 2E 00` (`144 46 127`, `144 46 0`)
  - Channel Right: `90 31 7F` then `90 31 00` (`144 49 127`, `144 49 0`)
- LUNA reacts to those MCU messages by updating control-surface/LCD state.
- That MCU response is not enough for Plus modal actions because the modal follows LUNA's actual selected track.
- Transport mode is configured as keyboard, and transport actions continue to use keyboard behavior where configured.

## Meter Findings

- `D0 00` through `D0 0C` = meter levels.
- `D0 0F` = confirmed clip event.
- `D0 0D` and `D0 0E` remain unconfirmed.
- Clip should not drive meter fill.
- Clip should only drive clip/peak lamp visibility.

## Suggested Next Investigation

- Run `MCU_DEBUG_MIDI=true npm run desktop:dev`.
- Enter Navigation Mode from the scribble strip.
- Verify only two secondary navigation buttons appear.
- Confirm Track Up sends `P` and moves LUNA's actual selected track.
- Confirm Track Down sends `;` and moves LUNA's actual selected track.
- Confirm Plus modal actions apply to the selected track reached by those navigation buttons.
- Watch for any remaining mismatch between LUNA selected-track state and MCU focused-strip feedback.

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
