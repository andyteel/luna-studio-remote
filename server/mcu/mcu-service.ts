import type {
  FocusedTrackState,
  McuDiagnosticsState,
  McuState,
  McuRecentMessageDiagnostic,
  TransportState,
  V2RemoteState,
} from '../../shared/v2-state.js';
import type {
  FocusedTrackMcuControlRole,
  McuNavigationControlRole,
  McuTransportControlRole,
} from '../../shared/commands.js';
import knownSurfaceModuleInformation from '../../Luna MIDI/known_surface_module_information.json' with { type: 'json' };
import { JzzMidiAdapter, type RawMidiMessage } from './midi-adapter.js';
import { MCU_MESSAGE_MAP } from './mcu-message-map.js';

export interface McuServiceOptions {
  enabled?: boolean;
  debugMidiMessages?: boolean;
  selectedInputId?: string;
  selectedInputName?: string;
  selectedOutputId?: string;
  selectedOutputName?: string;
  logger?: Pick<Console, 'log' | 'error'>;
  onStateChange?: (details: { reason: string; snapshot: V2RemoteState; emittedAt: string }) => void;
}

const FOCUSED_TRACK_NOT_SELECTED_ERROR =
  'Focused track is not selected yet. Select a track in LUNA or wait for MCU select feedback.';
const MCU_BUTTON_PRESS_VELOCITY = 127;
const MCU_BUTTON_RELEASE_VELOCITY = 0;
const MCU_NOTE_OFF_STATUS = 128; // 0x80
const MCU_BUTTON_RELEASE_DELAY_MS = 20;
const MAX_RECENT_MCU_DIAGNOSTIC_MESSAGES = 12;
const CURRENT_SURFACE_DEVICE_NAME = 'MCU Pro';
const MCU_METER_FOCUSED_LEVEL_STATUS = MCU_MESSAGE_MAP.protocol.channelPressureStatusBase;
const MCU_METER_OBSERVED_MAX_RAW = 0x0c;
const MCU_METER_UNKNOWN_HIGH_RAW_VALUES = new Set([0x0d, 0x0e]);
const MCU_METER_CONFIRMED_CLIP_RAW = 0x0f;
const MCU_METER_CLIP_HOLD_MS = 3000;
const MCU_METER_WARNING_THRESHOLD_RAW = 0x0c;

type SurfaceFaderTaper = Readonly<{
  taper_db_values: number[];
  taper_fader_position: number[];
}>;

type KnownSurfaceModuleInformation = Readonly<{
  surface_fader_taper_maps: Record<string, string | undefined>;
  surface_fader_tapers: Record<string, SurfaceFaderTaper | undefined>;
}>;

type FaderTaperPoint = Readonly<{
  position: number;
  db: number;
}>;

type ActiveFaderTaper = Readonly<{
  mapName: string;
  points: FaderTaperPoint[];
}>;

export interface FocusedTrackControlResult {
  role: FocusedTrackMcuControlRole;
  stripIndex: number;
  pressMessage: number[];
  releaseMessage: number[];
}

export interface TransportControlResult {
  role: McuTransportControlRole;
  pressMessage: number[];
  releaseMessage: number[];
}

export interface NavigationControlResult {
  role: McuNavigationControlRole;
  pressMessage: number[];
  releaseMessage: number[];
}

const createTransportState = (): TransportState => ({
  playing: null,
  stopped: null,
  recording: null,
  loop: null,
  click: null,
  countIn: null,
  source: 'unknown',
  updatedAt: null,
});

const createFocusedTrackState = (): FocusedTrackState => ({
  index: null,
  name: null,
  arm: null,
  solo: null,
  mute: null,
  meter: {
    raw: null,
    normalized: null,
    peak: null,
    clip: null,
    source: 'unknown',
    updatedAt: null,
  },
  fader: {
    raw14: null,
    signed: null,
    normalized: null,
    gainDbText: null,
    source: 'unknown',
    updatedAt: null,
  },
  source: 'unknown',
  updatedAt: null,
});

const createMcuState = (): McuState => ({
  enabled: false,
  available: false,
  connected: false,
  lifecycle: 'disabled',
  driver: 'noop',
  inputPorts: [],
  outputPorts: [],
  selectedInputId: null,
  selectedInputName: null,
  selectedOutputId: null,
  selectedOutputName: null,
  lastMessageAt: null,
  lastError: null,
});

const createMcuDiagnosticsState = (): McuDiagnosticsState => ({
  rawMessageCount: 0,
  transportMessageCount: 0,
  lcdMessageCount: 0,
  selectMessageCount: 0,
  focusedTrackFeedbackCount: 0,
  lastRawMessageAt: null,
  lastTransportFeedbackAt: null,
  lastLcdFeedbackAt: null,
  lastSelectFeedbackAt: null,
  lastFocusedTrackFeedbackAt: null,
  recentMessages: [],
});

const combineErrors = (...errors: Array<string | null | undefined>): string | null => {
  const presentErrors = errors.filter((error): error is string => Boolean(error));
  return presentErrors.length ? presentErrors.join('; ') : null;
};

const serializeError = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const formatMidiBytes = (bytes: number[]): string => {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
};

const delay = (milliseconds: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
};

const surfaceModuleInformation = knownSurfaceModuleInformation as KnownSurfaceModuleInformation;

const normalizeFaderTaperPoints = (taper: SurfaceFaderTaper | undefined): FaderTaperPoint[] => {
  if (!taper || taper.taper_db_values.length !== taper.taper_fader_position.length) {
    return [];
  }

  return taper.taper_fader_position
    .map((position, index) => ({
      position,
      db: taper.taper_db_values[index],
    }))
    .filter((point) => Number.isFinite(point.position) && Number.isFinite(point.db))
    .sort((a, b) => a.position - b.position);
};

const resolveActiveFaderTaper = (): ActiveFaderTaper => {
  const taperMapName =
    surfaceModuleInformation.surface_fader_taper_maps[CURRENT_SURFACE_DEVICE_NAME] ??
    surfaceModuleInformation.surface_fader_taper_maps.default ??
    'mackie_v1';
  const taper = surfaceModuleInformation.surface_fader_tapers[taperMapName];
  const points = normalizeFaderTaperPoints(taper);

  if (points.length >= 2) {
    return {
      mapName: taperMapName,
      points,
    };
  }

  const fallbackMapName = 'mackie_v1';
  const fallbackPoints = normalizeFaderTaperPoints(surfaceModuleInformation.surface_fader_tapers[fallbackMapName]);

  return {
    mapName: fallbackMapName,
    points: fallbackPoints,
  };
};

const ACTIVE_FADER_TAPER = resolveActiveFaderTaper();

export const interpolateFaderTaperDb = (
  normalized: number | null | undefined,
  taper: ActiveFaderTaper = ACTIVE_FADER_TAPER,
): number | null => {
  if (typeof normalized !== 'number' || !Number.isFinite(normalized) || taper.points.length < 2) {
    return null;
  }

  const clamped = Math.max(0, Math.min(1, normalized));
  const firstPoint = taper.points[0];
  const lastPoint = taper.points[taper.points.length - 1];

  if (clamped <= firstPoint.position) {
    return firstPoint.db;
  }

  if (clamped >= lastPoint.position) {
    return lastPoint.db;
  }

  for (let index = 1; index < taper.points.length; index += 1) {
    const upperPoint = taper.points[index];

    if (clamped <= upperPoint.position) {
      const lowerPoint = taper.points[index - 1];
      const range = upperPoint.position - lowerPoint.position;
      const ratio = range === 0 ? 0 : (clamped - lowerPoint.position) / range;

      return lowerPoint.db + ratio * (upperPoint.db - lowerPoint.db);
    }
  }

  return lastPoint.db;
};

