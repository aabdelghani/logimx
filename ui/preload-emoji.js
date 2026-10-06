const { contextBridge, ipcRenderer } = require('electron');
// the language the main process chose, with its translations
contextBridge.exposeInMainWorld('i18n', { load: () => ipcRenderer.sendSync('i18n') });
contextBridge.exposeInMainWorld('emoji', {
  onShow: cb => ipcRenderer.on('emoji-show', (_e, msg) => cb(msg)),
  pick: (ch, name) => ipcRenderer.send('emoji-pick', { ch, name }),
  close: () => ipcRenderer.send('emoji-close'),
});
