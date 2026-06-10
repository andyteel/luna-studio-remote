import type {
  FocusedTrackState,
  McuState,
  McuPortState,
  TransportState,
  V2RemoteState,
} from '../../shared/v2-state.js';
import { JzzMidiAdapter, type RawMidiMessage } from './midi-adapter.js';
import { MCU_MESSAGE_MAP } from './mcu-message-map.js';
import { RtMidiVirtualPortAdapter, type VirtualMidiAdapterSnapshot } from './virtual-midi-adapter.js';

export interface McuServiceOptions {
  enabled?: boolean;
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

export class McuService {
  private readonly options: McuServiceOptions;
  private readonly logger: Pick<Console, 'log' | 'error'>;
  private midiAdapter: JzzMidiAdapter | null = null;
  private virtualMidiAdapter: RtMidiVirtualPortAdapter | null = null;
  private transport = createTransportState();
  private focusedTrack = createFocusedTrackState();
  private mcu = createMcuState();

  constructor(options: McuServiceOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? console;
    this.mcu = {
      ...this.mcu,
      enabled: options.enabled ?? true,
      virtualInputName: (options.enableVirtualMidi ?? true) ? this.getVirtualInputName() : null,
      virtualOutputName: (options.enableVirtualMidi ?? true) ? this.getVirtualOutputName() : null,
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

    this.mcu = {
      ...this.mcu,
      enabled: true,
      lifecycle: 'starting',
      driver: (this.options.enableVirtualMidi ?? true) ? 'rtmidi' : 'jzz',
      virtualInputName: (this.options.enableVirtualMidi ?? true) ? this.getVirtualInputName() : null,
      virtualOutputName: (this.options.enableVirtualMidi ?? true) ? this.getVirtualOutputName() : null,
      lastError: null,
    };

    const virtualSnapshot = await this.startVirtualMidi();
    const hasManualInputSelection = Boolean(this.options.selectedInputId || this.options.selectedInputName);
    const hasManualOutputSelection = Boolean(this.options.selectedOutputId || this.options.selectedOutputName);
    const shouldOpenDiscoveredInputForDebug =
      (this.options.debugMidiMessages ?? false) && (hasManualInputSelection || !virtualSnapshot.inputCreated);

    this.midiAdapter = new JzzMidiAdapter({
      enabled: true,
      debugRawMessages: shouldOpenDiscoveredInputForDebug,
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
    const connected = Boolean(selectedInput.id || selectedOutput.id);
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
    if (this.options.enableVirtualMidi === false) {
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

  private getVirtualInputName(): string {
    return this.options.virtualInputName?.trim() || DEFAULT_VIRTUAL_INPUT_NAME;
  }

  private getVirtualOutputName(): string {
    return this.options.virtualOutputName?.trim() || DEFAULT_VIRTUAL_OUTPUT_NAME;
  }

  private handleRawMidiMessage(message: RawMidiMessage): void {
    this.mcu = {
      ...this.mcu,
      lastMessageAt: message.receivedAt,
    };

    this.applyTransportFeedback(message);
  }

  private applyTransportFeedback(message: RawMidiMessage): void {
    const [status, data1, data2] = message.bytes;

    if (
      status !== MCU_MESSAGE_MAP.protocol.noteStatus ||
      typeof data1 !== 'number' ||
      typeof data2 !== 'number'
    ) {
      return;
    }

    const role = TRANSPORT_LED_NOTE_TO_ROLE.get(data1);

    if (!role) {
      return;
    }

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
    return {
      transport: {
        ...this.transport,
      },
      focusedTrack: {
        ...this.focusedTrack,
        meter: {
          ...this.focusedTrack.meter,
        },
        fader: {
          ...this.focusedTrack.fader,
        },
      },
      mcu: {
        ...this.mcu,
        inputPorts: [...this.mcu.inputPorts],
        outputPorts: [...this.mcu.outputPorts],
      },
    };
  }
}
