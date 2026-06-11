const statusTitle = document.getElementById('status-title');
const statusDetail = document.getElementById('status-detail');
const remoteUrl = document.getElementById('remote-url');
const portMessage = document.getElementById('port-message');
const qrImage = document.getElementById('qr-image');
const qrPlaceholder = document.getElementById('qr-placeholder');
const permissionsNote = document.getElementById('permissions-note');
const statusOrb = document.getElementById('status-orb');
const midiStatusOrb = document.getElementById('midi-status-orb');
const midiStatusTitle = document.getElementById('midi-status-title');
const midiStatusDetail = document.getElementById('midi-status-detail');
const midiSetupPanel = document.getElementById('midi-setup-panel');
const midiSetupSummary = document.getElementById('midi-setup-summary');
const midiModeIac = document.getElementById('midi-mode-iac');
const midiModeVirtual = document.getElementById('midi-mode-virtual');
const expectedIacInput = document.getElementById('expected-iac-input');
const expectedIacOutput = document.getElementById('expected-iac-output');
const selectedMidiInput = document.getElementById('selected-midi-input');
const selectedMidiOutput = document.getElementById('selected-midi-output');
const midiWarningBlock = document.getElementById('midi-warning-block');
const midiWarnings = document.getElementById('midi-warnings');
const detectedInputs = document.getElementById('detected-inputs');
const detectedOutputs = document.getElementById('detected-outputs');
const selectedPorts = document.getElementById('selected-ports');
const diagnosticLastRaw = document.getElementById('diag-last-raw');
const diagnosticLastTransport = document.getElementById('diag-last-transport');
const diagnosticLastLcd = document.getElementById('diag-last-lcd');
const diagnosticLastSelect = document.getElementById('diag-last-select');
const diagnosticLastFocused = document.getElementById('diag-last-focused');
const diagnosticCounts = document.getElementById('diag-counts');
const diagnosticRecentMessages = document.getElementById('diag-recent-messages');
const midiActionMessage = document.getElementById('midi-action-message');
const toUpperUi = (value) => String(value ?? '').toUpperCase();
let currentStatus = null;

const actionButtons = {
  copyUrl: document.getElementById('copy-url'),
  openLocal: document.getElementById('open-local'),
  restartServer: document.getElementById('restart-server'),
  stopServer: document.getElementById('stop-server'),
  startServer: document.getElementById('start-server'),
  midiSetup: document.getElementById('midi-setup'),
  closeMidiSetup: document.getElementById('close-midi-setup'),
  openAudioMidiSetup: document.getElementById('open-audio-midi-setup'),
  refreshMidi: document.getElementById('refresh-midi'),
  testMidi: document.getElementById('test-midi'),
  dismissNote: document.getElementById('dismiss-note'),
  quitApp: document.getElementById('quit-app'),
};

const setBusy = (busy) => {
  if (!busy && currentStatus) {
    renderStatus(currentStatus);
    return;
  }

  Object.values(actionButtons).forEach((button) => {
    if (button) {
      button.disabled = busy;
    }
  });
};

const setOrbState = (element, state) => {
  element.classList.toggle('ready', state === 'ready' || state === 'receiving');
  element.classList.toggle('warning', state === 'setup-required' || state === 'connected');
  element.classList.toggle('online', state === 'ready' || state === 'receiving');
  element.classList.toggle('offline', state !== 'ready' && state !== 'receiving' && state !== 'setup-required' && state !== 'connected');
};

const setCheck = (id, state) => {
  const element = document.getElementById(id);
  const dot = element?.querySelector('.status-dot');

  if (!element || !dot) {
    return;
  }

  const ready = state === 'green';

  element.classList.toggle('ready', ready);
  element.classList.toggle('waiting', state === 'yellow');
  element.classList.toggle('error', state === 'red');
  dot.classList.toggle('online', state === 'green');
  dot.classList.toggle('warning', state === 'yellow');
  dot.classList.toggle('offline', state === 'red');
};

const formatPorts = (ports) => {
  if (!Array.isArray(ports) || ports.length === 0) {
    return 'NONE DETECTED';
  }

  return ports.map((port) => port.name ?? port.id).join(', ');
};

const formatDiagnosticTime = (value) => {
  if (!value) {
    return 'NONE';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatRecentMessages = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 'NONE RECEIVED';
  }

  return messages
    .slice(0, 6)
    .map((message) => {
      const time = formatDiagnosticTime(message.receivedAt);
      const bytes = message.bytesHex ? ` [${message.bytesHex}]` : '';
      return `${time} ${message.kind ?? 'other'}: ${message.detail ?? 'message'}${bytes}`;
    })
    .join(' | ');
};

