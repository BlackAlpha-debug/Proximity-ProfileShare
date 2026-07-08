import { app, shell, BrowserWindow, session } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { registerProfileIpc, ensureDeviceId } from './profileStore.js'
import { registerPermissionsIpc } from './permissions.js'
import { registerDiscoveryIpc } from './discovery.js'
import { registerHandshakeIpc } from './handshake.js'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    title: 'Proximity Profile Share',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Open external links in the user's browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // In dev, electron-vite injects ELECTRON_RENDERER_URL for hot reload.
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Allow camera access for QR scanning; deny every other permission by default.
  // The OS-level prompt (macOS TCC / Windows privacy) still governs real access.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')

  registerProfileIpc()
  registerPermissionsIpc()
  registerDiscoveryIpc()
  registerHandshakeIpc()
  // Create the deviceId on first launch if it doesn't exist yet.
  ensureDeviceId()
  createWindow()

  // Check for updates via GitHub Releases (see electron-builder.yml "publish").
  // Only meaningful for a packaged, signed build with a real publish target;
  // no-ops harmlessly in dev (app.isPackaged is false).
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  }

  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked and none are open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // On macOS, apps stay active until the user quits explicitly with Cmd+Q.
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
