/**
 * eBay Data Sync Service
 * Tải bulk data từ eBay API → import vào SQLite local
 */
import { getDb, setSyncMeta, closeDb } from './ebay-db'
import { createGunzip } from 'zlib'
import { Readable } from 'stream'

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getBaseUrl(env) {
  return env === 'production'
    ? 'https://api.ebay.com'
    : 'https://api.sandbox.ebay.com'
}

async function getAppToken(clientId, clientSecret, env) {
  const base = getBaseUrl(env)
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(`${base}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`eBay OAuth failed (${res.status}): ${err}`)
  }

  const data = await res.json()
  return data.access_token
}

// ─── Sync Category Tree ────────────────────────────────────────────────────────

/**
 * Tải toàn bộ category tree (1 API call) → lưu SQLite
 */
export async function syncCategoryTree(settings, onProgress) {
  const { ebayClientId, ebayClientSecret, ebayEnv = 'sandbox' } = settings
  const token = await getAppToken(ebayClientId, ebayClientSecret, ebayEnv)
  const base = getBaseUrl(ebayEnv)

  onProgress?.({ step: 'tree', message: 'Đang tải Category Tree...', percent: 0 })

  const res = await fetch(`${base}/commerce/taxonomy/v1/category_tree/0`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!res.ok) throw new Error(`Category Tree API failed: ${res.status}`)

  const data = await res.json()
  const db = getDb()

  onProgress?.({ step: 'tree', message: 'Đang lưu categories vào database...', percent: 30 })

  // Clear old data
  db.exec('DELETE FROM categories')

  // Flatten tree → array
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO categories (categoryId, categoryName, parentId, level, isLeaf)
    VALUES (?, ?, ?, ?, ?)
  `)

  let count = 0
  const insertAll = db.transaction(() => {
    function walk(node, parentId, level) {
      const children = node.childCategoryTreeNodes || []
      const isLeaf = children.length === 0 ? 1 : 0
      insertStmt.run(node.category.categoryId, node.category.categoryName, parentId, level, isLeaf)
      count++
      for (const child of children) {
        walk(child, node.category.categoryId, level + 1)
      }
    }
    walk(data.rootCategoryNode, null, 0)
  })

  insertAll()

  setSyncMeta('treeVersion', data.categoryTreeVersion || 'unknown')
  onProgress?.({ step: 'tree', message: `✓ Đã lưu ${count} categories`, percent: 100 })

  return count
}

// ─── Sync Aspects (Bulk Download) ──────────────────────────────────────────────

/**
 * Tải toàn bộ aspects cho ALL leaf categories (1 API call) → lưu SQLite
 * File trả về là gzipped JSON, có thể nặng 100-200MB compressed
 */
