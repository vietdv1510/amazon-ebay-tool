/**
 * eBay Taxonomy API Service
 * Dùng Application Token (Client Credentials) — không cần user login
 */

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
    path: (s.categoryTreePath || []).map(p => p.categoryName).join(' › ')
  }))
}

/**
 * Lấy Item Specifics (aspects) bắt buộc/tùy chọn cho 1 category
 * @returns Array of aspect objects
 */
export async function getCategoryAspects(categoryId, settings) {
  const data = await ebayGet(
    `/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}/get_item_aspects_for_category?category_id=${categoryId}`,
    settings
  )

  return (data.aspects || []).map(aspect => ({
    name: aspect.localizedAspectName,
    required: aspect.aspectConstraint?.aspectRequired || false,
    mode: aspect.aspectConstraint?.aspectMode || 'FREE_TEXT', // FREE_TEXT | SELECTION_ONLY
    values: (aspect.aspectValues || []).map(v => v.localizedValue),
    maxLength: aspect.aspectConstraint?.itemToAspectCardinality === 'MULTI' ? 'MULTI' : 'SINGLE',
  }))
}

/**
 * Tìm top-level category tree (để build dropdown)
 * Chỉ lấy các node cấp 1 và 2 để tránh response quá lớn
 */
export async function getCategoryTree(settings) {
  const data = await ebayGet(
    `/commerce/taxonomy/v1/category_tree/${EBAY_CATEGORY_TREE_ID}`,
    settings
  )

  // Chỉ lấy cấp 1 (rootCategoryNode.childCategoryTreeNodes)
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
