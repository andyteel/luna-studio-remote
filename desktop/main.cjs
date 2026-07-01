const { app, BrowserWindow, Menu, Tray, clipboard, dialog, ipcMain, nativeImage, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const QRCode = require('qrcode');

const DEFAULT_PORT = 3000;
const DEFAULT_ENV = {
  NODE_ENV: 'production',
  TEST_MODE: 'false',
  ENABLE_KEYSTROKES: 'true',
  LUNA_APP_NAME: 'LUNA',
  PORT: String(DEFAULT_PORT),
  HOST: '0.0.0.0',
};

const WINDOW_BOUNDS = {
  width: 680,
  height: 720,
};

let tray = null;
let qrWindow = null;
let remoteServer = null;
let isQuitting = false;
let midiStatusTimer = null;
let lastMidiActionMessage = null;
const MIDI_ACTION_MESSAGE_VISIBLE_MS = 15000;
let permissionsState = {
  permissionsNoteDismissed: false,
};

const createDefaultMcuDiagnostics = () => ({
  rawMessageCount: 0,
  transportMessageCount: 0,
  lcdMessageCount: 0,
  selectMessageCount: 0,
  focusedTrackFeedbackCount: 0,
  lastRawMessageAt: null,
  lastTransportFeedbackAt: null,
  lastLcdFeedbackAt: null,
  lastSelectFeedbackAt: null,
  lastFocusedTrackFeedbackAt: null,
  recentMessages: [],
});

const createDefaultMidiStatus = () => ({
  state: 'unknown',
  title: 'MIDI unavailable',
  detail: 'Start the server to check MIDI setup.',
  midiMode: 'iac',
  expectedIacInputName: 'LUNA Companion From LUNA',
  expectedIacOutputName: 'LUNA Companion To LUNA',
  expectedIacInputFound: false,
  expectedIacOutputFound: false,
  midiConnected: false,
  mcuReceiving: false,
  focusedTrackSelected: false,
  focusedTrackNamed: false,
  focusedTrackHydrated: false,
  focusedTrackReady: false,
  selectedInputName: null,
  selectedOutputName: null,
  inputPorts: [],
  outputPorts: [],
  setupWarnings: ['Start the server to check MIDI setup.'],
  lastMessageAt: null,
  focusedTrackName: null,
  focusedTrackFallbackName: null,
  mcuDiagnostics: createDefaultMcuDiagnostics(),
  actionMessage: null,
  checkedAt: null,
});

let runtimeStatus = {
  state: 'starting',
  title: 'Starting server…',
  detail: 'Preparing the bundled production remote.',
  remoteUrl: null,
  localUrl: null,
  port: null,
  qrCodeDataUrl: null,
  portMessage: null,
  showPermissionsNote: true,
  permissionsNote:
    'Luna Companion may need Accessibility, Automation, and Local Network access. If macOS prompts, allow access so keystrokes and network discovery work correctly.',
  midi: createDefaultMidiStatus(),
  updatedAt: new Date().toISOString(),
};

const getStateFilePath = () => path.join(app.getPath('userData'), 'desktop-state.json');
const getAppIconPath = () => path.join(app.getAppPath(), 'desktop-assets', 'luna-app-icon.png');
const getTrayIconPath = () => path.join(app.getAppPath(), 'desktop-assets', 'lsr-tray-icon.png');
const getServerEntryPath = () => path.join(app.getAppPath(), 'dist-server', 'server', 'index.js');
const getWindowHtmlPath = () => path.join(__dirname, 'qr-window.html');

const createTrayImage = () => {
  if (!fs.existsSync(getTrayIconPath())) {
    return nativeImage.createEmpty();
  }

  const trayImage = nativeImage.createFromPath(getTrayIconPath());

  if (trayImage.isEmpty()) {
    return nativeImage.createEmpty();
  }

  return trayImage.resize({
    height: 18,
    quality: 'best',
  });
};

const buildLanUrl = (port) => {
  const interfaces = os.networkInterfaces();

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) {
        continue;
      }

      if (name.startsWith('en') || name.startsWith('bridge') || name.startsWith('Ethernet')) {
        return `http://${address.address}:${port}`;
      }
    }
  }

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4' && !address.internal) {
        return `http://${address.address}:${port}`;
      }
    }
  }

  return null;
};

