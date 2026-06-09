import type {
  FocusedTrackState,
  McuState,
  TransportState,
  V2RemoteState,
} from '../../shared/v2-state.js';

export interface McuServiceOptions {
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
  selectedOutputId: null,
  virtualInputName: null,
  virtualOutputName: null,
  lastMessageAt: null,
  lastError: null,
});

export class McuService {
  private readonly logger: Pick<Console, 'log' | 'error'>;
  private transport = createTransportState();
  private focusedTrack = createFocusedTrackState();
  private mcu = createMcuState();

  constructor(options: McuServiceOptions = {}) {
    this.logger = options.logger ?? console;
  }

  async start(): Promise<void> {
    this.mcu = {
      ...this.mcu,
      lifecycle: 'idle',
      lastError: null,
    };

    this.logger.log('MCU service initialized in no-op mode');
  }

  async stop(): Promise<void> {
    this.mcu = {
      ...this.mcu,
      connected: false,
      lifecycle: 'disabled',
      lastMessageAt: null,
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
