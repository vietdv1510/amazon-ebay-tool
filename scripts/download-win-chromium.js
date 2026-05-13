/**
 * Download Playwright's chromium-headless-shell for Windows x64.
 * Playwright 1.59.x uses revision 1217 (chromium_headless_shell-1217).
 * 
 * Usage: node scripts/download-win-chromium.js
 */
const https = require('https')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// Get the revision from playwright's own descriptor
let revision = '1217'
let downloadUrl = ''

try {
  // Try to read playwright's browser descriptor to get the exact revision
  const playwrightPath = path.join(__dirname, '..', 'node_modules', 'playwright-core')
  const browsersJson = path.join(playwrightPath, 'browsers.json')
  if (fs.existsSync(browsersJson)) {
    const browsers = JSON.parse(fs.readFileSync(browsersJson, 'utf-8'))
    const chromiumEntry = browsers.browsers?.find(
      (b) => b.name === 'chromium' && b.installByDefault
    )
    if (chromiumEntry?.revision) {
      revision = String(chromiumEntry.revision)
      console.log(`[Info] Playwright chromium revision from browsers.json: ${revision}`)
    }
  }
} catch (e) {
  console.log(`[Info] Using default revision: ${revision}`)
}

const DEST_DIR = path.join(
  __dirname,
  '..',
  'playwright-browsers',
  `chromium_headless_shell-${revision}`,
  'chrome-headless-shell-win64'
)

if (fs.existsSync(path.join(DEST_DIR, 'chrome-headless-shell.exe'))) {
  console.log(`[Info] Windows Chromium already exists at: ${DEST_DIR}`)
  process.exit(0)
}

// Playwright's CDN URL for chromium headless shell (win64)
// Pattern: https://playwright.azureedge.net/builds/chromium-headless-shell/{revision}/chromium-headless-shell-win64.zip
const BASE_URL = `https://playwright.azureedge.net/builds/chromium-headless-shell/${revision}`
const ZIP_NAME = 'chromium-headless-shell-win64.zip'
const ZIP_URL = `${BASE_URL}/${ZIP_NAME}`
const ZIP_DEST = path.join(__dirname, '..', 'playwright-browsers', ZIP_NAME)

console.log(`\n[Download] Fetching Windows Chromium headless shell...`)
console.log(`[Download] URL: ${ZIP_URL}`)
console.log(`[Download] To: ${ZIP_DEST}\n`)

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Too many redirects'))
    const file = fs.createWriteStream(dest)
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close()
        fs.unlinkSync(dest)
        return download(res.headers.location, dest, redirects + 1).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`))
      }
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      res.on('data', (chunk) => {
        received += chunk.length
        if (total > 0) {
          const pct = ((received / total) * 100).toFixed(1)
          process.stdout.write(`\r[Download] ${pct}% (${(received / 1024 / 1024).toFixed(1)}MB / ${(total / 1024 / 1024).toFixed(1)}MB)`)
        }
      })
      res.pipe(file)
      file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve() })
      file.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  await download(ZIP_URL, ZIP_DEST)
  console.log(`[Extract] Extracting to playwright-browsers/...`)
  fs.mkdirSync(DEST_DIR, { recursive: true })
  execSync(`unzip -o "${ZIP_DEST}" -d "${path.dirname(DEST_DIR)}"`, { stdio: 'inherit' })
  fs.unlinkSync(ZIP_DEST)
  // Create marker files
  fs.writeFileSync(path.join(path.dirname(DEST_DIR), 'INSTALLATION_COMPLETE'), '')
  fs.writeFileSync(path.join(path.dirname(DEST_DIR), 'DEPENDENCIES_VALIDATED'), '')
  console.log(`\n[Done] ✅ Windows Chromium ready at:\n  ${DEST_DIR}\n`)
}

main().catch((e) => {
  console.error('\n[Error] ❌ Failed:', e.message)
  process.exit(1)
})
