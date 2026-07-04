import dotenv from 'dotenv';

dotenv.config();

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
};

const parseMcuTransportMode = (value: string | undefined): 'keyboard' | 'prefer-mcu' | 'mcu-only' => {
  const normalized = value?.trim().toLowerCase();

  return normalized === 'prefer-mcu' || normalized === 'mcu-only' ? normalized : 'keyboard';
};

const parseMcuNavSendMode = (
  value: string | undefined,
): 'noteOnZeroRelease' | 'noteOffRelease' | 'noteOnOnly' | 'longHoldNoteOnZero' | 'longHoldNoteOff' => {
  const normalized = value?.trim();

  switch (normalized) {
    case 'noteOffRelease':
    case 'noteOnOnly':
    case 'longHoldNoteOnZero':
    case 'longHoldNoteOff':
      return normalized;
    case 'noteOnZeroRelease':
    default:
      return 'noteOnZeroRelease';
  }
};

export const config = {
  host: process.env.HOST?.trim() || '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  testMode: parseBoolean(process.env.TEST_MODE, false),
  enableKeystrokes: parseBoolean(process.env.ENABLE_KEYSTROKES, true),
  lunaAppName: process.env.LUNA_APP_NAME?.trim() || 'LUNA',
  appPin: process.env.APP_PIN?.trim() || '',
  isDev: process.env.NODE_ENV !== 'production',
  enableMcu: parseBoolean(process.env.ENABLE_MCU, true),
  enableMidi: parseBoolean(process.env.ENABLE_MIDI, true),
  midiMode: 'iac' as const,
  debugMcuMidi: parseBoolean(process.env.MCU_DEBUG_MIDI, false),
  mcuTransportMode: parseMcuTransportMode(process.env.MCU_TRANSPORT_MODE),
  mcuNavSendMode: parseMcuNavSendMode(process.env.MCU_NAV_SEND_MODE),
  expectedIacInputName: process.env.MCU_IAC_INPUT_NAME?.trim() || 'LUNA Companion From LUNA',
  expectedIacOutputName: process.env.MCU_IAC_OUTPUT_NAME?.trim() || 'LUNA Companion To LUNA',
  mcuInputId: process.env.MCU_INPUT_ID?.trim() || '',
  mcuInputName: process.env.MCU_INPUT_NAME?.trim() || '',
  mcuOutputId: process.env.MCU_OUTPUT_ID?.trim() || '',
  mcuOutputName: process.env.MCU_OUTPUT_NAME?.trim() || '',
};
