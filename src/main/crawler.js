import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import * as cheerio from 'cheerio'

chromium.use(stealth())

let browser = null
let currentHeadless = true
const activeCrawls = new Map()

export async function initBrowser(headless = true) {
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
  const { headless = true, delay = 2, defaultQuantity = 10 } = options
  const b = await initBrowser(headless)

  const context = await b.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    }
  })

  // ── Force US region via cookies ─────────────────────────────────────────
  await context.addCookies([
    { name: 'i18n-prefs', value: 'USD', domain: '.amazon.com', path: '/' },
    { name: 'lc-main', value: 'en_US', domain: '.amazon.com', path: '/' },
    { name: 'sp-cdn', value: '"L5Z9:US"', domain: '.amazon.com', path: '/' },
  ])

  const page = await context.newPage()
  activeCrawls.set(asin, page)
  progressCb('[PROGRESS] Khởi động trình duyệt...')

  try {
    const url = `https://www.amazon.com/dp/${asin}`
    progressCb(`[PROGRESS] Mở trang Amazon...`)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 })

    const waitMs = (delay * 1000) + Math.random() * 1000
    progressCb('[PROGRESS] Đang chờ trang tải...')
    await page.waitForTimeout(waitMs)

    // Wait for product title to actually render (JS-driven pages load it late)
    progressCb('[PROGRESS] Đang chờ tiêu đề sản phẩm...')
    const titleSelectors = [
      '#productTitle',
      'span#title',
      'h1#title span',
      'h1.a-size-large',
      '#title',
      'span.a-text-normal[data-a-size="b"]'
    ]
    const titleSelectorStr = titleSelectors.join(', ')

    await page.waitForSelector(titleSelectorStr, {
      state: 'attached',
      timeout: 15000
    }).catch((err) => {
      console.log('[Crawler] Cảnh báo: Không tìm thấy selector title ban đầu trong 15s. Có thể là thay đổi DOM từ Amazon.', err.message)
    }) // non-fatal: proceed even if not found

    progressCb('[PROGRESS] Đang kiểm tra địa chỉ giao hàng...')
    if (options.forceUSLocation !== false) {
      await trySetUSDelivery(page)
    }
    
    progressCb('[PROGRESS] Trích xuất dữ liệu sản phẩm...')

    // ── Title ────────────────────────────────────────────────────────────
    let html = await page.content()
    let $ = cheerio.load(html)

    let title = ''
    // Try each selector one by one to log which one succeeded
    for (const sel of titleSelectors) {
      const t = $(sel).first().text().trim()
      if (t) {
        title = t
        console.log(`[Crawler] Found title using DOM selector: ${sel}`)
        break
      }
    }

    if (!title) {
      // Playwright evaluation fallback (sometimes cheerio misses dynamically inserted nodes)
      title = await page.$eval(titleSelectorStr, el => el.textContent.trim()).catch(() => '')
      if (title) console.log(`[Crawler] Found title using Playwright $eval fallback`)
    }

    // Fallback lấy title từ thẻ <title> của trang nếu các selector chính không có
    if (!title) {
      const pageTitle = await page.title()
      if (pageTitle) {
        console.log(`[Crawler] Fallback to page title: ${pageTitle}`)
        // Amazon titles often look like "Amazon.com: Actual Product Title" or "Amazon.com : Actual Product Title"
        let cleanTitle = pageTitle.replace(/^Amazon\.com\s*:\s*/i, '')
        // If it starts with "Amazon.com: ", it will be removed. If not, maybe it still has other colons.
        if (cleanTitle === pageTitle && pageTitle.includes(':')) {
           cleanTitle = pageTitle.split(':').slice(1).join(':').trim()
        }
        title = cleanTitle.trim()
        if (title) console.log(`[Crawler] Extracted title from page <title>: ${title}`)
      }
    }

    if (!title && (html.toLowerCase().includes('captcha') || html.toLowerCase().includes('type the characters'))) {
      throw new Error('Amazon Anti-Bot Captcha — thử lại sau hoặc tắt Headless Mode.')
    }
    if (!title) {
      console.error('[Crawler] Lỗi nghiêm trọng: Không thể trích xuất title từ HTML. Lưu dump HTML để debug.')
      throw new Error('Không tìm thấy tiêu đề sản phẩm. Trang có thể load quá chậm, bị block, hoặc DOM đã bị Amazon thay đổi hoàn toàn.')
    }

    // Wait for other lazy-loaded sections before scraping them
    await Promise.allSettled([
      page.waitForSelector('#feature-bullets', { timeout: 8000 }),
      page.waitForSelector('#availability', { timeout: 8000 }),
      page.waitForSelector('#wayfinding-breadcrumbs_feature_div, #wayfinding-breadcrumbs_container', { timeout: 8000 }),
      page.waitForSelector('.a-price .a-offscreen', { timeout: 8000 }),
    ])

    // Re-fetch HTML AFTER lazy sections loaded (captures JS-injected prices, variations)
    html = await page.content()
    $ = cheerio.load(html)

    // ── Price ────────────────────────────────────────────────────────────
    progressCb('[PROGRESS] Đang lấy thông tin giá...')
    let price = 0

    // Strategy A (PRIMARY): DOM selectors scoped to core price area — most reliable
    // These selectors are scoped to the product's price section, avoiding carousel/related product prices
    const priceSelectors = [
      '#corePrice_feature_div .a-price .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#apex_desktop .a-price .a-offscreen',
      '#buybox .a-price .a-offscreen',
      '#centerCol #corePrice_feature_div .a-price .a-offscreen',
      '#centerCol #corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice',
      '#priceblock_saleprice',
    ]
    for (const sel of priceSelectors) {
      const el = $(sel).first()
      const text = el.text().trim()
      
      // Check if this element is inside a carousel/related section
      const isRelated = el.closest('#HLCXComparisonWidget_feature_div, #sims-consolidated-2_feature_div, #sp_detail, #reco-similar-items, .as-title-block').length > 0
      if (isRelated) {
        console.log(`[Crawler] Skipping price from related/sponsored section: ${sel}`)
        continue
      }

      const match = text.match(/\$([\d,]+\.?\d*)/)
      if (match) {
        price = parseFloat(match[1].replace(',', ''))
        if (price > 0) {
          console.log(`[Crawler] Found price ${price} using selector: ${sel}`)
          break
        }
      }
    }

    // Strategy B: Playwright evaluate — targets only the main product price area
    if (!price || price === 0) {
      try {
        price = await page.evaluate(() => {
          // Scoped: only look inside the core price display area
          const corePrice = document.querySelector('#corePrice_feature_div, #corePriceDisplay_desktop_feature_div, #apex_desktop')
          if (corePrice) {
            const offscreen = corePrice.querySelector('.a-price .a-offscreen')
            if (offscreen) {
              const m = offscreen.textContent.trim().match(/\$([\d,]+\.?\d*)/)
              if (m) return parseFloat(m[1].replace(',', ''))
            }
          }
          // Fallback: apexPriceToPay (still scoped)
          const apexEl = document.querySelector('.a-price.apexPriceToPay .a-offscreen, .a-price.priceToPay .a-offscreen')
          if (apexEl) {
            const m = apexEl.textContent.trim().match(/\$([\d,]+\.?\d*)/)
            if (m) return parseFloat(m[1].replace(',', ''))
          }
          return 0
        })
      } catch (_) {}
    }

    // Strategy C (LAST RESORT): JSON priceAmount regex — searches full HTML
    // ⚠️ This can pick up prices from "Related Products" carousel, so only use as fallback
    if (!price || price === 0) {
      // Try to find priceAmount near the product's own ASIN to reduce false matches
      const asinPriceMatch = html.match(new RegExp(`"${asin}"[\\s\\S]{0,500}"priceAmount"\\s*:\\s*([\\d.]+)`))
      if (asinPriceMatch) {
        const p = parseFloat(asinPriceMatch[1])
        if (p > 0) price = p
      }
    }
    if (!price || price === 0) {
      // Final fallback: first priceAmount in the page (may be inaccurate)
      const priceMatches = [...html.matchAll(/"priceAmount"\s*:\s*([\d.]+)/g)]
      for (const m of priceMatches) {
        const p = parseFloat(m[1])
        if (p > 0) {
          price = p
          break
        }
      }
    }

    // ── Price Range ─────────────────────────────────────────────────────
    let priceRange = ''
    const rangeEl = $('#corePrice_feature_div .a-price-range')
    if (rangeEl.length) {
      const prices = rangeEl.find('.a-offscreen').map((_, el) => $(el).text().trim()).get()
      if (prices.length >= 2) priceRange = `${prices[0]} - ${prices[1]}`
    }

    // ── Images — FIXED: multiple extraction methods ─────────────────────
    progressCb('[PROGRESS] Đang tải hình ảnh...')
    let images = []

    // Method 1: Parse from imageGalleryData or colorImages in JS
    const imgDataPatterns = [
      /"colorImages"\s*:\s*\{\s*"initial"\s*:\s*(\[[\s\S]*?\])\s*\}/,
      /"imageGalleryData"\s*:\s*(\[[\s\S]*?\])\s*[,}]/,
    ]
    for (const pat of imgDataPatterns) {
      if (images.length > 0) break
      const m = html.match(pat)
      if (m?.[1]) {
        try {
          const parsed = JSON.parse(m[1])
          images = parsed
            .map(i => i.hiRes || i.large || i.mainUrl || '')
            .filter(Boolean)
        } catch (_) {}
      }
    }

    // Method 2: Extract all image URLs from the JS data (broader search)
    if (images.length === 0) {
      const allHiRes = [...html.matchAll(/"hiRes"\s*:\s*"(https:\/\/[^"]+)"/g)]
      if (allHiRes.length > 0) {
        images = [...new Set(allHiRes.map(m => m[1]))]
      }
    }

    // Method 3: Parse from DOM using Playwright (more reliable than cheerio for lazy-loaded)
    if (images.length === 0) {
      try {
        images = await page.$$eval(
          '#altImages .a-spacing-small img, #imageBlock img, .imageThumbnail img',
          els => {
            const urls = []
            for (const el of els) {
              let src = el.src || el.getAttribute('data-old-hires') || ''
              // Convert thumbnail to full-size
              src = src.replace(/\._.*_\./, '.')
              if (src && !src.includes('sprite') && !src.includes('grey-pixel') && !src.includes('play-icon')) {
                urls.push(src)
              }
            }
            return [...new Set(urls)]
          }
        )
      } catch (_) {}
    }

    // Method 4: Fallback to landing image
    if (images.length === 0) {
      const mainImg = await page.$eval('#landingImage', el => {
        return el.getAttribute('data-old-hires') || el.src || ''
      }).catch(() => '')
      if (mainImg) images.push(mainImg.replace(/\._.*_\./, '.'))
    }

    // Deduplicate & clean
    images = [...new Set(images)].filter(url => url && url.startsWith('http'))

    // ── Brand ───────────────────────────────────────────────────────────
    let brand = $('#bylineInfo').text()
      .replace(/^Visit the\s+/i, '')
      .replace(/^Brand:\s*/i, '')
      .replace(/\s+Store$/i, '')
      .trim()

    // ── Rating & Reviews ────────────────────────────────────────────────
    progressCb('[PROGRESS] Đang lấy đánh giá...')
    const ratingText = $('#acrPopover .a-icon-alt').first().text().trim()
    const ratingMatch = ratingText.match(/([\d.]+)\s*out/)
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 0

    const reviewCountText = $('#acrCustomerReviewText').first().text().trim()
    const reviewMatch = reviewCountText.match(/([\d,]+)/)
    const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(',', ''), 10) : 0

    // ── Bullet Points ───────────────────────────────────────────────────
    const bulletPoints = []
    $('#feature-bullets li span.a-list-item').each((_, el) => {
      const txt = $(el).text().trim()
      if (txt && txt.length > 5) bulletPoints.push(txt)
    })

    // ── Description ─────────────────────────────────────────────────────
    let description = ''
    let descriptionHtml = ''
    const descriptionImages = []

    const descEl = $('#productDescription')
    if (descEl.length) {
      description = descEl.text().trim().replace(/\s+/g, ' ')
      descriptionHtml = descEl.html()?.trim() || ''
    }

    // A+ content
    const aplusEl = $('#aplus-content, #aplus, #aplusProductDescription')
    if (aplusEl.length) {
      if (!description) {
        description = aplusEl.text().trim().replace(/\s+/g, ' ').substring(0, 3000)
      }
      if (!descriptionHtml) {
        descriptionHtml = aplusEl.html()?.trim() || ''
      }
      // Extract A+ images via Playwright (cheerio misses lazy-loaded)
      try {
        const aplusImgs = await page.$$eval(
          '#aplus-content img, #aplus img, #aplusProductDescription img',
          els => els
            .filter(img => {
              const w = img.naturalWidth || img.width || 0
              const h = img.naturalHeight || img.height || 0
              // Filter out 1x1 placeholders and tiny icons
              return (w > 10 && h > 10) || (!w && !h)
            })
            .map(img => {
              let src = img.getAttribute('data-src') || img.src || ''
              // Convert to full resolution
              src = src.replace(/\._.*_\./, '.')
              return src
            })
            .filter(src => src && src.startsWith('http') && !src.includes('sprite') && !src.includes('grey-pixel'))
        )
        for (const src of aplusImgs) {
          if (!descriptionImages.includes(src)) descriptionImages.push(src)
        }
      } catch (_) {}
    }

    // ── Technical Specs ─────────────────────────────────────────────────
    progressCb('[PROGRESS] Đang lấy thông số kỹ thuật...')
    const specs = {}

    $('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr').each((_, el) => {
      const key = $(el).find('th').text().trim()
      const val = $(el).find('td').text().replace(/\s+/g, ' ').trim()
      if (key && val) specs[key] = val
    })

    $('#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li').each((_, el) => {
      const spans = $(el).find('span span')
      if (spans.length >= 2) {
        const key = $(spans[0]).text().replace(/[:\u200F\u200E\s]+/g, ' ').trim()
        const val = $(spans[1]).text().replace(/[:\u200F\u200E\s]+/g, ' ').trim()
        if (key && val && key.length < 60 && !key.includes('Customer Reviews') && !val.includes('P.when')) {
          specs[key] = val
        }
      }
    })

    $('#productOverview_feature_div tr').each((_, el) => {
      const key = $(el).find('td.a-span3 span').text().trim()
      const val = $(el).find('td.a-span9 span').text().trim()
      if (key && val) specs[key] = val
    })

    // Filter out specs not useful for eBay
    const skipKeys = ['Best Sellers Rank', 'ASIN', 'Customer Reviews', 'Date First Available']
    for (const sk of skipKeys) delete specs[sk]

    // ── Important Information (Safety, Ingredients, Directions) ────────
    progressCb('[PROGRESS] Đang lấy thông tin quan trọng...')
    const importantInfo = {}
    try {
      const importantEl = $('#important-information, #importantInformation')
      if (importantEl.length) {
        importantEl.find('h4, .a-text-bold').each((_, h) => {
          const title = $(h).text().trim()
          let content = ''
          let next = $(h).next()
          while (next.length && !next.is('h4') && !next.is('h3') && !next.hasClass('a-text-bold')) {
            content += next.text().trim() + ' '
            next = next.next()
          }
          if (title && content.trim()) {
            importantInfo[title] = content.trim()
          }
        })
      }
    } catch (_) {}

    // ── Availability ────────────────────────────────────────────────────
    const availabilityText = $('#availability span').first().text().trim()
    const inStock = availabilityText.toLowerCase().includes('in stock')

    // ── Categories ──────────────────────────────────────────────────────
    const categories = []
    $('#wayfinding-breadcrumbs_feature_div li a, #wayfinding-breadcrumbs_container li a').each((_, el) => {
      const cat = $(el).text().trim()
      if (cat) categories.push(cat)
    })

    // ── BSR ──────────────────────────────────────────────────────────────
    let bsr = ''
    $('#productDetails_detailBullets_sections1 tr, #detailBulletsWrapper_feature_div li').each((_, el) => {
      const text = $(el).text()
      if (text.includes('Best Sellers Rank') || text.includes('Amazon Best Sellers Rank')) {
        bsr = text.replace(/\s+/g, ' ').trim()
      }
    })

    // ── Variations — FIXED: comprehensive parsing ───────────────────────
    progressCb('[PROGRESS] Đang phân tích biến thể sản phẩm...')
    const variations = await extractVariations($, html, page, price, progressCb, defaultQuantity)

    progressCb('[PROGRESS] ✓ Hoàn tất crawl!')
    return {
      asin,
      title,
      priceConfigured: price,
      originalPrice: price,
      priceRange,
      brand,
      images,
      specs,
      importantInfo,
      variations,
      bulletPoints,
      description,
      descriptionHtml,
      descriptionImages,
      categories,
      bsr,
      inStock,
      availability: availabilityText,
    }

  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
    activeCrawls.delete(asin)
  }
}

