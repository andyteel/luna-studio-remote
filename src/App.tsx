import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { commandRegistry, type CommandDefinition, type CommandId } from '../shared/commands';
import type { CommandResponse, RemoteState, RemoteStateStreamEvent } from './types';
import countIn1Icon from '../luna-image-resources/buttons/icon_count_in_1.png';
import countIn1IconOn from '../luna-image-resources/buttons/icon_count_in_1_on.png';
import countIn2Icon from '../luna-image-resources/buttons/icon_count_in_2.png';
import countIn2IconOn from '../luna-image-resources/buttons/icon_count_in_2_on.png';
import countIn4Icon from '../luna-image-resources/buttons/icon_count_in_4.png';
import countIn4IconOn from '../luna-image-resources/buttons/icon_count_in_4_on.png';
import focusedTrackPanel from '../assets_v2/track-panel@2x.png';
import focusedFaderPanel from '../assets_v2/fader-panel@2x.png';
import focusedFaderTrack from '../assets_v2/fader-track@2x.png';
import focusedFaderCap from '../assets_v2/fader_cap@2x.png';
import focusedMeterBg from '../assets_v2/meter_channer_bg@2x.png';
import focusedMeterOn from '../assets_v2/meter_channel_on@2x.png';
import focusedMeterClip from '../assets_v2/meter_channel_clip_on@2x.png';
import focusedScribbleStrip from '../assets_v2/scribble-strip@2x.png';
import focusedSwitchNeutral from '../assets_v2/switch_fader@2x.png';
import focusedSwitchBlue from '../assets_v2/switch_fader_blu@2x.png';
import focusedSwitchRed from '../assets_v2/switch_fader_red@2x.png';
import focusedSwitchYellow from '../assets_v2/switch_fader_yel@2x.png';
import clickSvg from '../assets_original/transport/click.svg';
import playSvg from '../assets_original/transport/play.svg';
import stopSvg from '../assets_original/transport/stop.svg';
import recordSvg from '../assets_original/transport/record.svg';
import loopSvg from '../assets_original/transport/loop.svg';
import gteSvg from '../assets_original/transport/gte.svg';
import rtzSvg from '../assets_original/transport/rtz.svg';
import undoSvg from '../assets_original/transport/undo.svg';
import redoSvg from '../assets_original/transport/redo.svg';
import plusSvg from '../assets_original/transport/plus.svg';

const statusPollMs = 100;
const useCssFocusedMeterTest = true;

type FocusedFaderResponse = {
  ok: boolean;
  fader?: {
    normalized: number;
    raw14: number;
    signed?: number;
    gainDbText: string | null;
  };
  state?: RemoteState;
  error?: string;
};

const commandLookup = new Map(commandRegistry.map((command) => [command.id, command]));

const commandVisuals: Record<
  CommandId,
  { icon: string; label: string; tone?: 'record' | 'danger' | 'primary' | 'neutral'; helper?: string }
