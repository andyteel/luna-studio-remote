import type {
  FocusedTrackState,
  McuState,
  TransportState,
  V2RemoteState,
} from '../../shared/v2-state.js';
import { JzzMidiAdapter, type RawMidiMessage } from './midi-adapter.js';

export interface McuServiceOptions {
  enabled?: boolean;
  debugMidiMessages?: boolean;
  selectedInputId?: string;
  selectedInputName?: string;
  selectedOutputId?: string;
  selectedOutputName?: string;
  logger?: Pick<Console, 'log' | 'error'>;
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

export class McuService {
  private readonly options: McuServiceOptions;
  private readonly logger: Pick<Console, 'log' | 'error'>;
  private midiAdapter: JzzMidiAdapter | null = null;
  private transport = createTransportState();
  private focusedTrack = createFocusedTrackState();
  private mcu = createMcuState();

  constructor(options: McuServiceOptions = {}) {
    this.options = options;
    this.logger = options.logger ?? console;
    this.mcu = {
      ...this.mcu,
      enabled: options.enabled ?? true,
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
      driver: 'jzz',
      lastError: null,
    };

    this.midiAdapter = new JzzMidiAdapter({
      enabled: true,
      debugRawMessages: this.options.debugMidiMessages ?? false,
      selectedInputId: this.options.selectedInputId,
      selectedInputName: this.options.selectedInputName,
      selectedOutputId: this.options.selectedOutputId,
      selectedOutputName: this.options.selectedOutputName,
      logger: this.logger,
      onRawMessage: (message) => this.handleRawMidiMessage(message),
    });

    const midiSnapshot = await this.midiAdapter.start();

    this.mcu = {
      ...this.mcu,
      available: midiSnapshot.available,
      connected: midiSnapshot.connected,
      lifecycle: midiSnapshot.available ? (midiSnapshot.connected ? 'connected' : 'idle') : 'error',
      inputPorts: midiSnapshot.inputPorts,
      outputPorts: midiSnapshot.outputPorts,
      selectedInputId: midiSnapshot.selectedInputId,
      selectedInputName: midiSnapshot.selectedInputName,
      selectedOutputId: midiSnapshot.selectedOutputId,
      selectedOutputName: midiSnapshot.selectedOutputName,
      lastError: midiSnapshot.lastError,
    };

    if (!midiSnapshot.available) {
      this.logger.error(`MCU service running without MIDI: ${midiSnapshot.lastError ?? 'MIDI unavailable'}`);
      return;
    }

    this.logger.log(
      `MCU service initialized with ${midiSnapshot.inputPorts.length} MIDI input(s) and ${midiSnapshot.outputPorts.length} MIDI output(s)`,
    );
  }

  async stop(): Promise<void> {
    await this.midiAdapter?.stop();
    this.midiAdapter = null;

    this.mcu = {
      ...this.mcu,
      connected: false,
      lifecycle: this.mcu.enabled ? 'idle' : 'disabled',
      lastMessageAt: null,
    };
  }

  private handleRawMidiMessage(message: RawMidiMessage): void {
    this.mcu = {
      ...this.mcu,
      lastMessageAt: message.receivedAt,
    };
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
