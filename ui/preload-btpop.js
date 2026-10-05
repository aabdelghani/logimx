const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('btpop', {
  onShow: cb => ipcRenderer.on('btpop-show', (_e, msg) => cb(msg)),
  onState: cb => ipcRenderer.on('bt-event', (_e, msg) => cb(msg)),
  act: (action, address) => ipcRenderer.send('btpop-act', { action, address }),
});
