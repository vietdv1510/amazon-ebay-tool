import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'

// ─── Crawl History Storage ──────────────────────────────────────────────────
// Each session is stored as a separate JSON file in userData/crawl-history/
// File naming: {timestamp}.json

const getHistoryDir = () => {
  const dir = join(app.getPath('userData'), 'crawl-history')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Save a new crawl session
 * @param {Array} products - Array of crawled product data
 * @returns {{ ok: boolean, sessionId: string }}
 */
export function saveSession(products) {
  try {
    const sessionId = String(Date.now())
    const now = new Date()
    const session = {
      id: sessionId,
      createdAt: now.toISOString(),
      name: `Session ${now.toLocaleDateString('vi-VN')} ${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`,
      productCount: products.length,
      products
    }
    const filePath = join(getHistoryDir(), `${sessionId}.json`)
    writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8')
    console.log(`[History] Saved session ${sessionId} with ${products.length} products`)
    return { ok: true, sessionId }
  } catch (err) {
    console.error('[History] Save failed:', err)
    return { ok: false, error: err.message }
  }
}

/**
 * List all sessions (metadata only, no products)
 * @returns {Array<{ id, name, createdAt, productCount }>}
 */
export function listSessions() {
  try {
    const dir = getHistoryDir()
    const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()
    const sessions = []
    for (const file of files) {
      try {
        const raw = readFileSync(join(dir, file), 'utf-8')
        const data = JSON.parse(raw)
        sessions.push({
          id: data.id,
          name: data.name || file.replace('.json', ''),
          createdAt: data.createdAt,
          productCount: data.productCount || data.products?.length || 0,
          // Include first few ASINs for preview
          previewAsins: (data.products || []).slice(0, 5).map(p => p.asin)
        })
      } catch {
        // Skip corrupt files
      }
    }
    return sessions
  } catch (err) {
    console.error('[History] List failed:', err)
    return []
  }
}

/**
 * Load a full session (with products)
 * @param {string} sessionId
 * @returns {Object|null}
 */
export function loadSession(sessionId) {
  try {
    const filePath = join(getHistoryDir(), `${sessionId}.json`)
    if (!existsSync(filePath)) return null
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (err) {
    console.error(`[History] Load session ${sessionId} failed:`, err)
    return null
  }
}

/**
 * Delete a session
 * @param {string} sessionId
 * @returns {{ ok: boolean }}
 */
export function deleteSession(sessionId) {
  try {
    const filePath = join(getHistoryDir(), `${sessionId}.json`)
    if (existsSync(filePath)) unlinkSync(filePath)
    console.log(`[History] Deleted session ${sessionId}`)
    return { ok: true }
  } catch (err) {
    console.error(`[History] Delete session ${sessionId} failed:`, err)
    return { ok: false, error: err.message }
  }
}

/**
 * Delete a single product from a session
 * @param {string} sessionId
 * @param {string} asin
 * @returns {{ ok: boolean }}
 */
export function deleteProduct(sessionId, asin) {
  try {
    const session = loadSession(sessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    session.products = session.products.filter(p => p.asin !== asin)
    session.productCount = session.products.length
    const filePath = join(getHistoryDir(), `${sessionId}.json`)
    writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8')
    // If no products left, delete the session file
    if (session.products.length === 0) {
      unlinkSync(filePath)
      console.log(`[History] Session ${sessionId} empty, removed`)
    }
    return { ok: true }
  } catch (err) {
    console.error(`[History] Delete product ${asin} from ${sessionId} failed:`, err)
    return { ok: false, error: err.message }
  }
}

/**
 * Update a product's data within a session
 * @param {string} sessionId
 * @param {string} asin
 * @param {Object} updates - Partial product data to merge
 * @returns {{ ok: boolean }}
 */
export function updateProduct(sessionId, asin, updates) {
  try {
    const session = loadSession(sessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    const idx = session.products.findIndex(p => p.asin === asin)
    if (idx === -1) return { ok: false, error: 'Product not found' }
    session.products[idx] = { ...session.products[idx], ...updates }
    const filePath = join(getHistoryDir(), `${sessionId}.json`)
    writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8')
    return { ok: true }
  } catch (err) {
    console.error(`[History] Update product ${asin} in ${sessionId} failed:`, err)
    return { ok: false, error: err.message }
  }
}

/**
 * Rename a session
 * @param {string} sessionId
 * @param {string} newName
 * @returns {{ ok: boolean }}
 */
export function renameSession(sessionId, newName) {
  try {
    const session = loadSession(sessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    session.name = newName
    const filePath = join(getHistoryDir(), `${sessionId}.json`)
    writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf-8')
    return { ok: true }
  } catch (err) {
    console.error(`[History] Rename session ${sessionId} failed:`, err)
    return { ok: false, error: err.message }
  }
}
