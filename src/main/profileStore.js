import { ipcMain, dialog } from 'electron'
import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { extname } from 'path'
import { store } from './store.js'

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

// Read an image off disk and return a data URL suitable for <img src> in the
// sandboxed renderer (file:// paths are blocked by the CSP; data: is allowed).
async function toDataUrl(filePath) {
  try {
    const mime = MIME_BY_EXT[extname(filePath).toLowerCase()] || 'image/png'
    const buffer = await readFile(filePath)
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

// Generate the deviceId once, on first run, and persist it.
export function ensureDeviceId() {
  let id = store.get('deviceId')
  if (!id) {
    id = randomUUID()
    store.set('deviceId', id)
  }
  return id
}

export function registerProfileIpc() {
  ipcMain.handle('device:getId', () => ensureDeviceId())

  ipcMain.handle('profile:get', () => store.get('myProfile') ?? null)

  ipcMain.handle('profile:save', (_event, profile) => {
    store.set('myProfile', profile)
    return store.get('myProfile')
  })

  // Contacts collected from scans. Saved only after explicit user confirmation.
  ipcMain.handle('contacts:list', () => store.get('contacts', []))

  ipcMain.handle('contacts:add', (_event, contact) => {
    const list = store.get('contacts', [])
    const entry = { ...contact, id: randomUUID(), addedAt: new Date().toISOString() }
    list.push(entry)
    store.set('contacts', list)
    return entry
  })

  // Open a native picker; return the chosen path plus a preview data URL.
  ipcMain.handle('photo:select', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose a profile photo',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    return { path, dataUrl: await toDataUrl(path) }
  })

  // Re-read a previously stored path (used to preview when editing a saved card).
  ipcMain.handle('photo:read', async (_event, path) => (path ? toDataUrl(path) : null))
}
