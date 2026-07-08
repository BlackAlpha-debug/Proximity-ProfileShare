// Shared registry that merges peers found via mDNS (network) and BLE (bluetooth)
// into one list for the renderer. Electron-free: the "emit to renderer" function
// is injected by discovery.js. A single BLE advertisement carries only a deviceId
// PREFIX, so a network peer and a BLE hit are merged when the full network
// deviceId starts with the BLE prefix.

let emit = () => {}
const network = new Map() // deviceId -> { deviceId, name, ip, port }
const ble = new Map() // idPrefix -> { idPrefix, name, band, label }

export function setPeersEmitter(fn) {
  emit = typeof fn === 'function' ? fn : () => {}
}

export function snapshot() {
  const usedBle = new Set()
  const list = []

  for (const net of network.values()) {
    // The BLE prefix is dash-stripped hex; normalize the network deviceId to match.
    const netHex = String(net.deviceId).replace(/-/g, '').toLowerCase()
    let proximity = null
    for (const [prefix, b] of ble) {
      if (netHex.startsWith(prefix)) {
        proximity = { band: b.band, label: b.label }
        usedBle.add(prefix)
        break
      }
    }
    list.push({
      deviceId: net.deviceId,
      name: net.name,
      ip: net.ip,
      port: net.port,
      connectable: Boolean(net.ip && net.port),
      sources: proximity ? ['network', 'bluetooth'] : ['network'],
      proximity
    })
  }

  // BLE-only peers (physically near, but no network route to hand off to).
  for (const [prefix, b] of ble) {
    if (usedBle.has(prefix)) continue
    list.push({
      deviceId: `ble:${prefix}`,
      name: b.name,
      ip: null,
      port: null,
      connectable: false,
      sources: ['bluetooth'],
      proximity: { band: b.band, label: b.label }
    })
  }
  return list
}

function changed() {
  emit(snapshot())
}

export function setNetworkPeer(peer) {
  network.set(peer.deviceId, peer)
  changed()
}
export function removeNetworkPeer(deviceId) {
  if (network.delete(deviceId)) changed()
}
export function clearNetworkPeers() {
  if (network.size) {
    network.clear()
    changed()
  }
}

export function setBlePeer(entry) {
  ble.set(entry.idPrefix, entry)
  changed()
}
export function removeBlePeer(idPrefix) {
  if (ble.delete(idPrefix)) changed()
}
export function clearBlePeers() {
  if (ble.size) {
    ble.clear()
    changed()
  }
}

export function peerCount() {
  return snapshot().length
}