export const formatFaderGainDbText = (db: number | null | undefined): string | null => {
  if (typeof db !== 'number' || !Number.isFinite(db)) {
    return null;
  }

  if (db <= -143.5) {
    return '-∞ dB';
  }

  const normalizedZero = Math.abs(db) < 0.05 ? 0 : db;
  const sign = normalizedZero > 0 ? '+' : '';

  return `${sign}${normalizedZero.toFixed(1)} dB`;
};

export const getActiveFaderTaperMapName = (): string => ACTIVE_FADER_TAPER.mapName;

const cloneTransportState = (transport: TransportState): TransportState => ({
  ...transport,
});

const cloneFocusedTrackState = (focusedTrack: FocusedTrackState): FocusedTrackState => ({
  ...focusedTrack,
  meter: {
    ...focusedTrack.meter,
  },
  fader: {
    ...focusedTrack.fader,
  },
});

const cloneMcuState = (mcu: McuState): McuState => ({
  ...mcu,
  inputPorts: [...mcu.inputPorts],
  outputPorts: [...mcu.outputPorts],
});

const cloneMcuDiagnosticsState = (diagnostics: McuDiagnosticsState): McuDiagnosticsState => ({
  ...diagnostics,
  recentMessages: diagnostics.recentMessages.map((message) => ({ ...message })),
});

const cloneV2RemoteState = (snapshot: V2RemoteState): V2RemoteState => ({
  transport: cloneTransportState(snapshot.transport),
  focusedTrack: cloneFocusedTrackState(snapshot.focusedTrack),
  mcu: cloneMcuState(snapshot.mcu),
});

const hasTransportFeedback = (transport: TransportState): boolean => {
  return transport.source !== 'unknown' || transport.updatedAt !== null;
};

const hasFocusedTrackFeedback = (focusedTrack: FocusedTrackState): boolean => {
  return (
    focusedTrack.source !== 'unknown' ||
    focusedTrack.updatedAt !== null ||
    focusedTrack.index !== null ||
    focusedTrack.name !== null
  );
};

const isFocusedTrackSelected = (focusedTrack: FocusedTrackState): boolean => {
  return focusedTrack.source === 'mcu' && focusedTrack.index !== null;
};

const hasMcuConnectivityState = (mcu: McuState): boolean => {
  return (
    mcu.connected ||
    mcu.lastMessageAt !== null ||
    mcu.selectedInputId !== null ||
    mcu.selectedInputName !== null ||
    mcu.selectedOutputId !== null ||
    mcu.selectedOutputName !== null ||
    mcu.inputPorts.length > 0 ||
    mcu.outputPorts.length > 0
  );
};

const lostTransportFeedback = (current: TransportState, previous: TransportState): boolean => {
  return hasTransportFeedback(previous) && !hasTransportFeedback(current);
};

const lostFocusedTrackFeedback = (current: FocusedTrackState, previous: FocusedTrackState): boolean => {
  return (
    hasFocusedTrackFeedback(previous) &&
    (
      (
        current.source === 'unknown' &&
        current.updatedAt === null &&
        current.index === null &&
        current.name === null
      ) ||
      (previous.source !== 'unknown' && current.source === 'unknown') ||
      (previous.updatedAt !== null && current.updatedAt === null) ||
      (previous.index !== null && current.index === null) ||
      (
        previous.index !== null &&
        current.index === previous.index &&
        previous.name !== null &&
        current.name === null
      )
    )
  );
};

const lostMcuConnectivityState = (current: McuState, previous: McuState): boolean => {
  return (
    hasMcuConnectivityState(previous) &&
    (
      (previous.connected && !current.connected) ||
      (previous.lastMessageAt !== null && current.lastMessageAt === null) ||
      (previous.selectedInputId !== null && current.selectedInputId === null) ||
      (previous.selectedInputName !== null && current.selectedInputName === null) ||
      (previous.selectedOutputId !== null && current.selectedOutputId === null) ||
      (previous.selectedOutputName !== null && current.selectedOutputName === null) ||
      (previous.inputPorts.length > 0 && current.inputPorts.length === 0) ||
      (previous.outputPorts.length > 0 && current.outputPorts.length === 0)
    )
  );
};

type ParsedTransportRole = 'play' | 'stop' | 'record' | 'click' | 'cycle';

const TRANSPORT_LED_NOTE_TO_ROLE = new Map<number, ParsedTransportRole>([
  [MCU_MESSAGE_MAP.transport.play.led.data1, 'play'],
  [MCU_MESSAGE_MAP.transport.stop.led.data1, 'stop'],
  [MCU_MESSAGE_MAP.transport.record.led.data1, 'record'],
  [MCU_MESSAGE_MAP.transport.click.led.data1, 'click'],
  [MCU_MESSAGE_MAP.transport.cycle.led.data1, 'cycle'],
]);

type McuLcdRow = 'upper' | 'lower';

type ParsedMcuLcdFeedback = Readonly<{
  slot: number;
  row: McuLcdRow;
  text: string | null;
}>;

type ParsedMcuSelectFeedback = Readonly<{
  stripIndex: number;
  selected: boolean;
}>;

type ParsedMcuStripButtonFeedback = Readonly<{
  stripIndex: number;
  role: FocusedTrackMcuControlRole;
  isOn: boolean;
}>;

type ParsedMcuFaderFeedback = Readonly<{
  stripIndex: number;
  raw14: number;
  signed: number;
  normalized: number;
}>;

type ParsedMcuMeterFeedback = Readonly<{
  stripIndex: number | null;
  raw: number;
  normalized: number | null;
  clip: boolean | null;
  encoding: 'focused-level' | 'status-per-strip';
}>;

type McuStripLcdState = Readonly<{
  upper: string | null;
  lower: string | null;
}>;

type McuStripFeedbackState = Readonly<{
  arm: boolean | null;
  solo: boolean | null;
  mute: boolean | null;
  meter: FocusedTrackState['meter'];
  fader: FocusedTrackState['fader'];
}>;

const LCD_SLOT_WIDTH_CANDIDATES = [7, 6, 5] as const;

const createStripLcdStates = (): McuStripLcdState[] => {
  return Array.from({ length: MCU_MESSAGE_MAP.protocol.stripCount }, () => ({
    upper: null,
    lower: null,
  }));
};

const createStripFeedbackState = (): McuStripFeedbackState => ({
  arm: null,
  solo: null,
  mute: null,
  meter: {
    raw: null,
    normalized: null,
    peak: null,
    clip: null,
    source: 'unknown',
    updatedAt: null,
  },
  fader: {
    raw14: null,
    signed: null,
    normalized: null,
    gainDbText: null,
    source: 'unknown',
    updatedAt: null,
  },
});

const createStripFeedbackStates = (): McuStripFeedbackState[] => {
  return Array.from({ length: MCU_MESSAGE_MAP.protocol.stripCount }, () => createStripFeedbackState());
};

