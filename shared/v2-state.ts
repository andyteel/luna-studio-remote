export type FeedbackSource = 'unknown' | 'mcu' | 'keystrokeFallback';

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
  source: FeedbackSource;
  updatedAt: string | null;
}

export interface FocusedTrackFaderState {
  raw14: number | null;
  signed: number | null;
  normalized: number | null;
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

export type McuLifecycleState = 'disabled' | 'idle' | 'starting' | 'connected' | 'error';
export type McuDriverState = 'noop' | 'jzz' | 'rtmidi';

export interface McuState {
  enabled: boolean;
  available: boolean;
  connected: boolean;
  lifecycle: McuLifecycleState;
  driver: McuDriverState;
  inputPorts: McuPortState[];
  outputPorts: McuPortState[];
  selectedInputId: string | null;
  selectedOutputId: string | null;
  virtualInputName: string | null;
  virtualOutputName: string | null;
  lastMessageAt: string | null;
  lastError: string | null;
}

export interface V2RemoteState {
  transport: TransportState;
  focusedTrack: FocusedTrackState;
  mcu: McuState;
}
