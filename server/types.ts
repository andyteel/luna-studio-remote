import type { BaseKey, CommandId, ModifierKey } from '../shared/commands.js';

export interface ShortcutTestState {
  shortcutLabel: string | null;
  key: BaseKey | null;
  modifiers: ModifierKey[];
  keyAction: string | null;
  appleScript: string | null;
  lastError: string | null;
  sentAt: string | null;
  success?: boolean | null;
}

export interface TestShortcutDebug {
  requestBody: unknown;
  parsedShortcut: {
    key: BaseKey;
    modifiers: ModifierKey[];
  } | null;
  generatedAppleScript: string | null;
}

export interface RemoteDebugState {
  lastCommandId: CommandId | null;
  lastKeyAction: string | null;
  lastAppleScript: string | null;
  lastError: string | null;
  lastShortcutTest: ShortcutTestState;
}

export interface RemoteState {
  ok: true;
  testMode: boolean;
  lunaAppName: string;
  lunaDetected: boolean;
  lastCommand: CommandId | null;
  lastCommandAt: string | null;
  lastError: string | null;
  serverTime: string;
  pinRequired: boolean;
  debug?: RemoteDebugState;
}
