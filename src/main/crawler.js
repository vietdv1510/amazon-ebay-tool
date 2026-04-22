import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import * as cheerio from 'cheerio'

chromium.use(stealth())

let browser = null
let currentHeadless = true
const activeCrawls = new Map()

export async function initBrowser(headless = true) {
  // Nếu headless mode thay đổi → restart browser
  if (browser && currentHeadless !== headless) {
    await closeBrowser()
  }
  if (!browser) {
    currentHeadless = headless
    browser = await chromium.launch({
      headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ]
    })
  }
  return browser
}

export async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {})
    browser = null
  }
}

export async function crawlAmazon(asin, progressCb, options = {}) {
  const { headless = true, delay = 2 } = options
  const b = await initBrowser(headless)

  const context = await b.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    }
  })

  const page = await context.newPage()
  activeCrawls.set(asin, page)
  progressCb('[PROGRESS] Khởi động Playwright...')

  try {
    const url = `https://www.amazon.com/dp/${asin}`
    progressCb(`[PROGRESS] Mở trang ${url}`)

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 })

    // Random delay để tránh bot detection
    const waitMs = (delay * 1000) + Math.random() * 1000
    progressCb('[PROGRESS] Đang render trang...')
    await page.waitForTimeout(waitMs)

    progressCb('[PROGRESS] Trích xuất dữ liệu...')
    const html = await page.content()
    const $ = cheerio.load(html)

    // ── Title ──────────────────────────────────────────────────────────────
    const title = $('#productTitle').text().trim()
    if (!title && html.includes('captcha')) {
      throw new Error('Amazon Anti-Bot Captcha triggered — thử lại sau.')
    }
    if (!title) throw new Error('Không tìm thấy tiêu đề sản phẩm.')

    // ── Price ──────────────────────────────────────────────────────────────
    let priceText = $('.a-price .a-offscreen').first().text().trim()
    if (!priceText) priceText = $('#priceblock_ourprice').text().trim()
    if (!priceText) priceText = $('#corePrice_feature_div .a-offscreen').first().text().trim()
    const priceMatch = priceText.match(/[\d.,]+/)
    const price = priceMatch ? parseFloat(priceMatch[0].replace(',', '')) : 0

    // ── Images ─────────────────────────────────────────────────────────────
    let images = []
    const imgScript = html.match(/"colorImages":\s*\{\s*"initial":\s*(\[.*?\])\s*\}/)
    if (imgScript?.[1]) {
      try {
        const parsed = JSON.parse(imgScript[1])
        images = parsed.map(i => i.hiRes || i.large).filter(Boolean)
      } catch (_) {}
    }
    if (images.length === 0) {
      const mainImg = $('#landingImage').attr('src') || $('#imgBlkFront').attr('src')
      if (mainImg) images.push(mainImg)
    }

    // ── Brand ──────────────────────────────────────────────────────────────
    const brand = $('#bylineInfo').text()
      .replace(/^Visit the\s+/i, '')
      .replace(/\s+Store$/i, '')
      .trim()

    // ── Specs ──────────────────────────────────────────────────────────────
    const specs = {}
    $('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr').each((_, el) => {
      const key = $(el).find('th').text().trim()
      const val = $(el).find('td').text().replace(/\s+/g, ' ').trim()
      if (key && val) specs[key] = val
    })

    // ── Variations ─────────────────────────────────────────────────────────
    progressCb('[PROGRESS] Đang tìm biến thể...')
    const variations = await extractVariations($, html, price)

    progressCb('[PROGRESS] ✓ Hoàn tất cào dữ liệu!')
    return { asin, title, priceConfigured: price, originalPrice: price, brand, images, specs, variations }

  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
    activeCrawls.delete(asin)
  }
}

/**
 * Parse Amazon variation data from inline JS
 */
function extractVariations($, html, basePrice) {
  const variations = []
  try {
    // Amazon embeds variation data in twisterJS or dimensionValuesDisplayData
    const twisterMatch = html.match(/var\s+dataToReturn\s*=\s*(\{.*?"asin_variation_values".*?\});/s)
    if (!twisterMatch) return variations

    // Try to get dimension names
    const dimNamesMatch = html.match(/"dimensions"\s*:\s*(\[.*?\])/)
    const dimNames = dimNamesMatch ? JSON.parse(dimNamesMatch[1]) : []

    const asinVariations = html.match(/"asin_variation_values"\s*:\s*(\{[^}]+\})/)
    if (!asinVariations) return variations

    const asinMap = JSON.parse(asinVariations[1])
    const dimDisplay = html.match(/"dimensionValuesDisplayData"\s*:\s*(\{.*?\}\s*\})/)

    let displayMap = {}
    if (dimDisplay) {
      try { displayMap = JSON.parse(dimDisplay[1]) } catch (_) {}
    }

    for (const [childAsin, dimValues] of Object.entries(asinMap)) {
      const attrs = {}
      dimNames.forEach((dimName, i) => {
        const rawVal = dimValues[i]
        attrs[dimName] = displayMap[childAsin]?.[i] || rawVal || ''
      })
      variations.push({ asin: childAsin, attributes: attrs, price: basePrice, quantity: 10, image: '' })
    }
  } catch (_) {}
  return variations
}

export function cancelCrawl(asin) {
  const page = activeCrawls.get(asin)
  if (page) {
    page.close().catch(() => {})
    activeCrawls.delete(asin)
  }
}
