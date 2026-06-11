import express from 'express';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandMap, commandRegistry, type BaseKey, type CommandId, type ModifierKey } from '../shared/commands.js';
import type { McuDiagnosticsState, McuPortState, V2RemoteState } from '../shared/v2-state.js';
import { config } from './config.js';
import { getLanUrls } from './network.js';
import { buildAppleScript, buildKeyAction, isLunaRunning, triggerLunaCommand, triggerShortcut, type ShortcutSpec } from './luna.js';
import { McuService } from './mcu/mcu-service.js';
import type { RemoteState, TestShortcutDebug } from './types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ServerState {
  lastCommand: CommandId | null;
  lastCommandAt: string | null;
  lastError: string | null;
  lastKeyAction: string | null;
  lastAppleScript: string | null;
  lastShortcutTest: {
    shortcutLabel: string | null;
    key: BaseKey | null;
    modifiers: ModifierKey[];
    keyAction: string | null;
    appleScript: string | null;
    lastError: string | null;
    sentAt: string | null;
    success: boolean | null;
  };
}

export interface RemoteServerOptions {
  host?: string;
  port?: number;
  clientDistPath?: string;
  logger?: Pick<Console, 'log' | 'error'>;
}

export interface RemoteServerInstance {
  app: express.Express;
  host: string;
  port: number;
  localUrl: string;
  lanUrls: string[];
  clientDistPath: string;
  stop: () => Promise<void>;
}

const defaultState = (): ServerState => ({
  lastCommand: null,
  lastCommandAt: null,
  lastError: null,
  lastKeyAction: null,
  lastAppleScript: null,
  lastShortcutTest: {
    shortcutLabel: null,
    key: null,
    modifiers: [],
    keyAction: null,
    appleScript: null,
    lastError: null,
    sentAt: null,
    success: null,
  },
});

const normalizePin = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const validModifierKeys: ModifierKey[] = ['command', 'shift', 'control', 'option'];
const validBaseKeys: BaseKey[] = [
  'backslash',
  'digit0',
  'a',
  'd',
  'e',
  'k',
  'l',
  'q',
  'r',
  't',
  'w',
  'z',
  'leftArrow',
  'rightArrow',
  'upArrow',
  'downArrow',
  'return',
  'keypadEnter',
  'numpad3',
  'space',
  'period',
  'leftBracket',
  'rightBracket',
  'equals',
  'apostrophe',
];

const formatShortcutLabel = (key: BaseKey, modifiers: ModifierKey[]): string => {
  const keyLabels: Record<BaseKey, string> = {
    backslash: '\\',
    digit0: '0',
    a: 'A',
    d: 'D',
    e: 'E',
    k: 'K',
    l: 'L',
    q: 'Q',
    r: 'R',
    t: 'T',
    w: 'W',
    z: 'Z',
    leftArrow: 'Left Arrow',
    rightArrow: 'Right Arrow',
    upArrow: 'Up Arrow',
    downArrow: 'Down Arrow',
    return: 'Return',
    keypadEnter: 'Keypad Enter',
    numpad3: 'Numeric Keypad 3',
    space: 'Space',
    period: 'Period',
    leftBracket: '[',
    rightBracket: ']',
    equals: '=',
    apostrophe: "'",
  };

  const modifierLabels: Record<ModifierKey, string> = {
    command: 'Command',
    shift: 'Shift',
    control: 'Control',
    option: 'Option',
  };

  return [...modifiers.map((modifier) => modifierLabels[modifier]), keyLabels[key]].join(' ');
};

const parseShortcutRequest = (
  input: unknown,
): {
  error: string | null;
  parsedShortcut: { key: BaseKey; modifiers: ModifierKey[] } | null;
  shortcut: ShortcutSpec | null;
} => {
  if (typeof input !== 'object' || input === null) {
    return {
      error: 'Request body must be a JSON object',
      parsedShortcut: null,
      shortcut: null,
    };
  }

  const candidate = input as { key?: unknown; modifiers?: unknown };

  if (typeof candidate.key !== 'string') {
    return {
      error: 'Expected "key" to be a string',
      parsedShortcut: null,
      shortcut: null,
    };
  }

  if (!Array.isArray(candidate.modifiers)) {
    return {
      error: 'Expected "modifiers" to be an array of strings',
      parsedShortcut: null,
      shortcut: null,
    };
  }

  const key = candidate.key as BaseKey;

  if (!validBaseKeys.includes(key)) {
    return {
      error: `Unsupported key: ${candidate.key}`,
      parsedShortcut: null,
      shortcut: null,
    };
  }

  for (const modifier of candidate.modifiers) {
    if (typeof modifier !== 'string' || !validModifierKeys.includes(modifier as ModifierKey)) {
      return {
        error: `Unsupported modifier: ${String(modifier)}`,
        parsedShortcut: null,
        shortcut: null,
      };
    }
  }

  const modifiers = candidate.modifiers as ModifierKey[];

  return {
    error: null,
    parsedShortcut: { key, modifiers },
    shortcut: {
      id: 'shortcutTest',
      keys: [...modifiers, key],
    },
  };
};

