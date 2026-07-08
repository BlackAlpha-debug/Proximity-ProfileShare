import { ipcMain, app, BrowserWindow } from 'electron'
import { store } from './store.js'
import { createHandshakeEngine } from './handshakeEngine.js'

// Electron wiring for the handshake protocol. The protocol itself lives in the
// electron-free handshakeEngine (so it can be tested with real sockets).

const engine = createHandshakeEngine({
  ownId: () => String(store.get('deviceId') || ''),
  ownName: () => (store.get('myProfile')?.fullName || 'Someone').trim(),
  emit: (event) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win && !win.isDestroyed()) win.webContents.send('handshake-event', event)
  }
})

// The advertised mDNS port is this handshake server's port (see discovery.js).
export function ensureServer() {
  return engine.ensureServer()
}

export function registerHandshakeIpc() {
  ipcMain.handle('handshake:request', (_event, peer) => engine.requestShare(peer))
  ipcMain.handle('handshake:accept', (_event, peerId) => engine.acceptIncoming(String(peerId)))
  ipcMain.handle('handshake:decline', (_event, peerId) => engine.declineIncoming(String(peerId)))
  ipcMain.handle('handshake:cancel', (_event, peerId) => engine.cancelOutgoing(String(peerId)))

  app.on('will-quit', () => engine.close())
}
