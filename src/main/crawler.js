import { chromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'
import * as cheerio from 'cheerio'
import { join } from 'path'
import { app } from 'electron'

chromium.use(stealth())

/**
 * Resolve the bundled Chromium executable path at runtime.
 * When headless=true → use chrome-headless-shell (lightweight).
 * When headless=false → use full Chromium (has GUI window).
 */
function getChromiumExecutable(headless = true) {
  const browsersPath = app.isPackaged
    ? join(process.resourcesPath, 'playwright-browsers')
    : join(app.getAppPath(), '..', 'playwright-browsers')

  if (headless) {
    // Headless-only shell binary (lightweight, no GUI)
    const revision = 'chromium_headless_shell-1217'
    let platformDir
    if (process.platform === 'win32') {
      platformDir = 'chrome-headless-shell-win64'
    } else if (process.platform === 'darwin') {
      platformDir = process.arch === 'arm64'
        ? 'chrome-headless-shell-mac-arm64'
        : 'chrome-headless-shell-mac-x64'
    } else {
      platformDir = 'chrome-headless-shell-linux-x64'
    }
    const exeName = process.platform === 'win32'
      ? 'chrome-headless-shell.exe'
      : 'chrome-headless-shell'
    return join(browsersPath, revision, platformDir, exeName)
  } else {
    // Full Chromium with GUI (needed for non-headless mode)
    const revision = 'chromium-1217'
    if (process.platform === 'win32') {
      return join(browsersPath, revision, 'chrome-win64', 'chrome.exe')
    } else if (process.platform === 'darwin') {
      const platformDir = process.arch === 'arm64'
        ? 'chrome-mac-arm64'
        : 'chrome-mac-x64'
      return join(
        browsersPath, revision, platformDir,
        'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'
      )
    } else {
      return join(browsersPath, revision, 'chrome-linux64', 'chrome')
    }
  }
}

let browser = null
let currentHeadless = true
const activeCrawls = new Map()

// ── Retry helpers ────────────────────────────────────────────────────────────

const delay = (ms) => new Promise((res) => setTimeout(res, ms))

/**
 * Classify whether a crawl error is worth retrying.
 * CAPTCHA, invalid ASIN, DOM structural changes → not retryable.
 * Network timeouts, Amazon throttle, page crash → retryable.
 */
function isRetryableError(err) {
  const msg = String(err?.message || err).toLowerCase()
  // Non-retryable signals
  if (
    msg.includes('captcha') ||
    msg.includes('type the characters') ||
    msg.includes('invalid asin') ||
    msg.includes('amazon dom has changed')
  ) {
    return false
  }
  // Retryable signals
  return (
    msg.includes('timeout') ||
    msg.includes('net::err') ||
    msg.includes('navigation failed') ||
    msg.includes('target closed') ||
    msg.includes('socket') ||
    msg.includes('loading too slowly') ||
    msg.includes('blocked') ||
    msg.includes('http 503') ||
    msg.includes('http 429') ||
    msg.includes('http 403') ||
    msg.includes('no usable data') ||
    msg.includes('failed to load') ||
    msg.includes('redirected away')
  )
}

export async function initBrowser(headless = true) {
  if (browser && currentHeadless !== headless) {
    await closeBrowser()
  }
  if (!browser) {
    currentHeadless = headless
    browser = await chromium.launch({
      headless,
      executablePath: getChromiumExecutable(headless),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        // ── Memory optimization ──
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--no-first-run',
        '--disable-background-timer-throttling',
        '--js-flags=--max-old-space-size=128',
      ]
    })
  }
  return browser
}

export async function closeBrowser() {
  if (browser) {
    // Clean up any lingering active crawls before closing browser
    console.log(`[Crawler] Closing browser, cleaning up ${activeCrawls.size} active crawl(s)...`)
    for (const [asin, page] of activeCrawls.entries()) {
      try {
        if (!page.isClosed()) {
          await page.close()
        }
      } catch (e) {
        console.debug(`[Crawler] Error closing page for ASIN ${asin}:`, e.message)
      }
    }
    activeCrawls.clear()

    await browser.close().catch(() => {})
    browser = null
    console.log('[Crawler] Browser closed successfully')
  }
}

/**
 * Retry wrapper for crawlAmazon.
 * Retries up to MAX_RETRIES times with exponential backoff on transient errors.
 * Backoff: attempt 1→5s, attempt 2→15s, attempt 3→45s (+ up to 2s jitter).
 */
export async function crawlAmazonWithRetry(asin, progressCb, options = {}) {
  const MAX_RETRIES = options.maxRetries ?? 3
  const BASE_DELAY_MS = options.baseRetryDelayMs ?? 5000

  let lastError
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await crawlAmazon(asin, progressCb, options)
    } catch (err) {
      lastError = err
      const retryable = isRetryableError(err)
      if (!retryable || attempt === MAX_RETRIES) {
        console.error(`[Crawler] ❌ crawlAmazon failed (attempt ${attempt}/${MAX_RETRIES}, not retrying):`, err.message)
        throw err
      }
      const waitMs = BASE_DELAY_MS * Math.pow(3, attempt - 1) + Math.random() * 2000
      console.warn(
        `[Crawler] ⚠️ crawlAmazon attempt ${attempt}/${MAX_RETRIES} failed: ${err.message?.substring(0, 80)}. Retrying in ${(waitMs / 1000).toFixed(1)}s...`
      )
      progressCb(
        `[RETRY] Lần thử ${attempt}/${MAX_RETRIES} thất bại. Thử lại sau ${(waitMs / 1000).toFixed(1)}s...`
      )
      await delay(waitMs)
    }
  }
  throw lastError
}