const buildTestShortcutResponse = (details: {
  ok: boolean;
  key?: BaseKey;
  modifiers?: ModifierKey[];
  keyAction?: string | null;
  generatedAppleScript?: string | null;
  error?: string;
  stage?: string;
  stack?: string;
  requestBody: unknown;
  parsedShortcut: { key: BaseKey; modifiers: ModifierKey[] } | null;
}) => {
  const debug: TestShortcutDebug = {
    requestBody: details.requestBody,
    parsedShortcut: details.parsedShortcut,
    generatedAppleScript: details.generatedAppleScript ?? null,
  };

  return {
    ok: details.ok,
    shortcut:
      details.key && details.modifiers
        ? {
            key: details.key,
            modifiers: details.modifiers,
          }
        : undefined,
    keyAction: details.keyAction ?? null,
    generatedAppleScript: details.generatedAppleScript ?? null,
    testMode: config.testMode,
    error: details.error,
    stage: details.stage,
    stack: details.stack,
    debug,
  };
};

const serializeError = (error: unknown): { message: string; stack?: string; fullError: unknown } => {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      fullError: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    };
  }

  return {
    message: String(error),
    stack: undefined,
    fullError: error,
  };
};

const resolveClientDistPath = (overridePath?: string): string => {
  if (overridePath) {
    return overridePath;
  }

  const distPathCandidates = [
    path.resolve(__dirname, '../dist'),
    path.resolve(__dirname, '../../dist'),
  ];

  return distPathCandidates.find((candidate) => fs.existsSync(candidate)) ?? distPathCandidates[0];
};

const isEntrypoint = (): boolean => {
  const entryPath = process.argv[1];

  if (!entryPath) {
    return false;
  }

  return path.resolve(entryPath) === fileURLToPath(import.meta.url);
};

const FOCUSED_TRACK_NOT_SELECTED_ERROR =
  'Focused track is not selected yet. Select a track in LUNA or wait for MCU select feedback.';
const FOCUSED_TRACK_NAME_PENDING_WARNING =
  'Focused track name is pending, using selected strip index.';

const normalizeMidiPortName = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

const withoutIacDriverPrefix = (name: string): string => {
  return name.replace(/^iac driver\s+/, '');
};

const midiPortNameMatches = (candidateName: string | null | undefined, expectedName: string): boolean => {
  if (!candidateName) {
    return false;
  }

  const normalizedCandidateName = normalizeMidiPortName(candidateName);
  const normalizedExpectedName = normalizeMidiPortName(expectedName);
  const candidateNames = [
    normalizedCandidateName,
    withoutIacDriverPrefix(normalizedCandidateName),
  ];

  return candidateNames.some((name) => name === normalizedExpectedName || name.includes(normalizedExpectedName));
};

const hasPortNamed = (ports: McuPortState[], expectedName: string): boolean => {
  return ports.some((port) => midiPortNameMatches(port.name, expectedName));
};

const isExpectedPortSelected = (selectedName: string | null, expectedName: string): boolean => {
  return midiPortNameMatches(selectedName, expectedName);
};

