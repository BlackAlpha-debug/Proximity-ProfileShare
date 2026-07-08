import { ipcMain, app, BrowserWindow } from 'electron'
import { Bonjour } from 'bonjour-service'
import { store } from './store.js'
import { parsePeer } from './discoveryPeers.js'
import { ensureServer } from './handshake.js'

// Bonus, local-network sharing path (the QR flow remains the primary method).
// We advertise "_proximityshare._tcp" on a real, OS-assigned port and browse for
// other instances, keeping an in-memory peer list that is pushed to the renderer.
// The advertised port is the shared handshake TCP server (see handshake.js).

const SERVICE_TYPE = 'proximityshare' // bonjour-service adds the _<type>._tcp framing
const EMPTY_HINT_MS = 5000

let bonjour = null
let published = null
let browser = null
let servicePort = null
let emptyTimer = null
let hintActive = false
const peers = new Map() // deviceId -> { deviceId, name, ip, port }

function mainWindow() {
  return BrowserWindow.getAllWindows()[0] || null
}

function emitPeers() {
  const win = mainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('peers-updated', {
      peers: [...peers.values()],
      noPeersHint: hintActive && peers.size === 0
    })
  }
}

function addPeer(service, ownDeviceId) {
  const peer = parsePeer(service, ownDeviceId)
  if (!peer) return // our own advertisement, or no usable id
  peers.set(peer.deviceId, peer)
  hintActive = false
  emitPeers()
}

function removePeer(service) {
  // 'down' events may not carry TXT, so match on the deviceId we can derive,
  // falling back to a scan by service name.
  const peer = parsePeer(service, null)
  if (peer && peers.has(peer.deviceId)) {
    peers.delete(peer.deviceId)
  } else {
    for (const [id, existing] of peers) {
      if (existing.name && service.name && service.name.includes(existing.name)) {
        peers.delete(id)
        break
      }
    }
  }
  emitPeers()
}

async function startDiscovery() {
  if (bonjour) return { running: true, port: servicePort }

  const ownDeviceId = store.get('deviceId')
  const profile = store.get('myProfile') || {}
  const displayName = (profile.fullName || 'Proximity Share user').trim()

  // The handshake TCP server owns the listening socket; we advertise its port so
  // peers connect back to it. (That listen is also what raises the Windows
  // Firewall prompt explained during onboarding.)
  servicePort = await ensureServer()

  bonjour = new Bonjour()
  published = bonjour.publish({
    name: `${displayName} (${String(ownDeviceId).slice(0, 6)})`,
    type: SERVICE_TYPE,
    port: servicePort,
    txt: { displayName, deviceId: ownDeviceId }
  })

  browser = bonjour.find({ type: SERVICE_TYPE })
  browser.on('up', (service) => addPeer(service, ownDeviceId))
  browser.on('down', (service) => removePeer(service))

  // Subtle hint if the network turns up nothing shortly after we start looking.
  emptyTimer = setTimeout(() => {
    if (peers.size === 0) {
      hintActive = true
      emitPeers()
    }
  }, EMPTY_HINT_MS)

  return { running: true, port: servicePort }
}

function stopDiscovery() {
  if (emptyTimer) clearTimeout(emptyTimer)
  emptyTimer = null
  if (browser) {
    try {
      browser.stop()
    } catch {
      /* ignore */
    }
  }
  browser = null
  published = null
  if (bonjour) {
    try {
      bonjour.unpublishAll(() => bonjour.destroy())
    } catch {
      try {
        bonjour.destroy()
      } catch {
        /* ignore */
      }
    }
  }
  bonjour = null
  // The handshake server intentionally outlives discovery start/stop; it is
  // closed on app quit by handshake.js.
  peers.clear()
  hintActive = false
}

export function registerDiscoveryIpc() {
  ipcMain.handle('discovery:start', () => startDiscovery())
  ipcMain.handle('discovery:stop', () => {
    stopDiscovery()
    return { running: false }
  })
  ipcMain.handle('discovery:getPeers', () => ({
    peers: [...peers.values()],
    noPeersHint: hintActive && peers.size === 0
  }))

  // Clean up the advertisement and socket on quit.
  app.on('will-quit', stopDiscovery)
}
