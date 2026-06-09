import dotenv from 'dotenv';

dotenv.config();

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return value.toLowerCase() === 'true';
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
  enableVirtualMidi: parseBoolean(process.env.ENABLE_VIRTUAL_MIDI, true),
  debugMcuMidi: parseBoolean(process.env.MCU_DEBUG_MIDI, false),
  mcuInputId: process.env.MCU_INPUT_ID?.trim() || '',
  mcuInputName: process.env.MCU_INPUT_NAME?.trim() || '',
  mcuOutputId: process.env.MCU_OUTPUT_ID?.trim() || '',
  mcuOutputName: process.env.MCU_OUTPUT_NAME?.trim() || '',
  mcuVirtualInputName: process.env.MCU_VIRTUAL_INPUT_NAME?.trim() || 'LUNA Studio Remote MCU In',
  mcuVirtualOutputName: process.env.MCU_VIRTUAL_OUTPUT_NAME?.trim() || 'LUNA Studio Remote MCU Out',
};
