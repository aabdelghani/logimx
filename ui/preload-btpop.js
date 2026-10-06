const { contextBridge, ipcRenderer } = require('electron');
// the language the main process chose, with its translations
contextBridge.exposeInMainWorld('i18n', { load: () => ipcRenderer.sendSync('i18n') });
contextBridge.exposeInMainWorld('btpop', {
  onShow: cb => ipcRenderer.on('btpop-show', (_e, msg) => cb(msg)),
  onState: cb => ipcRenderer.on('bt-event', (_e, msg) => cb(msg)),
  act: (action, address) => ipcRenderer.send('btpop-act', { action, address }),
});
