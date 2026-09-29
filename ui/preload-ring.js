const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ring', {
  onShow: cb => ipcRenderer.on('ring-show', (_e, msg) => cb(msg)),
  onRelease: cb => ipcRenderer.on('ring-release', () => cb()),
  pick: index => ipcRenderer.send('ring-pick', { index }),
  close: () => ipcRenderer.send('ring-close'),
});
