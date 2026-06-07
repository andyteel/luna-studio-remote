const statusTitle = document.getElementById('status-title');
const statusDetail = document.getElementById('status-detail');
const remoteUrl = document.getElementById('remote-url');
const portMessage = document.getElementById('port-message');
const qrImage = document.getElementById('qr-image');
const qrPlaceholder = document.getElementById('qr-placeholder');
const permissionsNote = document.getElementById('permissions-note');
const statusOrb = document.getElementById('status-orb');
const toUpperUi = (value) => value.toUpperCase();

const actionButtons = {
  copyUrl: document.getElementById('copy-url'),
  openLocal: document.getElementById('open-local'),
  restartServer: document.getElementById('restart-server'),
  stopServer: document.getElementById('stop-server'),
  startServer: document.getElementById('start-server'),
  dismissNote: document.getElementById('dismiss-note'),
  quitApp: document.getElementById('quit-app'),
};

const setBusy = (busy) => {
  Object.values(actionButtons).forEach((button) => {
    if (button) {
      button.disabled = busy;
    }
  });
};

const renderStatus = (status) => {
  statusTitle.textContent = toUpperUi(status.title);
  statusDetail.textContent = toUpperUi(status.detail);
  remoteUrl.textContent = status.remoteUrl ?? 'No LAN IP detected yet';
  statusOrb.classList.toggle('online', status.state === 'running');
  statusOrb.classList.toggle('offline', status.state !== 'running');

  if (status.portMessage) {
    portMessage.textContent = status.portMessage;
    portMessage.classList.remove('hidden');
  } else {
    portMessage.textContent = '';
    portMessage.classList.add('hidden');
  }

  if (status.qrCodeDataUrl) {
    qrImage.src = status.qrCodeDataUrl;
    qrImage.classList.remove('hidden');
    qrPlaceholder.classList.add('hidden');
  } else {
    qrImage.removeAttribute('src');
    qrImage.classList.add('hidden');
    qrPlaceholder.classList.remove('hidden');
    qrPlaceholder.textContent =
      status.state === 'stopped'
        ? 'SERVER STOPPED.'
        : status.state === 'error'
          ? 'SERVER ERROR.'
          : 'WAITING FOR LAN URL…';
  }

  if (status.showPermissionsNote) {
    permissionsNote.classList.remove('hidden');
  } else {
    permissionsNote.classList.add('hidden');
  }

  actionButtons.copyUrl.disabled = !status.remoteUrl;
  actionButtons.openLocal.disabled = !status.localUrl;
  actionButtons.stopServer.disabled = status.state !== 'running';
  actionButtons.startServer.disabled = status.state !== 'stopped';
  actionButtons.startServer.classList.toggle('hidden', status.state !== 'stopped');
  actionButtons.stopServer.classList.toggle('hidden', status.state === 'stopped');
};

const performAction = async (action) => {
  setBusy(true);

  try {
    const nextStatus = await window.lunaDesktop.performAction(action);
    renderStatus(nextStatus);
  } finally {
    setBusy(false);
  }
};

actionButtons.copyUrl.addEventListener('click', () => {
  void performAction('copy-url');
});

actionButtons.openLocal.addEventListener('click', () => {
  void performAction('open-local');
});

actionButtons.restartServer.addEventListener('click', () => {
  void performAction('restart-server');
});

actionButtons.stopServer.addEventListener('click', () => {
  void performAction('stop-server');
});

actionButtons.startServer.addEventListener('click', () => {
  void performAction('start-server');
});

actionButtons.dismissNote.addEventListener('click', () => {
  void performAction('dismiss-permissions-note');
});

actionButtons.quitApp.addEventListener('click', () => {
  void performAction('quit-app');
});

window.lunaDesktop.onStatusChange((status) => {
  renderStatus(status);
});

void window.lunaDesktop.getStatus().then(renderStatus);
