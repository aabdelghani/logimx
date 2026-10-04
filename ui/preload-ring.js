const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ring', {
  onShow: cb => ipcRenderer.on('ring-show', (_e, msg) => cb(msg)),
  onRelease: cb => ipcRenderer.on('ring-release', () => cb()),
  onMove: cb => ipcRenderer.on('ring-move', (_e, msg) => cb(msg)),
  onKey: cb => ipcRenderer.on('ring-key', (_e, msg) => cb(msg)),
  onSlots: cb => ipcRenderer.on('ring-slots', (_e, msg) => cb(msg)),
  // a slot by its place: a number on the ring, or [folder, slot] inside a folder
  pick: at => ipcRenderer.send('ring-pick', Array.isArray(at) ? { path: at } : { index: at }),
  adjust: (path, dir) => ipcRenderer.send('ring-adjust', { path, dir }),
  hover: index => ipcRenderer.send('ring-hover', { index }),
  close: () => ipcRenderer.send('ring-close'),
  diag: info => ipcRenderer.send('ring-diag', info),
  volGet: () => ipcRenderer.invoke('ring-vol-get'),
  volSet: v => ipcRenderer.send('ring-vol-set', v),
  briGet: () => ipcRenderer.invoke('ring-bri-get'),
  briSet: v => ipcRenderer.send('ring-bri-set', v),
});
