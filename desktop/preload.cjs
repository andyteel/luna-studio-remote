const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lunaDesktop', {
  getStatus: () => ipcRenderer.invoke('desktop:get-status'),
  performAction: (action) => ipcRenderer.invoke('desktop:perform-action', action),
  onStatusChange: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('server-status-changed', listener);
    return () => {
      ipcRenderer.removeListener('server-status-changed', listener);
    };
  },
});
