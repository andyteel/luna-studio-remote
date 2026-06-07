import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { BaseKey, CommandId, ModifierKey } from '../shared/commands.js';

const execFileAsync = promisify(execFile);

const keyCodeMap = {
  space: 49,
  return: 36,
  keypadEnter: 76,
  numpad3: 85,
  period: 47,
  leftArrow: 123,
  rightArrow: 124,
  upArrow: 126,
  downArrow: 125,
  leftBracket: 33,
  rightBracket: 30,
  apostrophe: 39,
  equals: 24,
} as const;

const keystrokeMap = {
  digit0: '0',
  a: 'a',
  e: 'e',
  k: 'k',
  l: 'l',
  q: 'q',
  r: 'r',
  t: 't',
  w: 'w',
  z: 'z',
} as const;

const modifierMap: Record<ModifierKey, string> = {
  command: 'command down',
  shift: 'shift down',
  control: 'control down',
  option: 'option down',
};

const applescriptEscape = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const modifierKeys = ['command', 'shift', 'control', 'option'] as const;

export interface ShortcutSpec {
  id: string | CommandId;
  keys: Array<ModifierKey | BaseKey>;
}

export const buildKeyAction = (shortcut: ShortcutSpec): string => {
  if (shortcut.id === 'createMarker') {
    return 'key code 76, delay 0.10, key code 76';
  }

  const modifiers = shortcut.keys.filter((key): key is ModifierKey =>
    modifierKeys.includes(key as ModifierKey),
  );
  const baseKey = shortcut.keys.find((key) => !modifierKeys.includes(key as ModifierKey));

  if (!baseKey) {
    throw new Error(`No base key configured for ${shortcut.id}`);
  }

  const modifierClause =
    modifiers.length === 0
      ? ''
      : modifiers.length === 1
        ? ` using ${modifierMap[modifiers[0]]}`
        : ` using {${modifiers.map((modifier) => modifierMap[modifier]).join(', ')}}`;

  if (baseKey in keyCodeMap) {
    return `key code ${keyCodeMap[baseKey as keyof typeof keyCodeMap]}${modifierClause}`;
  }

  if (baseKey in keystrokeMap) {
    return `keystroke "${keystrokeMap[baseKey as keyof typeof keystrokeMap]}"${modifierClause}`;
  }

  throw new Error(`Unsupported base key "${String(baseKey)}" for ${shortcut.id}`);
};

export const buildAppleScript = (appName: string, shortcut: ShortcutSpec): string => {
  if (shortcut.id === 'createMarker') {
    return [
      `tell application "${applescriptEscape(appName)}" to activate`,
      'delay 0.05',
      'tell application "System Events"',
      '  key code 76',
      '  delay 0.10',
      '  key code 76',
      'end tell',
    ].join('\n');
  }

  const action = buildKeyAction(shortcut);
  return [
    `tell application "${applescriptEscape(appName)}" to activate`,
    'delay 0.05',
    'tell application "System Events"',
    `  ${action}`,
    'end tell',
  ].join('\n');
};

export const isLunaRunning = async (appName: string): Promise<boolean> => {
  const script = `application "${applescriptEscape(appName)}" is running`;
  const { stdout } = await execFileAsync('osascript', ['-e', script]);
  return stdout.trim().toLowerCase() === 'true';
};

export const triggerLunaCommand = async (
  appName: string,
  command: ShortcutSpec,
): Promise<{ action: string; script: string }> => {
  const action = buildKeyAction(command);
  const script = buildAppleScript(appName, command);
  await execFileAsync('osascript', ['-e', script]);
  return { action, script };
};

export const triggerShortcut = async (
  appName: string,
  shortcut: ShortcutSpec,
): Promise<{ action: string; script: string }> => {
  const action = buildKeyAction(shortcut);
  const script = buildAppleScript(appName, shortcut);
  await execFileAsync('osascript', ['-e', script]);
  return { action, script };
};
