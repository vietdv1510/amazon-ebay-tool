import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
app.name = 'eBay Engine'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import { crawlAmazon, cancelCrawl, closeBrowser } from './crawler'
import { getCategorySuggestions, getCategoryAspects, getCategoryTree, clearTokenCache } from './ebay-api'
import { fullSync } from './ebay-sync'
import { getSyncStatus, closeDb } from './ebay-db'
import path from 'path'

// ─── Settings store (JSON file) ───────────────────────────────────────────────
const settingsPath = join(app.getPath('userData'), 'settings.json')

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    }
  } catch (e) {
    console.error('Failed to load settings:', e)
  }
  return {
    priceMultiplier: 1.5,
    defaultCondition: '1000',
    defaultFormat: 'FixedPrice',
    defaultDuration: 'GTC',
    defaultQuantity: 10,
    crawlThreads: 3,
    crawlDelay: 2,
    crawlRetry: 3,
    headlessMode: true,
    ebayEnv: 'sandbox',
    ebayClientId: '',
    ebayClientSecret: '',
    geminiApiKey: '',
    useGemini: false,
    useEbayAI: true
  }
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

// ─── Playwright Crawl Manager ────────────────────────────────────────────────

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f13',
    title: 'eBay Engine',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()

  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// ─── App ready ────────────────────────────────────────────────────────────────
let mainWindow

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ebayengine.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', async () => {
  await closeBrowser()
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

// Settings
ipcMain.handle('settings:load', () => loadSettings())
ipcMain.handle('settings:save', (_, settings) => {
  saveSettings(settings)
  return { ok: true }
})

// File dialog - open CSV/Excel
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Spreadsheet', extensions: ['csv', 'xlsx', 'xls'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

// File dialog - save
ipcMain.handle('dialog:saveFile', async (_, opts = {}) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts.defaultPath || 'ebay_export.csv',
    filters: [
      { name: 'CSV', extensions: ['csv'] },
      { name: 'Excel', extensions: ['xlsx'] }
    ]
  })
  if (result.canceled) return null
  return result.filePath
})

// Read file content
ipcMain.handle('file:read', (_, filePath) => {
  return fs.readFileSync(filePath)
})

// Write file content
ipcMain.handle('file:write', (_, filePath, content) => {
  fs.writeFileSync(filePath, content, 'utf-8')
  return { ok: true }
})

// Crawl single ASIN
ipcMain.handle('crawl:asin', async (_, asin) => {
  try {
    const settings = loadSettings()
    const data = await crawlAmazon(
      asin,
      (msg) => {
        if (msg && mainWindow) {
          mainWindow.webContents.send('crawl-progress', {
            asin,
            message: msg.replace('[PROGRESS]', '').trim()
          })
        }
      },
      {
        headless: settings.headlessMode === true,
        delay: settings.crawlDelay ?? 2,
      }
    )
    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Cancel crawl
ipcMain.handle('crawl:cancel', (_, asin) => {
  cancelCrawl(asin)
  return { ok: true }
})

// Get app paths
ipcMain.handle('app:paths', () => ({
  userData: app.getPath('userData'),
  appPath: app.getAppPath()
}))

// ─── eBay Taxonomy API ────────────────────────────────────────────────────────

// Category suggestions từ title/keyword
ipcMain.handle('ebay:categorySuggestions', async (_, query) => {
  try {
    const settings = loadSettings()
    const results = await getCategorySuggestions(query, settings)
    return { ok: true, data: results }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Item Specifics (aspects) cho 1 category
ipcMain.handle('ebay:categoryAspects', async (_, categoryId) => {
  try {
    const settings = loadSettings()
    const results = await getCategoryAspects(categoryId, settings)
    return { ok: true, data: results }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Lấy category tree cấp 1+2 để build dropdown
ipcMain.handle('ebay:categoryTree', async () => {
  try {
    const settings = loadSettings()
    const results = await getCategoryTree(settings)
    return { ok: true, data: results }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Clear token cache khi user đổi credentials
ipcMain.handle('ebay:clearCache', () => {
  clearTokenCache()
  return { ok: true }
})

// ─── eBay Data Sync ───────────────────────────────────────────────────────────

// Sync toàn bộ category + aspects vào SQLite
ipcMain.handle('ebay:syncData', async () => {
  try {
    const settings = loadSettings()
    const result = await fullSync(settings, (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('ebay-sync-progress', progress)
      }
    })
    return result
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Lấy trạng thái sync hiện tại
ipcMain.handle('ebay:getSyncStatus', () => {
  try {
    return { ok: true, data: getSyncStatus() }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})
