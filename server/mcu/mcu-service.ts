import type {
  FocusedTrackState,
  MidiMode,
  McuDiagnosticsState,
  McuState,
  McuPortState,
  McuRecentMessageDiagnostic,
  TransportState,
  V2RemoteState,
} from '../../shared/v2-state.js';
import type { FocusedTrackMcuControlRole } from '../../shared/commands.js';
import { JzzMidiAdapter, type RawMidiMessage } from './midi-adapter.js';
import { MCU_MESSAGE_MAP } from './mcu-message-map.js';
import { RtMidiVirtualPortAdapter, type VirtualMidiAdapterSnapshot } from './virtual-midi-adapter.js';

export interface McuServiceOptions {
  enabled?: boolean;
  midiMode?: MidiMode;
  enableVirtualMidi?: boolean;
  debugMidiMessages?: boolean;
  selectedInputId?: string;
  selectedInputName?: string;
  selectedOutputId?: string;
  selectedOutputName?: string;
  virtualInputName?: string;
  virtualOutputName?: string;
  logger?: Pick<Console, 'log' | 'error'>;
}

const DEFAULT_VIRTUAL_INPUT_NAME = 'LUNA Studio Remote MCU In';
const DEFAULT_VIRTUAL_OUTPUT_NAME = 'LUNA Studio Remote MCU Out';
const FOCUSED_TRACK_NOT_SELECTED_ERROR =
  'Focused track is not selected yet. Select a track in LUNA or wait for MCU select feedback.';
const MCU_BUTTON_PRESS_VELOCITY = 127;
const MCU_BUTTON_RELEASE_VELOCITY = 0;
const MCU_BUTTON_RELEASE_DELAY_MS = 20;
const MAX_RECENT_MCU_DIAGNOSTIC_MESSAGES = 12;

