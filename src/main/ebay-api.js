/**
 * eBay Taxonomy API Service
 * Use Application Token (Client Credentials) — no user login required
 * Support SQLite local cache to reduce API calls
 */
import { getAspectsFromCache, getCategoryTreeFromCache } from './ebay-db'

const EBAY_CATEGORY_TREE_ID = '0' // US marketplace

// Default credentials — injected at build time via .env (not stored in source)
const DEFAULT_EBAY = {
  ebayClientId: process.env.EBAY_CLIENT_ID,
  ebayClientSecret: process.env.EBAY_CLIENT_SECRET,
  ebayEnv: process.env.EBAY_ENV || 'sandbox',
}

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
 * Get Application OAuth token (auto cache + refresh)
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
 * Helper: call eBay API with token
 * Always uses bundled credentials (Settings UI is hidden)
 */
async function ebayGet(path) {
  const ebayClientId = DEFAULT_EBAY.ebayClientId
  const ebayClientSecret = DEFAULT_EBAY.ebayClientSecret
  const ebayEnv = DEFAULT_EBAY.ebayEnv

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
 * Get list of suggested categories from title/keyword
 * Always call API (eBay's AI search algorithm)
 * @returns Array of { categoryId, categoryName, categoryTreeNodeLevel, relevancy }
 */
export async function getCategorySuggestions(query) {
  const encoded = encodeURIComponent(query.slice(0, 150)) // eBay limits query length
  const data = await ebayGet(
    `/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}/get_category_suggestions?q=${encoded}`
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
 * Get mandatory/optional Item Specifics (aspects) for 1 category
 * Prioritize reading from SQLite cache. Fallback to API call on cache miss.
 * @returns Array of aspect objects with 3-tier usage
 */
export async function getCategoryAspects(categoryId, settings) {
  // 1. Try reading from SQLite cache first
  try {
    const cached = getAspectsFromCache(categoryId)
    if (cached && cached.length > 0) {
      return cached
    }
  } catch (e) {
    console.warn('SQLite cache read failed, falling back to API:', e.message)
  }

  // 2. Fallback: call API
  const data = await ebayGet(
    `/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}/get_item_aspects_for_category?category_id=${categoryId}`
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
 * Find top-level category tree
 * Prioritize reading from SQLite cache
 */
export async function getCategoryTree(settings) {
  // 1. Try reading from SQLite cache first
  try {
    const cached = getCategoryTreeFromCache()
    if (cached && cached.length > 0) {
      return cached
    }
  } catch (e) {
    console.warn('SQLite cache read failed, falling back to API:', e.message)
  }

  // 2. Fallback: call API
  const data = await ebayGet(
    `/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}`
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
 * Clear token cache (used when user changes credentials)
 */
export function clearTokenCache() {
  tokenCache = { sandbox: null, production: null }
}