export async function crawlAmazon(asin, progressCb, options = {}) {
  const amazonUrl = options.amazonUrl || ''
  const { headless = true, delay: crawlDelay = 2, defaultQuantity = 10 } = options
  const b = await initBrowser(headless)

  const context = await b.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  })

  // ── Force US region via cookies ─────────────────────────────────────────
  await context.addCookies([
    { name: 'i18n-prefs', value: 'USD', domain: '.amazon.com', path: '/' },
    { name: 'lc-main', value: 'en_US', domain: '.amazon.com', path: '/' },
    { name: 'sp-cdn', value: '"L5Z9:US"', domain: '.amazon.com', path: '/' }
  ])

  const page = await context.newPage()

  // ── Block heavy resources to save RAM/CPU ────────────────────────────────
  // NOTE: Do NOT block 'stylesheet' — Amazon's JS rendering pipeline depends
  // on CSS being loaded. Blocking it prevents #productTitle from appearing.
  await page.route('**/*', (route) => {
    const type = route.request().resourceType()
    if (['image', 'font', 'media'].includes(type)) {
      return route.abort()
    }
    return route.continue()
  })

  activeCrawls.set(asin, page)
  progressCb('[PROGRESS] Starting browser...')

  try {
    // Prefer original Amazon URL from Excel; fallback to ASIN-constructed URL
    const url = (amazonUrl && amazonUrl.includes('amazon.com')) ? amazonUrl : `https://www.amazon.com/dp/${asin}`

    // ── HTTP response guard: detect Amazon blocks before parsing ─────────
    let httpBlockError = null
    page.on('response', (res) => {
      try {
        const resUrl = res.url()
        const status = res.status()
        if (
          resUrl.includes('amazon.com/dp/') &&
          [503, 429, 403].includes(status)
        ) {
          httpBlockError = new Error(`Amazon blocked request: HTTP ${status}`)
          console.error(`[Crawler] 🚫 HTTP ${status} detected on ${resUrl}`)
        }
      } catch { /* ignore listener errors */ }
    })

    progressCb(`[PROGRESS] Opening Amazon page...`)
    await page.goto(url, { waitUntil: 'load', timeout: 45000 })

    if (httpBlockError) throw httpBlockError

    // ── Handle "Continue shopping" interstitial ─────────────────────────
    // Amazon shows a gateway page with: "Click the button below to continue shopping"
    // This can appear even when URL contains /dp/ — so always check for the button.
    try {
      let continueBtn = await page.$('button.a-button-text[alt="Continue shopping"]')
      if (!continueBtn) {
        continueBtn = await page.$('button:has-text("Continue shopping")')
      }
      if (continueBtn) {
        console.log('[Crawler] 🛒 "Continue shopping" interstitial detected — clicking...')
        progressCb('[PROGRESS] Bypassing Amazon gateway page...')
        await continueBtn.click()
        await page.waitForLoadState('load', { timeout: 30000 })
        await page.waitForTimeout(1500)
        console.log('[Crawler] ✅ Passed interstitial, now on:', page.url())
      }
    } catch (e) {
      console.warn('[Crawler] ⚠️ Continue-shopping bypass attempt failed:', e.message)
    }

    const waitMs = crawlDelay * 1000 + Math.random() * 1000
    progressCb('[PROGRESS] Waiting for page to load...')
    await page.waitForTimeout(waitMs)

    // ── Early redirect detection ───────────────────────────────────────
    // Amazon redirects invalid/unavailable products to homepage, search, or error pages.
    // Detect this immediately to avoid wasting 30+ seconds on empty extraction.
    const postLoadUrl = page.url()
    const isStillProductPage =
      postLoadUrl.includes('/dp/') || postLoadUrl.includes('/gp/product/')
    if (!isStillProductPage) {
      console.error(`[Crawler] ❌ Amazon redirected away from product page`)
      console.error(`  - Expected: ${url}`)
      console.error(`  - Actual:   ${postLoadUrl}`)
      throw new Error(
        `Amazon redirected away from product page (to: ${postLoadUrl.substring(0, 120)}). ASIN may be invalid or region-locked.`
      )
    }

    // ── Early CAPTCHA / bot-block detection ──────────────────────────────
    // Fail fast instead of waiting 30s for title selectors that will never appear.
    const pageText = await page.evaluate(() => document.body?.innerText?.substring(0, 2000) || '')
    const bodyLower = pageText.toLowerCase()
    if (
      bodyLower.includes('type the characters you see') ||
      bodyLower.includes('enter the characters you see') ||
      bodyLower.includes('sorry, we just need to make sure') ||
      bodyLower.includes('captcha')
    ) {
      console.error('[Crawler] 🤖 CAPTCHA detected — Amazon is blocking this crawler session')
      throw new Error('Amazon CAPTCHA detected. Please wait a few minutes and try again, or switch IP/VPN.')
    }

    // Wait for product title to actually render (JS-driven pages load it late)
    progressCb('[PROGRESS] Waiting for product title...')
    const titleSelectors = [
      '#productTitle',
      'span#title',
      'h1#title span',
      '#centerCol h1.a-size-large',
      '#title'
    ]
    const titleSelectorStr = titleSelectors.join(', ')

    // Try to find title selector. If not found within 30s, reload page and try once more.
    // This handles transient network issues / slow Amazon responses.
    try {
      await page.waitForSelector(titleSelectorStr, { state: 'attached', timeout: 30000 })
    } catch {
      console.warn(
        '[Crawler] ⚠️ Title selector not found within 30s. Reloading page for retry...'
      )
      progressCb('[PROGRESS] Page loaded slowly — reloading and retrying...')

      try {
        httpBlockError = null // Reset before reload
        await page.reload({ waitUntil: 'load', timeout: 45000 })
        if (httpBlockError) throw httpBlockError

        await page.waitForTimeout(crawlDelay * 1000 + Math.random() * 1000)

        // Re-check redirect after reload
        const reloadUrl = page.url()
        if (!reloadUrl.includes('/dp/') && !reloadUrl.includes('/gp/product/')) {
          throw new Error(
            `Amazon redirected away after reload (to: ${reloadUrl.substring(0, 120)}). ASIN may be invalid.`
          )
        }

        await page.waitForSelector(titleSelectorStr, { state: 'attached', timeout: 30000 })
        console.log('[Crawler] ✅ Title found after page reload!')
        progressCb('[PROGRESS] ✅ Page reloaded successfully')
      } catch (reloadErr) {
        console.warn(
          '[Crawler] ⚠️ Title still not found after reload:',
          reloadErr.message
        )
        // Don't throw here — continue with extraction.
        // Data Quality Gate at the end will catch truly empty pages.
      }
    }

    // Wait 3-5s for JS to finish rendering
    await page.waitForTimeout(3000 + Math.random() * 2000)

    progressCb('[PROGRESS] Checking delivery address...')
    let deliveryChanged = false
    if (options.forceUSLocation !== false) {
      deliveryChanged = await trySetUSDelivery(page)
    }

    // If delivery location changed, re-wait for price elements to update
    if (deliveryChanged) {
      progressCb('[PROGRESS] Location changed — waiting for prices to update...')
      await page.waitForTimeout(2000)
      await Promise.allSettled([
        page.waitForSelector('.a-price .a-offscreen', { timeout: 8000 }),
        page.waitForSelector('#corePrice_feature_div', { timeout: 8000 }),
      ])
    }

    progressCb('[PROGRESS] Extracting product data...')

    // ── Title ────────────────────────────────────────────────────────────
    // Re-fetch HTML AFTER delivery location is set — critical for correct prices
    let html = await getStablePageContent(page)
    let $ = cheerio.load(html)

    let title = ''
    // Log: check each selector sequentially to avoid excessive parallel calls
    console.log('[Crawler] 🔍 Searching for title using selectors:')
    for (const sel of titleSelectors) {
      try {
        const count = await page.$$(sel)
        if (count.length > 0) {
          const t = $(sel).first().text().trim()
          console.log(
            `  [DEBUG] selector "${sel}" has ${count.length} element(s), text="${t.substring(0, 50)}..."`
          )
        }
      } catch {
        // Selector might be invalid, skip silently
      }
    }

    // Try each selector one by one to log which one succeeded
    for (const sel of titleSelectors) {
      const t = $(sel).first().text().trim()
      if (t) {
        title = t
        console.log(`✅ [Crawler] Found title using DOM selector: ${sel}`)
        break
      }
    }

    if (!title) {
      console.log('[Crawler] ⚠️ Cheerio failed to find title, trying Playwright $eval...')
      // Playwright evaluation fallback (sometimes cheerio misses dynamically inserted nodes)
      title = await page.$eval(titleSelectorStr, (el) => el.textContent.trim()).catch(() => '')
      if (title) {
        console.log(`✅ [Crawler] Found title using Playwright $eval fallback`)
      }
    }

    // Fallback: extract title from page <title> tag if main selectors fail
    if (!title) {
      console.log('[Crawler] ⚠️ $eval failed, trying page.title() fallback...')
      const pageTitle = await page.title()
      if (pageTitle) {
        console.log(`[Crawler] Page title raw: "${pageTitle}"`)
        // Amazon titles often look like "Amazon.com: Actual Product Title" or "Amazon.com : Actual Product Title"
        let cleanTitle = pageTitle.replace(/^Amazon\.com\s*:\s*/i, '')
        // If it starts with "Amazon.com: ", it will be removed. If not, maybe it still has other colons.
        if (cleanTitle === pageTitle && pageTitle.includes(':')) {
          cleanTitle = pageTitle.split(':').slice(1).join(':').trim()
        }
        cleanTitle = cleanTitle.trim()

        // Reject non-product page titles (error pages, dog pages, redirects)
        const NON_PRODUCT_TITLES = [
          'amazon.com',
          'amazon',
          'page not found',
          'robot check',
          'sorry',
          'something went wrong',
          'error',
          '404',
          'sign in',
          'amazon.com: online shopping',
        ]
        const isNonProduct = NON_PRODUCT_TITLES.some(
          (t) => cleanTitle.toLowerCase() === t || cleanTitle.toLowerCase().startsWith(t + ' ')
        )

        if (cleanTitle && !isNonProduct) {
          title = cleanTitle
          console.log(`✅ [Crawler] Extracted title from page <title>: ${title}`)
        } else {
          console.warn(
            `[Crawler] ⚠️ page.title() rejected as non-product: "${pageTitle}" → cleaned: "${cleanTitle}"`
          )
        }
      }
    }

    // Debug: log HTML snippet if title is still missing
    if (!title) {
      console.error('[Crawler] ❌ Critical Error: Could not extract title from HTML.')
      console.error('[Crawler] Debug info:')
      console.error(`  - Page URL: ${page.url()}`)
      console.error(`  - Page title (raw): ${await page.title()}`)
      console.error(`  - HTML length: ${html.length}`)
      // Save a snippet of HTML for debugging
      console.error(`  - HTML snippet (first 2000 chars):\n${html.substring(0, 2000)}`)
      console.error(`  - titleSelectors tried: ${titleSelectors.join(', ')}`)
    }

    if (
      !title &&
      (html.toLowerCase().includes('captcha') || html.toLowerCase().includes('type the characters'))
    ) {
      throw new Error('Amazon Anti-Bot Captcha — please try again later or disable Headless Mode.')
    }
    if (!title) {
      throw new Error(
        'Product title not found. Page might be loading too slowly, blocked, or Amazon DOM has changed. Check logs for debug info.'
      )
    }

    // Wait for other lazy-loaded sections before scraping them
    // Include #twister for variation data
    await Promise.allSettled([
      page.waitForSelector('#feature-bullets', { timeout: 8000 }),
      page.waitForSelector('#availability', { timeout: 8000 }),
      page.waitForSelector(
        '#wayfinding-breadcrumbs_feature_div, #wayfinding-breadcrumbs_container',
        { timeout: 8000 }
      ),
      page.waitForSelector('.a-price .a-offscreen', { timeout: 8000 }),
      page.waitForSelector('#twister, #variation_color_name, #variation_size_name', { timeout: 8000 })
    ])

    // Re-fetch HTML AFTER lazy sections loaded (captures JS-injected prices, variations)
    html = await getStablePageContent(page)
    $ = cheerio.load(html)

    // ── Price ────────────────────────────────────────────────────────────
    progressCb('[PROGRESS] Fetching price information...')
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
      '#priceblock_saleprice'
    ]
    for (const sel of priceSelectors) {
      const el = $(sel).first()
      const text = el.text().trim()

      // Check if this element is inside a carousel/related section
      const isRelated =
        el.closest(
          '#HLCXComparisonWidget_feature_div, #sims-consolidated-2_feature_div, #sp_detail, #reco-similar-items, .as-title-block'
        ).length > 0
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
          const corePrice = document.querySelector(
            '#corePrice_feature_div, #corePriceDisplay_desktop_feature_div, #apex_desktop'
          )
          if (corePrice) {
            const offscreen = corePrice.querySelector('.a-price .a-offscreen')
            if (offscreen) {
              const m = offscreen.textContent.trim().match(/\$([\d,]+\.?\d*)/)
              if (m) return parseFloat(m[1].replace(',', ''))
            }
          }
          // Fallback: apexPriceToPay (still scoped)
          const apexEl = document.querySelector(
            '.a-price.apexPriceToPay .a-offscreen, .a-price.priceToPay .a-offscreen'
          )
          if (apexEl) {
            const m = apexEl.textContent.trim().match(/\$([\d,]+\.?\d*)/)
            if (m) return parseFloat(m[1].replace(',', ''))
          }
          return 0
        })
      } catch (err) {
        console.debug('[Crawler] Strategy B Playwright evaluate failed:', err.message)
      }
    }

    // Strategy C (LAST RESORT): JSON priceAmount regex — searches full HTML
    // ⚠️ This can pick up prices from "Related Products" carousel, so only use as fallback
    if (!price || price === 0) {
      // Try to find priceAmount near the product's own ASIN to reduce false matches
      const asinPriceMatch = html.match(
        new RegExp(`"${asin}"[\\s\\S]{0,500}"priceAmount"\\s*:\\s*([\\d.]+)`)
      )
      if (asinPriceMatch) {
        const p = parseFloat(asinPriceMatch[1])
        if (p > 0) {
          price = p
          console.log(`[Crawler] Found price ${price} via ASIN-nearby priceAmount (Strategy C)`)
        }
      }
    }
    if (!price || price === 0) {
      // Final fallback: look for priceAmount in core price display area only
      // Search in core price containers to avoid related product prices
      const corePriceAreaMatch = html.match(
        /(corePrice|corePriceDisplay|apex_desktop|buybox)[\s\S]{0,300}"priceAmount"\s*:\s*([\d.]+)/
      )
      if (corePriceAreaMatch) {
        const p = parseFloat(corePriceAreaMatch[2])
        if (p > 0) {
          price = p
          console.log(
            `[Crawler] Found price ${price} via core price area priceAmount (Strategy C fallback)`
          )
        }
      }
    }
    if (!price || price === 0) {
      // Last resort: any priceAmount (WARNING: may be from related products)
      console.warn('[Crawler] ⚠️ Using last-resort priceAmount - may be inaccurate!')
      const priceMatches = [...html.matchAll(/"priceAmount"\s*:\s*([\d.]+)/g)]
      for (const m of priceMatches) {
        const p = parseFloat(m[1])
        if (p > 0) {
          price = p
          console.log(`[Crawler] Found price ${price} via any priceAmount (risky fallback)`)
          break
        }
      }
    }

    // ── Price Range ─────────────────────────────────────────────────────
    let priceRange = ''
    const rangeEl = $('#corePrice_feature_div .a-price-range')
    if (rangeEl.length) {
      const prices = rangeEl
        .find('.a-offscreen')
        .map((_, el) => $(el).text().trim())
        .get()
      if (prices.length >= 2) priceRange = `${prices[0]} - ${prices[1]}`
    }

    // ── Images — FIXED: multiple extraction methods ─────────────────────
    progressCb('[PROGRESS] Downloading images...')
    let images = []

    // Method 1: Parse from imageGalleryData or colorImages in JS
    const imgDataPatterns = [
      /"colorImages"\s*:\s*\{\s*"initial"\s*:\s*(\[[\s\S]*?\])\s*\}/,
      /"imageGalleryData"\s*:\s*(\[[\s\S]*?\])\s*[,}]/
    ]
    for (const pat of imgDataPatterns) {
      if (images.length > 0) break
      const m = html.match(pat)
      if (m?.[1]) {
        try {
          const parsed = JSON.parse(m[1])
          images = parsed.map((i) => i.hiRes || i.large || i.mainUrl || '').filter(Boolean)
        } catch (err) {
          console.debug(
            '[Crawler] Image data parse failed for pattern:',
            pat,
            'Error:',
            err.message
          )
        }
      }
    }

    // Method 2: Extract all image URLs from the JS data (broader search)
    if (images.length === 0) {
      const allHiRes = [...html.matchAll(/"hiRes"\s*:\s*"(https:\/\/[^"]+)"/g)]
      if (allHiRes.length > 0) {
        images = [...new Set(allHiRes.map((m) => m[1]))]
      }
    }

    // Method 3: Parse from DOM using Playwright (more reliable than cheerio for lazy-loaded)
    if (images.length === 0) {
      try {
        images = await page.$$eval(
          '#altImages .a-spacing-small img, #imageBlock img, .imageThumbnail img',
          (els) => {
            const urls = []
            for (const el of els) {
              let src = el.src || el.getAttribute('data-old-hires') || ''
              // Convert thumbnail to full-size
              src = src.replace(/\._.*_\./, '.')
              if (
                src &&
                !src.includes('sprite') &&
                !src.includes('grey-pixel') &&
                !src.includes('play-icon')
              ) {
                urls.push(src)
              }
            }
            return [...new Set(urls)]
          }
        )
      } catch (err) {
        console.debug('[Crawler] Method 3 DOM image extraction failed:', err.message)
      }
    }

    // Method 4: Fallback to landing image
    if (images.length === 0) {
      const mainImg = await page
        .$eval('#landingImage', (el) => {
          return el.getAttribute('data-old-hires') || el.src || ''
        })
        .catch(() => '')
      if (mainImg) images.push(mainImg.replace(/\._.*_\./, '.'))
    }

    // Deduplicate & clean
    images = [...new Set(images)].filter((url) => url && url.startsWith('http'))

    // ── Brand ───────────────────────────────────────────────────────────
    let brand = ''
    const brandSelectors = [
      '#bylineInfo',
      '#brand',
      'a#brand',
      '.a-link-normal .a-size-base[href*="/stores/"]',
      '[data-hook="brand-name"]'
    ]
    for (const sel of brandSelectors) {
      const text = $(sel).first().text().trim()
      if (text) {
        brand = text
          .replace(/^Visit the\s+/i, '')
          .replace(/^Brand:\s*/i, '')
          .replace(/\s+Store$/i, '')
          .trim()
        if (brand) {
          console.log(`[Crawler] Found brand "${brand}" using selector: ${sel}`)
          break
        }
      }
    }

    // ── Rating & Reviews ────────────────────────────────────────────────
    progressCb('[PROGRESS] Fetching reviews...')

    let rating = 0
    const ratingSelectors = [
      '#acrPopover .a-icon-alt',
      '[data-hook="rating-out-of-text"] .a-icon-alt',
      '.a-icon-star .a-icon-alt',
      '#averageCustomerReviews .a-icon-alt'
    ]
    for (const sel of ratingSelectors) {
      const text = $(sel).first().text().trim()
      const ratingMatch = text.match(/([\d.]+)\s*out/)
      if (ratingMatch) {
        rating = parseFloat(ratingMatch[1])
        console.log(`[Crawler] Found rating ${rating} using selector: ${sel}`)
        break
      }
    }

    let reviewCount = 0
    const reviewSelectors = [
      '#acrCustomerReviewText',
      '[data-hook="total-review-count"]',
      '#acrCustomerReviewLink',
      'a[href*="#customer-reviews"]'
    ]
    for (const sel of reviewSelectors) {
      const text = $(sel).first().text().trim()
      const reviewMatch = text.match(/([\d,]+)/)
      if (reviewMatch) {
        reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10)
        console.log(`[Crawler] Found review count ${reviewCount} using selector: ${sel}`)
        break
      }
    }

    // ── Bullet Points ───────────────────────────────────────────────────
    let bulletPoints = []
    $('#feature-bullets li span.a-list-item').each((_, el) => {
      const txt = $(el).text().trim()
      if (txt && txt.length > 5) bulletPoints.push(txt)
    })

    // ── Description ─────────────────────────────────────────────────────
    let description = ''
    let descriptionHtml = ''
    let descriptionImages = []

    const descEl = $('#productDescription')
    if (descEl.length) {
      description = descEl.text().trim().replace(/\s+/g, ' ')
      descriptionHtml = descEl.html()?.trim() || ''
    }

    // A+ content
    const aplusEl = $(
      '#aplus-content, #aplus, #aplusProductDescription, #aplus_feature_div, #aplus3p_feature_div, .aplus-v2'
    )
    if (aplusEl.length) {
      if (!description) {
        description = aplusEl.text().trim().replace(/\s+/g, ' ').substring(0, 3000)
      }
      if (!descriptionHtml) {
        descriptionHtml = aplusEl.html()?.trim() || ''
      }
      // Extract A+ images via Playwright (cheerio misses lazy-loaded)
      try {
        // A+ product description images only. Brand Story / carousel blocks often
        // contain cross-sell/category images that should not be exported as description.
        const aplusImgs = await page.$$eval(
          '#aplus-content img, #aplus img, #aplusProductDescription img, ' +
            '#aplus_feature_div img, #aplus3p_feature_div img, ' +
            '.aplus-v2 img, .aplus-module img, [data-aplus-component] img',
          (els) => {
            const brandStoryMarker = Array.from(
              document.querySelectorAll(
                'h1, h2, h3, h4, span, div, #aplusBrandStory_feature_div, #brandStory_feature_div'
              )
            ).find((el) => {
              const text = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase()
              return text === 'from the brand'
            })

            const excludedAncestors = [
              '#aplusBrandStory_feature_div',
              '#brandStory_feature_div',
              '[id*="BrandStory"]',
              '[id*="brandStory"]',
              '[id*="brand-story"]',
              '[class*="brand-story"]',
              '[cel_widget_id*="brandStory"]',
              '[data-cel-widget*="brandStory"]'
            ].join(', ')

            const isBeforeBrandStory = (img) => {
              if (!brandStoryMarker) return true
              return Boolean(img.compareDocumentPosition(brandStoryMarker) & Node.DOCUMENT_POSITION_FOLLOWING)
            }

            const getImageSrc = (img) => {
              const dynamicImage = img.getAttribute('data-a-dynamic-image')
              if (dynamicImage) {
                try {
                  const parsed = JSON.parse(dynamicImage)
                  const urls = Object.keys(parsed)
                  if (urls.length > 0) return urls[0]
                } catch {
                  // Fall back to normal attributes below.
                }
              }

              return img.getAttribute('data-src') || img.getAttribute('src') || ''
            }

            return els
              .filter((img) => !img.closest(excludedAncestors))
              .filter(isBeforeBrandStory)
              .filter((img) => {
                const w = img.naturalWidth || img.width || 0
                const h = img.naturalHeight || img.height || 0
                // Filter out loaded placeholders and tiny icons. If images are blocked
                // for crawler performance, dimensions may be 0 and source filters below apply.
                return (w > 10 && h > 10) || (!w && !h)
              })
              .map((img) => {
                const src = getImageSrc(img)
                return src.replace(/\._.*_\./, '.')
              })
              .filter((src) => {
                if (!src || !src.startsWith('http')) return false
                const lower = src.toLowerCase()
                return (
                  !lower.includes('sprite') &&
                  !lower.includes('grey-pixel') &&
                  !lower.includes('transparent-pixel') &&
                  !lower.includes('/nav-sprite')
                )
              })
          }
        )
        for (const src of aplusImgs) {
          if (!descriptionImages.includes(src)) descriptionImages.push(src)
        }
      } catch (err) {
        console.debug('[Crawler] A+ image extraction failed:', err.message)
      }
    }

    // ── Technical Specs ─────────────────────────────────────────────────
    progressCb('[PROGRESS] Fetching technical specifications...')
    const specs = {}

    $('#productDetails_techSpec_section_1 tr, #productDetails_detailBullets_sections1 tr').each(
      (_, el) => {
        const key = $(el).find('th').text().trim()
        const val = $(el).find('td').text().replace(/\s+/g, ' ').trim()
        if (key && val) specs[key] = val
      }
    )

    $('#detailBullets_feature_div li, #detailBulletsWrapper_feature_div li').each((_, el) => {
      const spans = $(el).find('span span')
      if (spans.length >= 2) {
        const key = $(spans[0])
          .text()
          .replace(/[:\u200F\u200E\s]+/g, ' ')
          .trim()
        const val = $(spans[1])
          .text()
          .replace(/[:\u200F\u200E\s]+/g, ' ')
          .trim()
        if (
          key &&
          val &&
          key.length < 60 &&
          !key.includes('Customer Reviews') &&
          !val.includes('P.when')
        ) {
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
    progressCb('[PROGRESS] Fetching important information...')
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
    } catch (err) {
      console.debug('[Crawler] Important info extraction failed:', err.message)
    }

    // ── Availability ────────────────────────────────────────────────────
    const availabilityText = $('#availability span').first().text().trim()
    const inStock = availabilityText.toLowerCase().includes('in stock')

    // ── Categories ──────────────────────────────────────────────────────
    let categories = []
    $('#wayfinding-breadcrumbs_feature_div li a, #wayfinding-breadcrumbs_container li a').each(
      (_, el) => {
        const cat = $(el).text().trim()
        if (cat) categories.push(cat)
      }
    )

    // ── BSR ──────────────────────────────────────────────────────────────
    let bsr = ''
    $('#productDetails_detailBullets_sections1 tr, #detailBulletsWrapper_feature_div li').each(
      (_, el) => {
        const text = $(el).text()
        if (text.includes('Best Sellers Rank') || text.includes('Amazon Best Sellers Rank')) {
          bsr = text.replace(/\s+/g, ' ').trim()
        }
      }
    )

    // ── Variations — FIXED: comprehensive parsing ───────────────────────
    progressCb('[PROGRESS] Analyzing product variations...')
    let variations = await extractVariations($, html, page, price, progressCb, defaultQuantity)

    progressCb('[PROGRESS] ✓ Crawl completed!')

    // ── Data Validation ─────────────────────────────────────────────────────
    // Validate critical fields and sanitize

    // Title must be non-empty and reasonable length
    if (!title || title.length < 3) {
      console.warn('[Crawler] ⚠️ Title is too short or empty:', title?.substring(0, 50))
      title = title || ''
    }
    if (title.length > 500) {
      title = title.substring(0, 500).trim() + '...'
    }

    // Price must be positive
    if (!price || price <= 0 || isNaN(price)) {
      console.error('[Crawler] ❌ Invalid price:', price, '- ASIN:', asin)
      price = 0
    }

    // Images must have at least one valid URL
    if (!Array.isArray(images) || images.length === 0) {
      console.warn('[Crawler] ⚠️ No product images found - ASIN:', asin)
      images = []
    } else {
      // Filter out any invalid URLs that slipped through
      images = images.filter((url) => url && typeof url === 'string' && url.startsWith('http'))
    }

    // ── Data Quality Gate ─────────────────────────────────────────────────
    // If we got no meaningful data, the product page didn't load properly
    // (dog page, redirect to homepage, invalid ASIN, geo-blocked, etc.)
    const hasNoImages = images.length === 0
    const hasNoPrice = !price || price <= 0
    const hasNoSpecs = Object.keys(specs).length === 0
    const hasNoBullets = bulletPoints.length === 0

    if (hasNoImages && hasNoPrice && hasNoSpecs && hasNoBullets) {
      const pageUrl = page.url()
      console.error(`[Crawler] ❌ Data Quality Gate FAILED for ASIN ${asin}:`)
      console.error(`  - title: "${title?.substring(0, 80)}"`)
      console.error(`  - images: ${images.length}, price: ${price}, specs: ${Object.keys(specs).length}, bullets: ${bulletPoints.length}`)
      console.error(`  - final URL: ${pageUrl}`)

      // Check if Amazon redirected away from the product page
      const isProductPage = pageUrl.includes('/dp/') || pageUrl.includes('/gp/product/')
      if (!isProductPage) {
        throw new Error(
          `Amazon redirected away from product page (to: ${pageUrl.substring(0, 100)}). ASIN may be invalid or region-locked.`
        )
      }

      throw new Error(
        `No usable data extracted for ASIN ${asin} — 0 images, no price, no specs. Page may have failed to load properly.`
      )
    }

    // ASIN format validation
    if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) {
      console.warn('[Crawler] ⚠️ Invalid ASIN format:', asin)
    }

    // Ensure brand is string
    if (typeof brand !== 'string') brand = ''

    // Ensure arrays are initialized
    if (!Array.isArray(bulletPoints)) bulletPoints = []
    if (!Array.isArray(categories)) categories = []
    if (!Array.isArray(variations)) variations = []
    if (!Array.isArray(descriptionImages)) descriptionImages = []

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
      availability: availabilityText
    }
  } finally {
    await page.close().catch(() => {})
    await context.close().catch(() => {})
    activeCrawls.delete(asin)
    // Close browser when no more active crawls — prevents zombie Chrome windows
    if (activeCrawls.size === 0) {
      await closeBrowser()
    }
  }
}

