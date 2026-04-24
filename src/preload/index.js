import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Expose typed API to renderer
const api = {
  // Settings
  settings: {
    load: () => ipcRenderer.invoke('settings:load'),
    save: (settings) => ipcRenderer.invoke('settings:save', settings)
  },

  // Dialogs
  dialog: {
    openFile: () => ipcRenderer.invoke('dialog:openFile'),
    saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts)
  },

  // File I/O
  file: {
    read: (filePath) => ipcRenderer.invoke('file:read', filePath),
    write: (filePath, content) => ipcRenderer.invoke('file:write', filePath, content)
  },

  // Crawl
  crawl: {
    asin: (asin) => ipcRenderer.invoke('crawl:asin', asin),
    cancel: (asin) => ipcRenderer.invoke('crawl:cancel', asin),
    onProgress: (callback) => {
      ipcRenderer.on('crawl-progress', (_, data) => callback(data))
      return () => ipcRenderer.removeAllListeners('crawl-progress')
    }
  },

  // App info
  app: {
    paths: () => ipcRenderer.invoke('app:paths')
  },

  // eBay Taxonomy API
  ebay: {
    categorySuggestions: (query) => ipcRenderer.invoke('ebay:categorySuggestions', query),
    categoryAspects: (categoryId) => ipcRenderer.invoke('ebay:categoryAspects', categoryId),
    categoryTree: () => ipcRenderer.invoke('ebay:categoryTree'),
    clearCache: () => ipcRenderer.invoke('ebay:clearCache'),
    syncData: () => ipcRenderer.invoke('ebay:syncData'),
    getSyncStatus: () => ipcRenderer.invoke('ebay:getSyncStatus'),
    onSyncProgress: (callback) => {
      ipcRenderer.on('ebay-sync-progress', (_, data) => callback(data))
      return () => ipcRenderer.removeAllListeners('ebay-sync-progress')
    },
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}