/**
 * Attempt to set US delivery address to get proper US prices.
 * Wrapped with a hard timeout to prevent hanging.
 */
async function trySetUSDelivery(page) {
  try {
    console.log('[trySetUSDelivery] Hardening location to US (10001)...')
    
    const result = await page.evaluate(async () => {
      const wait = (ms) => new Promise(res => setTimeout(res, ms))
      
      // 1. Check current location
      const locText = document.querySelector('#glow-ingress-block, #nav-global-location-popover-link')?.textContent || ''
      if (locText.includes('10001') || locText.includes('New York')) return 'ALREADY_US'

      // 2. Open popover
      const btn = document.querySelector('#nav-global-location-popover-link, #glow-ingress-block')
      if (!btn) return 'NO_BUTTON'
      btn.click()
      await wait(1500)

      // 3. Enter Zip
      const input = document.querySelector('#GLUXZipUpdateInput')
      if (!input) return 'NO_INPUT'
      input.value = '10001'
      // Trigger input events so Amazon knows we typed
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await wait(500)

      // 4. Click Apply
      const applyBtn = document.querySelector('#GLUXZipUpdate input[type="submit"], #GLUXZipUpdate .a-button-input')
      if (!applyBtn) return 'NO_APPLY'
      applyBtn.click()
      await wait(2000)

      // 5. Click Continue/Done
      const continueBtn = document.querySelector('.a-popover-footer .a-button-primary .a-button-input, #GLUXConfirmClose .a-button-input, button[name="glowDoneButton"]')
      if (continueBtn) {
        continueBtn.click()
        return 'SUCCESS_CONTINUE'
      }
      
      return 'SUCCESS_ZIP_ONLY'
    })

    console.log(`[trySetUSDelivery] Result: ${result}`)
    
    if (result.startsWith('SUCCESS')) {
      await page.waitForTimeout(1000)
      await page.reload({ waitUntil: 'domcontentloaded' })
      console.log('[trySetUSDelivery] Reloaded page to apply location.')
    }
  } catch (err) {
    console.error('[trySetUSDelivery] Error during hardening:', err)
  }
}

