import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { commandRegistry, type BaseKey, type CommandDefinition, type CommandId, type ModifierKey } from '../shared/commands';
import type { CommandResponse, RemoteState, ShortcutTestState, TestShortcutResponse } from './types';
import playIcon from '../luna-image-resources/buttons/icon_transport_play.png';
import playIconOn from '../luna-image-resources/buttons/icon_transport_play_on.png';
import stopIcon from '../luna-image-resources/buttons/icon_transport_stop.png';
import stopIconOn from '../luna-image-resources/buttons/icon_transport_stop_on.png';
import pauseIcon from '../luna-image-resources/buttons/icon_transport_pause.png';
import pauseIconOn from '../luna-image-resources/buttons/icon_transport_pause_on.png';
import recordIcon from '../luna-image-resources/buttons/icon_transport_rec.png';
import recordIconOn from '../luna-image-resources/buttons/icon_transport_rec_on.png';
import loopIcon from '../luna-image-resources/buttons/icon_transport_loop.png';
import loopIconOn from '../luna-image-resources/buttons/icon_transport_loop_on.png';
import endIcon from '../luna-image-resources/buttons/icon_transport_end.png';
import endIconOn from '../luna-image-resources/buttons/icon_transport_end_on.png';
import startIcon from '../luna-image-resources/buttons/icon_transport_start.png';
import startIconOn from '../luna-image-resources/buttons/icon_transport_start_on.png';
import clickIcon from '../luna-image-resources/buttons/icon_click.png';
import clickIconOn from '../luna-image-resources/buttons/icon_click_on.png';
import countIn1Icon from '../luna-image-resources/buttons/icon_count_in_1.png';
import countIn1IconOn from '../luna-image-resources/buttons/icon_count_in_1_on.png';
import countIn2Icon from '../luna-image-resources/buttons/icon_count_in_2.png';
import countIn2IconOn from '../luna-image-resources/buttons/icon_count_in_2_on.png';
import countIn4Icon from '../luna-image-resources/buttons/icon_count_in_4.png';
import countIn4IconOn from '../luna-image-resources/buttons/icon_count_in_4_on.png';
import undoIcon from '../luna-image-resources/buttons/icon_undo_drk.png';
import redoIcon from '../luna-image-resources/buttons/icon_redo_drk.png';
import uaDiamondOn from '../luna-image-resources/buttons/ua_diamond_on.png';
import uaDiamondMouseover from '../luna-image-resources/buttons/ua_diamond_mouseover.png';

const statusPollMs = 3000;
type TabId = 'tracking' | 'navigate' | 'settings';
const showDebugTools = false;

const shortcutKeyOptions: Array<{ value: BaseKey; label: string }> = [
  { value: 'backslash', label: '\\' },
  { value: 'digit0', label: '0' },
  { value: 'a', label: 'A' },
  { value: 'd', label: 'D' },
  { value: 'e', label: 'E' },
  { value: 'k', label: 'K' },
  { value: 'l', label: 'L' },
  { value: 'q', label: 'Q' },
  { value: 'r', label: 'R' },
  { value: 't', label: 'T' },
  { value: 'w', label: 'W' },
  { value: 'z', label: 'Z' },
  { value: 'leftArrow', label: 'Left Arrow' },
  { value: 'rightArrow', label: 'Right Arrow' },
  { value: 'upArrow', label: 'Up Arrow' },
  { value: 'downArrow', label: 'Down Arrow' },
  { value: 'return', label: 'Return' },
  { value: 'keypadEnter', label: 'Keypad Enter' },
  { value: 'numpad3', label: 'Numeric Keypad 3' },
  { value: 'space', label: 'Space' },
  { value: 'period', label: 'Period' },
  { value: 'leftBracket', label: '[' },
  { value: 'rightBracket', label: ']' },
  { value: 'equals', label: '=' },
  { value: 'apostrophe', label: "'" },
];

const modifierOptions: ModifierKey[] = ['command', 'shift', 'control', 'option'];

const shortcutPresets: Array<{ label: string; key: BaseKey; modifiers: ModifierKey[] }> = [
  { label: 'E', key: 'e', modifiers: [] },
  { label: 'R', key: 'r', modifiers: [] },
  { label: 'T', key: 't', modifiers: [] },
  { label: 'Control 0', key: 'digit0', modifiers: ['control'] },
  { label: 'Command [', key: 'leftBracket', modifiers: ['command'] },
  { label: 'Command ]', key: 'rightBracket', modifiers: ['command'] },
  { label: 'Shift A', key: 'a', modifiers: ['shift'] },
  { label: 'Control Option L', key: 'l', modifiers: ['control', 'option'] },
  { label: "Control Option '", key: 'apostrophe', modifiers: ['control', 'option'] },
  { label: 'Return', key: 'return', modifiers: [] },
  { label: 'Keypad Enter', key: 'keypadEnter', modifiers: [] },
  { label: 'Numeric Keypad 3', key: 'numpad3', modifiers: [] },
];

const commandLookup = new Map(commandRegistry.map((command) => [command.id, command]));

const commandVisuals: Record<
  CommandId,
  { icon: string; label: string; tone?: 'record' | 'danger' | 'primary' | 'neutral'; helper?: string }
