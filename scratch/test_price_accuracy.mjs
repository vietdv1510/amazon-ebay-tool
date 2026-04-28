import { crawlAmazon, closeBrowser } from '../src/main/crawler.js'

const ASINS = [
  'B002YLBBHY', // Link 1: Lỗi vơ nhầm giá 20.99$
  'B0B648W66Z'  // Link 2: Lỗi chọn biến thể/giá sai
]

;(async () => {
  console.log(`🚀 Testing crawl for ${ASINS.length} products with hardening logic...\n`)
  
  for (const ASIN of ASINS) {
    console.log(`\n🔍 CHECKING ASIN: ${ASIN}`)
    try {
      const result = await crawlAmazon(ASIN, (msg) => {
        // Chỉ hiện log quan trọng
        if (msg.includes('Found price') || msg.includes('location') || msg.includes('Skipping')) {
          console.log(`   > ${msg}`)
        }
      }, { headless: true, delay: 3 })

      console.log('   💰 RESULT:', `$${result.originalPrice} - ${result.title.substring(0, 50)}...`)
    } catch (err) {
      console.error(`   ❌ ERROR [${ASIN}]:`, err.message)
    }
  }

  console.log('\n✅ Test sequence completed.')
  await closeBrowser()
})()
