import { ipcMain, shell } from 'electron'
import dgram from 'dgram'
import { store } from './store.js'

// Deep links to the relevant OS privacy settings page. Keyed by "<target>:<platform>".
const SETTINGS_URIS = {
  'camera:win32': 'ms-settings:privacy-webcam',
  'camera:darwin':
    'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  'localnetwork:darwin':
    'x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork'
}

// Proactively provoke the macOS "…find and connect to devices on your local
// network" prompt by sending a single packet toward the mDNS multicast group.
// This is a no-op off macOS (Windows/Linux have no equivalent system prompt).
function primeLocalNetwork() {
  return new Promise((resolve) => {
    if (process.platform !== 'darwin') {
      resolve({ triggered: false, reason: 'not-macos' })
      return
    }
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      try {
        socket.close()
      } catch {
        /* already closed */
      }
      resolve(result)
    }

    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    socket.on('error', (err) => done({ triggered: false, error: err.message }))
    // Safety net in case no callback fires.
    const timer = setTimeout(() => done({ triggered: true, note: 'timeout' }), 2000)

    socket.bind(0, () => {
      try {
        socket.setMulticastTTL(1)
        // mDNS multicast group / port. The send is what trips the OS prompt.
        socket.send(Buffer.from([0x00]), 5353, '224.0.0.251', (err) => {
          clearTimeout(timer)
          done(err ? { triggered: false, error: err.message } : { triggered: true })
        })
      } catch (err) {
        clearTimeout(timer)
        done({ triggered: false, error: err.message })
      }
    })
  })
}

export function registerPermissionsIpc() {
  // Whether the one-time OS-permission explainers have already been shown.
  ipcMain.handle('permissions:getShown', () =>
    store.get('onboardingPermissionsShown', false)
  )
  ipcMain.handle('permissions:markShown', () => {
    store.set('onboardingPermissionsShown', true)
    return true
  })

  // Open an OS settings page (or report that no deep link exists for this platform).
  ipcMain.handle('permissions:openSettings', (_event, target) => {
    const uri = SETTINGS_URIS[`${target}:${process.platform}`]
    if (!uri) return false
    shell.openExternal(uri)
    return true
  })

  ipcMain.handle('permissions:primeLocalNetwork', () => primeLocalNetwork())

  // Open a contact's quick-action link in the system browser/handler. Restricted
  // to safe schemes so a malicious contact card can't trigger arbitrary handlers.
  ipcMain.handle('shell:openExternal', (_event, url) => {
    try {
      const scheme = new URL(url).protocol
      if (['http:', 'https:', 'mailto:', 'tel:'].includes(scheme)) {
        shell.openExternal(url)
        return true
      }
    } catch {
      /* invalid URL */
    }
    return false
  })
}