> = {
  record: { icon: 'record', label: 'Record', tone: 'record' },
  focusedTrackRecordArm: { icon: 'record', label: 'Focused Arm', tone: 'record' },
  focusedTrackSolo: { icon: 'view', label: 'Focused Solo' },
  focusedTrackMute: { icon: 'view', label: 'Focused Mute' },
  newTrackVersion: { icon: 'view', label: 'New Version' },
  duplicateTrack: { icon: 'view', label: 'Duplicate Track' },
  duplicateTrackWithoutContent: { icon: 'view', label: 'Duplicate No Content' },
  playStop: { icon: 'play', label: 'Play', tone: 'primary' },
  stop: { icon: 'stop', label: 'Stop / Pause' },
  returnToZero: { icon: 'rtz', label: 'RTZ' },
  goToEnd: { icon: 'gte', label: 'GTE' },
  loop: { icon: 'loop', label: 'Loop' },
  click: { icon: 'click', label: 'Click' },
  countIn: { icon: 'countIn', label: 'Count In' },
  undo: { icon: 'undo', label: 'Undo' },
  redo: { icon: 'redo', label: 'Redo' },
  abortRecording: { icon: 'warning', label: 'Discard Recording', tone: 'danger' },
  togglePrePostRoll: {
    icon: 'stop',
    label: 'Pre / Post Roll',
    tone: 'neutral',
  },
  togglePlayFromStopLocation: {
    icon: 'stop',
    label: 'Play From Stop',
    tone: 'neutral',
  },
  createMarker: { icon: 'marker', label: 'Add Marker' },
  previousBar: { icon: 'rew', label: 'Previous Bar' },
  nextBar: { icon: 'ffw', label: 'Next Bar' },
  previousMarker: { icon: 'markerLeft', label: 'Previous Marker' },
  nextMarker: { icon: 'markerRight', label: 'Next Marker' },
  zoomIn: { icon: 'zoomIn', label: 'Zoom In' },
  zoomOut: { icon: 'zoomOut', label: 'Zoom Out' },
  waveformZoomOut: { icon: 'waveMinus', label: 'Waveform Out' },
  waveformZoomIn: { icon: 'wavePlus', label: 'Waveform In' },
  frameSelection: { icon: 'frame', label: 'Frame' },
  autoScroll: { icon: 'auto', label: 'Auto Scroll' },
  scrollLeftSelection: { icon: 'scrollLeft', label: 'Scroll Left' },
  scrollRightSelection: { icon: 'scrollRight', label: 'Scroll Right' },
  toggleTimelineMixer: { icon: 'view', label: 'Timeline / Mixer' },
};

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

const resolveShortcutKeyAction = (key: BaseKey, modifiers: ModifierKey[]): string => {
  const modifierLabels: Record<ModifierKey, string> = {
    command: 'command down',
    shift: 'shift down',
    control: 'control down',
    option: 'option down',
  };

  const keyCodes: Partial<Record<BaseKey, number>> = {
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
    equals: 24,
    apostrophe: 39,
  };

  const keystrokes: Partial<Record<BaseKey, string>> = {
    backslash: '\\',
    digit0: '0',
    a: 'a',
    d: 'd',
    e: 'e',
    k: 'k',
    l: 'l',
    q: 'q',
    r: 'r',
    t: 't',
    w: 'w',
    z: 'z',
  };

  const modifierClause = modifiers.length
    ? ` using {${modifiers.map((modifier) => modifierLabels[modifier]).join(', ')}}`
    : '';

  if (key in keyCodes) {
    return `key code ${keyCodes[key] ?? 'pending'}${modifierClause}`;
  }

  if (key in keystrokes) {
    return `keystroke "${keystrokes[key] ?? ''}"${modifierClause}`;
  }

  return 'pending';
};