const normalizeLcdText = (text: string): string | null => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length ? normalized : null;
};

const bytesToLcdText = (bytes: number[]): string => {
  return bytes
    .map((byte) => {
      if (byte >= 32 && byte <= 126) {
        return String.fromCharCode(byte);
      }

      return ' ';
    })
    .join('');
};

const getSysexEndIndex = (bytes: number[]): number => {
  const lastByteIndex = bytes.length - 1;
  return bytes[lastByteIndex] === MCU_MESSAGE_MAP.protocol.sysexEnd ? lastByteIndex : bytes.length;
};

const isMcuLcdSysexMessage = (bytes: number[]): boolean => {
  const manufacturerId = MCU_MESSAGE_MAP.protocol.manufacturerId;

  return (
    bytes.length >= 8 &&
    bytes[0] === MCU_MESSAGE_MAP.protocol.sysexStatus &&
    bytes[1] === manufacturerId[0] &&
    bytes[2] === manufacturerId[1] &&
    bytes[3] === manufacturerId[2] &&
    bytes[5] === MCU_MESSAGE_MAP.protocol.lcdSysexCommand
  );
};

const inferLcdSlotWidth = (rowOffset: number, textLength: number): number => {
  if (textLength >= 5 && textLength <= 7 && rowOffset % textLength === 0) {
    return textLength;
  }

  const exactSpanWidth = LCD_SLOT_WIDTH_CANDIDATES.find((slotWidth) => {
    return rowOffset % slotWidth === 0 && textLength % slotWidth === 0;
  });

  if (exactSpanWidth) {
    return exactSpanWidth;
  }

  return LCD_SLOT_WIDTH_CANDIDATES.find((slotWidth) => rowOffset % slotWidth === 0) ?? 7;
};

export const parseMcuLcdSysexFeedback = (bytes: number[]): ParsedMcuLcdFeedback[] => {
  if (!isMcuLcdSysexMessage(bytes)) {
    return [];
  }

  const offset = bytes[6];

  if (typeof offset !== 'number' || offset < 0 || offset > 127) {
    return [];
  }

  const lowerRowOffset = MCU_MESSAGE_MAP.protocol.lcdLowerRowOffset;
  const row: McuLcdRow = offset >= lowerRowOffset ? 'lower' : 'upper';
  const rowOffset = row === 'lower' ? offset - lowerRowOffset : offset;

  if (rowOffset < 0 || rowOffset >= lowerRowOffset) {
    return [];
  }

  const payloadEndIndex = getSysexEndIndex(bytes);
  const rawText = bytesToLcdText(bytes.slice(7, payloadEndIndex));

  if (!rawText.length) {
    return [];
  }

  const slotWidth = inferLcdSlotWidth(rowOffset, rawText.length);
  const updates: ParsedMcuLcdFeedback[] = [];
  let textOffset = 0;

  while (textOffset < rawText.length) {
    const absoluteRowOffset = rowOffset + textOffset;

    if (absoluteRowOffset >= lowerRowOffset) {
      break;
    }

    const slot = Math.floor(absoluteRowOffset / slotWidth);

    if (slot < 0 || slot >= MCU_MESSAGE_MAP.protocol.stripCount) {
      break;
    }

    const offsetWithinSlot = absoluteRowOffset - slot * slotWidth;
    const chunkLength = Math.min(slotWidth - offsetWithinSlot, rawText.length - textOffset);
    const chunk = rawText.slice(textOffset, textOffset + chunkLength);

    if (offsetWithinSlot === 0) {
      updates.push({
        slot,
        row,
        text: normalizeLcdText(chunk),
      });
    }

    textOffset += chunkLength;
  }

  return updates;
};

export const parseMcuSelectLedFeedback = (bytes: number[]): ParsedMcuSelectFeedback | null => {
  const [status, data1, data2] = bytes;

  if (
    status !== MCU_MESSAGE_MAP.protocol.noteStatus ||
    typeof data1 !== 'number' ||
    typeof data2 !== 'number'
  ) {
    return null;
  }

  const selectLedOffset = MCU_MESSAGE_MAP.stripFamilies.ledOffsets.select;
  const stripIndex = data1 - selectLedOffset;

  if (stripIndex < 0 || stripIndex >= MCU_MESSAGE_MAP.protocol.stripCount) {
    return null;
  }

  return {
    stripIndex,
    selected: data2 > 0,
  };
};

export const parseMcuStripButtonLedFeedback = (bytes: number[]): ParsedMcuStripButtonFeedback | null => {
  const [status, data1, data2] = bytes;

  if (
    (status !== MCU_MESSAGE_MAP.protocol.noteStatus && status !== MCU_NOTE_OFF_STATUS) ||
    typeof data1 !== 'number' ||
    typeof data2 !== 'number'
  ) {
    return null;
  }

  const roles: FocusedTrackMcuControlRole[] = ['recordEnable', 'solo', 'mute'];

  for (const role of roles) {
    const stripIndex = data1 - MCU_MESSAGE_MAP.stripFamilies.ledOffsets[role];

    if (stripIndex >= 0 && stripIndex < MCU_MESSAGE_MAP.protocol.stripCount) {
      return {
        stripIndex,
        role,
        isOn: status === MCU_MESSAGE_MAP.protocol.noteStatus && data2 > 0,
      };
    }
  }

  return null;
};

export const parseMcuFaderFeedback = (bytes: number[]): ParsedMcuFaderFeedback | null => {
  const [status, data1, data2] = bytes;

  if (
    typeof status !== 'number' ||
    typeof data1 !== 'number' ||
    typeof data2 !== 'number' ||
    status < MCU_MESSAGE_MAP.stripFamilies.faderStatusBase ||
    status >= MCU_MESSAGE_MAP.stripFamilies.faderStatusBase + MCU_MESSAGE_MAP.protocol.stripCount
  ) {
    return null;
  }

  const stripIndex = status - MCU_MESSAGE_MAP.stripFamilies.faderStatusBase;
  const raw14 = ((data2 & 0x7f) << 7) | (data1 & 0x7f);

  return {
    stripIndex,
    raw14,
    signed: raw14 - 8192,
    normalized: raw14 / 0x3fff,
  };
};

export const parseMcuMeterFeedback = (bytes: number[]): ParsedMcuMeterFeedback | null => {
  const [status, raw] = bytes;

  if (
    typeof status !== 'number' ||
    typeof raw !== 'number'
  ) {
    return null;
  }

  if (status === MCU_METER_FOCUSED_LEVEL_STATUS) {
    const rawLevel = raw & 0x7f;
    const isConfirmedClip = rawLevel === MCU_METER_CONFIRMED_CLIP_RAW;
    const isNormalLevel = rawLevel <= MCU_METER_OBSERVED_MAX_RAW;

    return {
      stripIndex: null,
      raw: rawLevel,
      normalized: isNormalLevel ? rawLevel / MCU_METER_OBSERVED_MAX_RAW : null,
      clip: isConfirmedClip ? true : rawLevel < MCU_METER_OBSERVED_MAX_RAW ? false : null,
      encoding: 'focused-level',
    };
  }

  if (
    status >= MCU_MESSAGE_MAP.stripFamilies.meterStatusBase &&
    status < MCU_MESSAGE_MAP.stripFamilies.meterStatusBase + MCU_MESSAGE_MAP.protocol.stripCount
  ) {
    return {
      stripIndex: status - MCU_MESSAGE_MAP.stripFamilies.meterStatusBase,
      raw,
      normalized: Math.max(0, Math.min(raw, 127)) / 127,
      clip: null,
      encoding: 'status-per-strip',
    };
  }

  return null;
};