/**
 * Enhanced variation extraction
 * Uses multiple strategies: twister JS data, DOM swatches, dimension display data
 */
async function extractVariations($, html, page, basePrice, progressCb, defaultQuantity = 10) {
  const variations = []
  try {
    // ── Parse dimension names ──────────────────────────────────────────
    const dimNamesMatch = html.match(/"dimensions"\s*:\s*(\[.*?\])/)
    let dimNames = []
    if (dimNamesMatch) {
      try { dimNames = JSON.parse(dimNamesMatch[1]) } catch (_) {}
    }

    // ── Parse dimensionValuesDisplayData ────────────────────────────────
    // This maps ASIN → display values array
    let displayMap = {}
    const dimDisplayMatch = html.match(/"dimensionValuesDisplayData"\s*:\s*(\{[\s\S]*?\})\s*,\s*"/)
    if (dimDisplayMatch) {
      try { displayMap = JSON.parse(dimDisplayMatch[1]) } catch (_) {}
    }

    // ── Parse asinVariationValues ──────────────────────────────────────
    let asinMap = {}
    const asinVarMatch = html.match(/"asin_variation_values"\s*:\s*(\{[\s\S]*?\})\s*,\s*"/)
    if (asinVarMatch) {
      try { asinMap = JSON.parse(asinVarMatch[1]) } catch (_) {}
    }

    // ── Parse variation price data ──────────────────────────────────────
    // Method: extract all price info from twister data
    let priceMap = {}
    // Try to get per-ASIN prices from the page JS
    const twisterMatch = html.match(/"twisterModel"\s*:\s*(\{[\s\S]*?\})\s*;\s*/)
    if (twisterMatch) {
      try {
        // Extract price data per ASIN from twister model
        const twisterContent = twisterMatch[1]
        const allPrices = [...twisterContent.matchAll(/"([A-Z0-9]{10})"\s*:\s*\{[^}]*"priceAmount"\s*:\s*([\d.]+)/g)]
        for (const m of allPrices) {
          priceMap[m[1]] = parseFloat(m[2])
        }
      } catch (_) {
        console.log('[extractVariations] Twister price extraction failed')
      }
    }

    // ── Parse variation image data ──────────────────────────────────────
    let imageMap = {}
    // colorImages maps dimension value → image array
    const colorImgsMatch = html.match(/"colorImages"\s*:\s*(\{[\s\S]*?\})\s*,\s*"(?:colorToAsin|alwaysIncludeTwister|initial|heroImage|imageGalleryData|twisterModel)/)
    if (colorImgsMatch) {
      try {
        const colorData = JSON.parse(colorImgsMatch[1])
        for (const [key, imgs] of Object.entries(colorData)) {
          if (Array.isArray(imgs) && imgs.length > 0) {
            imageMap[key] = (imgs[0].hiRes || imgs[0].large || '')
          }
        }
      } catch (_) {}
    }

    // ── colorToAsin mapping ────────────────────────────────────────────
    let colorToAsin = {}
    const c2aMatch = html.match(/"colorToAsin"\s*:\s*(\{[\s\S]*?\})\s*[,}]\s*"/)
    if (c2aMatch) {
      try { colorToAsin = JSON.parse(c2aMatch[1]) } catch (_) {}
    }

    // Helper: fuzzy match image from imageMap
    const findVarImage = (displayValues) => {
      // Exact match on first display value
      for (const val of displayValues) {
        if (imageMap[val]) return imageMap[val]
      }
      // Case-insensitive match
      const lowerMap = {}
      for (const key of Object.keys(imageMap)) {
        lowerMap[key.toLowerCase().trim()] = imageMap[key]
      }
      for (const val of displayValues) {
        if (lowerMap[val.toLowerCase().trim()]) return lowerMap[val.toLowerCase().trim()]
      }
      // Substring match
      for (const val of displayValues) {
        const normVal = val.toLowerCase().trim()
        for (const [key, img] of Object.entries(imageMap)) {
          if (key.toLowerCase().includes(normVal) || normVal.includes(key.toLowerCase())) return img
        }
      }
      return ''
    }

    // ── Strategy 1: Use displayMap (most reliable) ─────────────────────
    if (Object.keys(displayMap).length > 0 && dimNames.length > 0) {
      for (const [childAsin, displayValues] of Object.entries(displayMap)) {
        if (!Array.isArray(displayValues) || displayValues.length === 0) continue

        const attributes = {}
        dimNames.forEach((dimName, i) => {
          // Convert snake_case to readable: "flavor_name" → "Flavor Name"
          const readableName = dimName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          attributes[readableName] = displayValues[i] || ''
        })

        let varPrice = priceMap[childAsin] || basePrice
        let varImage = findVarImage(displayValues)

        // Also try colorToAsin mapping
        if (!varImage) {
          const firstVal = displayValues[0] || ''
          if (colorToAsin[firstVal]?.asin) {
            const mappedAsin = colorToAsin[firstVal].asin
            if (imageMap[mappedAsin]) varImage = imageMap[mappedAsin]
          }
        }

        variations.push({
          asin: childAsin,
          attributes,
          price: varPrice,
          quantity: defaultQuantity,
          image: varImage,
        })
      }
    }

    // ── Strategy 2: Use asinVariationValues ────────────────────────────
    if (variations.length === 0 && Object.keys(asinMap).length > 0) {
      for (const [childAsin, dimValues] of Object.entries(asinMap)) {
        const attributes = {}
        dimNames.forEach((dimName, i) => {
          const readableName = dimName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
          const rawVal = Array.isArray(dimValues) ? dimValues[i] : ''
          attributes[readableName] = rawVal || ''
        })

        variations.push({
          asin: childAsin,
          attributes,
          price: priceMap[childAsin] || basePrice,
          quantity: defaultQuantity,
          image: '',
        })
      }
    }

    // ── Strategy 3: Parse from DOM (fallback) ──────────────────────────
    if (variations.length === 0) {
      const domVariations = await parseDOMVariations(page, dimNames, basePrice, defaultQuantity)
      variations.push(...domVariations)
    }

    // ── Fetch real prices per variation (navigate each ASIN) ────────────
    if (variations.length > 0) {
      progressCb(`[PROGRESS] Lấy giá ${variations.length} biến thể...`)
      const context = page.context()
      for (let i = 0; i < variations.length; i++) {
        const v = variations[i]
        // Skip current ASIN (already have price) or if we already got price from JS
        if (v.price !== basePrice && v.price > 0) continue

        try {
          progressCb(`[PROGRESS] Giá biến thể ${i + 1}/${variations.length}: ${v.asin}...`)
          const varPage = await context.newPage()
          await varPage.goto(`https://www.amazon.com/dp/${v.asin}`, {
            waitUntil: 'domcontentloaded',
            timeout: 12000
          })
          await varPage.waitForTimeout(1500)
          // Wait for price to render
          await varPage.waitForSelector('.a-price .a-offscreen', { timeout: 5000 }).catch(() => {})
          const vHtml = await varPage.content()
          const v$ = cheerio.load(vHtml)

          // Parse price — DOM selectors FIRST (scoped to core price area)
          let variantPrice = 0
          const varPriceSelectors = [
            '#corePrice_feature_div .a-price .a-offscreen',
            '#corePriceDisplay_desktop_feature_div .a-price .a-offscreen',
            '.a-price.apexPriceToPay .a-offscreen',
            '.a-price.priceToPay .a-offscreen',
            '#buybox .a-price .a-offscreen',
            '#centerCol .a-price .a-offscreen',
            '#priceblock_ourprice',
            '#priceblock_dealprice',
            '#corePrice_desktop .a-offscreen',
            '#apex_offerDisplay_desktop .a-price .a-offscreen',
          ]
          for (const sel of varPriceSelectors) {
            const txt = v$(sel).first().text().trim()
            const pm = txt.match(/\$([\d,]+\.?\d*)/)
            if (pm) {
              variantPrice = parseFloat(pm[1].replace(',', ''))
              if (variantPrice > 0) break
            }
          }

          // Playwright evaluate fallback
          if (!variantPrice) {
            try {
              variantPrice = await varPage.evaluate(() => {
                const core = document.querySelector('#corePrice_feature_div, #corePriceDisplay_desktop_feature_div')
                if (core) {
                  const el = core.querySelector('.a-price .a-offscreen')
                  if (el) {
                    const m = el.textContent.trim().match(/\$([\d,]+\.?\d*)/)
                    if (m) return parseFloat(m[1].replace(',', ''))
                  }
                }
                return 0
              })
            } catch (_) {}
          }

          // JSON regex last resort
          if (!variantPrice) {
            // JSON regex last resort - strictly look for the current ASIN's price amount
            const jsPriceMatches = [...vHtml.matchAll(new RegExp(`"${v.asin}"\\s*:\\s*\\{[^}]*"priceAmount"\\s*:\\s*([\\d.]+)`, 'g'))]
            for (const m of jsPriceMatches) {
              const p = parseFloat(m[1])
              if (p > 0) { variantPrice = p; break }
            }
          }
          
          if (variantPrice > 0) {
            v.price = variantPrice
          }

          // Also grab the main image for this variant if missing
          if (!v.image) {
            v.image = await varPage.$eval('#landingImage, #imgBlkFront, #main-image, .a-dynamic-image, #imgTagWrapperId img', el =>
              (el.getAttribute('data-old-hires') || el.getAttribute('data-a-dynamic-image') || el.src || '').replace(/\._.*_\./, '.')
            ).catch(() => '')
            
            // Handle data-a-dynamic-image which is a JSON string of URLs
            if (v.image && v.image.startsWith('{')) {
                try {
                    const imgObj = JSON.parse(v.image)
                    v.image = Object.keys(imgObj).sort((a,b) => imgObj[b][0] - imgObj[a][0])[0] // Get largest
                } catch (_) {}
            }

            if (!v.image) {
              const pat = /"colorImages"\s*:\s*\{\s*"initial"\s*:\s*(\[[\s\S]*?\])\s*\}/
              const m = vHtml.match(pat)
              if (m?.[1]) {
                  try {
                      const parsed = JSON.parse(m[1])
                      v.image = parsed[0]?.hiRes || parsed[0]?.large || parsed[0]?.main || ''
                  } catch (_) {}
              }
            }
          }

          await varPage.close()
        } catch (err) {
          // Non-critical: keep basePrice
          console.log(`[variation ${v.asin}] price fetch failed:`, err.message?.substring(0, 60))
        }
      }
    }

  } catch (err) {
    console.error('extractVariations error:', err)
  }
  return variations
}

/**
 * Parse variations directly from the DOM using Playwright
 */
async function parseDOMVariations(page, dimNames, basePrice, defaultQuantity = 10) {
  const variations = []

  // Check for dropdown-style variations
  const selects = await page.$$('#twister select')
  if (selects.length > 0) {
    for (const select of selects) {
      const options = await select.$$eval('option', opts =>
        opts
          .filter(o => o.value && o.value !== '-1' && o.value !== '0')
          .map(o => ({
            value: o.value,
            text: o.textContent.trim(),
            asin: o.getAttribute('data-a-html-content') || '',
          }))
      )
      const dimName = dimNames[0] || 'Option'
      const readableName = dimName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      for (const opt of options) {
        variations.push({
          asin: opt.value.length === 10 ? opt.value : `opt_${variations.length}`,
          attributes: { [readableName]: opt.text },
          price: basePrice,
          quantity: defaultQuantity,
          image: '',
        })
      }
    }
    return variations
  }

  // Check for swatch-style variations (buttons/images)
  const swatchSelectors = [
    '#variation_color_name ul li[data-defaultasin]',
    '#variation_size_name ul li[data-defaultasin]',
    '#variation_style_name ul li[data-defaultasin]',
    '#variation_flavor_name ul li[data-defaultasin]',
    '#variation_pattern_name ul li[data-defaultasin]',
  ]

  for (let si = 0; si < swatchSelectors.length; si++) {
    const sel = swatchSelectors[si]
    const items = await page.$$(sel)
    if (items.length === 0) continue

    const dimName = dimNames[si] || `option_${si}`
    const readableName = dimName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

    for (const item of items) {
      const data = await item.evaluate(el => ({
        asin: el.getAttribute('data-defaultasin') || '',
        title: el.getAttribute('title')?.replace(/^Click to select\s*/i, '') || el.querySelector('.a-size-base')?.textContent?.trim() || '',
        img: (() => {
          const img = el.querySelector('img')
          return img ? (img.src || '').replace(/\._.*_\./, '.') : ''
        })(),
      }))

      if (data.asin || data.title) {
        variations.push({
          asin: data.asin,
          attributes: { [readableName]: data.title },
          price: basePrice,
          quantity: defaultQuantity,
          image: data.img,
        })
      }
    }
  }

  return variations
}

export function cancelCrawl(asin) {
  const page = activeCrawls.get(asin)
  if (page) {
    page.close().catch(() => {})
    activeCrawls.delete(asin)
  }
}

/**
 * Sanitize HTML scraped from Amazon for safe use in eBay listings.
 * eBay allows: b, strong, i, em, u, br, p, ul, ol, li, table, tr, td, th,
 *              thead, tbody, tfoot, caption, h1-h6, span, div, img (https only),
 *              a (https, target=_blank).
 * eBay BLOCKS: script, style, iframe, form, input, button, JS event attrs,
 *              Amazon CDN images, relative URLs.
 *
 * @param {string} rawHtml - HTML from Amazon description/A+ content
 * @returns {string} Clean, eBay-safe HTML
 */
export function sanitizeHtmlForEbay(rawHtml) {
  if (!rawHtml) return ''

  const ALLOWED_TAGS = new Set([
    'b', 'strong', 'i', 'em', 'u', 'br', 'p', 'span', 'div',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'colgroup', 'col',
    'img', 'a',
  ])

  const $ = cheerio.load(rawHtml, { decodeEntities: false })

  // Remove entirely: script, style, iframe, form, input, button, svg, noscript
  $('script, style, iframe, form, input, button, select, textarea, svg, noscript, object, embed').remove()

  // Walk every element
  $('*').each((_, el) => {
    if (el.type !== 'tag') return
    const tagName = el.name?.toLowerCase()

    if (!ALLOWED_TAGS.has(tagName)) {
      // Replace disallowed tag with its children (unwrap)
      $(el).replaceWith($(el).contents())
      return
    }

    // Strip all attributes except safe ones per tag
    const attribs = el.attribs || {}
    const safe = {}

    if (tagName === 'a') {
      const href = (attribs.href || '').trim()
      if (href.startsWith('https://')) {
        safe.href = href
        safe.target = '_blank'
        safe.rel = 'noopener noreferrer'
      }
    }

    if (tagName === 'img') {
      const src = (attribs.src || attribs['data-src'] || '').trim()
      // Only keep HTTPS images, skip Amazon thumbnail/sprite URLs
      if (
        src.startsWith('https://') &&
        !src.includes('sprite') &&
        !src.includes('grey-pixel') &&
        !src.includes('1x1')
      ) {
        // Convert Amazon thumbnail to full resolution
        safe.src = src.replace(/\._.*_\./, '.')
        if (attribs.alt) safe.alt = attribs.alt
        // eBay recommends max 700px width
        safe.style = 'max-width:700px;height:auto;'
      } else {
        // Invalid/Amazon-internal image → remove entirely
        $(el).remove()
        return
      }
    }

    // For td/th: keep colspan/rowspan
    if (tagName === 'td' || tagName === 'th') {
      if (attribs.colspan) safe.colspan = attribs.colspan
      if (attribs.rowspan) safe.rowspan = attribs.rowspan
    }

    // Replace attribs with safe-only set
    el.attribs = safe
  })

  // Get inner body HTML, trim whitespace blocks
  const cleaned = $('body').html() || ''
  return cleaned
    .replace(/<br\s*\/?>\s*(<br\s*\/?>\s*)+/gi, '<br>') // collapse multiple <br>
    .replace(/\s{2,}/g, ' ')
    .trim()
}