const buildSetupWarnings = (snapshot: V2RemoteState, diagnostics: McuDiagnosticsState): string[] => {
  const warnings: string[] = [];
  const expectedInputFound =
    hasPortNamed(snapshot.mcu.inputPorts, config.expectedIacInputName) ||
    isExpectedPortSelected(snapshot.mcu.selectedInputName, config.expectedIacInputName);
  const expectedOutputFound =
    hasPortNamed(snapshot.mcu.outputPorts, config.expectedIacOutputName) ||
    isExpectedPortSelected(snapshot.mcu.selectedOutputName, config.expectedIacOutputName);
  const midiConnected = Boolean(snapshot.mcu.selectedInputId && snapshot.mcu.selectedOutputId);
  const mcuReceiving = Boolean(
    snapshot.mcu.lastMessageAt ||
      (snapshot.transport.source === 'mcu' && snapshot.transport.updatedAt),
  );
  const focusedTrackSelected = snapshot.focusedTrack.source === 'mcu' && snapshot.focusedTrack.index !== null;
  const focusedTrackNamed = snapshot.focusedTrack.source === 'mcu' && snapshot.focusedTrack.name !== null;
  const focusedTrackHydrated = focusedTrackSelected && focusedTrackNamed;

  if (config.midiMode === 'iac') {
    if (!expectedInputFound || !expectedOutputFound) {
      warnings.push(
        `Required IAC ports were not found. Create IAC buses named "${config.expectedIacOutputName}" and "${config.expectedIacInputName}" in Audio MIDI Setup.`,
      );
      return warnings;
    }

    if (
      expectedInputFound &&
      snapshot.mcu.selectedInputName &&
      !isExpectedPortSelected(snapshot.mcu.selectedInputName, config.expectedIacInputName)
    ) {
      warnings.push(`Select "${config.expectedIacInputName}" as this app's MCU input port.`);
    }

    if (
      expectedOutputFound &&
      snapshot.mcu.selectedOutputName &&
      !isExpectedPortSelected(snapshot.mcu.selectedOutputName, config.expectedIacOutputName)
    ) {
      warnings.push(`Select "${config.expectedIacOutputName}" as this app's MCU output port.`);
    }
  } else {
    warnings.push('Virtual MIDI is a fallback/developer mode and may create new macOS endpoint identities after app restarts.');
  }

  if (!midiConnected) {
    warnings.push('MIDI ports are not connected yet.');
  } else if (!mcuReceiving) {
    warnings.push('Waiting for MCU feedback from LUNA. Press Play/Stop or select a track in LUNA.');
  } else if (!focusedTrackSelected) {
    if (!diagnostics.lastLcdFeedbackAt && !diagnostics.lastSelectFeedbackAt) {
      warnings.push('MCU feedback is arriving, but no LCD/select focused-track feedback has been received since server start.');
    } else {
      warnings.push('Select a track in LUNA to enable focused-track controls.');
    }
  } else if (!focusedTrackNamed) {
    warnings.push('Track name pending from LUNA. Focused-track controls are available.');
  }

  return warnings;
};

const buildMidiTestMessage = (currentState: RemoteState): string => {
  const diagnostics = currentState.mcuDiagnostics;

  if (!currentState.midiConnected) {
    return 'Test Connection checked current state: MIDI input/output ports are not connected yet.';
  }

  if (!currentState.mcuReceiving) {
    return 'Test Connection checked current state: MIDI ports are connected, but no MCU feedback has arrived yet. Press Play/Stop or select a track in LUNA.';
  }

  if (currentState.focusedTrackHydrated) {
    return 'Test Connection checked current state: MIDI feedback is arriving and focused track is hydrated.';
  }

  if (currentState.focusedTrackReady && !currentState.focusedTrackNamed) {
    return 'Test Connection checked current state: focused track is selected and controls are ready. Track name is pending from LUNA.';
  }

  if (!diagnostics.lastLcdFeedbackAt && !diagnostics.lastSelectFeedbackAt) {
    return 'Test Connection checked current state: MCU feedback is arriving, but no LCD/select focused-track feedback has been received since server start.';
  }

  if (diagnostics.lastSelectFeedbackAt && !diagnostics.lastLcdFeedbackAt) {
    return 'Test Connection checked current state: MCU select feedback has arrived, but no LCD track-name feedback has been received since server start.';
  }

  if (diagnostics.lastLcdFeedbackAt && !diagnostics.lastSelectFeedbackAt) {
    return 'Test Connection checked current state: MCU LCD track-name feedback has arrived, but no selected-strip feedback has been received since server start.';
  }

  return 'Test Connection checked current state: MCU focused-track feedback has arrived, but the focused track is not fully hydrated yet.';
};