const formatTimestamp = (value: string | null): string => {
  if (!value) {
    return 'Waiting';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
};

const productionTrackingRows: Array<{ className: string; commands: CommandId[] }> = [
  { className: 'tracking-row-full', commands: ['record'] },
  { className: 'tracking-row-halves tracking-row-primary', commands: ['playStop', 'stop'] },
  { className: 'tracking-row-halves tracking-row-medium', commands: ['click', 'countIn'] },
  { className: 'tracking-row-thirds tracking-row-compact', commands: ['loop', 'undo', 'redo'] },
  { className: 'tracking-row-thirds tracking-row-compact', commands: ['goToEnd', 'nextBar', 'nextMarker'] },
  { className: 'tracking-row-thirds tracking-row-compact', commands: ['returnToZero', 'previousBar', 'previousMarker'] },
  {
    className: 'tracking-row-thirds tracking-row-compact',
    commands: ['createMarker', 'togglePlayFromStopLocation', 'togglePrePostRoll'],
  },
];
const navigateMarkerOrder: CommandId[] = ['createMarker', 'previousMarker', 'nextMarker'];
const navigateMovementOrder: CommandId[] = [
  'previousBar',
  'nextBar',
  'scrollLeftSelection',
  'scrollRightSelection',
  'frameSelection',
];
const navigateZoomOrder: CommandId[] = ['zoomOut', 'zoomIn', 'waveformZoomOut', 'waveformZoomIn'];
const navigateViewOrder: CommandId[] = ['toggleTimelineMixer', 'autoScroll'];
const momentaryTrackingCommands: CommandId[] = [
  'stop',
  'returnToZero',
  'goToEnd',
  'undo',
  'redo',
  'createMarker',
  'previousBar',
  'nextBar',
  'previousMarker',
  'nextMarker',
];
const trackingTransportGlyphCommands: CommandId[] = [
  'record',
  'playStop',
  'stop',
  'returnToZero',
  'goToEnd',
  'loop',
  'click',
  'countIn',
  'undo',
  'redo',
];

const renderSvgIcon = (icon: string): ReactNode => {
  switch (icon) {
    case 'click':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 10v22" />
          <path d="M24 10c6 0 9 6 9 12v10" />
          <path d="M24 10c-6 0-9 6-9 12v10" />
          <path d="M15 19h18" />
          <path d="M18 36h12" />
        </svg>
      );
    case 'countIn':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="10" y="12" width="28" height="24" rx="5" />
          <path d="M18 18v12" />
          <path d="M15 21h6" />
          <path d="M25 19c1.6-1.2 3.1-1.7 4.4-1.7 2.8 0 4.6 1.8 4.6 4.2 0 3.3-3.2 4.4-5.7 6.8h6.2" />
        </svg>
      );
    case 'undo':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M20 15H10l7-7" />
          <path d="M12 15h16c7.7 0 14 6.3 14 14s-6.3 14-14 14H17" />
        </svg>
      );
    case 'redo':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M28 15h10l-7-7" />
          <path d="M36 15H20c-7.7 0-14 6.3-14 14s6.3 14 14 14h11" />
        </svg>
      );
    case 'warning':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M24 8 42 40H6z" />
          <path d="M24 18v10" />
          <circle cx="24" cy="33" r="1.8" className="icon-fill" />
        </svg>
      );
    case 'marker':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M11 8v32" />
          <path d="M16 12h16l6 8-6 8H16z" />
          <path d="M24 16v8" />
          <path d="M20 20h8" />
        </svg>
      );
    case 'markerLeft':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M11 8v32" />
          <path d="m31 14-10 10 10 10" />
        </svg>
      );
    case 'markerRight':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M37 8v32" />
          <path d="m17 14 10 10-10 10" />
        </svg>
      );
    case 'rew':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M12 12v24" />
          <path d="m34 14-10 10 10 10" />
        </svg>
      );
    case 'ffw':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M36 12v24" />
          <path d="m14 14 10 10-10 10" />
        </svg>
      );
    case 'zoomIn':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="20" cy="20" r="9" />
          <path d="M27 27 36 36" />
          <path d="M20 16v8M16 20h8" />
        </svg>
      );
    case 'zoomOut':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="20" cy="20" r="9" />
          <path d="M27 27 36 36" />
          <path d="M16 20h8" />
        </svg>
      );
    case 'wavePlus':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M8 24c4-12 8 12 12 0s8-12 12 0 8 12 8 0" />
          <path d="M34 12v8M30 16h8" />
        </svg>
      );
    case 'waveMinus':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M8 24c4-12 8 12 12 0s8-12 12 0 8 12 8 0" />
          <path d="M30 16h8" />
        </svg>
      );
    case 'frame':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M12 18v-6h6" />
          <path d="M30 12h6v6" />
          <path d="M36 30v6h-6" />
          <path d="M18 36h-6v-6" />
          <rect x="17" y="17" width="14" height="14" rx="2" className="icon-subtle" />
        </svg>
      );
    case 'scrollLeft':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M11 10v28" className="icon-subtle" />
          <path d="m29 14-10 10 10 10" />
          <path d="M35 14v20" />
        </svg>
      );
    case 'scrollRight':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M37 10v28" className="icon-subtle" />
          <path d="m19 14 10 10-10 10" />
          <path d="M13 14v20" />
        </svg>
      );
    case 'view':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="10" y="12" width="10" height="24" rx="2" />
          <rect x="22" y="12" width="6" height="24" rx="2" />
          <rect x="30" y="12" width="8" height="24" rx="2" />
        </svg>
      );
    case 'auto':
      return (
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <path d="M12 24c0-6.6 5.4-12 12-12 4 0 7.5 1.9 9.7 5" />
          <path d="m33 12 .7 7-6.8-1.7" />
          <path d="M36 24c0 6.6-5.4 12-12 12-4 0-7.5-1.9-9.7-5" />
          <path d="m15 36-.7-7 6.8 1.7" />
        </svg>
      );
    default:
      return null;
  }
};

const renderCommandIcon = (icon: string): ReactNode => {
  switch (icon) {
    case 'play':
      return <img src={playIcon} alt="" className="luna-icon luna-icon-asset luna-icon-play" />;
    case 'stop':
      return <img src={stopIcon} alt="" className="luna-icon luna-icon-asset" />;
    case 'undo':
      return <img src={undoIcon} alt="" className="luna-icon luna-icon-asset" />;
    case 'redo':
      return <img src={redoIcon} alt="" className="luna-icon luna-icon-asset" />;
    case 'record':
      return <img src={recordIcon} alt="" className="luna-icon luna-icon-asset luna-icon-record" />;
    case 'loop':
      return <img src={loopIcon} alt="" className="luna-icon luna-icon-asset luna-icon-loop" />;
    case 'gte':
      return <img src={endIcon} alt="" className="luna-icon luna-icon-asset" />;
    case 'rtz':
      return <img src={startIcon} alt="" className="luna-icon luna-icon-asset luna-icon-wide" />;
    default:
      return renderSvgIcon(icon);
  }
};

