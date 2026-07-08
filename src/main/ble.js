import { createRequire } from 'module'
import { app } from 'electron'
import { store } from './store.js'
import { setBlePeer, removeBlePeer, clearBlePeers } from './peerRegistry.js'
import {
  DEFAULT_RSSI_THRESHOLD,
  deviceIdPrefix,
  decodeManufacturerData,
  buildAdvertisement,
  rssiBand,
  rssiLabel
} from './bleData.js'

// Optional BLE proximity mode. @abandonware/noble (scan) and @abandonware/bleno
// (advertise) are OPTIONAL native modules — if they're missing, fail to load, or
// the adapter is off/unauthorized/unsupported, we fall back SILENTLY to mDNS + QR.

const STALE_MS = 8000 // drop a BLE peer we haven't heard from in this long
const PRUNE_INTERVAL_MS = 3000

let started = false
let noble = null
let bleno = null
let ownPrefix = ''
let threshold = DEFAULT_RSSI_THRESHOLD
let pruneTimer = null
const lastSeen = new Map() // idPrefix -> timestamp

function tryRequire(name) {
  try {
    return createRequire(import.meta.url)(name)
  } catch {
    return null // module absent or native binding failed to load
  }
}

export function isBleAvailable() {
  return Boolean(noble || bleno)
}

export function startBle(options = {}) {
  if (started) return { available: isBleAvailable() }
  started = true

  if (typeof options.rssiThreshold === 'number') threshold = options.rssiThreshold
  ownPrefix = deviceIdPrefix(store.get('deviceId'))

  noble = tryRequire('@abandonware/noble')
  bleno = tryRequire('@abandonware/bleno')
  if (!noble && !bleno) {
    // No BLE stack at all — silent fallback, nothing else to do.
    return { available: false }
  }

  if (noble) setupScanning()
  if (bleno) setupAdvertising()

  pruneTimer = setInterval(pruneStale, PRUNE_INTERVAL_MS)
  return { available: true }
}

function setupScanning() {
  try {
    noble.on('stateChange', (state) => {
      if (state === 'poweredOn') {
        // Scan for everything (our id may sit in the scan response) and filter by
        // manufacturer data; allowDuplicates keeps RSSI fresh.
        try {
          noble.startScanning([], true)
        } catch {
          /* ignore */
        }
      } else {
        // poweredOff / unauthorized / unsupported → stop and drop BLE peers.
        try {
          noble.stopScanning()
        } catch {
          /* ignore */
        }
        clearBlePeers()
      }
    })
    noble.on('discover', onDiscover)
  } catch {
    noble = null // any unexpected wiring failure → treat BLE scan as unavailable
  }
}

function onDiscover(peripheral) {
  try {
    const decoded = decodeManufacturerData(peripheral?.advertisement?.manufacturerData)
    if (!decoded) return
    if (ownPrefix && decoded.idPrefix === ownPrefix) return // our own advertisement

    const band = rssiBand(peripheral.rssi, threshold)
    if (!band) {
      // Too far / weak — remove it if we were showing it.
      lastSeen.delete(decoded.idPrefix)
      removeBlePeer(decoded.idPrefix)
      return
    }
    lastSeen.set(decoded.idPrefix, Date.now())
    setBlePeer({ idPrefix: decoded.idPrefix, name: decoded.name, band, label: rssiLabel(band) })
  } catch {
    /* malformed advertisement — ignore */
  }
}

function pruneStale() {
  const now = Date.now()
  for (const [prefix, ts] of lastSeen) {
    if (now - ts > STALE_MS) {
      lastSeen.delete(prefix)
      removeBlePeer(prefix)
    }
  }
}

function setupAdvertising() {
  try {
    const displayName = (store.get('myProfile')?.fullName || 'Proximity Share').trim()
    const { advertisementData, scanData } = buildAdvertisement(store.get('deviceId'), displayName)
    bleno.on('stateChange', (state) => {
      if (state === 'poweredOn') {
        try {
          bleno.startAdvertisingWithEIRData(advertisementData, scanData, () => {})
        } catch {
          /* ignore */
        }
      } else {
        try {
          bleno.stopAdvertising()
        } catch {
          /* ignore */
        }
      }
    })
  } catch {
    bleno = null
  }
}

export function stopBle() {
  if (pruneTimer) clearInterval(pruneTimer)
  pruneTimer = null
  lastSeen.clear()
  try {
    noble?.stopScanning()
  } catch {
    /* ignore */
  }
  try {
    bleno?.stopAdvertising()
  } catch {
    /* ignore */
  }
  clearBlePeers()
}

// Ensure we stop advertising/scanning on quit.
app.on('will-quit', () => {
  if (started) stopBle()
})