export class McuService {
  private readonly options: McuServiceOptions;
  private readonly logger: Pick<Console, 'log' | 'error'>;
  private midiAdapter: JzzMidiAdapter | null = null;
  private transport = createTransportState();
  private focusedTrack = createFocusedTrackState();
  private selectedStripIndex: number | null = null;
  private stripLcdStates = createStripLcdStates();
  private stripFeedbackStates = createStripFeedbackStates();
  private meterClipClearTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private preservedSnapshot: V2RemoteState | null = null;
  private mcu = createMcuState();
  private diagnostics = createMcuDiagnosticsState();

  constructor(options: McuServiceOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? console;

    this.mcu = {
      ...this.mcu,
      enabled: options.enabled ?? true,
    };
  }

  private logMeterDebug(message: string): void {
    if (!this.options.debugMidiMessages) {
      return;
    }

    this.logger.log(message);
  }

  async start(): Promise<void> {
    if (this.options.enabled === false) {
      this.mcu = {
        ...this.mcu,
        enabled: false,
        available: false,
        connected: false,
        lifecycle: 'disabled',
        driver: 'noop',
        lastError: null,
      };
      this.logger.log('MCU service disabled by configuration');
      return;
    }

    this.mcu = {
      ...this.mcu,
      enabled: true,
      lifecycle: 'starting',
      driver: 'jzz',
      lastError: null,
    };

    this.midiAdapter = new JzzMidiAdapter({
      enabled: true,
      listenForMessages: true,
      debugRawMessages: this.options.debugMidiMessages ?? false,
      selectedInputId: this.options.selectedInputId,
      selectedInputName: this.options.selectedInputName,
      selectedOutputId: this.options.selectedOutputId,
      selectedOutputName: this.options.selectedOutputName,
      logger: this.logger,
      onRawMessage: (message) => this.handleRawMidiMessage(message),
    });

    const midiSnapshot = await this.midiAdapter.start();
    const inputPorts = midiSnapshot.inputPorts;
    const outputPorts = midiSnapshot.outputPorts;
    const connected = Boolean(midiSnapshot.selectedInputId && midiSnapshot.selectedOutputId);
    const lastError = combineErrors(midiSnapshot.lastError);

    this.mcu = {
      ...this.mcu,
      available: midiSnapshot.available,
      connected,
      lifecycle: midiSnapshot.available ? (connected ? 'connected' : 'idle') : 'error',
      inputPorts,
      outputPorts,
      selectedInputId: midiSnapshot.selectedInputId,
      selectedInputName: midiSnapshot.selectedInputName,
      selectedOutputId: midiSnapshot.selectedOutputId,
      selectedOutputName: midiSnapshot.selectedOutputName,
      lastError,
    };

    if (!midiSnapshot.available) {
      this.logger.error(`MCU service running without MIDI: ${lastError ?? 'MIDI unavailable'}`);
      return;
    }

    this.rememberPreservedSnapshot(this.buildCurrentSnapshot());

    this.logger.log(
      `MCU service initialized with ${inputPorts.length} MIDI input(s) and ${outputPorts.length} MIDI output(s)`,
    );
  }

  async stop(): Promise<void> {
    await this.midiAdapter?.stop();
    this.midiAdapter = null;
    this.clearAllMeterClipTimers();

    this.mcu = {
      ...this.mcu,
      connected: false,
      lifecycle: this.mcu.enabled ? 'idle' : 'disabled',
      lastMessageAt: null,
    };
  }

  async sendFocusedTrackControl(role: FocusedTrackMcuControlRole): Promise<FocusedTrackControlResult> {
    this.restorePreservedSnapshot();

    if (!isFocusedTrackSelected(this.focusedTrack)) {
      throw new Error(FOCUSED_TRACK_NOT_SELECTED_ERROR);
    }

    const stripIndex = this.focusedTrack.index;

    if (
      !Number.isInteger(stripIndex) ||
      stripIndex === null ||
      stripIndex < 0 ||
      stripIndex >= MCU_MESSAGE_MAP.protocol.stripCount
    ) {
      throw new Error('No focused MCU strip is available');
    }

    const note = MCU_MESSAGE_MAP.stripFamilies.switchOffsets[role] + stripIndex;
    const pressMessage = [MCU_MESSAGE_MAP.protocol.noteStatus, note, MCU_BUTTON_PRESS_VELOCITY];
    const releaseMessage = [MCU_MESSAGE_MAP.protocol.noteStatus, note, MCU_BUTTON_RELEASE_VELOCITY];

    try {
      await this.sendRawMcuMessage(pressMessage);
      await delay(MCU_BUTTON_RELEASE_DELAY_MS);
      await this.sendRawMcuMessage(releaseMessage);
    } catch (error) {
      this.mcu = {
        ...this.mcu,
        lastError: serializeError(error),
      };
      throw error;
    }

    return {
      role,
      stripIndex,
      pressMessage,
      releaseMessage,
    };
  }

  async sendTransportControl(role: McuTransportControlRole): Promise<TransportControlResult> {
    const address = MCU_MESSAGE_MAP.transport[role].input;
    const pressMessage = [address.status, address.data1, MCU_BUTTON_PRESS_VELOCITY];
    const releaseMessage = [address.status, address.data1, MCU_BUTTON_RELEASE_VELOCITY];

    try {
      await this.sendRawMcuMessage(pressMessage);
      await delay(MCU_BUTTON_RELEASE_DELAY_MS);
      await this.sendRawMcuMessage(releaseMessage);
    } catch (error) {
      this.mcu = {
        ...this.mcu,
        lastError: serializeError(error),
      };
      throw error;
    }

    return {
      role,
      pressMessage,
      releaseMessage,
    };
  }

  async sendNavigationControl(role: McuNavigationControlRole): Promise<NavigationControlResult> {
    const address = MCU_MESSAGE_MAP.navigation[role].input;
    const pressMessage = [address.status, address.data1, MCU_BUTTON_PRESS_VELOCITY];
    const releaseMessage = [address.status, address.data1, MCU_BUTTON_RELEASE_VELOCITY];

    try {
      await this.sendRawMcuMessage(pressMessage);
      await delay(MCU_BUTTON_RELEASE_DELAY_MS);
      await this.sendRawMcuMessage(releaseMessage);
    } catch (error) {
      this.mcu = {
        ...this.mcu,
        lastError: serializeError(error),
      };
      throw error;
    }

    return {
      role,
      pressMessage,
      releaseMessage,
    };
  }

  preserveSnapshot(snapshot: V2RemoteState): void {
    this.rememberPreservedSnapshot(snapshot);
    this.restorePreservedSnapshot();
  }

  private buildCurrentSnapshot(): V2RemoteState {
    return {
      transport: cloneTransportState(this.transport),
      focusedTrack: cloneFocusedTrackState(this.focusedTrack),
      mcu: cloneMcuState(this.mcu),
    };
  }

