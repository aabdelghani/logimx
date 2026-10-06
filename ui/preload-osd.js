const { contextBridge, ipcRenderer } = require('electron');
// the language the main process chose, with its translations
contextBridge.exposeInMainWorld('i18n', { load: () => ipcRenderer.sendSync('i18n') });
contextBridge.exposeInMainWorld('osd', {
  onShow: cb => ipcRenderer.on('osd-show', (_e, msg) => cb(msg)),
  hidden: () => ipcRenderer.send('osd-hidden'),
});