> = {
  record: { icon: 'record', label: 'Record', tone: 'record' },
  focusedTrackRecordArm: { icon: 'record', label: 'Focused Arm', tone: 'record' },
  focusedTrackSolo: { icon: 'view', label: 'Focused Solo' },
  focusedTrackMute: { icon: 'view', label: 'Focused Mute' },
  focusedSelectedTrackUp: { icon: 'markerLeft', label: 'Track Up' },
  focusedSelectedTrackDown: { icon: 'markerRight', label: 'Track Down' },
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

type FocusedStripButtonPosition = 'record' | 'solo' | 'mute' | 'version';
type FocusedStripIcon = FocusedStripButtonPosition | 'bankLeft' | 'channelLeft' | 'channelRight' | 'bankRight';

const focusedStripNormalButtons: Array<{
  position: FocusedStripButtonPosition;
  commandId: CommandId;
  icon: FocusedStripIcon;
}> = [
  { position: 'record', commandId: 'focusedTrackRecordArm', icon: 'record' },
  { position: 'solo', commandId: 'focusedTrackSolo', icon: 'solo' },
  { position: 'mute', commandId: 'focusedTrackMute', icon: 'mute' },
  { position: 'version', commandId: 'newTrackVersion', icon: 'version' },
];

const focusedStripNavigationButtons: Array<{
  position: FocusedStripButtonPosition;
  commandId: CommandId;
  icon: FocusedStripIcon;
}> = [
  { position: 'record', commandId: 'focusedSelectedTrackUp', icon: 'bankLeft' },
  { position: 'mute', commandId: 'focusedSelectedTrackDown', icon: 'bankRight' },
];

const focusedFaderTrackLeftPercent = 15.58;
const focusedFaderTrackTopPercent = 64.6;
const focusedFaderTrackWidthPercent = 69.75;
const focusedFaderTrackHeightPercent = 6.61;
const focusedFaderCapWidthPercent = 28.44;
const focusedFaderCapHeightPercent = 34.24;
const focusedStripVersionPanelCommands: CommandId[] = [
  'newTrackVersion',
  'duplicateTrack',
  'duplicateTrackWithoutContent',
];

const clamp01 = (value: number | null | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(1, value));
};

const formatFocusedFaderGainDb = (gainDbText: string | null | undefined): string => {
  return gainDbText ?? '--.- dB';
};
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

const createMaskIconStyle = (src: string): CSSProperties => ({
  WebkitMaskImage: `url(${src})`,
  maskImage: `url(${src})`,
});

const renderMaskIcon = (src: string, className = ''): ReactNode => (
  <span
    aria-hidden="true"
    className={`luna-icon luna-icon-mask ${className}`.trim()}
    style={createMaskIconStyle(src)}
  />
);

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
      return renderMaskIcon(playSvg, 'luna-icon-play');
    case 'stop':
      return renderMaskIcon(stopSvg);
    case 'undo':
      return renderMaskIcon(undoSvg);
    case 'redo':
      return renderMaskIcon(redoSvg);
    case 'record':
      return renderMaskIcon(recordSvg, 'luna-icon-record');
    case 'loop':
      return renderMaskIcon(loopSvg, 'luna-icon-loop');
    case 'gte':
      return renderMaskIcon(gteSvg);
    case 'rtz':
      return renderMaskIcon(rtzSvg, 'luna-icon-wide');
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

const renderFocusedStripButtonIcon = (icon: FocusedStripIcon): ReactNode => {
  switch (icon) {
    case 'record':
      return (
        <span className="focused-strip-glyph focused-strip-glyph-record" aria-hidden="true">
          <span className="focused-strip-glyph-mark focused-strip-record-dot" />
        </span>
      );
    case 'solo':
      return (
        <span className="focused-strip-glyph focused-strip-glyph-solo" aria-hidden="true">
          <span className="focused-strip-glyph-mark focused-strip-letter">S</span>
        </span>
      );
    case 'mute':
      return (
        <span className="focused-strip-glyph focused-strip-glyph-mute" aria-hidden="true">
          <span className="focused-strip-glyph-mark focused-strip-letter">M</span>
        </span>
      );
    case 'version':
      return (
        <span className="focused-strip-glyph focused-strip-glyph-version" aria-hidden="true">
          {renderMaskIcon(plusSvg, 'focused-strip-mask-icon focused-strip-mask-icon-plus')}
        </span>
      );
    case 'bankLeft':
      return renderMaskIcon(rtzSvg, 'focused-strip-mask-icon focused-strip-nav-image focused-strip-nav-image-bank-left');
    case 'channelLeft':
      return renderMaskIcon(playSvg, 'focused-strip-mask-icon focused-strip-nav-image focused-strip-nav-image-channel-left');
    case 'channelRight':
      return renderMaskIcon(playSvg, 'focused-strip-mask-icon focused-strip-nav-image focused-strip-nav-image-channel-right');
    case 'bankRight':
      return renderMaskIcon(gteSvg, 'focused-strip-mask-icon focused-strip-nav-image focused-strip-nav-image-bank-right');
    default:
      return null;
  }
};