const isPortAvailable = (port) =>
  new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port, '0.0.0.0');
  });

const findAvailablePort = async (startPort) => {
  for (let port = startPort; port < startPort + 20; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`Unable to find an available port starting at ${startPort}`);
};

const persistPermissionsState = async () => {
  await fsp.mkdir(app.getPath('userData'), { recursive: true });
  await fsp.writeFile(getStateFilePath(), JSON.stringify(permissionsState, null, 2), 'utf8');
};

const loadPermissionsState = async () => {
  try {
    const saved = await fsp.readFile(getStateFilePath(), 'utf8');
    permissionsState = {
      ...permissionsState,
      ...JSON.parse(saved),
    };
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.error('Failed to load desktop state');
      console.error(error);
    }
  }
};

const syncPermissionsNote = () => {
  runtimeStatus = {
    ...runtimeStatus,
    showPermissionsNote: !permissionsState.permissionsNoteDismissed,
  };
};

const broadcastStatus = () => {
  syncPermissionsNote();

  if (qrWindow && !qrWindow.isDestroyed()) {
    qrWindow.webContents.send('server-status-changed', runtimeStatus);
  }

  refreshTrayMenu();
};

const updateStatus = (partial) => {
  runtimeStatus = {
    ...runtimeStatus,
    ...partial,
    updatedAt: new Date().toISOString(),
  };
  broadcastStatus();
};

const formatFocusedTrackFallbackName = (focusedTrack) => {
  const index = focusedTrack?.index;

  if (!Number.isInteger(index) || index < 0) {
    return null;
  }

  return `Track ${index + 1}`;
};

const getMidiStatusTitle = (state) => {
  if (state.focusedTrackHydrated) {
    return state.focusedTrack?.name ? `Focused Track: ${state.focusedTrack.name}` : 'Focused track hydrated';
  }

  if (state.focusedTrackSelected) {
    const fallbackName = formatFocusedTrackFallbackName(state.focusedTrack);
    return fallbackName ? `Focused track selected: ${fallbackName}` : 'Focused track selected';
  }

  if (state.mcuReceiving) {
    return 'LUNA is sending MCU feedback';
  }

  if (state.midiConnected) {
    return 'Ports connected';
  }

  if (!state.expectedIacInputFound || !state.expectedIacOutputFound) {
    return 'Required IAC ports were not found';
  }

  return 'MIDI unavailable';
};

const getMidiStatusState = (state) => {
  if (state.focusedTrackReady) {
    return 'ready';
  }

  if (state.mcuReceiving) {
    return 'receiving';
  }

  if (state.midiConnected) {
    return 'connected';
  }

  if (!state.expectedIacInputFound || !state.expectedIacOutputFound) {
    return 'setup-required';
  }

  return 'unavailable';
};

const getMidiStatusDetail = (state) => {
  if (state.focusedTrackHydrated) {
    return 'Focused-track controls are available.';
  }

  if (state.focusedTrackSelected) {
    return 'Track name pending from LUNA. Focused-track controls are available.';
  }

  if (state.mcuReceiving) {
    if (state.mcuDiagnostics && !state.mcuDiagnostics.lastLcdFeedbackAt && !state.mcuDiagnostics.lastSelectFeedbackAt) {
      return 'MCU feedback is arriving, but no LCD/select focused-track feedback has been seen yet.';
    }

    return 'Select a track in LUNA to enable focused-track controls.';
  }

  if (state.midiConnected) {
    return 'Waiting for MCU feedback from LUNA. Press Play/Stop or select a track in LUNA.';
  }

  if (!state.expectedIacInputFound || !state.expectedIacOutputFound) {
    return 'Required IAC ports were not found.';
  }

  return state.setupWarnings?.[0] ?? 'MIDI setup has not been verified yet.';
};

const normalizeMidiPortName = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const withoutIacDriverPrefix = (name) => name.replace(/^iac driver\s+/, '');

