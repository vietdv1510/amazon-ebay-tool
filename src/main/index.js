import { app, shell, BrowserWindow, ipcMain, dialog, nativeImage, webContents } from 'electron'
app.name = 'eBay Engine'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import fs from 'fs'
import { crawlAmazon, crawlAmazonWithRetry, cancelCrawl, closeBrowser } from './crawler'
import { batchGenerate } from './ai-gen'
import { uploadToR2, testR2Connection, resetR2Client } from './r2-uploader'
import {
  getCategorySuggestions,
  getCategoryAspects,
  getCategoryTree,
  clearTokenCache
} from './ebay-api'
import { fullSync } from './ebay-sync'
import { getSyncStatus, closeDb, searchCategoriesOffline } from './ebay-db'

// ─── Playwright: point to bundled Chromium ────────────────────────────────────
// Must be set before any chromium.launch() call (happens on first crawl).
if (app.isPackaged) {
  // Production: Chromium is bundled in app's extraResources
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(process.resourcesPath, 'playwright-browsers')
} else {
  // Dev mode: use project-local playwright-browsers/ directory
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(__dirname, '../../playwright-browsers')
}

// ─── Settings store (JSON file) ───────────────────────────────────────────────
const settingsPath = join(app.getPath('userData'), 'settings.json')

const DEFAULT_SETTINGS = {
  priceMultiplier: 1.5,
  defaultCondition: '1000',
  defaultFormat: 'FixedPrice',
  defaultDuration: 'GTC',
  defaultQuantity: 10,
  crawlThreads: 1,
  crawlDelay: 2,
  crawlRetry: 3,
  headlessMode: true,
  ebayEnv: 'sandbox',
  ebayClientId: '',
  ebayClientSecret: '',
  useEbayAI: true,
  forceUSLocation: true,
  // AI Gen (Gemini)
  useGemini: false,
  geminiApiKey: '',
  geminiModel: 'gemini-3.1-flash-lite-preview',
  aiRewriteTitle: true,
  aiRewriteDescription: true,
  aiTitlePrompt: '',
  aiDescriptionPrompt: '',
  // Cloudflare R2 CDN
  useR2Cdn: false,
  r2AutoUpload: true,
  r2AccountId: '',
  r2AccessKeyId: '',
  r2SecretAccessKey: '',
  r2BucketName: '',
  r2CustomDomain: '',
  r2ConvertWebp: true,
  r2WebpQuality: 80
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8')
      console.log('[Settings] Raw content from disk:', content)
      const saved = JSON.parse(content)
      // Robust merge: only use saved value if it's not null/undefined
      const merged = { ...DEFAULT_SETTINGS }
      for (const key in saved) {
        if (saved[key] !== null && saved[key] !== undefined) {
          merged[key] = saved[key]
        }
      }
      console.log('[Settings] Merged settings:', JSON.stringify(merged))
      return merged
    }
  } catch (e) {
    console.error('Failed to load settings:', e)
  }
  return DEFAULT_SETTINGS
}

function saveSettings(settings) {
  console.log('[Settings] Saving to:', settingsPath)
  console.log('[Settings] Data:', JSON.stringify(settings, null, 2))
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    console.log('[Settings] Save successful')
  } catch (err) {
    console.error('[Settings] Save failed:', err)
    throw err
  }
}

// ─── Playwright Crawl Manager ────────────────────────────────────────────────

function sendToWebContents(senderId, channel, payload) {
  try {
    const sender = webContents.fromId(senderId)
    if (sender && !sender.isDestroyed()) {
      sender.send(channel, payload)
    }
  } catch (err) {
    console.warn(`[IPC] Failed to send ${channel}:`, err.message)
  }
}

// ─── Window ───────────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f0f13',
    title: 'eBay Engine',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// ─── App ready ────────────────────────────────────────────────────────────────