  private rememberPreservedSnapshot(snapshot: V2RemoteState): void {
    const preservedSnapshot = this.preservedSnapshot ?? cloneV2RemoteState(snapshot);

    if (hasTransportFeedback(snapshot.transport)) {
      preservedSnapshot.transport = cloneTransportState(snapshot.transport);
    }

    if (hasFocusedTrackFeedback(snapshot.focusedTrack)) {
      preservedSnapshot.focusedTrack = cloneFocusedTrackState(snapshot.focusedTrack);
    }

    if (hasMcuConnectivityState(snapshot.mcu)) {
      const nextMcu = cloneMcuState(snapshot.mcu);
      const previousMcu = preservedSnapshot.mcu;

      preservedSnapshot.mcu = {
        ...nextMcu,
        connected: nextMcu.connected || previousMcu.connected,
        lifecycle: nextMcu.connected ? nextMcu.lifecycle : previousMcu.lifecycle,
        inputPorts: nextMcu.inputPorts.length ? nextMcu.inputPorts : [...previousMcu.inputPorts],
        outputPorts: nextMcu.outputPorts.length ? nextMcu.outputPorts : [...previousMcu.outputPorts],
        selectedInputId: nextMcu.selectedInputId ?? previousMcu.selectedInputId,
        selectedInputName: nextMcu.selectedInputName ?? previousMcu.selectedInputName,
        selectedOutputId: nextMcu.selectedOutputId ?? previousMcu.selectedOutputId,
        selectedOutputName: nextMcu.selectedOutputName ?? previousMcu.selectedOutputName,
        lastMessageAt: nextMcu.lastMessageAt ?? previousMcu.lastMessageAt,
      };
    }

    this.preservedSnapshot = cloneV2RemoteState(preservedSnapshot);
  }

  private restorePreservedSnapshot(): void {
    const snapshot = this.preservedSnapshot;

    if (!snapshot) {
      return;
    }

    if (lostTransportFeedback(this.transport, snapshot.transport)) {
      this.transport = cloneTransportState(snapshot.transport);
    }

    if (lostFocusedTrackFeedback(this.focusedTrack, snapshot.focusedTrack)) {
      this.focusedTrack = cloneFocusedTrackState(snapshot.focusedTrack);

      if (
        Number.isInteger(this.focusedTrack.index) &&
        this.focusedTrack.index !== null &&
        this.focusedTrack.index >= 0 &&
        this.focusedTrack.index < MCU_MESSAGE_MAP.protocol.stripCount
      ) {
        this.selectedStripIndex = this.focusedTrack.index;
        this.stripLcdStates[this.focusedTrack.index] = {
          ...this.stripLcdStates[this.focusedTrack.index],
          upper: this.focusedTrack.name,
        };
      }
    }

    if (lostMcuConnectivityState(this.mcu, snapshot.mcu)) {
      this.mcu = cloneMcuState(snapshot.mcu);
    }
  }

  private async sendRawMcuMessage(bytes: number[]): Promise<void> {
    const hasManualOutputSelection = Boolean(this.options.selectedOutputId || this.options.selectedOutputName);

    if (hasManualOutputSelection) {
      if (!this.midiAdapter) {
        throw new Error('Configured MCU output port is not available');
      }

      await this.midiAdapter.sendRawMessage(bytes);
      return;
    }

    const sendErrors: string[] = [];

    if (this.midiAdapter) {
      try {
        await this.midiAdapter.sendRawMessage(bytes);
        return;
      } catch (error) {
        sendErrors.push(serializeError(error));
      }
    }

    throw new Error(sendErrors.length ? sendErrors.join('; ') : 'No MCU output port is available');
  }

  private getTransportFeedbackRole(bytes: number[]): ParsedTransportRole | null {
    const [status, data1, data2] = bytes;

    if (typeof data1 !== 'number' || typeof data2 !== 'number') {
      return null;
    }

    if (status !== MCU_MESSAGE_MAP.protocol.noteStatus && status !== MCU_NOTE_OFF_STATUS) {
      return null;
    }

    return TRANSPORT_LED_NOTE_TO_ROLE.get(data1) ?? null;
  }

  private recordRawMidiDiagnostic(details: {
    message: RawMidiMessage;
    transportRole: ParsedTransportRole | null;
    lcdUpdates: ParsedMcuLcdFeedback[];
    selectFeedback: ParsedMcuSelectFeedback | null;
    stripButtonFeedback: ParsedMcuStripButtonFeedback | null;
    faderFeedback: ParsedMcuFaderFeedback | null;
    meterFeedback: ParsedMcuMeterFeedback | null;
    focusedTrackUpdated: boolean;
  }): void {
    const {
      message,
      transportRole,
      lcdUpdates,
      selectFeedback,
      stripButtonFeedback,
      faderFeedback,
      meterFeedback,
      focusedTrackUpdated,
    } = details;
    const hasLcdFeedback = lcdUpdates.length > 0;
    const hasSelectFeedback = selectFeedback !== null;
    const kind: McuRecentMessageDiagnostic['kind'] = hasLcdFeedback
      ? 'lcd'
      : hasSelectFeedback
        ? 'select'
        : transportRole
          ? 'transport'
          : 'other';
    const detail = this.describeDiagnosticMessage({
      transportRole,
      lcdUpdates,
      selectFeedback,
      stripButtonFeedback,
      faderFeedback,
      meterFeedback,
    });
    const recentMessage: McuRecentMessageDiagnostic = {
      receivedAt: message.receivedAt,
      inputName: message.inputName,
      bytesHex: formatMidiBytes(message.bytes),
      kind,
      detail,
    };

    this.diagnostics = {
      ...this.diagnostics,
      rawMessageCount: this.diagnostics.rawMessageCount + 1,
      transportMessageCount: this.diagnostics.transportMessageCount + (transportRole ? 1 : 0),
      lcdMessageCount: this.diagnostics.lcdMessageCount + (hasLcdFeedback ? 1 : 0),
      selectMessageCount: this.diagnostics.selectMessageCount + (hasSelectFeedback ? 1 : 0),
      focusedTrackFeedbackCount: this.diagnostics.focusedTrackFeedbackCount + (focusedTrackUpdated ? 1 : 0),
      lastRawMessageAt: message.receivedAt,
      lastTransportFeedbackAt: transportRole ? message.receivedAt : this.diagnostics.lastTransportFeedbackAt,
      lastLcdFeedbackAt: hasLcdFeedback ? message.receivedAt : this.diagnostics.lastLcdFeedbackAt,
      lastSelectFeedbackAt: hasSelectFeedback ? message.receivedAt : this.diagnostics.lastSelectFeedbackAt,
      lastFocusedTrackFeedbackAt: focusedTrackUpdated
        ? message.receivedAt
        : this.diagnostics.lastFocusedTrackFeedbackAt,
      recentMessages: [
        recentMessage,
        ...this.diagnostics.recentMessages,
      ].slice(0, MAX_RECENT_MCU_DIAGNOSTIC_MESSAGES),
    };
  }

