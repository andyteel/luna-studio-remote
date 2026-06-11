import type { BaseKey, CommandDefinition, CommandId, ModifierKey } from '../shared/commands';
import type { McuDiagnosticsState, MidiMode, V2RemoteState } from '../shared/v2-state';

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

export interface RemoteState extends V2RemoteState {
  ok: true;
  testMode: boolean;
  lunaAppName: string;
  lunaDetected: boolean;
  midiMode: MidiMode;
  expectedIacInputName: string;
  expectedIacOutputName: string;
  expectedIacInputFound: boolean;
  expectedIacOutputFound: boolean;
  midiConnected: boolean;
  mcuReceiving: boolean;
  focusedTrackSelected: boolean;
  focusedTrackNamed: boolean;
  focusedTrackHydrated: boolean;
  focusedTrackReady: boolean;
  mcuDiagnostics: McuDiagnosticsState;
  setupWarnings: string[];
  lastCommand: CommandId | null;
  lastCommandAt: string | null;
  lastError: string | null;
  serverTime: string;
  pinRequired: boolean;
  debug?: RemoteDebugState;
}

export interface StateResponse extends RemoteState {}

export interface CommandResponse {
  ok: boolean;
  command?: CommandId;
  state?: RemoteState;
  warning?: string;
  error?: string;
}

export interface CommandsResponse {
  ok: true;
  commands: CommandDefinition[];
}

export interface TestShortcutResponse {
  ok: boolean;
  shortcut?: {
    key: BaseKey;
    modifiers: ModifierKey[];
  };
  keyAction?: string | null;
  generatedAppleScript?: string | null;
  testMode?: boolean;
  error?: string;
  debug: TestShortcutDebug;
}
