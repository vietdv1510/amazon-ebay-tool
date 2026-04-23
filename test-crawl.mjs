/**
 * Final test: Crawl B00N5XRYTE — verify all product sections
 */
import { crawlAmazon, closeBrowser } from './src/main/crawler.js'

const ASIN = 'B00N5XRYTE'

;(async () => {
  console.log(`🚀 Crawling ${ASIN}...\n`)
  
  try {
    const result = await crawlAmazon(ASIN, (msg) => {
      console.log(msg)
    }, { headless: false, delay: 2 })

    console.log('\n\n═══════════════════════════════════════════')
    console.log('📊 CRAWL RESULT')
    console.log('═══════════════════════════════════════════')
    
    console.log('\n📌 TITLE:', result.title)
    console.log('🏷️  BRAND:', result.brand)
    console.log('💰 PRICE:', `$${result.originalPrice}`)
    console.log('📦 IN STOCK:', result.inStock)
    console.log('📂 CATEGORIES:', result.categories?.join(' > '))
    console.log('📊 BSR:', result.bsr || 'N/A')
    
    console.log(`\n🖼️  PRODUCT IMAGES (${result.images?.length || 0}):`)
    result.images?.forEach((img, i) => console.log(`  [${i}] ${img}`))
    
    console.log(`\n📝 BULLET POINTS (${result.bulletPoints?.length || 0}):`)
    result.bulletPoints?.forEach((bp, i) => console.log(`  [${i}] ${bp.substring(0, 120)}`))
    
    console.log(`\n📋 DESCRIPTION: ${result.description?.length || 0} chars`)
    console.log(`📋 DESCRIPTION HTML: ${result.descriptionHtml?.length || 0} chars`)
    
    console.log(`\n📋 A+ DESCRIPTION IMAGES (${result.descriptionImages?.length || 0}):`)
    result.descriptionImages?.forEach((img, i) => console.log(`  [${i}] ${img}`))
    
    console.log(`\n📋 SPECS (${Object.keys(result.specs || {}).length}):`)
    for (const [k, v] of Object.entries(result.specs || {})) {
      console.log(`  ${k}: ${v.substring(0, 100)}`)
    }

    console.log(`\n⚠️  IMPORTANT INFO (${Object.keys(result.importantInfo || {}).length}):`)
    for (const [k, v] of Object.entries(result.importantInfo || {})) {
      console.log(`  ${k}: ${v.substring(0, 150)}`)
    }
    
    console.log(`\n🎨 VARIATIONS (${result.variations?.length || 0}):`)
    result.variations?.forEach((v, i) => {
      console.log(`  [${i}] ASIN=${v.asin} | Price=$${v.price} | Attrs=${JSON.stringify(v.attributes)} | Img=${v.image ? 'YES' : 'NO'}`)
    })
    
    console.log('\n✅ Done!')
  } catch (err) {
    console.error('❌ ERROR:', err.message)
  } finally {
    await closeBrowser()
  }
})()