  private describeDiagnosticMessage(details: {
    transportRole: ParsedTransportRole | null;
    lcdUpdates: ParsedMcuLcdFeedback[];
    selectFeedback: ParsedMcuSelectFeedback | null;
    stripButtonFeedback: ParsedMcuStripButtonFeedback | null;
    faderFeedback: ParsedMcuFaderFeedback | null;
    meterFeedback: ParsedMcuMeterFeedback | null;
  }): string {
    const { transportRole, lcdUpdates, selectFeedback, stripButtonFeedback, faderFeedback, meterFeedback } = details;

    if (lcdUpdates.length > 0) {
      const firstUpdate = lcdUpdates[0];
      const text = firstUpdate.text ? ` "${firstUpdate.text}"` : '';
      return lcdUpdates.length === 1
        ? `LCD ${firstUpdate.row} strip ${firstUpdate.slot + 1}${text}`
        : `LCD ${lcdUpdates.length} updates`;
    }

    if (selectFeedback) {
      return `Select strip ${selectFeedback.stripIndex + 1} ${selectFeedback.selected ? 'on' : 'off'}`;
    }

    if (stripButtonFeedback) {
      return `Strip ${stripButtonFeedback.stripIndex + 1} ${stripButtonFeedback.role} ${stripButtonFeedback.isOn ? 'on' : 'off'}`;
    }

    if (faderFeedback) {
      return `Fader strip ${faderFeedback.stripIndex + 1} ${faderFeedback.raw14}`;
    }

    if (meterFeedback) {
      const stripDetail = meterFeedback.stripIndex === null ? 'focused strip' : `strip ${meterFeedback.stripIndex + 1}`;
      return `Meter ${stripDetail} ${meterFeedback.raw} ${meterFeedback.encoding}${meterFeedback.clip === true ? ' clip' : ''}`;
    }

    if (transportRole) {
      return `Transport ${transportRole}`;
    }

    return 'Unmapped MCU message';
  }

  private handleRawMidiMessage(message: RawMidiMessage): void {
    const transportRole = this.getTransportFeedbackRole(message.bytes);
    const lcdUpdates = parseMcuLcdSysexFeedback(message.bytes);
    const selectFeedback = parseMcuSelectLedFeedback(message.bytes);
    const stripButtonFeedback = parseMcuStripButtonLedFeedback(message.bytes);
    const faderFeedback = parseMcuFaderFeedback(message.bytes);
    const meterFeedback = parseMcuMeterFeedback(message.bytes);

    this.logPotentialClipFeedbackMessage(message, {
      transportRole,
      lcdUpdates,
      selectFeedback,
      stripButtonFeedback,
      faderFeedback,
      meterFeedback,
    });

    this.mcu = {
      ...this.mcu,
      lastMessageAt: message.receivedAt,
    };

    this.applyTransportFeedback(message, transportRole);
    const focusedTrackUpdated = this.applyFocusedTrackFeedback(
      message,
      lcdUpdates,
      selectFeedback,
      stripButtonFeedback,
      faderFeedback,
      meterFeedback,
    );
    this.recordRawMidiDiagnostic({
      message,
      transportRole,
      lcdUpdates,
      selectFeedback,
      stripButtonFeedback,
      faderFeedback,
      meterFeedback,
      focusedTrackUpdated,
    });
    this.rememberPreservedSnapshot(this.buildCurrentSnapshot());

    if (focusedTrackUpdated && this.focusedTrack.meter.clip === true) {
      this.emitStateChange('meter-peak-hold-active');
    }
  }

  private applyFocusedTrackFeedback(
    message: RawMidiMessage,
    lcdUpdates: ParsedMcuLcdFeedback[],
    selectFeedback: ParsedMcuSelectFeedback | null,
    stripButtonFeedback: ParsedMcuStripButtonFeedback | null,
    faderFeedback: ParsedMcuFaderFeedback | null,
    meterFeedback: ParsedMcuMeterFeedback | null,
  ): boolean {
    let focusedTrackUpdated = false;

    if (lcdUpdates.length > 0) {
      focusedTrackUpdated = this.applyLcdFeedback(lcdUpdates, message.receivedAt) || focusedTrackUpdated;
    }

    if (selectFeedback?.selected) {
      this.applySelectedStripFeedback(selectFeedback.stripIndex, message.receivedAt);
      focusedTrackUpdated = true;
    }

    if (stripButtonFeedback) {
      this.rememberStripButtonFeedback(stripButtonFeedback, message.receivedAt);

      if (this.isFocusedStrip(stripButtonFeedback.stripIndex)) {
        this.applyStripButtonFeedback(stripButtonFeedback, message.receivedAt);
        focusedTrackUpdated = true;
      }
    }

    if (faderFeedback) {
      this.rememberFaderFeedback(faderFeedback, message.receivedAt);

      if (this.isFocusedStrip(faderFeedback.stripIndex)) {
        this.applyFaderFeedback(faderFeedback, message.receivedAt);
        focusedTrackUpdated = true;
      }
    }

    if (meterFeedback) {
      const meterStripIndex = this.resolveMeterFeedbackStripIndex(meterFeedback);

      this.logFocusedMeterFeedback(meterFeedback, meterStripIndex);

      if (meterStripIndex !== null) {
        this.rememberMeterFeedback(meterFeedback, message.receivedAt, meterStripIndex);
      }

      if (meterStripIndex !== null && this.isFocusedStrip(meterStripIndex)) {
        this.applyMeterFeedback(meterFeedback, message.receivedAt, meterStripIndex);
        focusedTrackUpdated = true;
      }
    }

    return focusedTrackUpdated;
  }

  private applyLcdFeedback(updates: ParsedMcuLcdFeedback[], receivedAt: string): boolean {
    let focusedTrackUpdated = false;

    for (const update of updates) {
      this.stripLcdStates[update.slot] = {
        ...this.stripLcdStates[update.slot],
        [update.row]: update.text,
      };

      if (update.row === 'upper' && update.slot === this.selectedStripIndex) {
        this.focusedTrack = {
          ...this.focusedTrack,
          index: update.slot,
          name: update.text,
          source: 'mcu',
          updatedAt: receivedAt,
        };
        focusedTrackUpdated = true;
      }

    }

    return focusedTrackUpdated;
  }

  private applySelectedStripFeedback(stripIndex: number, receivedAt: string): void {
    this.selectedStripIndex = stripIndex;
    const cachedFeedback = this.stripFeedbackStates[stripIndex] ?? createStripFeedbackState();
    const cachedLcd = this.stripLcdStates[stripIndex];

    this.focusedTrack = {
      ...this.focusedTrack,
      index: stripIndex,
      name: cachedLcd?.upper ?? null,
      arm: cachedFeedback.arm,
      solo: cachedFeedback.solo,
      mute: cachedFeedback.mute,
      meter: {
        ...cachedFeedback.meter,
      },
      fader: {
        ...cachedFeedback.fader,
      },
      source: 'mcu',
      updatedAt: receivedAt,
    };
  }

  private isFocusedStrip(stripIndex: number): boolean {
    return this.selectedStripIndex === stripIndex || this.focusedTrack.index === stripIndex;
  }

  private resolveMeterFeedbackStripIndex(feedback: ParsedMcuMeterFeedback): number | null {
    if (
      Number.isInteger(feedback.stripIndex) &&
      feedback.stripIndex !== null &&
      feedback.stripIndex >= 0 &&
      feedback.stripIndex < MCU_MESSAGE_MAP.protocol.stripCount
    ) {
      return feedback.stripIndex;
    }

    if (
      Number.isInteger(this.selectedStripIndex) &&
      this.selectedStripIndex !== null &&
      this.selectedStripIndex >= 0 &&
      this.selectedStripIndex < MCU_MESSAGE_MAP.protocol.stripCount
    ) {
      return this.selectedStripIndex;
    }

    if (
      Number.isInteger(this.focusedTrack.index) &&
      this.focusedTrack.index !== null &&
      this.focusedTrack.index >= 0 &&
      this.focusedTrack.index < MCU_MESSAGE_MAP.protocol.stripCount
    ) {
      return this.focusedTrack.index;
    }

    return null;
  }