const renderTrackingTextLabel = (commandId: CommandId, fallbackLabel: string): ReactNode => {
  switch (commandId) {
    case 'nextBar':
      return (
        <>
          <span>NEXT</span>
          <span>BAR</span>
        </>
      );
    case 'nextMarker':
      return (
        <>
          <span>NEXT</span>
          <span>MARKER</span>
        </>
      );
    case 'previousBar':
      return (
        <>
          <span>PREVIOUS</span>
          <span>BAR</span>
        </>
      );
    case 'previousMarker':
      return (
        <>
          <span>PREVIOUS</span>
          <span>MARKER</span>
        </>
      );
    case 'createMarker':
      return (
        <>
          <span>ADD</span>
          <span>MARKER</span>
        </>
      );
    case 'togglePlayFromStopLocation':
      return (
        <>
          <span>PLAY FROM</span>
          <span>STOP</span>
        </>
      );
    case 'togglePrePostRoll':
      return (
        <>
          <span>PRE / POST</span>
          <span>ROLL</span>
        </>
      );
    default:
      return fallbackLabel;
  }
};

const App = () => {
  const [state, setState] = useState<RemoteState | null>(null);
  const [pin, setPin] = useState('');
  const [busyCommand, setBusyCommand] = useState<CommandId | null>(null);
  const [flashCommand, setFlashCommand] = useState<CommandId | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('tracking');
  const [trackingUiState, setTrackingUiState] = useState({
    playing: false,
    recording: false,
    loop: false,
    click: false,
    countIn: false,
    playFromStopLocation: false,
  });
  const [testKey, setTestKey] = useState<BaseKey>('e');
  const [testModifiers, setTestModifiers] = useState<ModifierKey[]>([]);
  const [testBusy, setTestBusy] = useState(false);
  const [showTestLab, setShowTestLab] = useState(false);
  const [labState, setLabState] = useState<ShortcutTestState>({
    shortcutLabel: null,
    key: null,
    modifiers: [],
    keyAction: null,
    appleScript: null,
    lastError: null,
    sentAt: null,
    success: null,
  });
  const [labRequestJson, setLabRequestJson] = useState('Waiting');
  const [labResponseJson, setLabResponseJson] = useState('Waiting');
  const holdAnimationRef = useRef<number | null>(null);
  const currentTab: TabId = 'tracking';
  const isProductionRemote = true;

  const fetchState = async () => {
    const response = await fetch('/api/state');
    const nextState = (await response.json()) as RemoteState;
    setState(nextState);
  };

  useEffect(() => {
    void fetchState();
    const timer = window.setInterval(() => {
      void fetchState();
    }, statusPollMs);

    return () => window.clearInterval(timer);
  }, []);

  const pulseCommand = (commandId: CommandId) => {
    setFlashCommand(commandId);
    window.setTimeout(() => {
      setFlashCommand((current) => (current === commandId ? null : current));
    }, 180);
  };

  const applyOptimisticTrackingState = (commandId: CommandId) => {
    setTrackingUiState((current) => {
      switch (commandId) {
        case 'playStop':
          return { ...current, playing: true };
        case 'record':
          return { ...current, recording: true, playing: true };
        case 'stop':
          return { ...current, playing: false, recording: false };
        case 'loop':
          return { ...current, loop: !current.loop };
        case 'click':
          return { ...current, click: !current.click };
        case 'countIn':
          return { ...current, countIn: !current.countIn };
        case 'togglePlayFromStopLocation':
          return { ...current, playFromStopLocation: !current.playFromStopLocation };
        default:
          return current;
      }
    });
  };

  const sendCommand = async (command: CommandDefinition) => {
    setBusyCommand(command.id);
    setMessage(null);
    pulseCommand(command.id);
    applyOptimisticTrackingState(command.id);

    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: command.id,
          pin: pin || undefined,
        }),
      });

      const payload = (await response.json()) as CommandResponse;

      if (!payload.ok || !payload.state) {
        setMessage(payload.error ?? 'Command failed');
        await fetchState();
        return;
      }

      setState(payload.state);
      setMessage(`${command.label} sent`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Command failed');
    } finally {
      setBusyCommand(null);
    }
  };

  const executeTestShortcut = async (key: BaseKey, modifiers: ModifierKey[]) => {
    setTestBusy(true);
    setMessage(null);
    const requestBody = { key, modifiers };
    const shortcutLabel = formatShortcutLabel(key, modifiers);
    const keyAction = resolveShortcutKeyAction(key, modifiers);

    console.log('[Shortcut Test Lab] selected key:', key);
    console.log('[Shortcut Test Lab] selected modifiers:', modifiers);
    console.log('[Shortcut Test Lab] request body:', requestBody);
    setLabRequestJson(JSON.stringify(requestBody, null, 2));
    setLabResponseJson('Waiting for response');

    setLabState({
      shortcutLabel,
      key,
      modifiers,
      keyAction,
      appleScript: 'sending...',
      lastError: null,
      sentAt: new Date().toISOString(),
      success: null,
    });

    try {
      const response = await fetch('/api/test-shortcut', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json()) as TestShortcutResponse;
      console.log('[Shortcut Test Lab] response body:', payload);
      setLabResponseJson(JSON.stringify(payload, null, 2));

      if (!payload.ok) {
        const errorMessage = payload.error ?? 'Shortcut test failed';
        setMessage(errorMessage);
        setLabState({
          shortcutLabel,
          key,
          modifiers,
          keyAction: payload.keyAction ?? keyAction,
          appleScript: payload.generatedAppleScript ?? 'Waiting',
          lastError: errorMessage,
          sentAt: new Date().toISOString(),
          success: false,
        });
        return;
      }

      await fetchState();
      setLabState({
        shortcutLabel: formatShortcutLabel(payload.shortcut?.key ?? key, payload.shortcut?.modifiers ?? modifiers),
        key: payload.shortcut?.key ?? key,
        modifiers: payload.shortcut?.modifiers ?? modifiers,
        keyAction: payload.keyAction ?? keyAction,
        appleScript: payload.generatedAppleScript ?? 'Waiting',
        lastError: null,
        sentAt: new Date().toISOString(),
        success: true,
      });
      setMessage('Test shortcut sent');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Shortcut test failed';
      console.error('[Shortcut Test Lab] caught error:', error);
      setMessage(errorMessage);
      setLabResponseJson(
        JSON.stringify(
          {
            ok: false,
            error: errorMessage,
          },
          null,
          2,
        ),
      );
      setLabState((current) => ({
        ...current,
        lastError: errorMessage,
        success: false,
      }));
    } finally {
      setTestBusy(false);
    }
  };

  const toggleTestModifier = (modifier: ModifierKey) => {
    setTestModifiers((current) =>
      current.includes(modifier) ? current.filter((value) => value !== modifier) : [...current, modifier],
    );
  };

  const beginHold = (command: CommandDefinition) => {
    if (!command.confirm) {
      void sendCommand(command);
      return;
    }

    if (holdAnimationRef.current !== null) {
      window.cancelAnimationFrame(holdAnimationRef.current);
    }

    setHoldProgress(0.15);
    const startedAt = performance.now();

    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / 900, 1);
      setHoldProgress(progress);

      if (progress >= 1) {
        setHoldProgress(0);
        holdAnimationRef.current = null;
        void sendCommand(command);
        return;
      }

      holdAnimationRef.current = window.requestAnimationFrame(step);
    };

    holdAnimationRef.current = window.requestAnimationFrame(step);
  };

  const cancelHold = () => {
    if (holdAnimationRef.current !== null) {
      window.cancelAnimationFrame(holdAnimationRef.current);
      holdAnimationRef.current = null;
    }

    setHoldProgress(0);
  };

  useEffect(() => {
    return () => {
      if (holdAnimationRef.current !== null) {
        window.cancelAnimationFrame(holdAnimationRef.current);
      }
    };
  }, []);

  const sections = useMemo(
    () => ({
      navigateMarkers: navigateMarkerOrder.map((id) => commandLookup.get(id)!).filter(Boolean),
      navigateMovement: navigateMovementOrder.map((id) => commandLookup.get(id)!).filter(Boolean),
      navigateZoom: navigateZoomOrder.map((id) => commandLookup.get(id)!).filter(Boolean),
      navigateView: navigateViewOrder.map((id) => commandLookup.get(id)!).filter(Boolean),
    }),
    [],
  );

  const getTrackingStateClass = (commandId: CommandId): string => {
    if (commandId === 'playStop' && trackingUiState.playing) {
      return 'luna-button-state-blue luna-button-active';
    }

    if (commandId === 'record' && trackingUiState.recording) {
      return 'luna-button-state-red luna-button-active';
    }

    if (
      (commandId === 'loop' && trackingUiState.loop) ||
      (commandId === 'togglePlayFromStopLocation' && trackingUiState.playFromStopLocation)
    ) {
      return 'luna-button-state-yellow luna-button-active';
    }

    if ((commandId === 'click' && trackingUiState.click) || (commandId === 'countIn' && trackingUiState.countIn)) {
      return 'luna-button-state-amber luna-button-active';
    }

    if (commandId === 'stop' && !trackingUiState.playing) {
      return 'luna-button-state-yellow luna-button-active';
    }

    if (flashCommand === commandId && (momentaryTrackingCommands as CommandId[]).includes(commandId)) {
      return 'luna-button-state-yellow luna-button-active';
    }

    if (commandId === 'abortRecording' && holdProgress > 0) {
      return holdProgress > 0.75 ? 'luna-button-state-red luna-button-active' : 'luna-button-state-yellow luna-button-active';
    }

    return '';
  };

  const renderTrackingTransportGlyph = (commandId: CommandId): ReactNode => {
    const isPlaying = trackingUiState.playing;
    const isRecording = trackingUiState.recording;
    const isLooping = trackingUiState.loop;
    const isCountInEnabled = trackingUiState.countIn;
    const usesPauseMode = trackingUiState.playFromStopLocation;
    const isMomentaryActive = flashCommand === commandId;

    switch (commandId) {
      case 'playStop':
        return <img src={isPlaying ? playIconOn : playIcon} alt="" className="luna-icon luna-icon-asset luna-icon-play" />;
      case 'stop':
        return (
          <img
            src={usesPauseMode ? (!isPlaying || isMomentaryActive ? pauseIconOn : pauseIcon) : !isPlaying || isMomentaryActive ? stopIconOn : stopIcon}
            alt=""
            className="luna-icon luna-icon-asset"
          />
        );
      case 'record':
        return <img src={isRecording ? recordIconOn : recordIcon} alt="" className="luna-icon luna-icon-asset luna-icon-record" />;
      case 'loop':
        return <img src={isLooping ? loopIconOn : loopIcon} alt="" className="luna-icon luna-icon-asset luna-icon-loop" />;
      case 'returnToZero':
        return <img src={isMomentaryActive ? startIconOn : startIcon} alt="" className="luna-icon luna-icon-asset luna-icon-wide" />;
      case 'goToEnd':
        return <img src={isMomentaryActive ? endIconOn : endIcon} alt="" className="luna-icon luna-icon-asset luna-icon-wide" />;
      case 'click':
        return <img src={trackingUiState.click ? clickIconOn : clickIcon} alt="" className="luna-icon luna-icon-asset" />;
      case 'countIn':
        return (
          <span className="count-in-cluster">
            <img
              src={isCountInEnabled ? countIn1IconOn : countIn1Icon}
              alt=""
              className="luna-icon luna-icon-asset count-in-icon"
            />
            <img
              src={isCountInEnabled ? countIn2IconOn : countIn2Icon}
              alt=""
              className="luna-icon luna-icon-asset count-in-icon"
            />
            <img
              src={isCountInEnabled ? countIn4IconOn : countIn4Icon}
              alt=""
              className="luna-icon luna-icon-asset count-in-icon"
            />
          </span>
        );
      case 'undo':
        return <img src={undoIcon} alt="" className="luna-icon luna-icon-asset" />;
      case 'redo':
        return <img src={redoIcon} alt="" className="luna-icon luna-icon-asset" />;
      default:
        return renderCommandIcon(commandVisuals[commandId]?.icon ?? 'view');
    }
  };

  const renderCommandButton = (command: CommandDefinition, className: string) => {
    const visual = commandVisuals[command.id];
    const isPressed = flashCommand === command.id;
    const isTrackingButton = currentTab === 'tracking';
    const showTrackingText =
      isTrackingButton &&
      (
        command.id === 'abortRecording' ||
        command.id === 'togglePlayFromStopLocation' ||
        command.id === 'togglePrePostRoll' ||
        command.id === 'createMarker' ||
        command.id === 'previousBar' ||
        command.id === 'nextBar' ||
        command.id === 'previousMarker' ||
        command.id === 'nextMarker'
      );
    const isTrackingIconOnly = isTrackingButton && !showTrackingText;
    const holdLabel = visual.helper;
    const trackingLabelOverride =
      command.id === 'togglePlayFromStopLocation'
        ? 'PLAY FROM STOP'
        : command.id === 'abortRecording'
          ? 'DISCARD RECORDING'
          : command.id === 'togglePrePostRoll'
            ? 'PRE / POST ROLL'
            : visual.label;

    if (isTrackingButton) {
      return (
        <button
          key={command.id}
          className={`remote-button luna-button tracking-flat-button transport-button ${className} luna-button-${visual.tone ?? command.accent ?? 'neutral'} ${isPressed ? 'is-flashing' : ''} ${getTrackingStateClass(command.id)}`}
          disabled={busyCommand !== null}
          onClick={command.confirm ? undefined : () => void sendCommand(command)}
          onMouseDown={command.confirm ? () => beginHold(command) : undefined}
          onMouseUp={command.confirm ? cancelHold : undefined}
          onMouseLeave={command.confirm ? cancelHold : undefined}
          onTouchStart={command.confirm ? () => beginHold(command) : undefined}
          onTouchEnd={command.confirm ? cancelHold : undefined}
          type="button"
        >
          {isTrackingIconOnly ? (
            <span className="button-icon transport-icon" aria-hidden="true">
              {trackingTransportGlyphCommands.includes(command.id)
                ? renderTrackingTransportGlyph(command.id)
                : renderCommandIcon(visual.icon)}
            </span>
          ) : null}
          <span
            className={`button-label ${isTrackingIconOnly ? 'tracking-button-label' : 'tracking-text-button-label'}`}
          >
            {isTrackingIconOnly ? trackingLabelOverride : renderTrackingTextLabel(command.id, trackingLabelOverride)}
          </span>
        </button>
      );
    }

    return (
      <button
        key={command.id}
        className={`remote-button luna-button ${className} luna-button-${visual.tone ?? command.accent ?? 'neutral'} ${isPressed ? 'is-flashing' : ''} ${getTrackingStateClass(command.id)}`}
        disabled={busyCommand !== null}
        onClick={command.confirm ? undefined : () => void sendCommand(command)}
        onMouseDown={command.confirm ? () => beginHold(command) : undefined}
        onMouseUp={command.confirm ? cancelHold : undefined}
        onMouseLeave={command.confirm ? cancelHold : undefined}
        onTouchStart={command.confirm ? () => beginHold(command) : undefined}
        onTouchEnd={command.confirm ? cancelHold : undefined}
        type="button"
      >
        <div className="transport-cap">
          <span className="button-icon" aria-hidden="true">
            {renderCommandIcon(visual.icon)}
          </span>
        </div>
        <span className="button-label">{visual.label}</span>
        {holdLabel ? <span className="button-helper">{holdLabel}</span> : null}
      </button>
    );
  };

  const lastCommandLabel = state?.lastCommand ? commandVisuals[state.lastCommand]?.label ?? commandLookup.get(state.lastCommand)?.label : 'None';

  return (
    <main className="app-shell">
      <section className={`topbar ${isProductionRemote ? 'production-header' : ''}`}>
        <div className="brand-block">
          <img
            src={state?.lunaDetected ? uaDiamondOn : uaDiamondMouseover}
            alt={state?.lunaDetected ? 'LUNA detected' : 'LUNA not detected'}
            className="ua-status-logo"
          />
          <h1>LUNA STUDIO REMOTE</h1>
        </div>

        {showDebugTools ? <div className="status-strip">
          {state?.testMode ? <div className="status-badge warning">TEST MODE</div> : null}
          {state?.pinRequired ? <div className="status-badge neutral">PIN</div> : null}
        </div> : null}
      </section>

      <section className={`layout ${currentTab === 'tracking' ? 'layout-tracking' : ''} ${isProductionRemote ? 'layout-production' : ''}`}>
        <div className="remote-stage">
          {currentTab === 'tracking' ? (
            <section className="tab-panel" aria-label="Tracking controls">
              <div className="panel-group">
                <div className="tracking-console-layout">
                  {productionTrackingRows.map((row) => (
                    <div key={row.commands.join('-')} className={`button-grid ${row.className}`}>
                      {row.commands.map((commandId) => {
                        const command = commandLookup.get(commandId);

                        if (!command) {
                          return null;
                        }

                        const trackingClassMap: Partial<Record<CommandId, string>> = {
                          record: 'record-button tracking-record',
                          playStop: 'transport-button tracking-primary-button',
                          stop: 'transport-button tracking-primary-button',
                          click: 'utility-button tracking-medium-button',
                          countIn: 'utility-button tracking-medium-button',
                          loop: 'utility-button tracking-compact-button',
                          undo: 'utility-button tracking-compact-button',
                          redo: 'utility-button tracking-compact-button',
                          goToEnd: 'transport-button tracking-compact-button',
                          returnToZero: 'transport-button tracking-compact-button',
                          nextBar: 'utility-button tracking-compact-button tracking-text-command',
                          previousBar: 'utility-button tracking-compact-button tracking-text-command',
                          nextMarker: 'utility-button tracking-compact-button tracking-text-command',
                          previousMarker: 'utility-button tracking-compact-button tracking-text-command',
                          createMarker: 'utility-button tracking-compact-button tracking-text-command',
                          togglePlayFromStopLocation: 'utility-button tracking-compact-button tracking-text-command tracking-play-from-stop',
                          togglePrePostRoll: 'utility-button tracking-compact-button tracking-text-command tracking-pre-post-roll',
                        };

                        return renderCommandButton(command, trackingClassMap[command.id] ?? 'utility-button');
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {showDebugTools && currentTab === 'navigate' ? (
            <section className="tab-panel" aria-label="Navigation controls">
              <div className="panel-group">
                <div className="section-header">
                  <h2>Markers</h2>
                </div>
                <div className="button-grid marker-grid">
                  {sections.navigateMarkers.map((command) => renderCommandButton(command, 'nav-button'))}
                </div>
              </div>

              <div className="panel-group">
                <div className="section-header">
                  <h2>Movement</h2>
                </div>
                <div className="button-grid movement-grid">
                  {sections.navigateMovement.map((command) => renderCommandButton(command, 'nav-button'))}
                </div>
              </div>

              <div className="panel-group">
                <div className="section-header">
                  <h2>Zoom</h2>
                </div>
                <div className="button-grid zoom-grid">
                  {sections.navigateZoom.map((command) => renderCommandButton(command, 'nav-button'))}
                </div>
              </div>

              <div className="panel-group">
                <div className="section-header">
                  <h2>View</h2>
                </div>
                <div className="button-grid view-grid">
                  {sections.navigateView.map((command) => renderCommandButton(command, 'nav-button view-button'))}
                </div>
              </div>
            </section>
          ) : null}

          {showDebugTools && currentTab === 'settings' ? (
            <section className="tab-panel settings-panel" aria-label="Settings and Test Lab">
              <div className="settings-status-row">
                <div className="panel-card status-card">
                  <div className="status-card-row">
                    <div>
                      <p className="status-caption">Status</p>
                      <h2>{state?.lunaDetected ? 'Ready to Send' : 'Waiting for LUNA'}</h2>
                    </div>
                    <img
                      src={state?.lunaDetected ? uaDiamondOn : uaDiamondMouseover}
                      alt=""
                      aria-hidden="true"
                      className="status-card-logo"
                    />
                  </div>
                  <p className="panel-note">LUNA is activated before every command. Live control requires `TEST_MODE=false`.</p>
                </div>

                <div className="panel-card status-card">
                  <p className="status-caption">Last Command</p>
                  <div className="last-command-display">
                    <span className="last-command-icon" aria-hidden="true">
                      {state?.lastCommand ? renderCommandIcon(commandVisuals[state.lastCommand]?.icon ?? 'view') : '•'}
                    </span>
                    <div>
                      <strong>{lastCommandLabel}</strong>
                      <p className="panel-note">{formatTimestamp(state?.lastCommandAt ?? null)}</p>
                    </div>
                  </div>
                </div>

                {state?.lastError ? (
                  <div className="panel-card status-card error-card">
                    <p className="status-caption">Last Error</p>
                    <strong>{state.lastError}</strong>
                  </div>
                ) : null}
              </div>

              <div className="panel-card compact-card">
                <div className="card-row">
                  <div>
                    <h2>Remote Access</h2>
                    <p className="panel-note">Use the LAN URL on iPhone or iPad. Set `TEST_MODE=false` for live control.</p>
                  </div>
                  <div className="status-pill subtle">
                    <span className="status-caption">Sent</span>
                    <strong>{formatTimestamp(state?.lastCommandAt ?? null)}</strong>
                  </div>
                </div>

                {state?.pinRequired ? (
                  <label className="pin-field">
                    <span>PIN</span>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="Enter PIN"
                      value={pin}
                      onChange={(event) => setPin(event.target.value)}
                    />
                  </label>
                ) : (
                  <p className="panel-note">PIN protection is disabled.</p>
                )}
              </div>

              <div className="panel-card compact-card">
                <h2>Test Mode</h2>
                <p className="panel-note">
                  {state?.testMode
                    ? 'TEST_MODE is enabled. Commands are simulated for safe testing.'
                    : 'TEST_MODE is disabled. Commands are sent live to LUNA.'}
                </p>
              </div>

              <div className="panel-card compact-card">
                <h2>Feedback</h2>
                <p className="feedback-strong">{message ?? state?.lastError ?? 'Remote ready.'}</p>
              </div>

              <div className="panel-card compact-card">
                <button className="panel-toggle" onClick={() => setShowTestLab((current) => !current)} type="button">
                  {showTestLab ? 'Hide Shortcut Test Lab' : 'Show Shortcut Test Lab'}
                </button>
              </div>

              {showTestLab ? (
                <div className="panel-card lab-card">
                  <h2>Shortcut Test Lab</h2>
                  {!state?.testMode ? (
                    <div className="status-badge warning wide-badge">LIVE MODE: test shortcuts are sent to LUNA immediately.</div>
                  ) : null}

                  <div className="lab-controls">
                    <label className="pin-field">
                      <span>Key</span>
                      <select value={testKey} onChange={(event) => setTestKey(event.target.value as BaseKey)}>
                        {shortcutKeyOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="modifier-group">
                      <span>Modifiers</span>
                      <div className="modifier-grid">
                        {modifierOptions.map((modifier) => (
                          <label key={modifier} className="modifier-toggle">
                            <input
                              type="checkbox"
                              checked={testModifiers.includes(modifier)}
                              onChange={() => toggleTestModifier(modifier)}
                            />
                            <span>{modifier}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <button className="remote-button utility-button tone-neutral" disabled={testBusy} onClick={() => void executeTestShortcut(testKey, testModifiers)} type="button">
                      <span className="button-icon" aria-hidden="true">
                        ⌁
                      </span>
                      <span className="button-label">Send Test Shortcut</span>
                    </button>

                    <div className="preset-grid">
                      {shortcutPresets.map((preset) => (
                        <button
                          key={preset.label}
                          className="preset-button"
                          disabled={testBusy}
                          onClick={() => {
                            setTestKey(preset.key);
                            setTestModifiers(preset.modifiers);
                            void executeTestShortcut(preset.key, preset.modifiers);
                          }}
                          type="button"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <dl className="debug-stats">
                    <div>
                      <dt>Selected shortcut</dt>
                      <dd>{labState.shortcutLabel ?? state?.debug?.lastShortcutTest.shortcutLabel ?? 'Waiting'}</dd>
                    </div>
                    <div>
                      <dt>Success</dt>
                      <dd>
                        {labState.success === null
                          ? labState.sentAt
                            ? 'Sending...'
                            : state?.debug?.lastShortcutTest.success === false
                              ? 'No'
                              : state?.debug?.lastShortcutTest.success === true
                                ? 'Yes'
                                : 'Waiting'
                          : labState.success
                            ? 'Yes'
                            : 'No'}
                      </dd>
                    </div>
                    <div>
                      <dt>Key action</dt>
                      <dd>{labState.keyAction ?? state?.debug?.lastShortcutTest.keyAction ?? 'Pending'}</dd>
                    </div>
                    <div className="debug-block">
                      <dt>AppleScript</dt>
                      <dd>
                        <pre>{labState.appleScript ?? state?.debug?.lastShortcutTest.appleScript ?? 'Waiting for shortcut test'}</pre>
                      </dd>
                    </div>
                    <div className="debug-block">
                      <dt>Last error</dt>
                      <dd>{labState.lastError ?? state?.debug?.lastShortcutTest.lastError ?? 'None'}</dd>
                    </div>
                    <div className="debug-block">
                      <dt>Request JSON</dt>
                      <dd>
                        <pre>{labRequestJson}</pre>
                      </dd>
                    </div>
                    <div className="debug-block">
                      <dt>Response JSON</dt>
                      <dd>
                        <pre>{labResponseJson}</pre>
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>

      {showDebugTools ? <nav className="tab-row" aria-label="Remote tabs">
        <button className={`tab-button ${activeTab === 'tracking' ? 'active' : ''}`} onClick={() => setActiveTab('tracking')} type="button">
          TRACKING
        </button>
        <button className={`tab-button ${activeTab === 'navigate' ? 'active' : ''}`} onClick={() => setActiveTab('navigate')} type="button">
          NAVIGATE
        </button>
        <button className={`tab-button ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')} type="button">
          SETTINGS
        </button>
      </nav> : null}
    </main>
  );
};

export default App;
