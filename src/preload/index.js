import { contextBridge, ipcRenderer } from 'electron'

// The preload script is the only place with access to both Node and the DOM.
// Everything the renderer is allowed to touch must be explicitly exposed here
// through contextBridge — never expose ipcRenderer or Node APIs directly.
const api = {
  // Stable per-install identifier, created on first run.
  getDeviceId: () => ipcRenderer.invoke('device:getId'),

  // Profile persistence (electron-store, key "myProfile").
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveProfile: (profile) => ipcRenderer.invoke('profile:save', profile),

  // Profile photo helpers. selectPhoto opens a native file picker and returns
  // { path, dataUrl } (or null if cancelled); readPhoto re-reads a stored path
  // to produce a preview data URL.
  selectPhoto: () => ipcRenderer.invoke('photo:select'),
  readPhoto: (path) => ipcRenderer.invoke('photo:read', path),

  // Received contacts (QR scan or mDNS profile-payload), deduped by deviceId.
  // saveContact upserts and returns { ok, contact, contacts }.
  getContacts: () => ipcRenderer.invoke('contacts:list'),
  saveContact: (contact) => ipcRenderer.invoke('contacts:save', contact),
  deleteContact: (id) => ipcRenderer.invoke('contacts:delete', id),

  // Open a safe external link (tel:/mailto:/http(s):) in the system handler.
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // OS permission handling.
  // getPermissionsShown/markPermissionsShown gate the one-time explainers.
  // openSettings('camera' | 'localnetwork') deep-links to the OS settings page.
  // primeLocalNetwork proactively triggers the macOS local-network prompt.
  getPermissionsShown: () => ipcRenderer.invoke('permissions:getShown'),
  markPermissionsShown: () => ipcRenderer.invoke('permissions:markShown'),
  openSettings: (target) => ipcRenderer.invoke('permissions:openSettings', target),
  primeLocalNetwork: () => ipcRenderer.invoke('permissions:primeLocalNetwork'),

  // Local-network discovery (mDNS / bonjour). start/stop advertise + browse for
  // "_proximityshare._tcp"; getPeers returns the current snapshot; onPeersUpdated
  // subscribes to live updates and returns an unsubscribe function.
  startDiscovery: () => ipcRenderer.invoke('discovery:start'),
  stopDiscovery: () => ipcRenderer.invoke('discovery:stop'),
  getPeers: () => ipcRenderer.invoke('discovery:getPeers'),
  onPeersUpdated: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('peers-updated', listener)
    return () => ipcRenderer.removeListener('peers-updated', listener)
  },

  // Handshake protocol. requestShare initiates to a peer; accept/decline answer an
  // incoming request; cancel aborts our own pending request. onHandshakeEvent
  // streams protocol state changes and returns an unsubscribe function.
  requestShare: (peer) => ipcRenderer.invoke('handshake:request', peer),
  acceptShare: (peerId) => ipcRenderer.invoke('handshake:accept', peerId),
  declineShare: (peerId) => ipcRenderer.invoke('handshake:decline', peerId),
  cancelShare: (peerId) => ipcRenderer.invoke('handshake:cancel', peerId),
  onHandshakeEvent: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('handshake-event', listener)
    return () => ipcRenderer.removeListener('handshake-event', listener)
  },

  // Platform string (win32 | darwin | linux) for OS-specific UI hints.
  platform: process.platform
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // contextIsolation should always be on; this is a defensive fallback.
  window.api = api
}
