const { contextBridge, ipcRenderer } = require('electron')

// Единственное, что видит страница из десктопной оболочки: системные диалоги файлов.
contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  saveJson: (name, text) => ipcRenderer.invoke('backup:save', { name, text }),
  openJson: () => ipcRenderer.invoke('backup:open'),
})