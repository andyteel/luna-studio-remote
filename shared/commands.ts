export type ModifierKey = 'command' | 'shift' | 'control' | 'option';

export type BaseKey =
  | 'digit0'
  | 'space'
  | 'return'
  | 'keypadEnter'
  | 'numpad3'
  | 'period'
  | 'apostrophe'
  | 'k'
  | 'l'
  | 'r'
  | 't'
  | 'z'
  | 'leftArrow'
  | 'rightArrow'
  | 'upArrow'
  | 'downArrow'
  | 'leftBracket'
  | 'rightBracket'
  | 'equals'
  | 'a'
  | 'e'
  | 'q'
  | 'w';

export type CommandId =
  | 'record'
  | 'playStop'
  | 'stop'
  | 'returnToZero'
  | 'goToEnd'
  | 'loop'
  | 'click'
  | 'countIn'
  | 'undo'
  | 'redo'
  | 'abortRecording'
  | 'togglePrePostRoll'
  | 'togglePlayFromStopLocation'
  | 'createMarker'
  | 'previousBar'
  | 'nextBar'
  | 'previousMarker'
  | 'nextMarker'
  | 'zoomIn'
  | 'zoomOut'
  | 'waveformZoomOut'
  | 'waveformZoomIn'
  | 'frameSelection'
  | 'autoScroll'
  | 'scrollLeftSelection'
  | 'scrollRightSelection'
  | 'toggleTimelineMixer';

export interface CommandDefinition {
  id: CommandId;
  label: string;
  keys: Array<ModifierKey | BaseKey>;
  danger?: boolean;
  confirm?: boolean;
  placeholder?: boolean;
  note?: string;
  accent?: 'record' | 'danger' | 'neutral';
}

export const commandRegistry: CommandDefinition[] = [
  { id: 'record', label: 'Record', keys: ['numpad3'], accent: 'record' },
  { id: 'playStop', label: 'Play / Stop', keys: ['space'], accent: 'neutral' },
  { id: 'stop', label: 'Stop', keys: ['space'], accent: 'neutral' },
  { id: 'returnToZero', label: 'Return to Zero', keys: ['return'], accent: 'neutral' },
  {
    id: 'goToEnd',
    label: 'Go To End',
    keys: ['control', 'digit0'],
    accent: 'neutral',
  },
  { id: 'loop', label: 'Loop', keys: ['control', 'l'], accent: 'neutral' },
  { id: 'click', label: 'Click', keys: ['k'], accent: 'neutral' },
  { id: 'countIn', label: 'Count In', keys: ['shift', 'k'], accent: 'neutral' },
  { id: 'undo', label: 'Undo Last', keys: ['command', 'z'], accent: 'neutral' },
  { id: 'redo', label: 'Redo', keys: ['shift', 'command', 'z'], accent: 'neutral' },
  {
    id: 'togglePrePostRoll',
    label: 'Pre / Post Roll',
    keys: ['command', 'k'],
    accent: 'neutral',
  },
  {
    id: 'togglePlayFromStopLocation',
    label: 'Play From Stop Location',
    keys: ['control', 'equals'],
    accent: 'neutral',
  },
  { id: 'createMarker', label: 'Add Marker', keys: ['keypadEnter'], accent: 'neutral' },
  { id: 'previousBar', label: 'Previous Bar', keys: ['leftBracket'], accent: 'neutral' },
  { id: 'nextBar', label: 'Next Bar', keys: ['rightBracket'], accent: 'neutral' },
  { id: 'previousMarker', label: 'Previous Marker', keys: ['control', 'option', 'l'], accent: 'neutral' },
  { id: 'nextMarker', label: 'Next Marker', keys: ['control', 'option', 'apostrophe'], accent: 'neutral' },
  { id: 'zoomIn', label: 'Zoom In', keys: ['command', 'rightBracket'], accent: 'neutral' },
  { id: 'zoomOut', label: 'Zoom Out', keys: ['command', 'leftBracket'], accent: 'neutral' },
  { id: 'waveformZoomOut', label: 'Waveform Zoom Out', keys: ['option', 'command', 'leftBracket'], accent: 'neutral' },
  { id: 'waveformZoomIn', label: 'Waveform Zoom In', keys: ['option', 'command', 'rightBracket'], accent: 'neutral' },
  { id: 'frameSelection', label: 'Frame Selection', keys: ['e'], accent: 'neutral' },
  { id: 'autoScroll', label: 'Auto Scroll', keys: ['shift', 'a'], accent: 'neutral' },
  { id: 'scrollLeftSelection', label: 'Scroll Left Selection', keys: ['shift', 'leftArrow'], accent: 'neutral' },
  { id: 'scrollRightSelection', label: 'Scroll Right Selection', keys: ['shift', 'rightArrow'], accent: 'neutral' },
  { id: 'toggleTimelineMixer', label: 'Toggle Timeline/Mixer', keys: ['command', 'equals'], accent: 'neutral' },
  {
    id: 'abortRecording',
    label: 'Discard Recording',
    keys: ['command', 'shift', 'period'],
    danger: true,
    confirm: true,
    accent: 'danger',
  },
];

export const commandMap = new Map(commandRegistry.map((command) => [command.id, command]));