const midiPortNameMatches = (candidateName, expectedName) => {
  if (!candidateName) {
    return false;
  }

  const normalizedCandidateName = normalizeMidiPortName(candidateName);
  const normalizedExpectedName = normalizeMidiPortName(expectedName);
  const candidateNames = [
    normalizedCandidateName,
    withoutIacDriverPrefix(normalizedCandidateName),
  ];

  return candidateNames.some((name) => name === normalizedExpectedName || name.includes(normalizedExpectedName));
};

const hasExpectedPort = (ports, selectedName, expectedName) => {
  return (
    midiPortNameMatches(selectedName, expectedName) ||
    (Array.isArray(ports) && ports.some((port) => midiPortNameMatches(port.name, expectedName)))
  );
};

const getMidiSetupWarnings = (state) => {
  const expectedIacInputFound = hasExpectedPort(
    state.mcu?.inputPorts,
    state.mcu?.selectedInputName,
    state.expectedIacInputName,
  ) || Boolean(state.expectedIacInputFound);
  const expectedIacOutputFound = hasExpectedPort(
    state.mcu?.outputPorts,
    state.mcu?.selectedOutputName,
    state.expectedIacOutputName,
  ) || Boolean(state.expectedIacOutputFound);

  if (!expectedIacInputFound || !expectedIacOutputFound) {
    return [
      `Required IAC ports were not found. Expected input: ${state.expectedIacInputName}. Expected output: ${state.expectedIacOutputName}.`,
    ];
  }

  if (!state.midiConnected) {
    return ['MIDI ports are not connected yet.'];
  }

  if (!state.mcuReceiving) {
    return ['Waiting for MCU feedback from LUNA. Press Play/Stop or select a track in LUNA.'];
  }

  if (!state.focusedTrackSelected) {
    if (state.mcuDiagnostics && !state.mcuDiagnostics.lastLcdFeedbackAt && !state.mcuDiagnostics.lastSelectFeedbackAt) {
      return ['MCU feedback is arriving, but no LCD/select focused-track feedback has been received since server start.'];
    }

    return ['Select a track in LUNA to enable focused-track controls.'];
  }

  if (!state.focusedTrackNamed) {
    return ['Track name pending from LUNA. Focused-track controls are available.'];
  }

  return [];
};

const setMidiActionMessage = (message) => {
  if (!message) {
    lastMidiActionMessage = null;
    return;
  }

  lastMidiActionMessage = {
    message,
    createdAtMs: Date.now(),
  };
};

const getVisibleMidiActionMessage = () => {
  if (!lastMidiActionMessage) {
    return null;
  }

  if (Date.now() - lastMidiActionMessage.createdAtMs > MIDI_ACTION_MESSAGE_VISIBLE_MS) {
    lastMidiActionMessage = null;
    return null;
  }

  return lastMidiActionMessage.message;
};

const withMidiActionMessage = (midi) => ({
  ...midi,
  actionMessage: getVisibleMidiActionMessage(),
});

const toMidiStatus = (state) => {
  const inputPorts = Array.isArray(state.mcu?.inputPorts) ? state.mcu.inputPorts : [];
  const outputPorts = Array.isArray(state.mcu?.outputPorts) ? state.mcu.outputPorts : [];
  const selectedInputName = state.mcu?.selectedInputName ?? null;
  const selectedOutputName = state.mcu?.selectedOutputName ?? null;
  const expectedIacInputFound =
    Boolean(state.expectedIacInputFound) ||
    hasExpectedPort(inputPorts, selectedInputName, state.expectedIacInputName);
  const expectedIacOutputFound =
    Boolean(state.expectedIacOutputFound) ||
    hasExpectedPort(outputPorts, selectedOutputName, state.expectedIacOutputName);
  const normalizedState = {
    ...state,
    expectedIacInputFound,
    expectedIacOutputFound,
  };

  return {
    state: getMidiStatusState(normalizedState),
    title: getMidiStatusTitle(normalizedState),
    detail: getMidiStatusDetail(normalizedState),
    midiMode: state.midiMode,
    expectedIacInputName: state.expectedIacInputName,
    expectedIacOutputName: state.expectedIacOutputName,
    expectedIacInputFound,
    expectedIacOutputFound,
    midiConnected: Boolean(state.midiConnected),
    mcuReceiving: Boolean(state.mcuReceiving),
    focusedTrackSelected: Boolean(state.focusedTrackSelected),
    focusedTrackNamed: Boolean(state.focusedTrackNamed),
    focusedTrackHydrated: Boolean(state.focusedTrackHydrated),
    focusedTrackReady: Boolean(state.focusedTrackReady),
    selectedInputName,
    selectedOutputName,
    inputPorts,
    outputPorts,
    setupWarnings: getMidiSetupWarnings(normalizedState),
    lastMessageAt: state.mcu?.lastMessageAt ?? null,
    focusedTrackName: state.focusedTrack?.name ?? null,
    focusedTrackFallbackName: formatFocusedTrackFallbackName(state.focusedTrack),
    mcuDiagnostics: state.mcuDiagnostics ?? createDefaultMcuDiagnostics(),
    checkedAt: new Date().toISOString(),
  };
};