const renderMidiDiagnostics = (diagnostics = {}) => {
  diagnosticLastRaw.textContent = toUpperUi(formatDiagnosticTime(diagnostics.lastRawMessageAt));
  diagnosticLastTransport.textContent = toUpperUi(formatDiagnosticTime(diagnostics.lastTransportFeedbackAt));
  diagnosticLastLcd.textContent = toUpperUi(formatDiagnosticTime(diagnostics.lastLcdFeedbackAt));
  diagnosticLastSelect.textContent = toUpperUi(formatDiagnosticTime(diagnostics.lastSelectFeedbackAt));
  diagnosticLastFocused.textContent = toUpperUi(formatDiagnosticTime(diagnostics.lastFocusedTrackFeedbackAt));
  diagnosticCounts.textContent = toUpperUi(
    [
      `Raw ${diagnostics.rawMessageCount ?? 0}`,
      `Transport ${diagnostics.transportMessageCount ?? 0}`,
      `LCD ${diagnostics.lcdMessageCount ?? 0}`,
      `Select ${diagnostics.selectMessageCount ?? 0}`,
      `Focus ${diagnostics.focusedTrackFeedbackCount ?? 0}`,
    ].join(' | '),
  );
  diagnosticRecentMessages.textContent = toUpperUi(formatRecentMessages(diagnostics.recentMessages));
};

const renderMidiStatus = (midi = {}) => {
  const midiMode = midi.midiMode === 'virtual' ? 'virtual' : 'iac';
  const expectedInput = midi.expectedIacInputName ?? 'LUNA Remote From LUNA';
  const expectedOutput = midi.expectedIacOutputName ?? 'LUNA Remote To LUNA';
  const warnings = Array.isArray(midi.setupWarnings) ? midi.setupWarnings : [];

  midiStatusTitle.textContent = toUpperUi(midi.title ?? 'MIDI unavailable');
  midiStatusDetail.textContent = toUpperUi(midi.detail ?? 'MIDI status has not been checked yet.');
  midiSetupSummary.textContent = toUpperUi(midi.detail ?? 'MIDI status has not been checked yet.');
  setOrbState(midiStatusOrb, midi.state);

  midiModeIac.classList.toggle('active', midiMode === 'iac');
  midiModeVirtual.classList.toggle('active', midiMode === 'virtual');
  expectedIacInput.textContent = toUpperUi(expectedInput);
  expectedIacOutput.textContent = toUpperUi(expectedOutput);
  selectedMidiInput.textContent = toUpperUi(midi.selectedInputName ?? 'none');
  selectedMidiOutput.textContent = toUpperUi(midi.selectedOutputName ?? 'none');

  setCheck('check-input-found', midi.expectedIacInputFound ? 'green' : 'red');
  setCheck('check-output-found', midi.expectedIacOutputFound ? 'green' : 'red');
  setCheck('check-midi-connected', midi.midiConnected ? 'green' : 'red');
  setCheck('check-mcu-receiving', midi.mcuReceiving ? 'green' : 'yellow');
  setCheck('check-focused-selected', midi.focusedTrackSelected ? 'green' : 'yellow');
  setCheck('check-focused-named', midi.focusedTrackNamed ? 'green' : 'yellow');
  setCheck('check-focused-hydrated', midi.focusedTrackHydrated ? 'green' : 'yellow');

  if (warnings.length > 0) {
    midiWarnings.replaceChildren(
      ...warnings.map((warning) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = toUpperUi(warning);
        return paragraph;
      }),
    );
    midiWarningBlock.classList.remove('hidden');
  } else {
    midiWarnings.replaceChildren();
    midiWarningBlock.classList.add('hidden');
  }

  detectedInputs.textContent = toUpperUi(formatPorts(midi.inputPorts));
  detectedOutputs.textContent = toUpperUi(formatPorts(midi.outputPorts));
  selectedPorts.textContent = toUpperUi(
    `Selected input: ${midi.selectedInputName ?? 'none'} | Selected output: ${midi.selectedOutputName ?? 'none'}`,
  );
  renderMidiDiagnostics(midi.mcuDiagnostics);

  if (midi.actionMessage) {
    midiActionMessage.textContent = toUpperUi(midi.actionMessage);
    midiActionMessage.classList.remove('hidden');
  } else {
    midiActionMessage.textContent = '';
    midiActionMessage.classList.add('hidden');
  }
};

const renderStatus = (status) => {
  currentStatus = status;
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
  actionButtons.restartServer.disabled = status.state === 'starting' || status.state === 'stopping';
  actionButtons.stopServer.disabled = status.state !== 'running';
  actionButtons.startServer.disabled = status.state !== 'stopped';
  actionButtons.midiSetup.disabled = false;
  actionButtons.closeMidiSetup.disabled = false;
  actionButtons.startServer.classList.toggle('hidden', status.state !== 'stopped');
  actionButtons.stopServer.classList.toggle('hidden', status.state === 'stopped');
  actionButtons.openAudioMidiSetup.disabled = status.state !== 'running';
  actionButtons.refreshMidi.disabled = status.state !== 'running';
  actionButtons.testMidi.disabled = status.state !== 'running';
  actionButtons.dismissNote.disabled = false;
  actionButtons.quitApp.disabled = false;

  renderMidiStatus(status.midi);
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

actionButtons.midiSetup.addEventListener('click', () => {
  midiSetupPanel.classList.remove('hidden');
});

actionButtons.closeMidiSetup.addEventListener('click', () => {
  midiSetupPanel.classList.add('hidden');
});

actionButtons.openAudioMidiSetup.addEventListener('click', () => {
  void performAction('open-audio-midi-setup');
});

actionButtons.refreshMidi.addEventListener('click', () => {
  void performAction('refresh-midi');
});

actionButtons.testMidi.addEventListener('click', () => {
  void performAction('test-midi');
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