const openAudioMidiSetup = (): void => {
  const child = spawn('open', ['-a', 'Audio MIDI Setup'], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
};

export const startRemoteServer = async (options: RemoteServerOptions = {}): Promise<RemoteServerInstance> => {
  const logger = options.logger ?? console;
  const host = options.host ?? config.host;
  const port = options.port ?? config.port;
  const state = defaultState();
  const app = express();
  const configuredMcuInputName = config.mcuInputName || (config.midiMode === 'iac' ? config.expectedIacInputName : '');
  const configuredMcuOutputName = config.mcuOutputName || (config.midiMode === 'iac' ? config.expectedIacOutputName : '');
  const mcuService = new McuService({
    enabled: config.enableMcu && config.enableMidi,
    midiMode: config.midiMode,
    enableVirtualMidi: config.midiMode === 'virtual' && config.enableVirtualMidi,
    debugMidiMessages: config.debugMcuMidi,
    selectedInputId: config.mcuInputId,
    selectedInputName: configuredMcuInputName,
    selectedOutputId: config.mcuOutputId,
    selectedOutputName: configuredMcuOutputName,
    virtualInputName: config.mcuVirtualInputName,
    virtualOutputName: config.mcuVirtualOutputName,
    logger,
  });

  const clientDistPath = resolveClientDistPath(options.clientDistPath);
  const clientIndexPath = path.join(clientDistPath, 'index.html');
  const clientDistExists = fs.existsSync(clientDistPath);
  const clientIndexExists = fs.existsSync(clientIndexPath);

  await mcuService.start();

  const logStageError = (stage: string, error: unknown) => {
    const serialized = serializeError(error);
    logger.error(`TEST SHORTCUT ERROR stage=${stage}`);
    logger.error(serialized.fullError);

    if (serialized.stack) {
      logger.error(serialized.stack);
    }

    return serialized;
  };

  const logCommandEvent = (details: {
    commandId: string;
    keyAction: string | null;
    script: string | null;
    success: boolean;
    error?: string | null;
  }) => {
    const timestamp = new Date().toISOString();
    logger.log(`[${timestamp}] command=${details.commandId}`);
    logger.log(`  keyAction=${details.keyAction ?? 'unresolved'}`);
    logger.log(`  success=${details.success ? 'yes' : 'no'}`);
    logger.log(`  script=${details.script ?? 'n/a'}`);

    if (details.error) {
      logger.log(`  error=${details.error}`);
    }
  };

  const getState = async (): Promise<RemoteState> => {
    let lunaDetected = false;
    const mcuSnapshot = mcuService.getSnapshot();
    const mcuDiagnostics = mcuService.getDiagnostics();
    const expectedIacInputFound =
      hasPortNamed(mcuSnapshot.mcu.inputPorts, config.expectedIacInputName) ||
      isExpectedPortSelected(mcuSnapshot.mcu.selectedInputName, config.expectedIacInputName);
    const expectedIacOutputFound =
      hasPortNamed(mcuSnapshot.mcu.outputPorts, config.expectedIacOutputName) ||
      isExpectedPortSelected(mcuSnapshot.mcu.selectedOutputName, config.expectedIacOutputName);
    const midiConnected = Boolean(mcuSnapshot.mcu.selectedInputId && mcuSnapshot.mcu.selectedOutputId);
    const mcuReceiving = Boolean(
      mcuSnapshot.mcu.lastMessageAt ||
        (mcuSnapshot.transport.source === 'mcu' && mcuSnapshot.transport.updatedAt),
    );
    const focusedTrackSelected =
      mcuSnapshot.focusedTrack.source === 'mcu' &&
      mcuSnapshot.focusedTrack.index !== null;
    const focusedTrackNamed =
      mcuSnapshot.focusedTrack.source === 'mcu' &&
      mcuSnapshot.focusedTrack.name !== null;
    const focusedTrackHydrated = focusedTrackSelected && focusedTrackNamed;

    try {
      lunaDetected = await isLunaRunning(config.lunaAppName);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to detect LUNA';
      state.lastError = message;
    }

    return {
      ok: true,
      testMode: config.testMode,
      lunaAppName: config.lunaAppName,
      lunaDetected,
      midiMode: config.midiMode,
      expectedIacInputName: config.expectedIacInputName,
      expectedIacOutputName: config.expectedIacOutputName,
      expectedIacInputFound,
      expectedIacOutputFound,
      midiConnected,
      mcuReceiving,
      focusedTrackSelected,
      focusedTrackNamed,
      focusedTrackHydrated,
      focusedTrackReady: focusedTrackSelected,
      mcuDiagnostics,
      setupWarnings: buildSetupWarnings(mcuSnapshot, mcuDiagnostics),
      lastCommand: state.lastCommand,
      lastCommandAt: state.lastCommandAt,
      lastError: state.lastError,
      serverTime: new Date().toISOString(),
      pinRequired: config.appPin.length > 0,
      transport: mcuSnapshot.transport,
      focusedTrack: mcuSnapshot.focusedTrack,
      mcu: mcuSnapshot.mcu,
      debug: {
        lastCommandId: state.lastCommand,
        lastKeyAction: state.lastKeyAction,
        lastAppleScript: state.lastAppleScript,
        lastError: state.lastError,
        lastShortcutTest: state.lastShortcutTest,
      },
    };
  };

  app.use(express.json());

  app.get('/api/state', async (_request, response) => {
    response.json(await getState());
  });

  app.get('/api/commands', (_request, response) => {
    response.json({ ok: true, commands: commandRegistry });
  });

  app.post('/api/open-audio-midi-setup', async (_request, response) => {
    try {
      openAudioMidiSetup();
      response.json({ ok: true, state: await getState() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open Audio MIDI Setup';
      state.lastError = message;
      response.status(500).json({ ok: false, error: message, state: await getState() });
    }
  });

  app.post('/api/midi/refresh', async (_request, response) => {
    try {
      await mcuService.stop();
      await mcuService.start();
      response.json({ ok: true, state: await getState() });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to refresh MIDI ports';
      state.lastError = message;
      response.status(500).json({ ok: false, error: message, state: await getState() });
    }
  });

  app.post('/api/midi/test', async (_request, response) => {
    const currentState = await getState();
    const ok = currentState.midiConnected && currentState.mcuReceiving;

    response.status(ok ? 200 : 409).json({
      ok,
      message: buildMidiTestMessage(currentState),
      state: currentState,
    });
  });

  app.post('/api/command', async (request, response) => {
    const commandId = request.body?.command as CommandId | undefined;
    const command = commandId ? commandMap.get(commandId) : undefined;

    if (!command) {
      response.status(400).json({ ok: false, error: 'Unknown command' });
      return;
    }

    if (config.appPin && normalizePin(request.body?.pin) !== config.appPin) {
      response.status(401).json({ ok: false, error: 'PIN required or incorrect' });
      return;
    }

    try {
      logger.log(`[${new Date().toISOString()}] POST /api/command command=${command.id}`);
      const mcuSnapshotBeforeCommand = mcuService.getSnapshot();

      if (command.placeholder) {
        state.lastError = command.note ?? `${command.label} shortcut needs confirmation`;
        state.lastKeyAction = null;
        state.lastAppleScript = null;
        logCommandEvent({
          commandId: command.id,
          keyAction: null,
          script: null,
          success: false,
          error: state.lastError,
        });
        response.status(501).json({ ok: false, error: state.lastError });
        return;
      }

      const lunaDetected = await isLunaRunning(config.lunaAppName);

      if (!lunaDetected) {
        state.lastError = 'LUNA is not running';
        state.lastKeyAction = null;
        state.lastAppleScript = null;
        logCommandEvent({
          commandId: command.id,
          keyAction: null,
          script: null,
          success: false,
          error: state.lastError,
        });
        response.status(409).json({ ok: false, error: state.lastError });
        return;
      }

      const description = command.mcuControl
        ? `${command.id} -> MCU focused ${command.mcuControl}`
        : `${command.id} -> ${command.keys.join('+')}`;
      let keyAction: string | null = command.mcuControl
        ? `MCU focused ${command.mcuControl}`
        : buildKeyAction(command);
      const script = command.mcuControl ? null : buildAppleScript(config.lunaAppName, command);
      state.lastKeyAction = keyAction;
      state.lastAppleScript = script;
      let responseWarning: string | undefined;

      if (command.mcuControl) {
        const currentRemoteState = await getState();

        if (!currentRemoteState.focusedTrackReady) {
          state.lastError = FOCUSED_TRACK_NOT_SELECTED_ERROR;
          logCommandEvent({
            commandId: command.id,
            keyAction,
            script,
            success: false,
            error: state.lastError,
          });
          response.status(409).json({ ok: false, error: state.lastError, state: await getState() });
          return;
        }

        if (!currentRemoteState.focusedTrackNamed) {
          responseWarning = FOCUSED_TRACK_NAME_PENDING_WARNING;
        }

        if (config.testMode || !config.enableMcu || !config.enableMidi) {
          logger.log(`[TEST MODE] ${description}`);
          logCommandEvent({
            commandId: command.id,
            keyAction,
            script,
            success: true,
          });
        } else {
          const result = await mcuService.sendFocusedTrackControl(command.mcuControl);
          keyAction = `MCU strip ${result.stripIndex + 1} ${result.role}: ${result.pressMessage.join(' ')} / ${result.releaseMessage.join(' ')}`;
          state.lastKeyAction = keyAction;
          logger.log(`[SENT] ${description}`);
          logCommandEvent({
            commandId: command.id,
            keyAction,
            script,
            success: true,
          });
        }
      } else if (config.testMode || !config.enableKeystrokes) {
        logger.log(`[TEST MODE] ${description}`);
        logCommandEvent({
          commandId: command.id,
          keyAction,
          script,
          success: true,
        });
      } else {
        await triggerLunaCommand(config.lunaAppName, command);
        logger.log(`[SENT] ${description}`);
        logCommandEvent({
          commandId: command.id,
          keyAction,
          script,
          success: true,
        });
      }

      state.lastCommand = command.id;
      state.lastCommandAt = new Date().toISOString();
      state.lastError = null;

      if (!command.mcuControl) {
        mcuService.preserveSnapshot(mcuSnapshotBeforeCommand);
      }

      response.json({
        ok: true,
        command: command.id,
        warning: responseWarning,
        state: await getState(),
      });
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : 'Failed to send command';
      logCommandEvent({
        commandId: command.id,
        keyAction: state.lastKeyAction,
        script: state.lastAppleScript,
        success: false,
        error: state.lastError,
      });
      response.status(500).json({ ok: false, error: state.lastError });
    }
  });

  app.post('/api/test-shortcut', async (request, response) => {
    const requestBody = request.body ?? {};
    logger.log('TEST SHORTCUT REQUEST');
    logger.log(`[${new Date().toISOString()}] POST /api/test-shortcut body=${JSON.stringify(requestBody)}`);

    let parsedShortcut: { key: BaseKey; modifiers: ModifierKey[] } | null = null;
    let shortcut: ShortcutSpec | null = null;
    let key: BaseKey | undefined;
    let modifiers: ModifierKey[] | undefined;
    let shortcutLabel: string | null = null;
    let keyAction: string | null = null;
    let script: string | null = null;

    try {
      const parsedRequest = parseShortcutRequest(requestBody);
      parsedShortcut = parsedRequest.parsedShortcut;
      shortcut = parsedRequest.shortcut;
      logger.log(
        `[${new Date().toISOString()}] /api/test-shortcut parsed=${JSON.stringify(parsedShortcut)}`,
      );

      if (parsedRequest.error || !parsedShortcut || !shortcut) {
        response.status(400).json(
          buildTestShortcutResponse({
            ok: false,
            stage: 'request-parsing',
            error: parsedRequest.error ?? 'Invalid shortcut selection',
            requestBody,
            parsedShortcut,
          }),
        );
        return;
      }
    } catch (error) {
      const serialized = logStageError('request-parsing', error);
      response.status(500).json(
        buildTestShortcutResponse({
          ok: false,
          stage: 'request-parsing',
          error: serialized.message,
          stack: serialized.stack,
          requestBody,
          parsedShortcut,
        }),
      );
      return;
    }

    try {
      key = parsedShortcut.key;
      if (!validBaseKeys.includes(key)) {
        response.status(400).json(
          buildTestShortcutResponse({
            ok: false,
            stage: 'key-validation',
            error: `Unsupported key: ${key}`,
            requestBody,
            parsedShortcut,
          }),
        );
        return;
      }
    } catch (error) {
      const serialized = logStageError('key-validation', error);
      response.status(500).json(
        buildTestShortcutResponse({
          ok: false,
          key,
          modifiers,
          stage: 'key-validation',
          error: serialized.message,
          stack: serialized.stack,
          requestBody,
          parsedShortcut,
        }),
      );
      return;
    }

    try {
      modifiers = parsedShortcut.modifiers;
      const invalidModifier = modifiers.find((modifier) => !validModifierKeys.includes(modifier));

      if (invalidModifier) {
        response.status(400).json(
          buildTestShortcutResponse({
            ok: false,
            key,
            modifiers,
            stage: 'modifier-validation',
            error: `Unsupported modifier: ${invalidModifier}`,
            requestBody,
            parsedShortcut,
          }),
        );
        return;
      }
    } catch (error) {
      const serialized = logStageError('modifier-validation', error);
      response.status(500).json(
        buildTestShortcutResponse({
          ok: false,
          key,
          modifiers,
          stage: 'modifier-validation',
          error: serialized.message,
          stack: serialized.stack,
          requestBody,
          parsedShortcut,
        }),
      );
      return;
    }

    try {
      shortcutLabel = formatShortcutLabel(key!, modifiers!);
      logger.log('TEST SHORTCUT NORMALIZED');
      logger.log(`[${new Date().toISOString()}] POST /api/test-shortcut shortcut=${shortcutLabel}`);
    } catch (error) {
      const serialized = logStageError('shortcut-normalization', error);
      response.status(500).json(
        buildTestShortcutResponse({
          ok: false,
          key,
          modifiers,
          stage: 'shortcut-normalization',
          error: serialized.message,
          stack: serialized.stack,
          requestBody,
          parsedShortcut,
        }),
      );
      return;
    }

    try {
      keyAction = buildKeyAction(shortcut!);
    } catch (error) {
      const serialized = logStageError('key-action-generation', error);
      response.status(500).json(
        buildTestShortcutResponse({
          ok: false,
          key,
          modifiers,
          keyAction,
          stage: 'key-action-generation',
          error: serialized.message,
          stack: serialized.stack,
          requestBody,
          parsedShortcut,
        }),
      );
      return;
    }

    try {
      script = buildAppleScript(config.lunaAppName, shortcut!);
      logger.log('TEST SHORTCUT APPLESCRIPT GENERATED');
      logger.log(`[${new Date().toISOString()}] /api/test-shortcut script=${JSON.stringify(script)}`);
    } catch (error) {
      const serialized = logStageError('applescript-generation', error);
      response.status(500).json(
        buildTestShortcutResponse({
          ok: false,
          key,
          modifiers,
          keyAction,
          generatedAppleScript: script,
          stage: 'applescript-generation',
          error: serialized.message,
          stack: serialized.stack,
          requestBody,
          parsedShortcut,
        }),
      );
      return;
    }

    try {
      const lunaDetected = await isLunaRunning(config.lunaAppName);

      if (!lunaDetected) {
        state.lastError = 'LUNA is not running';
        state.lastShortcutTest = {
          shortcutLabel,
          key: key!,
          modifiers: modifiers!,
          keyAction,
          appleScript: script,
          lastError: state.lastError,
          sentAt: new Date().toISOString(),
          success: false,
        };
        logCommandEvent({
          commandId: `test:${shortcutLabel}`,
          keyAction,
          script,
          success: false,
          error: state.lastError,
        });
        response.status(409).json(
          buildTestShortcutResponse({
            ok: false,
            key,
            modifiers,
            keyAction,
            generatedAppleScript: script,
            stage: 'applescript-execution',
            error: state.lastError,
            requestBody,
            parsedShortcut,
          }),
        );
        return;
      }

      state.lastShortcutTest = {
        shortcutLabel,
        key: key!,
        modifiers: modifiers!,
        keyAction,
        appleScript: script,
        lastError: null,
        sentAt: new Date().toISOString(),
        success: true,
      };

      if (config.testMode || !config.enableKeystrokes) {
        logCommandEvent({
          commandId: `test:${shortcutLabel}`,
          keyAction,
          script,
          success: true,
        });
      } else {
        await triggerShortcut(config.lunaAppName, shortcut!);
        logCommandEvent({
          commandId: `test:${shortcutLabel}`,
          keyAction,
          script,
          success: true,
        });
      }

      logger.log('TEST SHORTCUT EXECUTED');
      response.json(
        buildTestShortcutResponse({
          ok: true,
          key,
          modifiers,
          keyAction,
          generatedAppleScript: script,
          requestBody,
          parsedShortcut,
        }),
      );
    } catch (error) {
      const serialized = logStageError('applescript-execution', error);
      state.lastShortcutTest = {
        ...state.lastShortcutTest,
        shortcutLabel,
        key: key ?? null,
        modifiers: modifiers ?? [],
        keyAction,
        appleScript: script,
        lastError: serialized.message,
        sentAt: new Date().toISOString(),
        success: false,
      };
      logCommandEvent({
        commandId: `test:${shortcutLabel ?? 'unknown'}`,
        keyAction,
        script,
        success: false,
        error: serialized.message,
      });
      response.status(500).json(
        buildTestShortcutResponse({
          ok: false,
          key,
          modifiers,
          keyAction,
          generatedAppleScript: script,
          stage: 'applescript-execution',
          error: serialized.message,
          stack: serialized.stack,
          requestBody,
          parsedShortcut,
        }),
      );
    }
  });

  app.use((request, response, next) => {
    if (!clientDistExists) {
      response.status(503).json({
        ok: false,
        error: `Frontend build directory not found at ${clientDistPath}. Run "npm run build" to generate dist/.`,
      });
      return;
    }

    next();
  });

  app.use(express.static(clientDistPath));
  app.get('*', (_request, response) => {
    if (!clientIndexExists) {
      response
        .status(503)
        .type('html')
        .send(
          [
            '<!doctype html>',
            '<html lang="en">',
            '<head><meta charset="utf-8"><title>Luna Studio Remote</title></head>',
            '<body>',
            '<h1>Frontend build missing</h1>',
            `<p>Resolved dist path: ${clientDistPath}</p>`,
            `<p>index.html exists: ${clientIndexExists ? 'true' : 'false'}</p>`,
            '<p>Run <code>npm run build</code> to generate the frontend bundle.</p>',
            '</body>',
            '</html>',
          ].join(''),
        );
      return;
    }

    response.sendFile(clientIndexPath);
  });

  let server: HttpServer;

  try {
    server = await new Promise<HttpServer>((resolve, reject) => {
      const nextServer = app.listen(port, host, () => resolve(nextServer));
      nextServer.once('error', reject);
    });
  } catch (error) {
    await mcuService.stop();
    throw error;
  }

  const localUrl = `http://127.0.0.1:${port}`;
  const lanUrls = getLanUrls(port);

  logger.log('');
  logger.log('Luna Studio Remote');
  logger.log(`App name: Luna Studio Remote`);
  logger.log(`Local URL: ${localUrl}`);
  logger.log(`LAN URLs: ${lanUrls.length ? lanUrls.join(', ') : 'No LAN address detected'}`);
  logger.log(`Resolved dist path: ${clientDistPath} Exists: ${clientDistExists && clientIndexExists ? 'true' : 'false'}`);
  logger.log(`Test mode: ${config.testMode ? 'enabled' : 'disabled'}`);
  logger.log(`Keystrokes enabled: ${config.enableKeystrokes ? 'yes' : 'no'}`);
  logger.log(`MCU enabled: ${config.enableMcu ? 'yes' : 'no'}`);
  logger.log(`MIDI enabled: ${config.enableMidi ? 'yes' : 'no'}`);
  logger.log(`MIDI mode: ${config.midiMode}`);
  logger.log(`Expected IAC input: ${config.expectedIacInputName}`);
  logger.log(`Expected IAC output: ${config.expectedIacOutputName}`);
  logger.log(`Virtual MIDI enabled: ${config.enableVirtualMidi ? 'yes' : 'no'}`);
  logger.log(`Virtual MCU input: ${config.mcuVirtualInputName}`);
  logger.log(`Virtual MCU output: ${config.mcuVirtualOutputName}`);
  logger.log(`MCU raw MIDI logging: ${config.debugMcuMidi ? 'yes' : 'no'}`);
  logger.log(`LUNA app name: ${config.lunaAppName}`);
  logger.log(`PIN: ${config.appPin ? 'enabled' : 'disabled'}`);
  logger.log(`Bound host: ${host}`);
  logger.log('');

  return {
    app,
    host,
    port,
    localUrl,
    lanUrls,
    clientDistPath,
    stop: async () => {
      await mcuService.stop();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
};

if (isEntrypoint()) {
  void startRemoteServer().catch((error) => {
    console.error('Failed to start Luna Studio Remote');
    console.error(error);
    process.exitCode = 1;
  });
}
