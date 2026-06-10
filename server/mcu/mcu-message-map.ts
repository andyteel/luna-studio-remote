const MCU_NOTE_STATUS = 144; // 0x90
const MCU_CONTROL_CHANGE_STATUS = 176; // 0xB0
const MCU_CHANNEL_PRESSURE_STATUS_BASE = 208; // 0xD0
const MCU_PITCH_BEND_STATUS_BASE = 224; // 0xE0
const MCU_SYSEX_STATUS = 240; // 0xF0
const MCU_SYSEX_END = 247; // 0xF7
const MCU_MANUFACTURER_ID = [0, 0, 102] as const; // 00 00 66
const MCU_LCD_SYSEX_COMMAND = 18; // 0x12
const MCU_LCD_LOWER_ROW_OFFSET = 56; // 0x38

const MCU_STRIP_COUNT = 8;
const MCU_MAIN_FADER_INDEX = 8;

export type McuNoteAddress = Readonly<{
  status: number;
  data1: number;
}>;

export type McuPitchBendAddress = Readonly<{
  status: number;
}>;

export type McuChannelPressureAddress = Readonly<{
  status: number;
}>;

export type McuLcdAddress = Readonly<{
  slot: number;
  row: 'upper' | 'lower';
}>;

export type McuStripButtonRole = 'recordEnable' | 'solo' | 'mute' | 'select' | 'faderTouch';
export type McuTransportRole = 'stop' | 'play' | 'record' | 'click' | 'cycle' | 'rewind' | 'fastForward';
export type McuNavigationRole = 'channelLeft' | 'channelRight' | 'bankLeft' | 'bankRight';

type StripIndex = number;

const assertStripIndex = (stripIndex: StripIndex): void => {
  if (!Number.isInteger(stripIndex) || stripIndex < 0 || stripIndex >= MCU_STRIP_COUNT) {
    throw new RangeError(`MCU strip index out of range: ${stripIndex}`);
  }
};

const assertStripOrMainIndex = (stripIndex: StripIndex): void => {
  if (!Number.isInteger(stripIndex) || stripIndex < 0 || stripIndex > MCU_MAIN_FADER_INDEX) {
    throw new RangeError(`MCU strip/main index out of range: ${stripIndex}`);
  }
};

const note = (data1: number): McuNoteAddress => ({
  status: MCU_NOTE_STATUS,
  data1,
});

const pitchBend = (status: number): McuPitchBendAddress => ({
  status,
});

const channelPressure = (status: number): McuChannelPressureAddress => ({
  status,
});

const lcd = (slot: number, row: 'upper' | 'lower'): McuLcdAddress => ({
  slot,
  row,
});

const STRIP_SWITCH_OFFSETS = {
  recordEnable: 0, // 0x00
  solo: 8, // 0x08
  mute: 16, // 0x10
  select: 24, // 0x18
  faderTouch: 104, // 0x68
} as const satisfies Record<McuStripButtonRole, number>;

const STRIP_LED_OFFSETS = {
  recordEnable: 0, // 0x00
  solo: 8, // 0x08
  mute: 16, // 0x10
  select: 24, // 0x18
} as const satisfies Record<Exclude<McuStripButtonRole, 'faderTouch'>, number>;

const TRANSPORT_NOTE_NUMBERS = {
  rewind: 91, // 0x5B, LUNA JSON name: frwd_switch
  fastForward: 92, // 0x5C, LUNA JSON name: ffwd_switch
  stop: 93, // 0x5D
  play: 94, // 0x5E
  record: 95, // 0x5F
  cycle: 86, // 0x56
  click: 89, // 0x59
} as const satisfies Record<McuTransportRole, number>;

const NAVIGATION_NOTE_NUMBERS = {
  bankLeft: 46, // 0x2E
  bankRight: 47, // 0x2F
  channelLeft: 48, // 0x30
  channelRight: 49, // 0x31
} as const satisfies Record<McuNavigationRole, number>;

const stripSwitchAddress = (stripIndex: StripIndex, role: McuStripButtonRole): McuNoteAddress => {
  assertStripIndex(stripIndex);
  return note(STRIP_SWITCH_OFFSETS[role] + stripIndex);
};

const stripLedAddress = (
  stripIndex: StripIndex,
  role: Exclude<McuStripButtonRole, 'faderTouch'>,
): McuNoteAddress => {
  assertStripIndex(stripIndex);
  return note(STRIP_LED_OFFSETS[role] + stripIndex);
};

const stripFaderAddress = (stripIndex: StripIndex): McuPitchBendAddress => {
  assertStripOrMainIndex(stripIndex);
  return pitchBend(MCU_PITCH_BEND_STATUS_BASE + stripIndex);
};

const stripMeterAddress = (stripIndex: StripIndex): McuChannelPressureAddress => {
  assertStripIndex(stripIndex);
  return channelPressure(MCU_CHANNEL_PRESSURE_STATUS_BASE + stripIndex);
};

const stripLcdAddress = (stripIndex: StripIndex, row: 'upper' | 'lower'): McuLcdAddress => {
  assertStripIndex(stripIndex);
  return lcd(stripIndex, row);
};

