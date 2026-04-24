/**
 * eBay Taxonomy API Service
 * Dùng Application Token (Client Credentials) — không cần user login
 * Hỗ trợ SQLite local cache để giảm API calls
 */
import { getAspectsFromCache, getCategoryTreeFromCache } from './ebay-db'

const EBAY_CATEGORY_TREE_ID = '0' // US marketplace

let tokenCache = {
  sandbox: null,
  production: null,
}

function getBaseUrl(env) {
  return env === 'production'
    ? 'https://api.ebay.com'
    : 'https://api.sandbox.ebay.com'
}

/**
 * Lấy Application OAuth token (tự cache + refresh)
 */
async function getAppToken(clientId, clientSecret, env = 'sandbox') {
  const cached = tokenCache[env]
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token
  }

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
  tokenCache[env] = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000)
  }

  return data.access_token
}

/**
 * Helper: gọi eBay API với token
 */
async function ebayGet(path, settings) {
  const { ebayClientId, ebayClientSecret, ebayEnv = 'sandbox' } = settings
  if (!ebayClientId || !ebayClientSecret) {
    throw new Error('Chưa cấu hình eBay Client ID / Client Secret trong Settings.')
  }

  const token = await getAppToken(ebayClientId, ebayClientSecret, ebayEnv)
  const base = getBaseUrl(ebayEnv)

  const res = await fetch(`${base}${path}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
    }
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`eBay API ${res.status}: ${err}`)
  }

  return res.json()
}

/**
 * Lấy danh sách category gợi ý từ title/keyword
 * Luôn call API (thuật toán AI search của eBay)
 * @returns Array of { categoryId, categoryName, categoryTreeNodeLevel, relevancy }
 */
export async function getCategorySuggestions(query, settings) {
  const encoded = encodeURIComponent(query.slice(0, 150)) // eBay giới hạn query length
  const data = await ebayGet(
    `/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}/get_category_suggestions?q=${encoded}`,
    settings
  )

  return (data.categorySuggestions || []).slice(0, 8).map(s => ({
    categoryId: s.category.categoryId,
    categoryName: s.category.categoryName,
    categoryTreeNodeLevel: s.categoryTreeNodeLevel,
    relevancy: s.relevancy,
    // Build breadcrumb path
    path: (s.categoryTreeNodeAncestors || []).map(p => p.categoryName).reverse().join(' › ')
  }))
}

/**
 * Lấy Item Specifics (aspects) bắt buộc/tùy chọn cho 1 category
 * Ưu tiên đọc từ SQLite cache. Nếu cache miss thì fallback call API.
 * @returns Array of aspect objects with 3-tier usage
 */
export async function getCategoryAspects(categoryId, settings) {
  // 1. Thử đọc từ SQLite cache trước
  try {
    const cached = getAspectsFromCache(categoryId)
    if (cached && cached.length > 0) {
      return cached
    }
  } catch (e) {
    console.warn('SQLite cache read failed, falling back to API:', e.message)
  }

  // 2. Fallback: gọi API
  const data = await ebayGet(
    `/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}/get_item_aspects_for_category?category_id=${categoryId}`,
    settings
  )

  return (data.aspects || []).map(aspect => {
    const constraint = aspect.aspectConstraint || {}
    const isRequired = constraint.aspectRequired === true
    const aspectUsage = constraint.aspectUsage || 'OPTIONAL'

    let usage
    if (isRequired) {
      usage = 'REQUIRED'
    } else if (aspectUsage === 'RECOMMENDED') {
      usage = 'RECOMMENDED'
    } else {
      usage = 'OPTIONAL'
    }

    return {
      name: aspect.localizedAspectName,
      required: isRequired,
      usage, // REQUIRED | RECOMMENDED | OPTIONAL
      mode: constraint.aspectMode || 'FREE_TEXT',
      cardinality: constraint.itemToAspectCardinality || 'SINGLE',
      values: (aspect.aspectValues || []).map(v => v.localizedValue),
    }
  })
}

/**
 * Tìm top-level category tree
 * Ưu tiên đọc từ SQLite cache
 */
export async function getCategoryTree(settings) {
  // 1. Thử đọc từ SQLite cache trước
  try {
    const cached = getCategoryTreeFromCache()
    if (cached && cached.length > 0) {
      return cached
    }
  } catch (e) {
    console.warn('SQLite cache read failed, falling back to API:', e.message)
  }

  // 2. Fallback: gọi API
  const data = await ebayGet(
    `/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}`,
    settings
  )

  const rootNodes = data.rootCategoryNode?.childCategoryTreeNodes || []
  return rootNodes.map(node => ({
    id: node.category.categoryId,
    name: node.category.categoryName,
    children: (node.childCategoryTreeNodes || []).slice(0, 20).map(child => ({
      id: child.category.categoryId,
      name: child.category.categoryName,
    }))
  }))
}

/**
 * Clear token cache (dùng khi user đổi credentials)
 */
export function clearTokenCache() {
  tokenCache = { sandbox: null, production: null }
}
