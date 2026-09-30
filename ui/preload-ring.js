const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ring', {
  onShow: cb => ipcRenderer.on('ring-show', (_e, msg) => cb(msg)),
  onRelease: cb => ipcRenderer.on('ring-release', () => cb()),
  onMove: cb => ipcRenderer.on('ring-move', (_e, msg) => cb(msg)),
  onKey: cb => ipcRenderer.on('ring-key', (_e, msg) => cb(msg)),
  pick: index => ipcRenderer.send('ring-pick', { index }),
  hover: index => ipcRenderer.send('ring-hover', { index }),
  close: () => ipcRenderer.send('ring-close'),
  diag: info => ipcRenderer.send('ring-diag', info),
});
