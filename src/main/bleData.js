// Pure helpers for the BLE proximity path (electron-free, unit-tested). Handles
// the tiny advertisement payload (BLE adv packets are ~31 bytes) and RSSI banding.

// Custom 128-bit service UUID identifying a Proximity Share device.
export const SERVICE_UUID = '70726f78696d69747973686172653031'
// 0xFFFF = "for internal/testing use" company id (we're not registered with the SIG).
export const COMPANY_ID = 0xffff

const ID_PREFIX_LEN = 12 // first 12 hex chars of the deviceId — enough to match/dedup
// Keep the whole advertisement within 31 bytes: 3 (flags) + 2 (AD header) leaves 26.
const MAX_MANUFACTURER_BYTES = 26

// RSSI thresholds (dBm). Higher (closer to 0) = stronger = closer. These are
// deliberately coarse — RSSI→distance is unreliable, so we only band it.
export const DEFAULT_RSSI_THRESHOLD = -70 // ~"within a few meters"; below this we hide
const BAND_VERY_CLOSE = -55
const BAND_NEARBY = -67

export function deviceIdPrefix(deviceId) {
  return String(deviceId || '')
    .replace(/-/g, '')
    .toLowerCase()
    .slice(0, ID_PREFIX_LEN)
}

// Manufacturer data value = [companyId LE (2)][idPrefix ascii (12)][nameLen (1)][name utf8].
export function encodeManufacturerData(deviceId, displayName) {
  const company = Buffer.from([COMPANY_ID & 0xff, (COMPANY_ID >> 8) & 0xff])
  const idBuf = Buffer.from(deviceIdPrefix(deviceId).padEnd(ID_PREFIX_LEN, '0'), 'ascii')
  const room = MAX_MANUFACTURER_BYTES - company.length - idBuf.length - 1
  const nameBuf = Buffer.from(String(displayName || '').slice(0, 40), 'utf8').subarray(0, Math.max(0, room))
  return Buffer.concat([company, idBuf, Buffer.from([nameBuf.length]), nameBuf])
}

export function decodeManufacturerData(buffer) {
  if (!buffer || buffer.length < 2 + ID_PREFIX_LEN + 1) return null
  const company = buffer[0] | (buffer[1] << 8)
  if (company !== COMPANY_ID) return null
  const idPrefix = buffer.subarray(2, 2 + ID_PREFIX_LEN).toString('ascii')
  if (!/^[0-9a-f]{12}$/.test(idPrefix)) return null
  const nameLen = buffer[2 + ID_PREFIX_LEN]
  const start = 2 + ID_PREFIX_LEN + 1
  const name = buffer.subarray(start, start + nameLen).toString('utf8')
  return { idPrefix, name: name || 'Nearby device' }
}

// Builds the raw EIR advertisement + scan-response buffers for the peripheral lib.
// Advertisement carries flags + manufacturer data; the 128-bit service UUID (big,
// 16 bytes) goes in the scan response so the main packet stays under 31 bytes.
export function buildAdvertisement(deviceId, displayName) {
  const flags = Buffer.from([0x02, 0x01, 0x06])
  const md = encodeManufacturerData(deviceId, displayName)
  const mdAd = Buffer.concat([Buffer.from([md.length + 1, 0xff]), md])
  const advertisementData = Buffer.concat([flags, mdAd])

  const uuidLe = Buffer.from(SERVICE_UUID, 'hex').reverse()
  const scanData = Buffer.concat([Buffer.from([uuidLe.length + 1, 0x07]), uuidLe])
  return { advertisementData, scanData }
}

export function rssiBand(rssi, threshold = DEFAULT_RSSI_THRESHOLD) {
  if (typeof rssi !== 'number' || Number.isNaN(rssi)) return null
  if (rssi < threshold) return null // too far — don't surface
  if (rssi >= BAND_VERY_CLOSE) return 'very-close'
  if (rssi >= BAND_NEARBY) return 'nearby'
  return 'in-range'
}

export function rssiLabel(band) {
  return { 'very-close': 'Very close', nearby: 'Nearby', 'in-range': 'In range' }[band] || null
}