async function getStablePageContent(page, options = {}) {
  const { attempts = 3, waitAfterNavigationMs = 750 } = options
  let lastError = null

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
      return await page.content()
    } catch (err) {
      lastError = err
      const message = String(err?.message || err)
      const isNavigating =
        message.includes('page is navigating') ||
        message.includes('changing the content') ||
        message.includes('Execution context was destroyed')

      if (!isNavigating || attempt === attempts) {
        throw err
      }

      console.debug(
        `[Crawler] page.content() hit navigation race; retrying ${attempt}/${attempts}...`
      )
      await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {})
      await page.waitForTimeout(waitAfterNavigationMs * attempt)
    }
  }

  throw lastError
}

/**
 * Attempt to set US delivery address to get proper US prices.
 * Wrapped with a hard timeout to prevent hanging.
 */
async function trySetUSDelivery(page) {
  const MAX_ATTEMPTS = 3

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`[trySetUSDelivery] Hardening location to US (10001)... (attempt ${attempt}/${MAX_ATTEMPTS})`)

      const result = await page.evaluate(async () => {
        const wait = (ms) => new Promise((res) => setTimeout(res, ms))

        // 1. Check current location
        const locText =
          document.querySelector('#glow-ingress-block, #nav-global-location-popover-link')
            ?.textContent || ''
        if (locText.includes('10001') || locText.includes('New York')) return 'ALREADY_US'

        // 2. Open popover
        const btn = document.querySelector('#nav-global-location-popover-link, #glow-ingress-block')
        if (!btn) return 'NO_BUTTON'
        btn.click()
        await wait(2500)

        // 3. Enter Zip — use native setter to ensure React/Amazon JS detects the change
        const input = document.querySelector('#GLUXZipUpdateInput')
        if (!input) return 'NO_INPUT'
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(input, '10001')
        } else {
          input.value = '10001'
        }
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new Event('change', { bubbles: true }))
        // Also fire keydown/keyup to satisfy Amazon's event listeners
        input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
        await wait(800)

        // 4. Click Apply
        const applyBtn = document.querySelector(
          '#GLUXZipUpdate input[type="submit"], #GLUXZipUpdate .a-button-input'
        )
        if (!applyBtn) return 'NO_APPLY'
        applyBtn.click()
        await wait(2500)

        // 5. Click Continue/Done
        const continueBtn = document.querySelector(
          '.a-popover-footer .a-button-primary .a-button-input, #GLUXConfirmClose .a-button-input, button[name="glowDoneButton"]'
        )
        if (continueBtn) {
          continueBtn.click()
          return 'SUCCESS_CONTINUE'
        }

        return 'SUCCESS_ZIP_ONLY'
      })

      console.log(`[trySetUSDelivery] Result: ${result}`)

      if (result === 'ALREADY_US') {
        return false // Already US, no change
      }

      if (result.startsWith('SUCCESS')) {
        await page.waitForTimeout(1500)
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {})
        await page
          .reload({ waitUntil: 'domcontentloaded' })
          .catch((err) => {
            const message = String(err?.message || err)
            if (!message.includes('ERR_ABORTED') && !message.includes('frame was detached')) {
              throw err
            }
            console.debug('[trySetUSDelivery] Reload skipped because Amazon was already navigating.')
          })
        await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
        await page.waitForTimeout(2000)

        // Verify the location actually changed
        const verifyResult = await page.evaluate(() => {
          const locText = document.querySelector('#glow-ingress-block, #nav-global-location-popover-link')?.textContent || ''
          return locText.includes('10001') || locText.includes('New York') || locText.includes('United States')
        })

        if (verifyResult) {
          console.log('[trySetUSDelivery] ✅ Verified: location is now US (10001).')
          return true // Changed successfully
        } else {
          console.warn(`[trySetUSDelivery] ⚠️ Attempt ${attempt}: Location set but verification failed.`)
          if (attempt < MAX_ATTEMPTS) {
            await page.waitForTimeout(2000)
            continue // Retry
          }
        }
      }

      // Failed — retry after waiting for DOM to fully render
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[trySetUSDelivery] ⚠️ Attempt ${attempt} failed (${result}). Waiting 3s for DOM then retrying...`)
        await page.waitForTimeout(3000)
      } else {
        console.warn(
          `[trySetUSDelivery] ⚠️ Location setting incomplete after ${MAX_ATTEMPTS} attempts (${result}). Prices may be in local currency.`
        )
      }
    } catch (err) {
      console.error('[trySetUSDelivery] Error during hardening:', err)
      if (attempt === MAX_ATTEMPTS) {
        console.warn('[trySetUSDelivery] ⚠️ Location setting failed - prices may be inaccurate!')
      }
    }
  }
  return false // Could not change
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
      try {
        dimNames = JSON.parse(dimNamesMatch[1])
      } catch (err) {
        console.debug('[extractVariations] Failed to parse dimensions:', err.message)
      }
    }

    // ── Parse dimensionValuesDisplayData ────────────────────────────────
    // This maps ASIN → display values array
    let displayMap = {}
    // More flexible pattern - match until closing brace followed by optional whitespace and comma/end
    const dimDisplayMatch = html.match(/"dimensionValuesDisplayData"\s*:\s*(\{[^}]*\})\s*(?:,|;|$)/)
    if (dimDisplayMatch) {
      try {
        displayMap = JSON.parse(dimDisplayMatch[1])
      } catch (err) {
        console.debug(
          '[extractVariations] Failed to parse dimensionValuesDisplayData:',
          err.message
        )
      }
    }

    // ── Parse asinVariationValues ──────────────────────────────────────
    let asinMap = {}
    // More flexible pattern
    const asinVarMatch = html.match(/"asin_variation_values"\s*:\s*(\{[^}]*\})\s*(?:,|;|$)/)
    if (asinVarMatch) {
      try {
        asinMap = JSON.parse(asinVarMatch[1])
      } catch (err) {
        console.debug('[extractVariations] Failed to parse asin_variation_values:', err.message)
      }
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
        const allPrices = [
          ...twisterContent.matchAll(/"([A-Z0-9]{10})"\s*:\s*\{[^}]*"priceAmount"\s*:\s*([\d.]+)/g)
        ]
        for (const m of allPrices) {
          priceMap[m[1]] = parseFloat(m[2])
        }
      } catch {
        console.log('[extractVariations] Twister price extraction failed')
      }
    }

    // ── Parse variation image data ──────────────────────────────────────
    let imageMap = {}
    // colorImages maps dimension value → image array
    // More flexible pattern - look for colorImages followed by any key
    const colorImgsMatch = html.match(
      /"colorImages"\s*:\s*(\{[^}]*\})\s*(?:,|;|$)/
    )
    if (colorImgsMatch) {
      try {
        const colorData = JSON.parse(colorImgsMatch[1])
        for (const [key, imgs] of Object.entries(colorData)) {
          if (Array.isArray(imgs) && imgs.length > 0) {
            imageMap[key] = imgs[0].hiRes || imgs[0].large || ''
          }
        }
      } catch (err) {
        console.debug('[extractVariations] colorImages parse failed:', err.message)
      }
    }

    // ── colorToAsin mapping ────────────────────────────────────────────
    let colorToAsin = {}
    // More flexible pattern
    const c2aMatch = html.match(/"colorToAsin"\s*:\s*(\{[^}]*\})\s*(?:,|;|$)/)
    if (c2aMatch) {
      try {
        colorToAsin = JSON.parse(c2aMatch[1])
      } catch (err) {
        console.debug('[extractVariations] colorToAsin parse failed:', err.message)
      }
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
          const readableName = dimName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
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
          image: varImage
        })
      }
    }

    // ── Strategy 2: Use asinVariationValues ────────────────────────────
    if (variations.length === 0 && Object.keys(asinMap).length > 0) {
      for (const [childAsin, dimValues] of Object.entries(asinMap)) {
        const attributes = {}
        dimNames.forEach((dimName, i) => {
          const readableName = dimName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
          const rawVal = Array.isArray(dimValues) ? dimValues[i] : ''
          attributes[readableName] = rawVal || ''
        })

        variations.push({
          asin: childAsin,
          attributes,
          price: priceMap[childAsin] || basePrice,
          quantity: defaultQuantity,
          image: ''
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
      const toFetch = variations.filter((v) => !v.price || v.price === basePrice || v.price <= 0)

      if (toFetch.length > 0) {
        progressCb(`[PROGRESS] Fetching prices for ${toFetch.length} variations...`)
      }
      const context = page.context()

      for (let i = 0; i < toFetch.length; i++) {
        const v = toFetch[i]
        let varPage = null
        try {
          progressCb(`[PROGRESS] Variation price ${i + 1}/${toFetch.length}: ${v.asin}...`)
          varPage = await context.newPage()
          // Block heavy resources for variant pages too
          await varPage.route('**/*', (route) => {
            const type = route.request().resourceType()
            if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
              return route.abort()
            }
            return route.continue()
          })
          await varPage.goto(`https://www.amazon.com/dp/${v.asin}`, {
            waitUntil: 'domcontentloaded',
            timeout: 12000
          })
          await varPage.waitForTimeout(1500)

          // Guard: check if Amazon redirected away from product page
          const varUrl = varPage.url()
          if (!varUrl.includes('/dp/') && !varUrl.includes('/gp/product/')) {
            console.warn(`[variation ${v.asin}] redirected away → skipping price fetch`)
            await varPage.close().catch(() => {})
            varPage = null
            continue
          }

          // Wait for price to render
          await varPage.waitForSelector('.a-price .a-offscreen', { timeout: 5000 }).catch(() => {})
          const vHtml = await getStablePageContent(varPage, {
            attempts: 4,
            waitAfterNavigationMs: 500
          })
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
            '#apex_offerDisplay_desktop .a-price .a-offscreen'
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
                const core = document.querySelector(
                  '#corePrice_feature_div, #corePriceDisplay_desktop_feature_div'
                )
                if (core) {
                  const el = core.querySelector('.a-price .a-offscreen')
                  if (el) {
                    const m = el.textContent.trim().match(/\$([\d,]+\.?\d*)/)
                    if (m) return parseFloat(m[1].replace(',', ''))
                  }
                }
                return 0
              })
            } catch (err) {
              console.debug('[Crawler] Variant price evaluation failed:', err.message)
            }
          }

          // JSON regex last resort - strictly look for the current ASIN's price amount
          if (!variantPrice) {
            const jsPriceMatches = [
              ...vHtml.matchAll(
                new RegExp(`"${v.asin}"\\s*:\\s*\\{[^}]*"priceAmount"\\s*:\\s*([\\d.]+)`, 'g')
              )
            ]
            for (const m of jsPriceMatches) {
              const p = parseFloat(m[1])
              if (p > 0) {
                variantPrice = p
                break
              }
            }
          }

          if (variantPrice > 0) {
            v.price = variantPrice
          }

          // Also grab the main image for this variant if missing
          if (!v.image) {
            v.image = await varPage
              .$eval(
                '#landingImage, #imgBlkFront, #main-image, .a-dynamic-image, #imgTagWrapperId img',
                (el) =>
                  (
                    el.getAttribute('data-old-hires') ||
                    el.getAttribute('data-a-dynamic-image') ||
                    el.src ||
                    ''
                  ).replace(/\._.*_\./, '.')
              )
              .catch(() => '')

            // Handle data-a-dynamic-image which is a JSON string of URLs
            if (v.image && v.image.startsWith('{')) {
              try {
                const imgObj = JSON.parse(v.image)
                v.image = Object.keys(imgObj).sort((a, b) => imgObj[b][0] - imgObj[a][0])[0] // Get largest
              } catch (err) {
                console.debug(
                  `[variation ${v.asin}] data-a-dynamic-image parse failed:`,
                  err.message
                )
              }
            }

            if (!v.image) {
              const pat = /"colorImages"\s*:\s*\{\s*"initial"\s*:\s*(\[[\s\S]*?\])\s*\}/
              const m = vHtml.match(pat)
              if (m?.[1]) {
                try {
                  const parsed = JSON.parse(m[1])
                  v.image = parsed[0]?.hiRes || parsed[0]?.large || parsed[0]?.main || ''
                } catch (err) {
                  console.debug(`[variation ${v.asin}] colorImages parse failed:`, err.message)
                }
              }
            }
          }
        } catch (err) {
          // Non-critical: keep basePrice
          console.log(`[variation ${v.asin}] price fetch failed:`, err.message?.substring(0, 60))
        } finally {
          // Ensure varPage is always closed to prevent memory leak
          if (varPage) {
            try {
              await varPage.close()
            } catch (closeErr) {
              console.log(
                `[variation ${v.asin}] error closing page:`,
                closeErr.message?.substring(0, 40)
              )
            }
          }
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
      const options = await select.$$eval('option', (opts) =>
        opts
          .filter((o) => o.value && o.value !== '-1' && o.value !== '0')
          .map((o) => ({
            value: o.value,
            text: o.textContent.trim(),
            asin: o.getAttribute('data-a-html-content') || ''
          }))
      )
      const dimName = dimNames[0] || 'Option'
      const readableName = dimName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      for (const opt of options) {
        variations.push({
          asin: opt.value.length === 10 ? opt.value : `opt_${variations.length}`,
          attributes: { [readableName]: opt.text },
          price: basePrice,
          quantity: defaultQuantity,
          image: ''
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
    '#variation_pattern_name ul li[data-defaultasin]'
  ]

  for (let si = 0; si < swatchSelectors.length; si++) {
    const sel = swatchSelectors[si]
    const items = await page.$$(sel)
    if (items.length === 0) continue

    const dimName = dimNames[si] || `option_${si}`
    const readableName = dimName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

    for (const item of items) {
      const data = await item.evaluate((el) => ({
        asin: el.getAttribute('data-defaultasin') || '',
        title:
          el.getAttribute('title')?.replace(/^Click to select\s*/i, '') ||
          el.querySelector('.a-size-base')?.textContent?.trim() ||
          '',
        img: (() => {
          const img = el.querySelector('img')
          return img ? (img.src || '').replace(/\._.*_\./, '.') : ''
        })()
      }))

      if (data.asin || data.title) {
        variations.push({
          asin: data.asin,
          attributes: { [readableName]: data.title },
          price: basePrice,
          quantity: defaultQuantity,
          image: data.img
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
    'b',
    'strong',
    'i',
    'em',
    'u',
    'br',
    'p',
    'span',
    'div',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'td',
    'th',
    'caption',
    'colgroup',
    'col',
    'img',
    'a'
  ])

  const $ = cheerio.load(rawHtml, { decodeEntities: false })

  // Remove entirely: script, style, iframe, form, input, button, svg, noscript
  $(
    'script, style, iframe, form, input, button, select, textarea, svg, noscript, object, embed'
  ).remove()

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