export async function syncAspects(settings, onProgress) {
  const { ebayClientId, ebayClientSecret, ebayEnv = 'sandbox' } = settings
  const token = await getAppToken(ebayClientId, ebayClientSecret, ebayEnv)
  const base = getBaseUrl(ebayEnv)

  onProgress?.({ step: 'aspects', message: 'Đang tải bulk aspects (có thể mất 2-5 phút)...', percent: 0 })

  const res = await fetch(`${base}/commerce/taxonomy/v1/category_tree/0/fetch_item_aspects`, {
    headers: { 'Authorization': `Bearer ${token}` }
  })

  if (!res.ok) throw new Error(`fetchItemAspects API failed: ${res.status}`)

  onProgress?.({ step: 'aspects', message: 'Đang download file...', percent: 10 })

  // Download entire response as buffer
  const buffer = Buffer.from(await res.arrayBuffer())
  const sizeMB = (buffer.length / 1024 / 1024).toFixed(1)
  onProgress?.({ step: 'aspects', message: `Downloaded ${sizeMB}MB, đang giải nén...`, percent: 30 })

  // Decompress gzip
  let jsonStr
  try {
    jsonStr = await decompressGzip(buffer)
  } catch {
    // Maybe not gzipped (sandbox sometimes returns plain JSON)
    jsonStr = buffer.toString('utf8')
  }

  onProgress?.({ step: 'aspects', message: 'Đang parse JSON...', percent: 50 })

  const data = JSON.parse(jsonStr)
  jsonStr = null // Free memory

  const categoryAspects = data.categoryAspects || []
  const totalCats = categoryAspects.length

  onProgress?.({ step: 'aspects', message: `Đang import ${totalCats} categories vào database...`, percent: 60 })

  const db = getDb()

  // Clear old data
  db.exec('DELETE FROM aspects')
  db.exec('DELETE FROM aspect_values')

  const insertAspect = db.prepare(`
    INSERT OR REPLACE INTO aspects (categoryId, aspectName, usage, mode, cardinality, dataType)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const insertValue = db.prepare(`
    INSERT INTO aspect_values (categoryId, aspectName, value) VALUES (?, ?, ?)
  `)

  // Process in batches of 500 categories per transaction
  const BATCH_SIZE = 500
  let processed = 0

  for (let i = 0; i < totalCats; i += BATCH_SIZE) {
    const batch = categoryAspects.slice(i, i + BATCH_SIZE)

    const insertBatch = db.transaction(() => {
      for (const catAspect of batch) {
        const catId = catAspect.category.categoryId
        const aspects = catAspect.aspects || []

        for (const aspect of aspects) {
          const constraint = aspect.aspectConstraint || {}
          const isRequired = constraint.aspectRequired === true
          const aspectUsage = constraint.aspectUsage || 'OPTIONAL'

          // Phân loại 3 cấp
          let usage
          if (isRequired) {
            usage = 'REQUIRED'
          } else if (aspectUsage === 'RECOMMENDED') {
            usage = 'RECOMMENDED'
          } else {
            usage = 'OPTIONAL'
          }

          const mode = constraint.aspectMode || 'FREE_TEXT'
          const cardinality = constraint.itemToAspectCardinality || 'SINGLE'
          const dataType = constraint.aspectDataType || 'STRING'

          insertAspect.run(catId, aspect.localizedAspectName, usage, mode, cardinality, dataType)

          // Insert aspect values
          const values = aspect.aspectValues || []
          for (const v of values) {
            if (v.localizedValue) {
              insertValue.run(catId, aspect.localizedAspectName, v.localizedValue)
            }
          }
        }
      }
    })

    insertBatch()
    processed += batch.length

    const percent = 60 + Math.round((processed / totalCats) * 35)
    if (processed % 2000 === 0 || processed === totalCats) {
      onProgress?.({
        step: 'aspects',
        message: `Đang import... ${processed}/${totalCats} categories`,
        percent
      })
    }
  }

  setSyncMeta('aspectsVersion', data.categoryTreeVersion || 'unknown')
  setSyncMeta('lastSyncTime', new Date().toISOString())

  onProgress?.({ step: 'aspects', message: `✓ Hoàn tất — ${totalCats} categories đã import`, percent: 100 })

  return totalCats
}

// ─── Full Sync ─────────────────────────────────────────────────────────────────

/**
 * Sync toàn bộ: Category Tree + Aspects
 */
export async function fullSync(settings, onProgress) {
  try {
    const catCount = await syncCategoryTree(settings, onProgress)
    const aspectCount = await syncAspects(settings, onProgress)

    return {
      ok: true,
      categoryCount: catCount,
      aspectCategoryCount: aspectCount,
    }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function decompressGzip(buffer) {
  return new Promise((resolve, reject) => {
    const gunzip = createGunzip()
    const chunks = []
    const readable = Readable.from(buffer)

    readable.pipe(gunzip)

    gunzip.on('data', chunk => chunks.push(chunk))
    gunzip.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    gunzip.on('error', reject)
  })
}