const App = () => {
  const [state, setState] = useState<RemoteState | null>(null);
  const [pin, setPin] = useState('');
  const [busyCommand, setBusyCommand] = useState<CommandId | null>(null);
  const [flashCommand, setFlashCommand] = useState<CommandId | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [trackingUiState, setTrackingUiState] = useState({
    playing: false,
    recording: false,
    loop: false,
    click: false,
    countIn: false,
    playFromStopLocation: false,
  });
  const [focusedStripNavMode, setFocusedStripNavMode] = useState(false);
  const [focusedStripVersionPanelOpen, setFocusedStripVersionPanelOpen] = useState(false);
  const [focusedStripVersionPressed, setFocusedStripVersionPressed] = useState(false);
  const [focusedFaderDrag, setFocusedFaderDrag] = useState<{
    active: boolean;
    normalized: number;
    gainDbText: string | null;
  } | null>(null);
  const focusedStripActionSheetRef = useRef<HTMLDivElement | null>(null);
  const focusedFaderHitZoneRef = useRef<HTMLDivElement | null>(null);
  const holdAnimationRef = useRef<number | null>(null);
  const focusedFaderSendAnimationRef = useRef<number | null>(null);
  const focusedFaderPendingNormalizedRef = useRef<number | null>(null);
  const focusedFaderLastSentNormalizedRef = useRef<number | null>(null);
  const stateFetchInFlightRef = useRef(false);
  const stateFetchPendingRef = useRef(false);
  const activeStateFetchPromiseRef = useRef<Promise<void> | null>(null);
  const isProductionRemote = true;

  const applyIncomingState = (nextState: RemoteState) => {
    setState(nextState);
  };

  const fetchState = async () => {
    if (stateFetchInFlightRef.current) {
      stateFetchPendingRef.current = true;
      return activeStateFetchPromiseRef.current ?? Promise.resolve();
    }

    const run = (async () => {
      stateFetchInFlightRef.current = true;

      try {
        do {
          stateFetchPendingRef.current = false;
          const response = await fetch('/api/state');
          const nextState = (await response.json()) as RemoteState;
          applyIncomingState(nextState);
        } while (stateFetchPendingRef.current);
      } finally {
        stateFetchInFlightRef.current = false;
        activeStateFetchPromiseRef.current = null;
      }
    })();

    activeStateFetchPromiseRef.current = run;
    return run;
  };

  useEffect(() => {
    void fetchState();
    const timer = window.setInterval(() => {
      void fetchState();
    }, statusPollMs);
    const stateStream = new EventSource('/api/state/stream');

    stateStream.addEventListener('state', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as RemoteStateStreamEvent;
      applyIncomingState(payload.state);
    });

    return () => {
      window.clearInterval(timer);
      stateStream.close();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (focusedFaderSendAnimationRef.current !== null) {
        window.cancelAnimationFrame(focusedFaderSendAnimationRef.current);
        focusedFaderSendAnimationRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!focusedStripVersionPanelOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (focusedStripActionSheetRef.current?.contains(target)) {
        return;
      }

      setFocusedStripVersionPanelOpen(false);
      setFocusedStripVersionPressed(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }

      setFocusedStripVersionPanelOpen(false);
      setFocusedStripVersionPressed(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focusedStripVersionPanelOpen]);

  useEffect(() => {
    if (!focusedStripNavMode) {
      return;
    }

    setFocusedStripVersionPanelOpen(false);
    setFocusedStripVersionPressed(false);
  }, [focusedStripNavMode]);

  useEffect(() => {
    const transport = state?.transport;

    if (!transport || transport.source !== 'mcu') {
      return;
    }

    setTrackingUiState((current) => {
      const next = {
        ...current,
        playing: transport.playing ?? (transport.stopped === true ? false : current.playing),
        recording: transport.recording ?? current.recording,
        loop: transport.loop ?? current.loop,
        click: transport.click ?? current.click,
      };

      return (
        next.playing === current.playing &&
        next.recording === current.recording &&
        next.loop === current.loop &&
        next.click === current.click
      )
        ? current
        : next;
    });
  }, [
    state?.transport.source,
    state?.transport.updatedAt,
    state?.transport.playing,
    state?.transport.stopped,
    state?.transport.recording,
    state?.transport.loop,
    state?.transport.click,
  ]);

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
      setMessage(payload.warning ? `${command.label} sent. ${payload.warning}` : `${command.label} sent`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Command failed');
    } finally {
      setBusyCommand(null);
    }
  };

  const getFocusedFaderNormalizedFromClientX = (clientX: number): number | null => {
    const hitZone = focusedFaderHitZoneRef.current;
    const strip = hitZone?.closest('.focused-channel-strip');

    if (!(strip instanceof HTMLElement)) {
      return null;
    }

    const stripRect = strip.getBoundingClientRect();

    if (stripRect.width <= 0) {
      return null;
    }

    const trackLeft = stripRect.left + (focusedFaderTrackLeftPercent / 100) * stripRect.width;
    const trackWidth = (focusedFaderTrackWidthPercent / 100) * stripRect.width;

    if (trackWidth <= 0) {
      return null;
    }

    return clamp01((clientX - trackLeft) / trackWidth);
  };

  const sendFocusedFaderPosition = async (
    normalized: number,
    phase: 'start' | 'move' | 'end',
  ): Promise<void> => {
    if (!state?.focusedTrackReady) {
      return;
    }

    try {
      const response = await fetch('/api/focused-fader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          normalized,
          phase,
          pin: pin || undefined,
        }),
      });
      const payload = (await response.json()) as FocusedFaderResponse;

      if (!payload.ok) {
        setMessage(payload.error ?? 'Focused fader failed');
        return;
      }

      if (payload.fader?.gainDbText) {
        setFocusedFaderDrag((current) => (
          current?.active && Math.abs(current.normalized - payload.fader!.normalized) < 0.015
            ? {
                ...current,
                gainDbText: payload.fader?.gainDbText ?? current.gainDbText,
              }
            : current
        ));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Focused fader failed');
    }
  };

  const queueFocusedFaderPosition = (normalized: number) => {
    const previousSent = focusedFaderLastSentNormalizedRef.current;

    if (previousSent !== null && Math.abs(previousSent - normalized) < 1 / 0x3fff) {
      return;
    }

    focusedFaderPendingNormalizedRef.current = normalized;

    if (focusedFaderSendAnimationRef.current !== null) {
      return;
    }

    focusedFaderSendAnimationRef.current = window.requestAnimationFrame(() => {
      focusedFaderSendAnimationRef.current = null;
      const pendingNormalized = focusedFaderPendingNormalizedRef.current;
      focusedFaderPendingNormalizedRef.current = null;

      if (pendingNormalized === null) {
        return;
      }

      focusedFaderLastSentNormalizedRef.current = pendingNormalized;
      void sendFocusedFaderPosition(pendingNormalized, 'move');
    });
  };

  const beginFocusedFaderDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!state?.focusedTrackReady) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const normalized = getFocusedFaderNormalizedFromClientX(event.clientX);

    if (normalized === null) {
      return;
    }

    focusedFaderLastSentNormalizedRef.current = normalized;
    setFocusedFaderDrag({
      active: true,
      normalized,
      gainDbText: state.focusedTrack.fader.gainDbText,
    });
    void sendFocusedFaderPosition(normalized, 'start');
  };

  const updateFocusedFaderDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!focusedFaderDrag?.active) {
      return;
    }

    event.preventDefault();

    const normalized = getFocusedFaderNormalizedFromClientX(event.clientX);

    if (normalized === null) {
      return;
    }

    setFocusedFaderDrag((current) => (
      current?.active
        ? {
            ...current,
            normalized,
          }
        : current
    ));
    queueFocusedFaderPosition(normalized);
  };

  const endFocusedFaderDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!focusedFaderDrag?.active) {
      return;
    }

    event.preventDefault();

    if (focusedFaderSendAnimationRef.current !== null) {
      window.cancelAnimationFrame(focusedFaderSendAnimationRef.current);
      focusedFaderSendAnimationRef.current = null;
    }

    const pendingNormalized = focusedFaderPendingNormalizedRef.current;
    focusedFaderPendingNormalizedRef.current = null;
    const normalized = getFocusedFaderNormalizedFromClientX(event.clientX) ?? pendingNormalized ?? focusedFaderDrag.normalized;
    focusedFaderLastSentNormalizedRef.current = normalized;
    void sendFocusedFaderPosition(normalized, 'end').finally(() => {
      void fetchState();
    });
    setFocusedFaderDrag(null);
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
    const isCountInEnabled = trackingUiState.countIn;

    switch (commandId) {
      case 'playStop':
        return renderMaskIcon(playSvg, 'luna-icon-play');
      case 'stop':
        return renderMaskIcon(stopSvg);
      case 'record':
        return renderMaskIcon(recordSvg, 'luna-icon-record');
      case 'loop':
        return renderMaskIcon(loopSvg, 'luna-icon-loop');
      case 'returnToZero':
        return renderMaskIcon(rtzSvg, 'luna-icon-wide');
      case 'goToEnd':
        return renderMaskIcon(gteSvg);
      case 'click':
        return renderMaskIcon(clickSvg);
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
        return renderMaskIcon(undoSvg);
      case 'redo':
        return renderMaskIcon(redoSvg);
      default:
        return renderCommandIcon(commandVisuals[commandId]?.icon ?? 'view');
    }
  };

  const renderCommandButton = (command: CommandDefinition, className: string) => {
    const visual = commandVisuals[command.id];
    const isPressed = flashCommand === command.id;
    const isDisabled = busyCommand !== null || Boolean(command.mcuControl && !state?.focusedTrackReady);
    const isTrackingButton = true;
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
          disabled={isDisabled}
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
        disabled={isDisabled}
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

  const getFocusedStripButtonAsset = (
    position: FocusedStripButtonPosition,
    options: {
      isActive: boolean;
      isPressed: boolean;
      isNavigationMode: boolean;
    },
  ): string => {
    if (options.isNavigationMode) {
      if (!options.isPressed) {
        return focusedSwitchNeutral;
      }

      return position === 'record' || position === 'version' ? focusedSwitchBlue : focusedSwitchRed;
    }

    switch (position) {
      case 'record':
        return options.isActive || options.isPressed ? focusedSwitchRed : focusedSwitchNeutral;
      case 'solo':
        return options.isActive || options.isPressed ? focusedSwitchYellow : focusedSwitchNeutral;
      case 'mute':
        return options.isActive || options.isPressed ? focusedSwitchBlue : focusedSwitchNeutral;
      case 'version':
        return focusedSwitchBlue;
      default:
        return focusedSwitchNeutral;
    }
  };

  const handleFocusedStripVersionAction = async (commandId: CommandId) => {
    const command = commandLookup.get(commandId);

    setFocusedStripVersionPanelOpen(false);
    setFocusedStripVersionPressed(false);

    if (!command) {
      return;
    }

    await sendCommand(command);
  };

  const renderFocusedChannelStrip = () => {
    const focusedTrack = state?.focusedTrack;
    const faderPosition = clamp01(
      focusedFaderDrag?.active
        ? focusedFaderDrag.normalized
        : focusedTrack?.fader.normalized ?? 0.5,
    );
    const meterLevel = clamp01(focusedTrack?.meter.normalized);
    const hasPeakHoldLamp = focusedTrack?.meter.clip === true;
    const liveMeterSegments = Math.max(0, Math.min(31, Math.round(meterLevel * 31)));
    const trackName = focusedTrack?.name ?? (state?.focusedTrackReady ? 'TRACK' : 'NO TRACK');
    const faderGainDb = formatFocusedFaderGainDb(
      focusedFaderDrag?.active
        ? focusedFaderDrag.gainDbText ?? focusedTrack?.fader.gainDbText
        : focusedTrack?.fader.gainDbText,
    );
    const buttonSpecs = focusedStripNavMode ? focusedStripNavigationButtons : focusedStripNormalButtons;
    const faderCapLeft =
      focusedFaderTrackLeftPercent -
      focusedFaderCapWidthPercent / 2 +
      faderPosition * focusedFaderTrackWidthPercent;
    const faderCapTop =
      focusedFaderTrackTopPercent +
      focusedFaderTrackHeightPercent / 2 -
      focusedFaderCapHeightPercent / 2;
    const stripStyle = {
      '--focused-fader-left': `${faderCapLeft}%`,
      '--focused-fader-top': `${faderCapTop}%`,
      '--focused-meter-level': `${meterLevel * 100}%`,
    } as CSSProperties;

    const isNormalButtonActive = (position: FocusedStripButtonPosition): boolean => {
      if (focusedStripNavMode) {
        return false;
      }

      switch (position) {
        case 'record':
          return focusedTrack?.arm === true;
        case 'solo':
          return focusedTrack?.solo === true;
        case 'mute':
          return focusedTrack?.mute === true;
        default:
          return false;
      }
    };

    return (
      <div
        className={`focused-channel-strip ${focusedStripNavMode ? 'is-navigation-mode' : ''}`}
        style={stripStyle}
        aria-label="Focused channel strip"
      >
        <img src={focusedTrackPanel} alt="" className="focused-strip-panel focused-strip-track-panel" aria-hidden="true" />
        <img src={focusedFaderPanel} alt="" className="focused-strip-panel focused-strip-fader-panel" aria-hidden="true" />
        <div className="focused-strip-buttons" aria-label="Focused channel controls">
          {buttonSpecs.map((spec) => {
            const command = commandLookup.get(spec.commandId);

            if (!command) {
              return null;
            }

            const isDisabled =
              busyCommand !== null ||
              Boolean(command.mcuControl && !state?.focusedTrackReady) ||
              Boolean(command.mcuNavigation && !state?.midiConnected);
            const isPressed = flashCommand === command.id;
            const isActive = isNormalButtonActive(spec.position);
            const isVersionMenuTrigger = !focusedStripNavMode && spec.position === 'version';
            const showPressedState = isVersionMenuTrigger ? false : isPressed;
            const navPressedState = focusedStripNavMode ? isPressed : showPressedState;
            const buttonAsset = getFocusedStripButtonAsset(spec.position, {
              isActive,
              isPressed: navPressedState,
              isNavigationMode: focusedStripNavMode,
            });

            return (
              <button
                key={spec.position}
                className={`focused-strip-button focused-strip-button-${spec.position} ${navPressedState ? 'is-pressed' : ''} ${isActive ? 'is-active' : ''} ${isVersionMenuTrigger ? 'is-primary-action' : ''}`}
                disabled={isDisabled}
                onClick={() => {
                  if (isVersionMenuTrigger) {
                    setFocusedStripVersionPanelOpen((current) => !current);
                    setFocusedStripVersionPressed(false);
                    return;
                  }

                  void sendCommand(command);
                }}
                type="button"
                aria-label={command.label}
                aria-pressed={!focusedStripNavMode && spec.position !== 'version' ? isActive : undefined}
                title={command.label}
              >
                <img src={buttonAsset} alt="" aria-hidden="true" />
                <span className="focused-strip-button-icon">
                  {renderFocusedStripButtonIcon(spec.icon)}
                </span>
              </button>
            );
          })}
        </div>

        <button
          className="focused-strip-scribble"
          onClick={() => setFocusedStripNavMode((current) => !current)}
          type="button"
          aria-label="Toggle focused channel navigation"
          aria-pressed={focusedStripNavMode}
        >
          <img src={focusedScribbleStrip} alt="" aria-hidden="true" />
          <span className="focused-strip-fader-gain">{faderGainDb}</span>
          <span className="focused-strip-name">{trackName}</span>
        </button>

        <img src={focusedFaderTrack} alt="" className="focused-strip-fader-track" aria-hidden="true" />
        <img src={focusedFaderCap} alt="" className="focused-strip-fader-cap" aria-hidden="true" />
        <div
          className="focused-strip-fader-hit-zone"
          ref={focusedFaderHitZoneRef}
          onPointerDown={beginFocusedFaderDrag}
          onPointerMove={updateFocusedFaderDrag}
          onPointerUp={endFocusedFaderDrag}
          onPointerCancel={endFocusedFaderDrag}
          role="slider"
          aria-label="Focused track fader"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(faderPosition * 100)}
          aria-valuetext={faderGainDb}
          aria-disabled={!state?.focusedTrackReady}
          tabIndex={state?.focusedTrackReady ? 0 : -1}
        />

        <div className="focused-strip-meter" aria-hidden="true">
          {useCssFocusedMeterTest ? (
            <span className="focused-strip-meter-css-shell">
              <span className="focused-strip-meter-css-track">
                {Array.from({ length: 32 }, (_, index) => {
                  const isFinalRedSegment = index === 31;
                  const isLiveOn = isFinalRedSegment ? false : index < liveMeterSegments;
                  const isPeakHoldOn = hasPeakHoldLamp && isFinalRedSegment;

                  return (
                    <span
                      key={index}
                      className={`focused-strip-meter-led focused-strip-meter-led-${index + 1} ${isLiveOn ? 'is-live-on' : ''} ${isPeakHoldOn ? 'is-peak-hold-on' : ''}`}
                    />
                  );
                })}
              </span>
            </span>
          ) : (
            <>
              <img src={focusedMeterBg} alt="" className="focused-strip-meter-bg" />
              <span className="focused-strip-meter-active-region">
                <span className="focused-strip-meter-fill-mask">
                  <img src={focusedMeterOn} alt="" className="focused-strip-meter-fill-image" />
                </span>
                <span
                  className={`focused-strip-meter-clip ${hasPeakHoldLamp ? 'is-visible' : ''}`}
                  data-clip-asset={focusedMeterClip}
                />
              </span>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <main className="app-shell">
      <section className={`topbar ${isProductionRemote ? 'production-header' : ''}`}>
        <div className="brand-block">
          <h1>LUNA Companion</h1>
        </div>

      </section>

      <section className={`layout layout-tracking ${isProductionRemote ? 'layout-production' : ''}`}>
        <div className="remote-stage">
          <section className="tab-panel" aria-label="Tracking controls">
            <div className="focused-channel-strip-row">
              {renderFocusedChannelStrip()}
            </div>
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

          {focusedStripVersionPanelOpen && !focusedStripNavMode ? (
            <div
              className="focused-strip-action-sheet-overlay"
              onClick={() => {
                setFocusedStripVersionPanelOpen(false);
                setFocusedStripVersionPressed(false);
              }}
            >
              <div
                className="focused-strip-action-sheet"
                ref={focusedStripActionSheetRef}
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Focused strip actions"
              >
                <button
                  className="focused-strip-action-sheet-close"
                  onClick={() => {
                    setFocusedStripVersionPanelOpen(false);
                    setFocusedStripVersionPressed(false);
                  }}
                  type="button"
                  aria-label="Close focused strip actions"
                >
                  <span aria-hidden="true">X</span>
                </button>
                <div className="focused-strip-action-sheet-actions">
                  {focusedStripVersionPanelCommands.map((commandId) => {
                    const command = commandLookup.get(commandId);

                    if (!command) {
                      return null;
                    }

                    const isDisabled =
                      busyCommand !== null || Boolean(command.mcuControl && !state?.focusedTrackReady);
                    const isPressed = flashCommand === command.id;

                    return (
                      <button
                        key={commandId}
                        className={`focused-strip-action-sheet-button ${isPressed ? 'is-pressed' : ''}`}
                        disabled={isDisabled}
                        onClick={() => void handleFocusedStripVersionAction(commandId)}
                        type="button"
                      >
                        <span className="focused-strip-action-sheet-label">{command.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

        </div>
      </section>

    </main>
  );
};

export default App;
