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
  width: 420,
  height: 620,
};

let tray = null;
let qrWindow = null;
let remoteServer = null;
let isQuitting = false;
let permissionsState = {
  permissionsNoteDismissed: false,
};

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
    'LUNA Studio Remote may need Accessibility, Automation, and Local Network access. If macOS prompts, allow access so keystrokes and network discovery work correctly.',
  updatedAt: new Date().toISOString(),
};

const getStateFilePath = () => path.join(app.getPath('userData'), 'desktop-state.json');
const getIconPath = () => path.join(app.getAppPath(), 'desktop-assets', 'luna-app-icon.png');
const getServerEntryPath = () => path.join(app.getAppPath(), 'dist-server', 'server', 'index.js');
const getWindowHtmlPath = () => path.join(__dirname, 'qr-window.html');

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

  if (typeof startRemoteServer !== 'function') {
    throw new Error('Bundled server entry does not export startRemoteServer');
  }

  remoteServer = await startRemoteServer({
    host: DEFAULT_ENV.HOST,
    port: selectedPort,
    logger: createLogger(),
  });

  const remoteUrl = buildLanUrl(remoteServer.port) ?? remoteServer.lanUrls[0] ?? null;
  const portMessage =
    remoteServer.port === DEFAULT_PORT
      ? null
      : `Port ${DEFAULT_PORT} was busy, so LUNA Studio Remote is using port ${remoteServer.port}.`;

  const qrCodeDataUrl = remoteUrl
    ? await QRCode.toDataURL(remoteUrl, {
        margin: 1,
        width: 260,
        color: {
          dark: '#0a0a0a',
          light: '#f6f2e9',
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
};

const stopServer = async () => {
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
    resizable: false,
    fullscreenable: false,
    title: 'LUNA Studio Remote',
    autoHideMenuBar: true,
    backgroundColor: '#111111',
    icon: fs.existsSync(getIconPath()) ? getIconPath() : undefined,
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

  tray.setToolTip(runtimeStatus.remoteUrl ?? 'LUNA Studio Remote');
  tray.setContextMenu(Menu.buildFromTemplate(template));
};

const createTray = () => {
  const image = fs.existsSync(getIconPath()) ? nativeImage.createFromPath(getIconPath()) : nativeImage.createEmpty();
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
    message: 'LUNA Studio Remote could not start its bundled server.',
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
      message: 'LUNA Studio Remote permissions',
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
