import { createRequire } from 'node:module';

interface RtMidiInput {
  on: (event: 'message', callback: (deltaTime: number, message: number[]) => void) => void;
  ignoreTypes?: (sysex: boolean, timing: boolean, activeSensing: boolean) => void;
  openVirtualPort: (name: string) => void;
  closePort: () => void;
}

interface RtMidiOutput {
  openVirtualPort: (name: string) => void;
  sendMessage: (message: number[]) => void;
  closePort: () => void;
}

interface RtMidiModule {
  Input: new () => RtMidiInput;
  Output: new () => RtMidiOutput;
}

type WorkerInboundMessage =
  | {
      type: 'start';
      inputName: string;
      outputName: string;
      debugRawMessages: boolean;
    }
  | {
      type: 'send';
      bytes: number[];
    }
  | {
      type: 'shutdown';
    };

const require = createRequire(import.meta.url);
let virtualInput: RtMidiInput | null = null;
let virtualOutput: RtMidiOutput | null = null;
let keepAliveTimer: NodeJS.Timeout | null = null;

const serializeError = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error);
};

const sendMessage = (message: unknown): void => {
  if (process.send) {
    process.send(message);
  }
};

const closeVirtualInput = (): void => {
  if (!virtualInput) {
    return;
  }

  try {
    virtualInput.closePort();
  } catch {
    // The parent process owns error reporting; shutdown should stay quiet.
  }

  virtualInput = null;
};

const closeVirtualOutput = (): void => {
  if (!virtualOutput) {
    return;
  }

  try {
    virtualOutput.closePort();
  } catch {
    // The parent process owns error reporting; shutdown should stay quiet.
  }

  virtualOutput = null;
};

const shutdown = (): void => {
  closeVirtualOutput();
  closeVirtualInput();

  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }

  process.exit(0);
};

const startVirtualMidi = (message: Extract<WorkerInboundMessage, { type: 'start' }>): void => {
  let midi: RtMidiModule;

  try {
    midi = require('midi') as RtMidiModule;
  } catch (error) {
    sendMessage({
      type: 'error',
      error: `Virtual MIDI unavailable: ${serializeError(error)}`,
    });
    process.exit(0);
  }

  const errors: string[] = [];
  let inputCreated = false;
  let outputCreated = false;

  try {
    virtualInput = new midi.Input();

    virtualInput.on('message', (_deltaTime, rawMessage) => {
      sendMessage({
        type: 'raw',
        bytes: Array.from(rawMessage ?? []),
        receivedAt: new Date().toISOString(),
      });
    });

    virtualInput.openVirtualPort(message.inputName);
    virtualInput.ignoreTypes?.(false, false, false);
    inputCreated = true;
  } catch (error) {
    errors.push(`Virtual MIDI input "${message.inputName}" failed: ${serializeError(error)}`);
    closeVirtualInput();
  }

  try {
    virtualOutput = new midi.Output();
    virtualOutput.openVirtualPort(message.outputName);
    outputCreated = true;
  } catch (error) {
    errors.push(`Virtual MIDI output "${message.outputName}" failed: ${serializeError(error)}`);
    closeVirtualOutput();
  }

  sendMessage({
    type: 'ready',
    inputCreated,
    outputCreated,
    lastError: errors.length ? errors.join('; ') : null,
  });

  if (!inputCreated && !outputCreated) {
    process.exit(0);
  }

  keepAliveTimer = setInterval(() => {
    // Hold the worker open so the virtual CoreMIDI ports remain published.
  }, 2147483647);
};

process.on('message', (message: WorkerInboundMessage) => {
  if (message.type === 'start') {
    startVirtualMidi(message);
    return;
  }

  if (message.type === 'send') {
    if (!virtualOutput) {
      sendMessage({
        type: 'error',
        error: 'Virtual MIDI output is not available',
      });
      return;
    }

    try {
      virtualOutput.sendMessage(message.bytes);
    } catch (error) {
      sendMessage({
        type: 'error',
        error: `Virtual MIDI send failed: ${serializeError(error)}`,
      });
    }

    return;
  }

  if (message.type === 'shutdown') {
    shutdown();
  }
});

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
process.once('disconnect', shutdown);
