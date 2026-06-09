import express from 'express';
import fs from 'node:fs';
import type { Server as HttpServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { commandMap, commandRegistry, type BaseKey, type CommandId, type ModifierKey } from '../shared/commands.js';
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
  'digit0',
  'a',
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
    digit0: '0',
    a: 'A',
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

export const startRemoteServer = async (options: RemoteServerOptions = {}): Promise<RemoteServerInstance> => {
  const logger = options.logger ?? console;
  const host = options.host ?? config.host;
  const port = options.port ?? config.port;
  const state = defaultState();
  const app = express();
  const mcuService = new McuService({ logger });

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

      const description = `${command.id} -> ${command.keys.join('+')}`;
      const keyAction = buildKeyAction(command);
      const script = buildAppleScript(config.lunaAppName, command);
      state.lastKeyAction = keyAction;
      state.lastAppleScript = script;

      if (config.testMode || !config.enableKeystrokes) {
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

      response.json({
        ok: true,
        command: command.id,
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

  const server = await new Promise<HttpServer>((resolve, reject) => {
    const nextServer = app.listen(port, host, () => resolve(nextServer));
    nextServer.once('error', reject);
  });

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