const fetchRemoteState = async () => {
  if (!runtimeStatus.localUrl) {
    return null;
  }

  const response = await fetch(`${runtimeStatus.localUrl}/api/state`);

  if (!response.ok) {
    throw new Error(`State request failed with HTTP ${response.status}`);
  }

  return response.json();
};

const refreshMidiStatus = async () => {
  if (runtimeStatus.state !== 'running') {
    updateStatus({
      midi: {
        ...createDefaultMidiStatus(),
        title: runtimeStatus.state === 'stopped' ? 'Server stopped' : 'MIDI unavailable',
        detail: runtimeStatus.state === 'stopped' ? 'Start the server to check MIDI setup.' : 'Waiting for server.',
      },
    });
    return;
  }

  try {
    const state = await fetchRemoteState();

    if (!state) {
      return;
    }

    updateStatus({
      midi: withMidiActionMessage(toMidiStatus(state)),
    });
  } catch (error) {
    updateStatus({
      midi: {
        ...runtimeStatus.midi,
        state: 'unavailable',
        title: 'MIDI status unavailable',
        detail: error instanceof Error ? error.message : 'Unable to check MIDI setup.',
        checkedAt: new Date().toISOString(),
      },
    });
  }
};

const startMidiStatusPolling = () => {
  if (midiStatusTimer) {
    clearInterval(midiStatusTimer);
  }

  void refreshMidiStatus();
  midiStatusTimer = setInterval(() => {
    void refreshMidiStatus();
  }, 3000);
};

const stopMidiStatusPolling = () => {
  if (midiStatusTimer) {
    clearInterval(midiStatusTimer);
    midiStatusTimer = null;
  }
};