  private logFocusedMeterFeedback(feedback: ParsedMcuMeterFeedback, stripIndex: number | null): void {
    const liveMeterNormalized = this.getCurrentMeterNormalized(stripIndex, feedback.normalized);
    const parsedMeterDetail = feedback.normalized === null ? 'unchanged' : feedback.normalized.toFixed(4);

    this.logMeterDebug(
      `[focused-meter-debug] rawD0=${feedback.raw} parsedMeter=${parsedMeterDetail} liveMeter=${liveMeterNormalized.toFixed(4)} clip=${feedback.clip === true ? 'true' : feedback.clip === false ? 'false' : 'unchanged'} focusedStrip=${stripIndex === null ? '--' : stripIndex + 1} uiMeter=${liveMeterNormalized.toFixed(4)} encoding=${feedback.encoding}`,
    );

    if (feedback.encoding !== 'focused-level') {
      return;
    }

    if (feedback.raw === MCU_METER_CONFIRMED_CLIP_RAW) {
      this.logMeterDebug(
        `[${new Date().toISOString()}] [focused-meter-clip-debug] server received D0 0F raw=0F clip=true meterLevelUnchanged liveMeter=${liveMeterNormalized.toFixed(4)} focusedStrip=${stripIndex === null ? '--' : stripIndex + 1}`,
      );
      return;
    }

    if (MCU_METER_UNKNOWN_HIGH_RAW_VALUES.has(feedback.raw)) {
      this.logMeterDebug(
        `[focused-meter-clip-debug] unconfirmed high D0 meter raw=${feedback.raw.toString(16).padStart(2, '0').toUpperCase()} meterLevelUnchanged liveMeter=${liveMeterNormalized.toFixed(4)} focusedStrip=${stripIndex === null ? '--' : stripIndex + 1}`,
      );
      return;
    }

    if (feedback.raw > MCU_METER_CONFIRMED_CLIP_RAW) {
      this.logMeterDebug(
        `[focused-meter-clip-debug] unexpected D0 meter raw=${feedback.raw} meterLevelUnchanged liveMeter=${liveMeterNormalized.toFixed(4)} focusedStrip=${stripIndex === null ? '--' : stripIndex + 1}`,
      );
    }
  }

  private getCurrentMeterNormalized(stripIndex: number | null, parsedNormalized: number | null): number {
    if (typeof parsedNormalized === 'number' && Number.isFinite(parsedNormalized)) {
      return parsedNormalized;
    }

    if (stripIndex !== null) {
      const cachedNormalized = this.stripFeedbackStates[stripIndex]?.meter.normalized;

      if (typeof cachedNormalized === 'number' && Number.isFinite(cachedNormalized)) {
        return cachedNormalized;
      }
    }

    return typeof this.focusedTrack.meter.normalized === 'number' && Number.isFinite(this.focusedTrack.meter.normalized)
      ? this.focusedTrack.meter.normalized
      : 0;
  }

  private logPotentialClipFeedbackMessage(
    message: RawMidiMessage,
    details: {
      transportRole: ParsedTransportRole | null;
      lcdUpdates: ParsedMcuLcdFeedback[];
      selectFeedback: ParsedMcuSelectFeedback | null;
      stripButtonFeedback: ParsedMcuStripButtonFeedback | null;
      faderFeedback: ParsedMcuFaderFeedback | null;
      meterFeedback: ParsedMcuMeterFeedback | null;
    },
  ): void {
    const isMapped =
      details.transportRole !== null ||
      details.lcdUpdates.length > 0 ||
      details.selectFeedback !== null ||
      details.stripButtonFeedback !== null ||
      details.faderFeedback !== null ||
      details.meterFeedback !== null;

    if (isMapped) {
      return;
    }

    const [status, data1, data2] = message.bytes;

    if (typeof status !== 'number' || typeof data1 !== 'number') {
      return;
    }

    const isShortMcuStatus =
      status === MCU_MESSAGE_MAP.protocol.noteStatus ||
      status === MCU_MESSAGE_MAP.protocol.controlChangeStatus ||
      (status >= MCU_MESSAGE_MAP.protocol.channelPressureStatusBase &&
        status < MCU_MESSAGE_MAP.protocol.channelPressureStatusBase + MCU_MESSAGE_MAP.protocol.stripCount);
    const value = typeof data2 === 'number' ? data2 : data1;

    if (isShortMcuStatus && value >= MCU_BUTTON_PRESS_VELOCITY) {
      this.logMeterDebug(
        `[focused-meter-clip-debug] unmapped high-value MIDI bytes=${formatMidiBytes(message.bytes)} value=${value}`,
      );
    }
  }

  private rememberStripButtonFeedback(feedback: ParsedMcuStripButtonFeedback, receivedAt: string): void {
    const current = this.stripFeedbackStates[feedback.stripIndex] ?? createStripFeedbackState();
    const nextFeedback = {
      ...current,
      arm: feedback.role === 'recordEnable' ? feedback.isOn : current.arm,
      solo: feedback.role === 'solo' ? feedback.isOn : current.solo,
      mute: feedback.role === 'mute' ? feedback.isOn : current.mute,
    };

    this.stripFeedbackStates[feedback.stripIndex] = nextFeedback;
  }

  private rememberFaderFeedback(feedback: ParsedMcuFaderFeedback, receivedAt: string): void {
    const current = this.stripFeedbackStates[feedback.stripIndex] ?? createStripFeedbackState();
    const db = interpolateFaderTaperDb(feedback.normalized);
    const gainDbText = formatFaderGainDbText(db);

    this.stripFeedbackStates[feedback.stripIndex] = {
      ...current,
      fader: {
        ...current.fader,
        raw14: feedback.raw14,
        signed: feedback.signed,
        normalized: feedback.normalized,
        gainDbText,
        source: 'mcu',
        updatedAt: receivedAt,
      },
    };
  }

  private rememberMeterFeedback(feedback: ParsedMcuMeterFeedback, receivedAt: string, stripIndex: number): void {
    const current = this.stripFeedbackStates[stripIndex] ?? createStripFeedbackState();
    const clip = this.resolveNextMeterClipState(feedback, current.meter.clip, stripIndex, receivedAt);
    const normalized = feedback.normalized ?? current.meter.normalized;
    const peak =
      typeof normalized === 'number' && Number.isFinite(normalized)
        ? Math.max(current.meter.peak ?? 0, normalized)
        : current.meter.peak;

    this.stripFeedbackStates[stripIndex] = {
      ...current,
      meter: {
        raw: feedback.raw,
        normalized,
        peak,
        clip,
        source: 'mcu',
        updatedAt: receivedAt,
      },
    };

    if (clip === true && current.meter.clip !== true) {
      this.logMeterDebug(
        `[${new Date().toISOString()}] [focused-meter-clip-debug] live meter set peak lamp=true strip=${stripIndex + 1} meterUpdatedAt=${receivedAt}`,
      );
    }
  }

