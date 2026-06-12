export type ModifierKey = 'command' | 'shift' | 'control' | 'option';

export type BaseKey =
  | 'backslash'
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
  | 'd'
  | 'e'
  | 'q'
  | 'w';

export type FocusedTrackMcuControlRole = 'recordEnable' | 'solo' | 'mute';
export type McuTransportControlRole = 'play' | 'stop' | 'record' | 'cycle' | 'click';
export type McuNavigationControlRole = 'channelLeft' | 'channelRight' | 'bankLeft' | 'bankRight';

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
  | 'toggleTimelineMixer'
  | 'focusedTrackRecordArm'
  | 'focusedTrackSolo'
  | 'focusedTrackMute'
  | 'focusedBankLeft'
  | 'focusedChannelLeft'
  | 'focusedChannelRight'
  | 'focusedBankRight'
  | 'newTrackVersion'
  | 'duplicateTrack'
  | 'duplicateTrackWithoutContent';

export interface CommandDefinition {
  id: CommandId;
  label: string;
  keys: Array<ModifierKey | BaseKey>;
  mcuControl?: FocusedTrackMcuControlRole;
  mcuTransport?: McuTransportControlRole;
  mcuNavigation?: McuNavigationControlRole;
  danger?: boolean;
  confirm?: boolean;
  placeholder?: boolean;
  note?: string;
  accent?: 'record' | 'danger' | 'neutral';
}

export const commandRegistry: CommandDefinition[] = [
  { id: 'record', label: 'Record', keys: ['numpad3'], mcuTransport: 'record', accent: 'record' },
  { id: 'playStop', label: 'Play / Stop', keys: ['space'], mcuTransport: 'play', accent: 'neutral' },
  { id: 'stop', label: 'Stop', keys: ['space'], mcuTransport: 'stop', accent: 'neutral' },
  { id: 'returnToZero', label: 'Return to Zero', keys: ['return'], accent: 'neutral' },
  {
    id: 'goToEnd',
    label: 'Go To End',
    keys: ['control', 'digit0'],
    accent: 'neutral',
  },
  { id: 'loop', label: 'Loop', keys: ['control', 'l'], mcuTransport: 'cycle', accent: 'neutral' },
  { id: 'click', label: 'Click', keys: ['k'], mcuTransport: 'click', accent: 'neutral' },
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
    id: 'focusedTrackRecordArm',
    label: 'Focused Track Record Arm',
    keys: [],
    mcuControl: 'recordEnable',
    accent: 'record',
  },
  {
    id: 'focusedTrackSolo',
    label: 'Focused Track Solo',
    keys: [],
    mcuControl: 'solo',
    accent: 'neutral',
  },
  {
    id: 'focusedTrackMute',
    label: 'Focused Track Mute',
    keys: [],
    mcuControl: 'mute',
    accent: 'neutral',
  },
  {
    id: 'focusedBankLeft',
    label: 'Bank Left',
    keys: [],
    mcuNavigation: 'bankLeft',
    accent: 'neutral',
  },
  {
    id: 'focusedChannelLeft',
    label: 'Channel Left',
    keys: [],
    mcuNavigation: 'channelLeft',
    accent: 'neutral',
  },
  {
    id: 'focusedChannelRight',
    label: 'Channel Right',
    keys: [],
    mcuNavigation: 'channelRight',
    accent: 'neutral',
  },
  {
    id: 'focusedBankRight',
    label: 'Bank Right',
    keys: [],
    mcuNavigation: 'bankRight',
    accent: 'neutral',
  },
  {
    id: 'newTrackVersion',
    label: 'New Track Version',
    keys: ['control', 'backslash'],
    accent: 'neutral',
  },
  {
    id: 'duplicateTrack',
    label: 'Duplicate Track',
    keys: ['option', 'd'],
    accent: 'neutral',
  },
  {
    id: 'duplicateTrackWithoutContent',
    label: 'Duplicate Without Content',
    keys: ['shift', 'option', 'd'],
    accent: 'neutral',
  },
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
