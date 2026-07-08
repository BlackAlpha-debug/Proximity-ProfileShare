// Pure helpers for turning bonjour-service Service objects into peer records.
// Kept free of any electron imports so they can be unit-tested in plain Node.

// TXT keys are case-insensitive in DNS-SD; normalize to lowercase before reading.
export function readTxt(txt) {
  const out = {}
  for (const [key, value] of Object.entries(txt || {})) {
    out[key.toLowerCase()] = value
  }
  return out
}

export function pickIp(service) {
  const addresses = service.addresses || []
  const ipv4 = addresses.find((addr) => /^\d+\.\d+\.\d+\.\d+$/.test(addr))
  return ipv4 || addresses[0] || service.referer?.address || null
}

// Returns a peer record, or null if this service is our own advertisement or
// carries no usable deviceId.
export function parsePeer(service, ownDeviceId) {
  const txt = readTxt(service.txt)
  const deviceId = txt.deviceid
  if (!deviceId || deviceId === ownDeviceId) return null
  return {
    deviceId,
    name: txt.displayname || service.name || 'Unknown device',
    ip: pickIp(service),
    port: service.port
  }
}
