import { ipcMain, app, BrowserWindow } from 'electron'
import { Bonjour } from 'bonjour-service'
import { store } from './store.js'
import { parsePeer } from './discoveryPeers.js'
import { ensureServer } from './handshake.js'
import { startBle, stopBle } from './ble.js'
import {
  setPeersEmitter,
  setNetworkPeer,
  removeNetworkPeer,
  clearNetworkPeers,
  snapshot,
  peerCount
} from './peerRegistry.js'

// Bonus, local-network sharing path (the QR flow remains the primary method).
// We advertise "_proximityshare._tcp" on a real, OS-assigned port and browse for
// other instances; peers flow into the shared registry (merged with BLE, see
// peerRegistry.js) and are pushed to the renderer. The advertised port is the
// shared handshake TCP server (see handshake.js).

const SERVICE_TYPE = 'proximityshare' // bonjour-service adds the _<type>._tcp framing
const EMPTY_HINT_MS = 5000

let bonjour = null
let published = null
let browser = null
let servicePort = null
let emptyTimer = null
let hintActive = false

function payload(peers) {
  return { peers, noPeersHint: hintActive && peers.length === 0 }
}

// The registry calls this whenever the merged (network + BLE) peer list changes.
setPeersEmitter((peers) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) win.webContents.send('peers-updated', payload(peers))
})

function addPeer(service, ownDeviceId) {
  const peer = parsePeer(service, ownDeviceId)
  if (!peer) return // our own advertisement, or no usable id
  hintActive = false
  setNetworkPeer(peer)
}

function removePeer(service) {
  const peer = parsePeer(service, null)
  if (peer) removeNetworkPeer(peer.deviceId)
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

  // Optional BLE proximity mode — silently no-ops if BLE isn't available.
  startBle()

  // Subtle hint if nothing (network or BLE) turns up shortly after we start.
  emptyTimer = setTimeout(() => {
    if (peerCount() === 0) {
      hintActive = true
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) win.webContents.send('peers-updated', payload(snapshot()))
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
  stopBle()
  // The handshake server intentionally outlives discovery start/stop; it is
  // closed on app quit by handshake.js.
  clearNetworkPeers()
  hintActive = false
}

export function registerDiscoveryIpc() {
  ipcMain.handle('discovery:start', () => startDiscovery())
  ipcMain.handle('discovery:stop', () => {
    stopDiscovery()
    return { running: false }
  })
  ipcMain.handle('discovery:getPeers', () => payload(snapshot()))

  // Clean up the advertisement and socket on quit.
  app.on('will-quit', stopDiscovery)
}
