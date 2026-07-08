import selfsigned from 'selfsigned'
import { store } from './store.js'

// Self-signed TLS credentials, generated once per device and persisted in
// electron-store (key "tlsCredentials"). IMPORTANT: a self-signed cert only
// ENCRYPTS the channel — it does NOT prove who is on the other end. Identity is
// established out-of-band by the two-word verification code (see the ceremony).
// That is why the TLS client connects with rejectUnauthorized:false.

let cached = null

export async function getTlsCredentials() {
  if (cached) return cached

  const stored = store.get('tlsCredentials')
  if (stored?.cert && stored?.key) {
    cached = stored
    return cached
  }

  const attrs = [{ name: 'commonName', value: 'proximity-share-device' }]
  const pems = await selfsigned.generate(attrs, {
    days: 3650,
    keySize: 2048,
    algorithm: 'sha256'
  })
  cached = { cert: pems.cert, key: pems.private }
  store.set('tlsCredentials', cached)
  return cached
}
