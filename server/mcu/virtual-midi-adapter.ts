import { fork, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { RawMidiMessage } from './midi-adapter.js';

export interface VirtualMidiAdapterOptions {
  enabled: boolean;
  inputName: string;
  outputName: string;
  debugRawMessages: boolean;
  logger?: Pick<Console, 'log' | 'error'>;
  onRawMessage?: (message: RawMidiMessage) => void;
}

export interface VirtualMidiAdapterSnapshot {
  available: boolean;
  connected: boolean;
  inputCreated: boolean;
  outputCreated: boolean;
  virtualInputName: string | null;
  virtualOutputName: string | null;
  lastError: string | null;
}

type WorkerMessage =
  | {
      type: 'ready';
      inputCreated: boolean;
      outputCreated: boolean;
      lastError: string | null;
    }
  | {
      type: 'raw';
      bytes: number[];
      receivedAt: string;
    }
  | {
      type: 'error';
      error: string;
    };

const VIRTUAL_MIDI_START_TIMEOUT_MS = 2000;

const emptySnapshot = (): VirtualMidiAdapterSnapshot => ({
  available: false,
  connected: false,
  inputCreated: false,
  outputCreated: false,
  virtualInputName: null,
  virtualOutputName: null,
  lastError: null,
});

const formatMidiBytes = (bytes: number[]): string => {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ');
};

const resolveWorkerPath = (): string => {
  const compiledWorkerPath = fileURLToPath(new URL('./virtual-midi-worker.js', import.meta.url));

  if (existsSync(compiledWorkerPath)) {
    return compiledWorkerPath;
  }

  return fileURLToPath(new URL('./virtual-midi-worker.ts', import.meta.url));
};

const getWorkerExecArgv = (): string[] => {
  return process.execArgv.filter((arg) => !arg.startsWith('--input-type'));
};

export class RtMidiVirtualPortAdapter {
  private readonly options: VirtualMidiAdapterOptions;
  private readonly logger: Pick<Console, 'log' | 'error'>;
  private worker: ChildProcess | null = null;
  private snapshot = emptySnapshot();

  constructor(options: VirtualMidiAdapterOptions) {
    this.options = options;
    this.logger = options.logger ?? console;
  }

  async start(): Promise<VirtualMidiAdapterSnapshot> {
    if (!this.options.enabled) {
      this.snapshot = emptySnapshot();
      return this.getSnapshot();
    }

    this.snapshot = {
      ...emptySnapshot(),
      virtualInputName: this.options.inputName,
      virtualOutputName: this.options.outputName,
    };

    return new Promise((resolve) => {
      const worker = fork(resolveWorkerPath(), {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
        },
        execArgv: getWorkerExecArgv(),
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      });

      this.worker = worker;
      let settled = false;
      let workerStderr = '';

      const settle = (snapshot: VirtualMidiAdapterSnapshot) => {
        if (settled) {
          return;
        }

        settled = true;
        clearTimeout(startTimeout);
        this.snapshot = snapshot;
        resolve(this.getSnapshot());
      };

      const startTimeout = setTimeout(() => {
        if (this.worker === worker) {
          this.worker = null;
        }

        this.stopWorker(worker, true);
        settle({
          ...this.snapshot,
          lastError: `Virtual MIDI worker did not report startup status within ${VIRTUAL_MIDI_START_TIMEOUT_MS}ms`,
        });
      }, VIRTUAL_MIDI_START_TIMEOUT_MS);

      startTimeout.unref();

      worker.stderr?.on('data', (chunk: Buffer) => {
        workerStderr = `${workerStderr}${chunk.toString('utf8')}`.slice(-2000);
      });

      worker.on('message', (message: WorkerMessage) => {
        if (message.type === 'raw') {
          this.handleRawMessage(message.bytes, message.receivedAt);
          return;
        }

        if (message.type === 'error') {
          if (settled) {
            this.snapshot = {
              ...this.snapshot,
              lastError: message.error,
            };
            return;
          }

          if (this.worker === worker) {
            this.worker = null;
          }

          settle({
            ...this.snapshot,
            lastError: message.error,
          });
          return;
        }

        if (message.type === 'ready') {
          const available = message.inputCreated || message.outputCreated;

          if (!available && this.worker === worker) {
            this.worker = null;
          }

          settle({
            ...this.snapshot,
            available,
            connected: available,
            inputCreated: message.inputCreated,
            outputCreated: message.outputCreated,
            lastError: message.lastError,
          });

          if (available) {
            this.logger.log(
              `MCU virtual MIDI ports available: input="${this.options.inputName}" output="${this.options.outputName}"`,
            );
          }
        }
      });

      worker.once('error', (error) => {
        settle({
          ...this.snapshot,
          lastError: `Virtual MIDI worker failed: ${error.message}`,
        });
      });

      worker.once('exit', (code, signal) => {
        const stderr = workerStderr.trim();
        const detail = stderr ? `: ${stderr}` : '';
        const lastError = `Virtual MIDI worker exited before startup completed (code ${String(code)}, signal ${String(signal)})${detail}`;

        if (!settled) {
          settle({
            ...this.snapshot,
            lastError,
          });
          return;
        }

        if (this.worker !== worker) {
          return;
        }

        this.worker = null;
        this.snapshot = {
          ...this.snapshot,
          available: false,
          connected: false,
          inputCreated: false,
          outputCreated: false,
          lastError,
        };
      });

      worker.send({
        type: 'start',
        inputName: this.options.inputName,
        outputName: this.options.outputName,
        debugRawMessages: this.options.debugRawMessages,
      });
    });
  }

  stop(): void {
    const worker = this.worker;
    this.worker = null;

    if (worker) {
      this.stopWorker(worker, false);
    }

    this.snapshot = {
      ...this.snapshot,
      available: false,
      connected: false,
      inputCreated: false,
      outputCreated: false,
    };
  }

  getSnapshot(): VirtualMidiAdapterSnapshot {
    return {
      ...this.snapshot,
    };
  }

  sendRawMessage(bytes: number[]): void {
    if (!this.worker?.connected || !this.snapshot.outputCreated) {
      throw new Error('Virtual MCU output port is not available');
    }

    this.worker.send({
      type: 'send',
      bytes,
    });
  }

  private handleRawMessage(bytes: number[], receivedAt: string): void {
    const rawMessage: RawMidiMessage = {
      inputId: `virtual:input:${this.options.inputName}`,
      inputName: this.options.inputName,
      bytes,
      receivedAt,
    };

    this.options.onRawMessage?.(rawMessage);
    this.logger.log(`[MCU MIDI VIRTUAL IN] ${this.options.inputName}: ${formatMidiBytes(bytes)}`);
  }

  private stopWorker(worker: ChildProcess, force: boolean): void {
    if (worker.connected) {
      worker.send({ type: 'shutdown' });
    }

    if (force) {
      worker.kill();
      return;
    }

    const killTimer = setTimeout(() => {
      if (!worker.killed) {
        worker.kill();
      }
    }, 500);

    killTimer.unref();
  }
}