export const MCU_MESSAGE_MAP = {
  protocol: {
    noteStatus: MCU_NOTE_STATUS,
    controlChangeStatus: MCU_CONTROL_CHANGE_STATUS,
    channelPressureStatusBase: MCU_CHANNEL_PRESSURE_STATUS_BASE,
    pitchBendStatusBase: MCU_PITCH_BEND_STATUS_BASE,
    sysexStatus: MCU_SYSEX_STATUS,
    sysexEnd: MCU_SYSEX_END,
    manufacturerId: MCU_MANUFACTURER_ID,
    lcdSysexCommand: MCU_LCD_SYSEX_COMMAND,
    lcdLowerRowOffset: MCU_LCD_LOWER_ROW_OFFSET,
    stripCount: MCU_STRIP_COUNT,
    mainFaderIndex: MCU_MAIN_FADER_INDEX,
  },

  transport: {
    stop: {
      input: note(TRANSPORT_NOTE_NUMBERS.stop),
      led: note(TRANSPORT_NOTE_NUMBERS.stop),
    },
    play: {
      input: note(TRANSPORT_NOTE_NUMBERS.play),
      led: note(TRANSPORT_NOTE_NUMBERS.play),
    },
    record: {
      input: note(TRANSPORT_NOTE_NUMBERS.record),
      led: note(TRANSPORT_NOTE_NUMBERS.record),
    },
    click: {
      input: note(TRANSPORT_NOTE_NUMBERS.click),
      led: note(TRANSPORT_NOTE_NUMBERS.click),
    },
    cycle: {
      input: note(TRANSPORT_NOTE_NUMBERS.cycle),
      led: note(TRANSPORT_NOTE_NUMBERS.cycle),
    },
    rewind: {
      input: note(TRANSPORT_NOTE_NUMBERS.rewind),
      led: note(TRANSPORT_NOTE_NUMBERS.rewind),
    },
    fastForward: {
      input: note(TRANSPORT_NOTE_NUMBERS.fastForward),
      led: note(TRANSPORT_NOTE_NUMBERS.fastForward),
    },
  } as const,

  navigation: {
    bankLeft: {
      input: note(NAVIGATION_NOTE_NUMBERS.bankLeft),
      led: note(NAVIGATION_NOTE_NUMBERS.bankLeft),
    },
    bankRight: {
      input: note(NAVIGATION_NOTE_NUMBERS.bankRight),
      led: note(NAVIGATION_NOTE_NUMBERS.bankRight),
    },
    channelLeft: {
      input: note(NAVIGATION_NOTE_NUMBERS.channelLeft),
      led: note(NAVIGATION_NOTE_NUMBERS.channelLeft),
    },
    channelRight: {
      input: note(NAVIGATION_NOTE_NUMBERS.channelRight),
      led: note(NAVIGATION_NOTE_NUMBERS.channelRight),
    },
  } as const,

  focusedChannel: {
    // This stays server-internal. Consumers can treat strip 0 as the active surface strip
    // until parser-side bank/focus tracking is implemented.
    stripIndex: 0,
    recordEnable: {
      input: stripSwitchAddress(0, 'recordEnable'),
      led: stripLedAddress(0, 'recordEnable'),
    },
    solo: {
      input: stripSwitchAddress(0, 'solo'),
      led: stripLedAddress(0, 'solo'),
    },
    mute: {
      input: stripSwitchAddress(0, 'mute'),
      led: stripLedAddress(0, 'mute'),
    },
    select: {
      input: stripSwitchAddress(0, 'select'),
      led: stripLedAddress(0, 'select'),
    },
    faderTouch: {
      input: stripSwitchAddress(0, 'faderTouch'),
    },
    faderPosition: {
      input: stripFaderAddress(0),
      led: stripFaderAddress(0),
    },
    stripMeter: {
      led: stripMeterAddress(0),
    },
    lcd: {
      upper: stripLcdAddress(0, 'upper'),
      lower: stripLcdAddress(0, 'lower'),
    },
  } as const,

  stripFamilies: {
    switchOffsets: STRIP_SWITCH_OFFSETS,
    ledOffsets: STRIP_LED_OFFSETS,
    faderStatusBase: MCU_PITCH_BEND_STATUS_BASE,
    meterStatusBase: MCU_CHANNEL_PRESSURE_STATUS_BASE,
    lcdSlots: Array.from({ length: MCU_STRIP_COUNT }, (_, index) => index),
  } as const,
} as const;

export const getMcuTransportInput = (role: McuTransportRole): McuNoteAddress => {
  return MCU_MESSAGE_MAP.transport[role].input;
};

export const getMcuTransportLed = (role: McuTransportRole): McuNoteAddress => {
  return MCU_MESSAGE_MAP.transport[role].led;
};

export const getMcuNavigationInput = (role: McuNavigationRole): McuNoteAddress => {
  return MCU_MESSAGE_MAP.navigation[role].input;
};

export const getMcuNavigationLed = (role: McuNavigationRole): McuNoteAddress => {
  return MCU_MESSAGE_MAP.navigation[role].led;
};

export const getMcuStripSwitch = (stripIndex: StripIndex, role: McuStripButtonRole): McuNoteAddress => {
  return stripSwitchAddress(stripIndex, role);
};

export const getMcuStripLed = (
  stripIndex: StripIndex,
  role: Exclude<McuStripButtonRole, 'faderTouch'>,
): McuNoteAddress => {
  return stripLedAddress(stripIndex, role);
};

export const getMcuStripFader = (stripIndex: StripIndex): McuPitchBendAddress => {
  return stripFaderAddress(stripIndex);
};

export const getMcuMainFader = (): McuPitchBendAddress => {
  return stripFaderAddress(MCU_MAIN_FADER_INDEX);
};

export const getMcuStripMeter = (stripIndex: StripIndex): McuChannelPressureAddress => {
  return stripMeterAddress(stripIndex);
};

export const getMcuStripLcd = (stripIndex: StripIndex, row: 'upper' | 'lower'): McuLcdAddress => {
  return stripLcdAddress(stripIndex, row);
};
