export type FeedbackSource = 'unknown' | 'mcu' | 'keystrokeFallback';
export type MidiMode = 'iac';

export interface TransportState {
  playing: boolean | null;
  stopped: boolean | null;
  recording: boolean | null;
  loop: boolean | null;
  click: boolean | null;
  countIn: boolean | null;
  source: FeedbackSource;
  updatedAt: string | null;
}

export interface FocusedTrackMeterState {
  raw: number | null;
  normalized: number | null;
  peak: number | null;
  // D0 00..0C carry live focused-meter levels.
  // D0 0F is a delayed LUNA peak-hold diagnostic.
  // This field tracks the currently accepted visible red peak-hold lamp behavior.
  clip: boolean | null;
  source: FeedbackSource;
  updatedAt: string | null;
}

export interface FocusedTrackFaderState {
  raw14: number | null;
  signed: number | null;
  normalized: number | null;
  gainDbText: string | null;
  source: FeedbackSource;
  updatedAt: string | null;
}

export interface FocusedTrackState {
  index: number | null;
  name: string | null;
  arm: boolean | null;
  solo: boolean | null;
  mute: boolean | null;
  meter: FocusedTrackMeterState;
  fader: FocusedTrackFaderState;
  source: FeedbackSource;
  updatedAt: string | null;
}

export interface McuPortState {
  id: string;
  name: string;
}

export type McuDiagnosticMessageKind = 'transport' | 'lcd' | 'select' | 'other';

export interface McuRecentMessageDiagnostic {
  receivedAt: string;
  inputName: string;
  bytesHex: string;
  kind: McuDiagnosticMessageKind;
  detail: string;
}

export interface McuDiagnosticsState {
  rawMessageCount: number;
  transportMessageCount: number;
  lcdMessageCount: number;
  selectMessageCount: number;
  focusedTrackFeedbackCount: number;
  lastRawMessageAt: string | null;
  lastTransportFeedbackAt: string | null;
  lastLcdFeedbackAt: string | null;
  lastSelectFeedbackAt: string | null;
  lastFocusedTrackFeedbackAt: string | null;
  recentMessages: McuRecentMessageDiagnostic[];
}

export type McuLifecycleState = 'disabled' | 'idle' | 'starting' | 'connected' | 'error';
export type McuDriverState = 'noop' | 'jzz';

export interface McuState {
  enabled: boolean;
  available: boolean;
  connected: boolean;
  lifecycle: McuLifecycleState;
  driver: McuDriverState;
  inputPorts: McuPortState[];
  outputPorts: McuPortState[];
  selectedInputId: string | null;
  selectedInputName: string | null;
  selectedOutputId: string | null;
  selectedOutputName: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
}

export interface V2RemoteState {
  transport: TransportState;
  focusedTrack: FocusedTrackState;
  mcu: McuState;
}