export interface FocusedTrackControlResult {
  role: FocusedTrackMcuControlRole;
  stripIndex: number;
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
    source: 'unknown',
    updatedAt: null,
  },
  fader: {
    raw14: null,
    signed: null,
    normalized: null,
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
  virtualInputName: null,
  virtualOutputName: null,
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

const createEmptyVirtualMidiSnapshot = (): VirtualMidiAdapterSnapshot => ({
  available: false,
  connected: false,
  inputCreated: false,
  outputCreated: false,
  virtualInputName: null,
  virtualOutputName: null,
  lastError: null,
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

const createVirtualInputPort = (name: string): McuPortState => ({
  id: `virtual:input:${name}`,
  name,
});

const createVirtualOutputPort = (name: string): McuPortState => ({
  id: `virtual:output:${name}`,
  name,
});

const prependPortIfMissing = (ports: McuPortState[], port: McuPortState | null): McuPortState[] => {
  if (!port) {
    return ports;
  }

  const normalizedName = port.name.toLowerCase();
  const alreadyPresent = ports.some((candidate) => {
    return candidate.id === port.id || candidate.name.toLowerCase() === normalizedName;
  });

  return alreadyPresent ? ports : [port, ...ports];
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

type McuStripLcdState = Readonly<{
  upper: string | null;
  lower: string | null;
}>;

const LCD_SLOT_WIDTH_CANDIDATES = [7, 6, 5] as const;

const createStripLcdStates = (): McuStripLcdState[] => {
  return Array.from({ length: MCU_MESSAGE_MAP.protocol.stripCount }, () => ({
    upper: null,
    lower: null,
  }));
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

export class McuService {
  private readonly options: McuServiceOptions;
  private readonly logger: Pick<Console, 'log' | 'error'>;
  private midiAdapter: JzzMidiAdapter | null = null;
  private virtualMidiAdapter: RtMidiVirtualPortAdapter | null = null;
  private transport = createTransportState();
  private focusedTrack = createFocusedTrackState();
  private selectedStripIndex: number | null = null;
  private stripLcdStates = createStripLcdStates();
  private preservedSnapshot: V2RemoteState | null = null;
  private mcu = createMcuState();
  private diagnostics = createMcuDiagnosticsState();

  constructor(options: McuServiceOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? console;
    const useVirtualMidi = this.shouldUseVirtualMidi();

    this.mcu = {
      ...this.mcu,
      enabled: options.enabled ?? true,
      virtualInputName: useVirtualMidi ? this.getVirtualInputName() : null,
      virtualOutputName: useVirtualMidi ? this.getVirtualOutputName() : null,
    };
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

    const useVirtualMidi = this.shouldUseVirtualMidi();

    this.mcu = {
      ...this.mcu,
      enabled: true,
      lifecycle: 'starting',
      driver: useVirtualMidi ? 'rtmidi' : 'jzz',
      virtualInputName: useVirtualMidi ? this.getVirtualInputName() : null,
      virtualOutputName: useVirtualMidi ? this.getVirtualOutputName() : null,
      lastError: null,
    };

    const virtualSnapshot = await this.startVirtualMidi();
    const hasManualInputSelection = Boolean(this.options.selectedInputId || this.options.selectedInputName);
    const hasManualOutputSelection = Boolean(this.options.selectedOutputId || this.options.selectedOutputName);
    const shouldListenToJzzInput = !useVirtualMidi || hasManualInputSelection || !virtualSnapshot.inputCreated;

    this.midiAdapter = new JzzMidiAdapter({
      enabled: true,
      listenForMessages: shouldListenToJzzInput,
      debugRawMessages: this.options.debugMidiMessages ?? false,
      selectedInputId: this.options.selectedInputId,
      selectedInputName: this.options.selectedInputName,
      selectedOutputId: this.options.selectedOutputId,
      selectedOutputName: this.options.selectedOutputName,
      logger: this.logger,
      onRawMessage: (message) => this.handleRawMidiMessage(message),
    });

    const midiSnapshot = await this.midiAdapter.start();
    const virtualInputPort = virtualSnapshot.inputCreated ? createVirtualInputPort(this.getVirtualInputName()) : null;
    const virtualOutputPort = virtualSnapshot.outputCreated ? createVirtualOutputPort(this.getVirtualOutputName()) : null;
    const inputPorts = prependPortIfMissing(midiSnapshot.inputPorts, virtualInputPort);
    const outputPorts = prependPortIfMissing(midiSnapshot.outputPorts, virtualOutputPort);
    const selectedInput = hasManualInputSelection
      ? {
          id: midiSnapshot.selectedInputId,
          name: midiSnapshot.selectedInputName,
        }
      : {
          id: virtualInputPort?.id ?? midiSnapshot.selectedInputId,
          name: virtualInputPort?.name ?? midiSnapshot.selectedInputName,
        };
    const selectedOutput = hasManualOutputSelection
      ? {
          id: midiSnapshot.selectedOutputId,
          name: midiSnapshot.selectedOutputName,
        }
      : {
          id: virtualOutputPort?.id ?? midiSnapshot.selectedOutputId,
          name: virtualOutputPort?.name ?? midiSnapshot.selectedOutputName,
        };
    const available = virtualSnapshot.available || midiSnapshot.available;
    const connected = Boolean(selectedInput.id && selectedOutput.id);
    const lastError = combineErrors(virtualSnapshot.lastError, midiSnapshot.lastError);

    this.mcu = {
      ...this.mcu,
      available,
      connected,
      lifecycle: available ? (connected ? 'connected' : 'idle') : 'error',
      inputPorts,
      outputPorts,
      selectedInputId: selectedInput.id,
      selectedInputName: selectedInput.name,
      selectedOutputId: selectedOutput.id,
      selectedOutputName: selectedOutput.name,
      virtualInputName: virtualSnapshot.virtualInputName,
      virtualOutputName: virtualSnapshot.virtualOutputName,
      lastError,
    };

    if (!available) {
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
    this.virtualMidiAdapter?.stop();
    this.virtualMidiAdapter = null;

    this.mcu = {
      ...this.mcu,
      connected: false,
      lifecycle: this.mcu.enabled ? 'idle' : 'disabled',
      lastMessageAt: null,
    };
  }

  private async startVirtualMidi(): Promise<VirtualMidiAdapterSnapshot> {
    if (!this.shouldUseVirtualMidi()) {
      return createEmptyVirtualMidiSnapshot();
    }

    this.virtualMidiAdapter = new RtMidiVirtualPortAdapter({
      enabled: true,
      inputName: this.getVirtualInputName(),
      outputName: this.getVirtualOutputName(),
      debugRawMessages: this.options.debugMidiMessages ?? false,
      logger: this.logger,
      onRawMessage: (message) => this.handleRawMidiMessage(message),
    });

    return this.virtualMidiAdapter.start();
  }

  private shouldUseVirtualMidi(): boolean {
    return (this.options.midiMode ?? 'virtual') === 'virtual' && (this.options.enableVirtualMidi ?? true);
  }

  private getVirtualInputName(): string {
    return this.options.virtualInputName?.trim() || DEFAULT_VIRTUAL_INPUT_NAME;
  }

  private getVirtualOutputName(): string {
    return this.options.virtualOutputName?.trim() || DEFAULT_VIRTUAL_OUTPUT_NAME;
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
        virtualInputName: nextMcu.virtualInputName ?? previousMcu.virtualInputName,
        virtualOutputName: nextMcu.virtualOutputName ?? previousMcu.virtualOutputName,
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

    if (this.virtualMidiAdapter) {
      try {
        await this.virtualMidiAdapter.sendRawMessage(bytes);
        return;
      } catch (error) {
        sendErrors.push(serializeError(error));
      }
    }

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

    if (
      status !== MCU_MESSAGE_MAP.protocol.noteStatus ||
      typeof data1 !== 'number' ||
      typeof data2 !== 'number'
    ) {
      return null;
    }

    return TRANSPORT_LED_NOTE_TO_ROLE.get(data1) ?? null;
  }

  private recordRawMidiDiagnostic(details: {
    message: RawMidiMessage;
    transportRole: ParsedTransportRole | null;
    lcdUpdates: ParsedMcuLcdFeedback[];
    selectFeedback: ParsedMcuSelectFeedback | null;
    focusedTrackUpdated: boolean;
  }): void {
    const { message, transportRole, lcdUpdates, selectFeedback, focusedTrackUpdated } = details;
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
  }): string {
    const { transportRole, lcdUpdates, selectFeedback } = details;

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

    if (transportRole) {
      return `Transport ${transportRole}`;
    }

    return 'Unmapped MCU message';
  }

  private handleRawMidiMessage(message: RawMidiMessage): void {
    const transportRole = this.getTransportFeedbackRole(message.bytes);
    const lcdUpdates = parseMcuLcdSysexFeedback(message.bytes);
    const selectFeedback = parseMcuSelectLedFeedback(message.bytes);

    this.mcu = {
      ...this.mcu,
      lastMessageAt: message.receivedAt,
    };

    this.applyTransportFeedback(message, transportRole);
    const focusedTrackUpdated = this.applyFocusedTrackFeedback(message, lcdUpdates, selectFeedback);
    this.recordRawMidiDiagnostic({
      message,
      transportRole,
      lcdUpdates,
      selectFeedback,
      focusedTrackUpdated,
    });
    this.rememberPreservedSnapshot(this.buildCurrentSnapshot());
  }

  private applyFocusedTrackFeedback(
    message: RawMidiMessage,
    lcdUpdates: ParsedMcuLcdFeedback[],
    selectFeedback: ParsedMcuSelectFeedback | null,
  ): boolean {
    let focusedTrackUpdated = false;

    if (lcdUpdates.length > 0) {
      focusedTrackUpdated = this.applyLcdFeedback(lcdUpdates, message.receivedAt) || focusedTrackUpdated;
    }

    if (selectFeedback?.selected) {
      this.applySelectedStripFeedback(selectFeedback.stripIndex, message.receivedAt);
      focusedTrackUpdated = true;
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
    this.focusedTrack = {
      ...this.focusedTrack,
      index: stripIndex,
      name: this.stripLcdStates[stripIndex]?.upper ?? null,
      source: 'mcu',
      updatedAt: receivedAt,
    };
  }

  private applyTransportFeedback(message: RawMidiMessage, role: ParsedTransportRole | null): void {
    if (!role) {
      return;
    }

    const data2 = message.bytes[2] ?? 0;
    const isOn = data2 > 0;
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