let mainWindow

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.ebayengine.app')
  if (process.platform === 'darwin') {
    const iconPath = join(__dirname, '../../resources/icon.png')
    app.dock.setIcon(nativeImage.createFromPath(iconPath))
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  mainWindow = createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
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
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const result = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
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
  const win = BrowserWindow.getFocusedWindow() || mainWindow
  const result = await dialog.showSaveDialog(win && !win.isDestroyed() ? win : undefined, {
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
ipcMain.handle('crawl:asin', async (event, asin) => {
  try {
    const settings = loadSettings()
    const senderId = event.sender.id
    const progressCb = (msg) => {
      if (!msg) return
      sendToWebContents(senderId, 'crawl-progress', {
        asin,
        message: String(msg).replace('[PROGRESS]', '').trim()
      })
    }
    const data = await crawlAmazonWithRetry(
      asin,
      progressCb,
      {
        headless: settings.headlessMode === true,
        delay: settings.crawlDelay ?? 2,
        defaultQuantity: settings.defaultQuantity || 10,
        forceUSLocation: settings.forceUSLocation !== false,
        maxRetries: settings.crawlRetry ?? 3,
        baseRetryDelayMs: 5000
      }
    )

    if (!data) {
      return { ok: false, error: 'Không lấy được dữ liệu từ Amazon' }
    }

    // R2 CDN: always upload images after crawl if enabled
    if (settings.useR2Cdn && data.images?.length > 0) {
      // Validate R2 credentials
      if (!settings.r2AccountId || !settings.r2AccessKeyId || !settings.r2SecretAccessKey || !settings.r2BucketName) {
        progressCb('[PROGRESS] ⚠ CDN bật nhưng chưa cấu hình đầy đủ — vào Settings để nhập thông tin R2')
      } else {
        try {
          progressCb('[PROGRESS] Uploading images to CDN...')
          data.images = await uploadToR2(data.images, asin, settings, (msg) => {
            progressCb(`[PROGRESS] ${msg}`)
          })
          // Also upload variation images
          if (data.variations?.length > 0) {
            for (let vi = 0; vi < data.variations.length; vi++) {
              const v = data.variations[vi]
              if (v.image) {
                const [cdnUrl] = await uploadToR2([v.image], `${asin}/var`, settings, () => {})
                data.variations[vi].image = cdnUrl
              }
            }
          }
          // Upload description images too
          if (data.descriptionImages?.length > 0) {
            data.descriptionImages = await uploadToR2(
              data.descriptionImages, `${asin}/desc`, settings, () => {}
            )
          }
          progressCb('[PROGRESS] ✓ Images uploaded to CDN')
        } catch (r2Err) {
          console.warn('[R2] Auto-upload failed, keeping original URLs:', r2Err.message)
          progressCb(`[PROGRESS] ⚠ CDN upload lỗi: ${r2Err.message}`)
        }
      }
    }

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

// Category suggestions from title/keyword
ipcMain.handle('ebay:categorySuggestions', async (_, query) => {
  try {
    console.log(`[CategorySearch] query="${query}"`)

    // Always try eBay API first — credentials are bundled, no user config needed
    // Fallback to offline SQLite only if API fails (rate-limit / network error)
    try {
      const results = await getCategorySuggestions(query)
      console.log(`[CategorySearch] eBay API results: ${results.length}`)
      if (results.length > 0) return { ok: true, data: results }
    } catch (apiErr) {
      console.warn(`[CategorySearch] eBay API failed, using offline DB:`, apiErr.message)
    }

    // Offline fallback (always available)
    const offlineResults = searchCategoriesOffline(query)
    console.log(`[CategorySearch] Offline results: ${offlineResults.length}`)
    if (offlineResults.length > 0) return { ok: true, data: offlineResults }

    return { ok: true, data: [] }
  } catch (e) {
    console.error(`[CategorySearch] ERROR:`, e.message)
    return { ok: false, error: e.message }
  }
})

// Item Specifics (aspects) for 1 category
ipcMain.handle('ebay:categoryAspects', async (_, categoryId) => {
  try {
    const settings = loadSettings()
    const results = await getCategoryAspects(categoryId, settings)
    return { ok: true, data: results }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Get category tree level 1+2 to build dropdown
ipcMain.handle('ebay:categoryTree', async () => {
  try {
    const settings = loadSettings()
    const results = await getCategoryTree(settings)
    return { ok: true, data: results }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Clear token cache when user changes credentials
ipcMain.handle('ebay:clearCache', () => {
  clearTokenCache()
  return { ok: true }
})

// ─── eBay Data Sync ───────────────────────────────────────────────────────────

// Sync all categories + aspects to SQLite
ipcMain.handle('ebay:syncData', async (event) => {
  try {
    const senderId = event.sender.id
    const progressCb = (progress) => {
      sendToWebContents(senderId, 'ebay-sync-progress', progress)
    }
    const settings = loadSettings()
    const result = await fullSync(settings, progressCb)
    return result
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// Get current sync status
ipcMain.handle('ebay:getSyncStatus', () => {
  try {
    return { ok: true, data: getSyncStatus() }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── AI Content Generation ────────────────────────────────────────────────────

ipcMain.handle('ai:batchGenerate', async (event, products) => {
  try {
    const senderId = event.sender.id
    const settings = loadSettings()
    if (!settings.useGemini || !settings.geminiApiKey) {
      return { ok: false, error: 'Gemini AI chưa được bật hoặc thiếu API Key' }
    }
    const progressCb = (asin, message, total, current) => {
      sendToWebContents(senderId, 'ai-gen-progress', { asin, message, total, current })
    }
    const results = await batchGenerate(products, settings, progressCb)
    // Ensure results are plain serializable objects
    const safeResults = results.map(r => ({
      asin: r.asin,
      ok: !!r.ok,
      title: r.title,
      description: r.description,
      features: r.features,
      error: r.error
    }))
    return { ok: true, data: safeResults }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ─── Cloudflare R2 CDN ────────────────────────────────────────────────────────

ipcMain.handle('r2:uploadImages', async (event, { images, asin }) => {
  try {
    const senderId = event.sender.id
    const settings = loadSettings()
    if (!settings.useR2Cdn) {
      return { ok: false, error: 'R2 CDN chưa được bật' }
    }
    const cdnUrls = await uploadToR2(images, asin, settings, (msg) => {
      sendToWebContents(senderId, 'r2-upload-progress', { asin, message: msg })
    })
    return { ok: true, data: cdnUrls }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('r2:testConnection', async () => {
  try {
    const settings = loadSettings()
    const result = await testR2Connection(settings)
    return { ok: !!result.ok, message: String(result.message || '') }
  } catch (e) {
    return { ok: false, message: String(e?.message || e) }
  }
})

ipcMain.handle('r2:resetClient', () => {
  resetR2Client()
  return { ok: true }
})