  private isLivePeakTriggerFeedback(feedback: ParsedMcuMeterFeedback): boolean {
    if (feedback.encoding === 'focused-level' && feedback.raw >= 0x0b && feedback.raw <= MCU_METER_OBSERVED_MAX_RAW) {
      this.logMeterDebug(
        `[${new Date().toISOString()}] [focused-meter-clip-debug] upper meter event raw=${feedback.raw.toString(16).padStart(2, '0').toUpperCase()} normalized=${feedback.normalized?.toFixed(4) ?? 'null'}`,
      );
    }

    return (
      feedback.encoding === 'focused-level' &&
      feedback.raw >= MCU_METER_WARNING_THRESHOLD_RAW &&
      feedback.raw <= MCU_METER_OBSERVED_MAX_RAW &&
      typeof feedback.normalized === 'number' &&
      feedback.normalized >= MCU_METER_WARNING_THRESHOLD_RAW / MCU_METER_OBSERVED_MAX_RAW
    );
  }

  private resolveNextMeterClipState(
    feedback: ParsedMcuMeterFeedback,
    currentClip: boolean | null,
    stripIndex: number,
    receivedAt: string,
  ): boolean | null {
    if (this.isLivePeakTriggerFeedback(feedback)) {
      this.scheduleMeterClipClear(stripIndex, 'live-meter');
      return true;
    }

    if (feedback.clip === true) {
      this.logMeterDebug(
        `[${new Date().toISOString()}] [focused-meter-clip-debug] received delayed D0 0F diagnostic strip=${stripIndex + 1} meterUpdatedAt=${receivedAt}`,
      );

      if (currentClip === true) {
        this.scheduleMeterClipClear(stripIndex, 'd0-0f-refresh');
      }

      return currentClip;
    }

    return currentClip;
  }

  private scheduleMeterClipClear(stripIndex: number, reason: 'live-meter' | 'd0-0f-refresh'): void {
    const hadExistingTimer = this.meterClipClearTimers.has(stripIndex);
    this.clearMeterClipTimer(stripIndex);

    this.logMeterDebug(
      `[${new Date().toISOString()}] [focused-meter-clip-debug] ${hadExistingTimer ? 'refreshed' : 'started'} peak lamp hold strip=${stripIndex + 1} holdMs=${MCU_METER_CLIP_HOLD_MS} reason=${reason}`,
    );

    const timer = setTimeout(() => {
      this.meterClipClearTimers.delete(stripIndex);
      this.clearMeterClipState(stripIndex);
    }, MCU_METER_CLIP_HOLD_MS);

    this.meterClipClearTimers.set(stripIndex, timer);
  }

  private clearMeterClipTimer(stripIndex: number): void {
    const timer = this.meterClipClearTimers.get(stripIndex);

    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.meterClipClearTimers.delete(stripIndex);
  }

  private clearAllMeterClipTimers(): void {
    for (const timer of this.meterClipClearTimers.values()) {
      clearTimeout(timer);
    }

    this.meterClipClearTimers.clear();
  }

  private clearMeterClipState(stripIndex: number): void {
    const current = this.stripFeedbackStates[stripIndex] ?? createStripFeedbackState();

    if (current.meter.clip !== true) {
      return;
    }

    const updatedAt = new Date().toISOString();
    const nextMeter = {
      ...current.meter,
      clip: false,
      source: 'mcu' as const,
      updatedAt,
    };

    this.stripFeedbackStates[stripIndex] = {
      ...current,
      meter: nextMeter,
    };

    this.logMeterDebug(
      `[${new Date().toISOString()}] [focused-meter-clip-debug] peak lamp hold cleared strip=${stripIndex + 1} holdMs=${MCU_METER_CLIP_HOLD_MS}`,
    );

    if (this.isFocusedStrip(stripIndex)) {
      this.focusedTrack = {
        ...this.focusedTrack,
        index: stripIndex,
        meter: {
          ...nextMeter,
        },
        source: 'mcu',
        updatedAt,
      };
      this.rememberPreservedSnapshot(this.buildCurrentSnapshot());
      this.emitStateChange('meter-clip-clear');
    }
  }

  private emitStateChange(reason: string): void {
    this.options.onStateChange?.({
      reason,
      snapshot: this.buildCurrentSnapshot(),
      emittedAt: new Date().toISOString(),
    });
  }

  private applyStripButtonFeedback(feedback: ParsedMcuStripButtonFeedback, receivedAt: string): void {
    const cachedFeedback = this.stripFeedbackStates[feedback.stripIndex] ?? createStripFeedbackState();

    this.focusedTrack = {
      ...this.focusedTrack,
      index: feedback.stripIndex,
      arm: cachedFeedback.arm,
      solo: cachedFeedback.solo,
      mute: cachedFeedback.mute,
      source: 'mcu' as const,
      updatedAt: receivedAt,
    };
  }

  private applyFaderFeedback(feedback: ParsedMcuFaderFeedback, receivedAt: string): void {
    const cachedFeedback = this.stripFeedbackStates[feedback.stripIndex] ?? createStripFeedbackState();

    this.logger.log(
      `[focused-fader-debug] strip=${feedback.stripIndex + 1} raw14=${feedback.raw14} normalized=${feedback.normalized.toFixed(6)} displayGain=${cachedFeedback.fader.gainDbText ?? '--'} signed=${feedback.signed}`,
    );

    this.focusedTrack = {
      ...this.focusedTrack,
      index: feedback.stripIndex,
      fader: {
        ...cachedFeedback.fader,
      },
      source: 'mcu',
      updatedAt: receivedAt,
    };
  }

  private applyMeterFeedback(feedback: ParsedMcuMeterFeedback, receivedAt: string, stripIndex: number): void {
    const cachedFeedback = this.stripFeedbackStates[stripIndex] ?? createStripFeedbackState();

    this.focusedTrack = {
      ...this.focusedTrack,
      index: stripIndex,
      meter: {
        ...cachedFeedback.meter,
      },
      source: 'mcu',
      updatedAt: receivedAt,
    };
  }

  private applyTransportFeedback(message: RawMidiMessage, role: ParsedTransportRole | null): void {
    if (!role) {
      return;
    }

    const [status, , data2 = 0] = message.bytes;
    const isOn = status === MCU_MESSAGE_MAP.protocol.noteStatus && data2 > 0;
    const nextTransport: TransportState = {
      ...this.transport,
      source: 'mcu',
      updatedAt: message.receivedAt,
    };

    switch (role) {
      case 'play':
        nextTransport.playing = isOn;
        if (isOn) {
          nextTransport.stopped = false;
        }
        break;
      case 'stop':
        nextTransport.stopped = isOn;
        if (isOn) {
          nextTransport.playing = false;
        }
        break;
      case 'record':
        nextTransport.recording = isOn;
        break;
      case 'click':
        nextTransport.click = isOn;
        break;
      case 'cycle':
        nextTransport.loop = isOn;
        break;
      default:
        return;
    }

    this.transport = nextTransport;
  }

  getSnapshot(): V2RemoteState {
    this.restorePreservedSnapshot();

    const snapshot = this.buildCurrentSnapshot();
    this.rememberPreservedSnapshot(snapshot);

    return snapshot;
  }

  getDiagnostics(): McuDiagnosticsState {
    return cloneMcuDiagnosticsState(this.diagnostics);
  }
}
