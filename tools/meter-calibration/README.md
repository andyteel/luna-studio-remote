# LUNA Meter Step Test

This standalone utility is only for meter calibration testing. It is not imported by the app and does not touch production source files.

Generate the test files from the repository root:

```sh
node tools/meter-calibration/generate-luna-meter-step-test.mjs
```

The generator creates:

- `luna-meter-step-test.wav`
- `luna-meter-step-test-map.csv`

The WAV is a 48 kHz, 24-bit mono 1 kHz sine test with stepped dBFS sections and short fades at section boundaries to avoid clicks. Silence rows in the CSV use `-Infinity` for `dbfs` and `0` for `expected_linear_amplitude`.

To use it:

1. Import the WAV into one LUNA audio track.
2. Route it through the focused channel.
3. Watch MIDI Snooper for MCU meter messages, especially `D0` / decimal `208` messages.
4. Compare the MIDI meter output against the CSV timing map.

Do not use this signal at high speaker or headphone levels.
