import type { McuPortState } from '../../shared/v2-state.js';

interface MidiPortLike {
  id: string;
  name?: string;
  manufacturer?: string;
}

interface MidiInputLike extends MidiPortLike {
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
  open?: () => Promise<unknown>;
  close?: () => Promise<unknown>;
}

interface MidiOutputLike extends MidiPortLike {}

interface MidiAccessLike {
  inputs: ReadonlyMap<string, MidiInputLike>;
  outputs: ReadonlyMap<string, MidiOutputLike>;
}

interface JzzLike {
  requestMIDIAccess: (options?: { sysex: boolean; software: boolean }) => Promise<MidiAccessLike>;
  close?: () => void;
}

export interface RawMidiMessage {
  inputId: string;
  inputName: string;
  bytes: number[];
  receivedAt: string;
}

export interface MidiAdapterOptions {
  enabled: boolean;
  debugRawMessages: boolean;
  selectedInputId?: string;
  selectedInputName?: string;
  selectedOutputId?: string;
  selectedOutputName?: string;
  logger?: Pick<Console, 'log' | 'error'>;
  onRawMessage?: (message: RawMidiMessage) => void;
}

export interface MidiAdapterSnapshot {
  available: boolean;
  connected: boolean;
  inputPorts: McuPortState[];
  outputPorts: McuPortState[];
  selectedInputId: string | null;
  selectedInputName: string | null;
  selectedOutputId: string | null;
  selectedOutputName: string | null;
  lastError: string | null;
}

const emptySnapshot = (): MidiAdapterSnapshot => ({
  available: false,
  connected: false,
  inputPorts: [],
  outputPorts: [],
  selectedInputId: null,
  selectedInputName: null,
  selectedOutputId: null,
  selectedOutputName: null,
  lastError: null,
});

const normalizePortName = (port: MidiPortLike): string => {
  return port.name?.trim() || port.manufacturer?.trim() || port.id;
};

const toPortState = (port: MidiPortLike): McuPortState => ({
  id: port.id,
  name: normalizePortName(port),
});

const findPort = <Port extends McuPortState>(
  ports: Port[],
  selectedId?: string,
  selectedName?: string,
): Port | null => {
  if (ports.length === 0) {
    return null;
  }

  const normalizedId = selectedId?.trim();
  const normalizedName = selectedName?.trim().toLowerCase();

  if (normalizedId) {
    return ports.find((port) => port.id === normalizedId) ?? null;
  }

  if (normalizedName) {
    return ports.find((port) => port.name.toLowerCase() === normalizedName) ??
      ports.find((port) => port.name.toLowerCase().includes(normalizedName)) ??
      null;
  }

  return ports[0];
};

const formatMidiBytes = (bytes: number[]): string => {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
};

const serializeError = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

export class JzzMidiAdapter {
  private readonly options: MidiAdapterOptions;
  private readonly logger: Pick<Console, 'log' | 'error'>;
  private jzz: JzzLike | null = null;
  private access: MidiAccessLike | null = null;
  private openedInput: MidiInputLike | null = null;
  private snapshot = emptySnapshot();

  constructor(options: MidiAdapterOptions) {
    this.options = options;
    this.logger = options.logger ?? console;
  }

  async start(): Promise<MidiAdapterSnapshot> {
    if (!this.options.enabled) {
      this.snapshot = emptySnapshot();
      return this.getSnapshot();
    }

    try {
      const imported = (await import('jzz')) as unknown as JzzLike & { default?: JzzLike };
      this.jzz = imported.default ?? imported;

      this.access = await this.jzz.requestMIDIAccess({
        sysex: true,
        software: true,
      });

      const inputPorts = Array.from(this.access.inputs.values()).map(toPortState);
      const outputPorts = Array.from(this.access.outputs.values()).map(toPortState);
      const selectedInput = findPort(inputPorts, this.options.selectedInputId, this.options.selectedInputName);
      const selectedOutput = findPort(outputPorts, this.options.selectedOutputId, this.options.selectedOutputName);
      const selectionErrors = this.getSelectionErrors(inputPorts, outputPorts, selectedInput, selectedOutput);

      this.snapshot = {
        available: true,
        connected: Boolean(selectedInput || selectedOutput),
        inputPorts,
        outputPorts,
        selectedInputId: selectedInput?.id ?? null,
        selectedInputName: selectedInput?.name ?? null,
        selectedOutputId: selectedOutput?.id ?? null,
        selectedOutputName: selectedOutput?.name ?? null,
        lastError: selectionErrors.length ? selectionErrors.join('; ') : null,
      };

      if (this.options.debugRawMessages && selectedInput) {
        await this.openRawMessageInput(selectedInput);
      }

      return this.getSnapshot();
    } catch (error) {
      this.snapshot = {
        ...emptySnapshot(),
        lastError: serializeError(error),
      };
      this.logger.error(`MCU MIDI initialization failed: ${this.snapshot.lastError}`);
      return this.getSnapshot();
    }
  }

  async stop(): Promise<void> {
    if (this.openedInput) {
      this.openedInput.onmidimessage = null;

      try {
        await this.openedInput.close?.();
      } catch (error) {
        this.logger.error(`MCU MIDI input close failed: ${serializeError(error)}`);
      }

      this.openedInput = null;
    }

    try {
      this.jzz?.close?.();
    } catch (error) {
      this.logger.error(`MCU MIDI engine close failed: ${serializeError(error)}`);
    }

    this.access = null;
    this.jzz = null;
  }

  getSnapshot(): MidiAdapterSnapshot {
    return {
      ...this.snapshot,
      inputPorts: [...this.snapshot.inputPorts],
      outputPorts: [...this.snapshot.outputPorts],
    };
  }

  private getSelectionErrors(
    inputPorts: McuPortState[],
    outputPorts: McuPortState[],
    selectedInput: McuPortState | null,
    selectedOutput: McuPortState | null,
  ): string[] {
    const errors: string[] = [];

    if ((this.options.selectedInputId || this.options.selectedInputName) && inputPorts.length > 0 && !selectedInput) {
      errors.push('Configured MCU input port was not found');
    }

    if ((this.options.selectedOutputId || this.options.selectedOutputName) && outputPorts.length > 0 && !selectedOutput) {
      errors.push('Configured MCU output port was not found');
    }

    return errors;
  }

  private async openRawMessageInput(selectedInput: McuPortState): Promise<void> {
    const input = this.access?.inputs.get(selectedInput.id);

    if (!input) {
      this.snapshot = {
        ...this.snapshot,
        lastError: 'Selected MCU input port could not be opened',
      };
      return;
    }

    input.onmidimessage = (event) => {
      const bytes = Array.from(event.data ?? []);
      const receivedAt = new Date().toISOString();
      const message: RawMidiMessage = {
        inputId: selectedInput.id,
        inputName: selectedInput.name,
        bytes,
        receivedAt,
      };

      this.options.onRawMessage?.(message);
      this.logger.log(`[MCU MIDI IN] ${selectedInput.name}: ${formatMidiBytes(bytes)}`);
    };

    await input.open?.();
    this.openedInput = input;
  }
}
