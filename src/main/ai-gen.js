/**
 * AI Content Generation Module
 * Uses Google Gemini API to rewrite Amazon product titles/descriptions for eBay.
 */

const DEFAULT_TITLE_PROMPT = `You are an eBay listing optimization expert.
Rewrite this Amazon product title for an eBay listing.

Rules:
- MAXIMUM 80 characters (this is STRICT — count carefully)
- Remove brand spam, redundant keywords, and Amazon-specific formatting
- Keep the most important product identifiers (brand name, model, key specs)
- Make it clear, buyer-friendly, and search-optimized for eBay
- Do NOT add quotes, special characters, or emoji
- Return ONLY the rewritten title, nothing else

Original title: {title}`

const DEFAULT_DESCRIPTION_PROMPT = `You are an eBay listing copywriter.
Rewrite this product information into a professional eBay listing description.

Rules:
- Professional, concise tone
- Highlight key features and specifications
- Remove any Amazon-specific references (Prime, Subscribe & Save, etc.)
- Use clean HTML formatting (paragraphs, bullet lists, bold for key specs)
- Keep it under 2000 characters
- Do NOT include any external links or references to other marketplaces
- Return ONLY the HTML description, no markdown

Product features:
{bulletPoints}

Product description:
{description}

Technical specs:
{specs}`

/**
 * Call Gemini API
 */
async function callGemini(prompt, settings) {
  const model = settings.geminiModel || 'gemini-3.1-flash-lite-preview'
  const apiKey = settings.geminiApiKey
  if (!apiKey) throw new Error('Gemini API Key chưa được cấu hình')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      }
    })
  })

  if (!response.ok) {
    const errBody = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errBody}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned empty response')
  return text.trim()
}

/**
 * Generate optimized title (≤80 chars)
 */
export async function generateTitle(originalTitle, settings) {
  if (!originalTitle) return ''

  const promptTemplate = settings.aiTitlePrompt?.trim() || DEFAULT_TITLE_PROMPT
  const prompt = promptTemplate.replace('{title}', originalTitle)

  let result = await callGemini(prompt, settings)

  // Strip quotes if AI wrapped in them
  result = result.replace(/^["']|["']$/g, '').trim()

  // Hard truncate if still over 80
  if (result.length > 80) {
    result = result.substring(0, 77).trim() + '...'
  }

  return result
}

/**
 * Generate optimized description (HTML)
 */
export async function generateDescription(product, settings) {
  const promptTemplate = settings.aiDescriptionPrompt?.trim() || DEFAULT_DESCRIPTION_PROMPT

  const bulletText = (product.bulletPoints || []).map((b) => `- ${b}`).join('\n')
  const specsText = product.specs
    ? Object.entries(product.specs)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    : ''

  const prompt = promptTemplate
    .replace('{bulletPoints}', bulletText || 'N/A')
    .replace('{description}', product.description || 'N/A')
    .replace('{specs}', specsText || 'N/A')
    .replace('{title}', product.title || '')

  return await callGemini(prompt, settings)
}

/**
 * Batch generate for multiple products
 * @param {Array} products - Array of product objects from globalRowData
 * @param {Object} settings - App settings
 * @param {Function} progressCb - (asin, step, total, current) => void
 * @returns {Array} - Array of { asin, title?, description? }
 */
export async function batchGenerate(products, settings, progressCb) {
  const results = []
  const total = products.length

  for (let i = 0; i < products.length; i++) {
    const product = products[i]
    const result = { asin: product.asin }

    progressCb(product.asin, `Đang xử lý ${i + 1}/${total}...`, total, i + 1)

    try {
      // Generate title if enabled
      if (settings.aiRewriteTitle !== false && product.title) {
        result.title = await generateTitle(product.title, settings)
        console.log(`[AI-Gen] Title: "${product.title.substring(0, 40)}..." → "${result.title}"`)
      }

      // Generate description if enabled
      if (settings.aiRewriteDescription !== false) {
        result.description = await generateDescription(product, settings)
        console.log(
          `[AI-Gen] Description generated for ${product.asin} (${result.description.length} chars)`
        )
      }

      result.ok = true
    } catch (err) {
      console.error(`[AI-Gen] Error for ${product.asin}:`, err.message)
      result.ok = false
      result.error = err.message
    }

    results.push(result)

    // Small delay between API calls to avoid rate limiting
    if (i < products.length - 1) {
      await new Promise((r) => setTimeout(r, 300))
    }
  }

  return results
}
