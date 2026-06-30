const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onSessions: (cb) => ipcRenderer.on('sessions', (_e, data) => cb(data)),
  onConfig: (cb) => ipcRenderer.on('config', (_e, data) => cb(data)),
  // Click-through toggling: false while hovering an interactive light.
  setIgnore: (ignore) => ipcRenderer.send('overlay:setIgnore', ignore),
  // Dragging the whole overlay.
  dragStart: () => ipcRenderer.send('overlay:dragStart'),
  dragMove: () => ipcRenderer.send('overlay:dragMove'),
  dragEnd: () => ipcRenderer.send('overlay:dragEnd'),
});
