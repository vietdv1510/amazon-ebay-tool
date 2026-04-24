/**
 * eBay SQLite Local Cache
 * Lưu toàn bộ Category Tree + Aspects offline để giảm API calls
 */
import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

let db = null

/**
 * Khởi tạo / mở database
 */
export function getDb() {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'ebay_cache.db')
  db = new Database(dbPath)

  // Tối ưu performance
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('cache_size = -64000') // 64MB cache

  // Tạo tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      categoryId   TEXT PRIMARY KEY,
      categoryName TEXT NOT NULL,
      parentId     TEXT,
      level        INTEGER DEFAULT 0,
      isLeaf       INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS aspects (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      categoryId   TEXT NOT NULL,
      aspectName   TEXT NOT NULL,
      usage        TEXT NOT NULL DEFAULT 'OPTIONAL',  -- REQUIRED | RECOMMENDED | OPTIONAL
      mode         TEXT NOT NULL DEFAULT 'FREE_TEXT',  -- FREE_TEXT | SELECTION_ONLY
      cardinality  TEXT NOT NULL DEFAULT 'SINGLE',     -- SINGLE | MULTI
      dataType     TEXT DEFAULT 'STRING',
      UNIQUE(categoryId, aspectName)
    );

    CREATE TABLE IF NOT EXISTS aspect_values (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      categoryId   TEXT NOT NULL,
      aspectName   TEXT NOT NULL,
      value        TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (
      key          TEXT PRIMARY KEY,
      value        TEXT,
      updatedAt    TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_aspects_category ON aspects(categoryId);
    CREATE INDEX IF NOT EXISTS idx_aspect_values_cat ON aspect_values(categoryId, aspectName);
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parentId);
  `)

  return db
}

// ─── Category Queries ──────────────────────────────────────────────────────────

/**
 * Lấy aspects cho 1 category từ SQLite
 * @returns Array giống format cũ của getCategoryAspects API
 */
export function getAspectsFromCache(categoryId) {
  const database = getDb()

  const aspects = database.prepare(`
    SELECT aspectName, usage, mode, cardinality, dataType
    FROM aspects WHERE categoryId = ?
    ORDER BY
      CASE usage WHEN 'REQUIRED' THEN 0 WHEN 'RECOMMENDED' THEN 1 ELSE 2 END,
      aspectName
  `).all(categoryId)

  if (aspects.length === 0) return null // Cache miss

  // Lấy values cho từng aspect
  const valuesStmt = database.prepare(`
    SELECT value FROM aspect_values
    WHERE categoryId = ? AND aspectName = ?
  `)

  return aspects.map(a => ({
    name: a.aspectName,
    required: a.usage === 'REQUIRED',
    usage: a.usage, // REQUIRED | RECOMMENDED | OPTIONAL
    mode: a.mode,
    cardinality: a.cardinality,
    values: valuesStmt.all(categoryId, a.aspectName).map(v => v.value),
  }))
}

/**
 * Lấy category tree từ SQLite
 */
export function getCategoryTreeFromCache() {
  const database = getDb()

  const count = database.prepare('SELECT COUNT(*) as cnt FROM categories').get()
  if (count.cnt === 0) return null // Cache miss

  // Lấy categories cấp 1
  const level1 = database.prepare(`
    SELECT categoryId, categoryName FROM categories WHERE level = 1 ORDER BY categoryName
  `).all()

  // Lấy children cấp 2 cho mỗi cấp 1
  const childStmt = database.prepare(`
    SELECT categoryId, categoryName FROM categories WHERE parentId = ? ORDER BY categoryName LIMIT 30
  `)

  return level1.map(node => ({
    id: node.categoryId,
    name: node.categoryName,
    children: childStmt.all(node.categoryId).map(c => ({
      id: c.categoryId,
      name: c.categoryName,
    })),
  }))
}

// ─── Sync Status ───────────────────────────────────────────────────────────────

export function getSyncStatus() {
  const database = getDb()

  const catCount = database.prepare('SELECT COUNT(*) as cnt FROM categories').get().cnt
  const aspectCatCount = database.prepare('SELECT COUNT(DISTINCT categoryId) as cnt FROM aspects').get().cnt
  const lastSync = database.prepare("SELECT value FROM sync_meta WHERE key = 'lastSyncTime'").get()
  const treeVersion = database.prepare("SELECT value FROM sync_meta WHERE key = 'treeVersion'").get()

  return {
    categoryCount: catCount,
    aspectCategoryCount: aspectCatCount,
    lastSyncTime: lastSync?.value || null,
    treeVersion: treeVersion?.value || null,
  }
}

export function setSyncMeta(key, value) {
  const database = getDb()
  database.prepare(`
    INSERT OR REPLACE INTO sync_meta (key, value, updatedAt) VALUES (?, ?, datetime('now'))
  `).run(key, value)
}

/**
 * Đóng database connection
 */
export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}