const postRemoteAction = async (endpoint) => {
  await ensureServerRunning();

  if (!runtimeStatus.localUrl) {
    throw new Error('Local server URL is not available');
  }

  const response = await fetch(`${runtimeStatus.localUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const payload = await response.json().catch(() => ({}));

  if (payload.state) {
    const actionMessage = payload.message ?? payload.error ?? null;
    setMidiActionMessage(actionMessage);
    updateStatus({
      midi: withMidiActionMessage(toMidiStatus(payload.state)),
    });
  } else {
    await refreshMidiStatus();
  }

  return {
    ok: response.ok && payload.ok !== false,
    payload,
  };
};

const createLogger = () => ({
  log: (...args) => console.log('[desktop-server]', ...args),
  error: (...args) => console.error('[desktop-server]', ...args),
});

const startServer = async () => {
  updateStatus({
    state: 'starting',
    title: 'Starting server…',
    detail: 'Launching the bundled production server.',
    qrCodeDataUrl: null,
    midi: {
      ...createDefaultMidiStatus(),
      title: 'Checking MIDI setup',
      detail: 'Waiting for the server to report MIDI status.',
    },
  });

  process.env.NODE_ENV = DEFAULT_ENV.NODE_ENV;
  process.env.TEST_MODE = DEFAULT_ENV.TEST_MODE;
  process.env.ENABLE_KEYSTROKES = DEFAULT_ENV.ENABLE_KEYSTROKES;
  process.env.LUNA_APP_NAME = DEFAULT_ENV.LUNA_APP_NAME;
  process.env.HOST = DEFAULT_ENV.HOST;

  const selectedPort = await findAvailablePort(DEFAULT_PORT);
  process.env.PORT = String(selectedPort);

  const moduleUrl = pathToFileURL(getServerEntryPath()).href;
  const serverModule = await import(moduleUrl);
  const { startRemoteServer } = serverModule;
  const logger = createLogger();

  if (typeof startRemoteServer !== 'function') {
    throw new Error('Bundled server entry does not export startRemoteServer');
  }

  logger.log('Luna Companion Remote Server');
  remoteServer = await startRemoteServer({
    host: DEFAULT_ENV.HOST,
    port: selectedPort,
    logger,
  });

  const remoteUrl = buildLanUrl(remoteServer.port) ?? remoteServer.lanUrls[0] ?? null;
  const portMessage =
    remoteServer.port === DEFAULT_PORT
      ? null
      : `Port ${DEFAULT_PORT} was busy, so Luna Companion is using port ${remoteServer.port}.`;

  const qrCodeDataUrl = remoteUrl
    ? await QRCode.toDataURL(remoteUrl, {
        margin: 1,
        width: 260,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
    : null;

  updateStatus({
    state: 'running',
    title: 'Server running',
    detail: remoteUrl
      ? 'Scan with your phone on the same Wi-Fi network.'
      : 'The server is running, but no LAN IP address was detected yet.',
    remoteUrl,
    localUrl: remoteServer.localUrl,
    port: remoteServer.port,
    portMessage,
    qrCodeDataUrl,
  });
  startMidiStatusPolling();
};

const stopServer = async () => {
  stopMidiStatusPolling();

  if (!remoteServer) {
    updateStatus({
      state: 'stopped',
      title: 'Server stopped',
      detail: 'The production server is not running.',
      remoteUrl: null,
      localUrl: null,
      port: null,
      qrCodeDataUrl: null,
      portMessage: null,
      midi: {
        ...createDefaultMidiStatus(),
        title: 'Server stopped',
        detail: 'Start the server to check MIDI setup.',
      },
    });
    return;
  }

  updateStatus({
    state: 'stopping',
    title: 'Stopping server…',
    detail: 'Shutting down the bundled production server.',
  });

  const serverToStop = remoteServer;
  remoteServer = null;
  await serverToStop.stop();

  updateStatus({
    state: 'stopped',
    title: 'Server stopped',
    detail: 'The production server is not running.',
    remoteUrl: null,
    localUrl: null,
    port: null,
    qrCodeDataUrl: null,
    portMessage: null,
    midi: {
      ...createDefaultMidiStatus(),
      title: 'Server stopped',
      detail: 'Start the server to check MIDI setup.',
    },
  });
};

const restartServer = async () => {
  await stopServer();
  await startServer();
};

const ensureServerRunning = async () => {
  if (remoteServer) {
    return;
  }

  await startServer();
};

const openRemoteLocally = async () => {
  await ensureServerRunning();

  if (runtimeStatus.localUrl) {
    await shell.openExternal(runtimeStatus.localUrl);
  }
};

const copyRemoteUrl = () => {
  if (runtimeStatus.remoteUrl) {
    clipboard.writeText(runtimeStatus.remoteUrl);
  }
};

const createQrWindow = () => {
  if (qrWindow && !qrWindow.isDestroyed()) {
    return qrWindow;
  }

  qrWindow = new BrowserWindow({
    width: WINDOW_BOUNDS.width,
    height: WINDOW_BOUNDS.height,
    minWidth: WINDOW_BOUNDS.width,
    minHeight: WINDOW_BOUNDS.height,
    resizable: false,
    fullscreenable: false,
    title: 'Luna Companion',
    autoHideMenuBar: true,
    backgroundColor: '#676e72',
    icon: fs.existsSync(getAppIconPath()) ? getAppIconPath() : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  qrWindow.on('closed', () => {
    qrWindow = null;
  });

  void qrWindow.loadFile(getWindowHtmlPath());
  return qrWindow;
};

const showQrWindow = () => {
  const window = createQrWindow();
  window.show();
  window.focus();
};

const refreshTrayMenu = () => {
  if (!tray) {
    return;
  }

  const isRunning = runtimeStatus.state === 'running';
  const hasRemoteUrl = Boolean(runtimeStatus.remoteUrl);

  const template = [
    {
      label: 'Show QR Code',
      click: showQrWindow,
    },
    {
      label: 'Open Remote Locally',
      enabled: isRunning,
      click: () => {
        void openRemoteLocally();
      },
    },
    {
      label: 'Copy Remote URL',
      enabled: hasRemoteUrl,
      click: copyRemoteUrl,
    },
    { type: 'separator' },
    {
      label: 'Restart Server',
      click: () => {
        void restartServer().catch(handleRuntimeError);
      },
    },
    {
      label: 'Stop Server',
      enabled: isRunning,
      click: () => {
        void stopServer().catch(handleRuntimeError);
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ];

  tray.setToolTip(runtimeStatus.remoteUrl ?? 'Luna Companion');
  tray.setContextMenu(Menu.buildFromTemplate(template));
};

const createTray = () => {
  const image = createTrayImage();
  tray = new Tray(image);
  tray.on('click', showQrWindow);
  refreshTrayMenu();
};

const handleRuntimeError = async (error) => {
  console.error(error);
  updateStatus({
    state: 'error',
    title: 'Server error',
    detail: error instanceof Error ? error.message : String(error),
    remoteUrl: null,
    localUrl: null,
    port: null,
    qrCodeDataUrl: null,
  });

  await dialog.showMessageBox({
    type: 'error',
    message: 'Luna Companion could not start its bundled server.',
    detail: error instanceof Error ? error.message : String(error),
  });
};

ipcMain.handle('desktop:get-status', async () => runtimeStatus);

ipcMain.handle('desktop:perform-action', async (_event, action) => {
  if (action === 'copy-url') {
    copyRemoteUrl();
    return runtimeStatus;
  }

  if (action === 'open-local') {
    await openRemoteLocally();
    return runtimeStatus;
  }

  if (action === 'restart-server') {
    await restartServer();
    return runtimeStatus;
  }

  if (action === 'stop-server') {
    await stopServer();
    return runtimeStatus;
  }

  if (action === 'start-server') {
    await ensureServerRunning();
    return runtimeStatus;
  }

  if (action === 'dismiss-permissions-note') {
    permissionsState.permissionsNoteDismissed = true;
    await persistPermissionsState();
    broadcastStatus();
    return runtimeStatus;
  }

  if (action === 'open-audio-midi-setup') {
    await postRemoteAction('/api/open-audio-midi-setup');
    return runtimeStatus;
  }

  if (action === 'refresh-midi') {
    await postRemoteAction('/api/midi/refresh');
    return runtimeStatus;
  }

  if (action === 'test-midi') {
    await postRemoteAction('/api/midi/test');
    return runtimeStatus;
  }

  if (action === 'quit-app') {
    isQuitting = true;
    app.quit();
    return runtimeStatus;
  }

  throw new Error(`Unknown desktop action: ${action}`);
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('activate', () => {
  showQrWindow();
});

app.on('before-quit', (event) => {
  if (!isQuitting) {
    isQuitting = true;
  }

  if (!remoteServer) {
    return;
  }

  event.preventDefault();
  const pendingServer = remoteServer;
  remoteServer = null;

  pendingServer
    .stop()
    .catch((error) => {
      console.error('Failed to stop server during quit');
      console.error(error);
    })
    .finally(() => {
      app.exit(0);
    });
});

app.whenReady().then(async () => {
  await loadPermissionsState();
  syncPermissionsNote();
  createTray();
  createQrWindow();

  if (!permissionsState.permissionsNoteDismissed) {
    await dialog.showMessageBox({
      type: 'info',
      message: 'Luna Companion permissions',
      detail:
        'To control LUNA, macOS may ask for Accessibility, Automation, and Local Network access. Allow these prompts so the remote can send keystrokes and stay reachable on your Wi-Fi network.',
    });
  }

  try {
    await startServer();
  } catch (error) {
    await handleRuntimeError(error);
  }
});
