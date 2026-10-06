const { contextBridge, ipcRenderer } = require('electron');
// the language the main process chose, with its translations
contextBridge.exposeInMainWorld('i18n', { load: () => ipcRenderer.sendSync('i18n') });
contextBridge.exposeInMainWorld('tray', {
  state: () => ipcRenderer.invoke('tray-state'),
  onState: cb => ipcRenderer.on('tray-state', (_e, st) => cb(st)),
  action: (name, params) => ipcRenderer.invoke('tray-action', name, params || {}),
});
