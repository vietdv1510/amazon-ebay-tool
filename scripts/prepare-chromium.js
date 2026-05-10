/**
 * Prebuild script: Download Playwright Chromium into ./playwright-browsers/
 * This directory is then bundled into the Electron app via electron-builder extraResources.
 * Run automatically before build:mac / build:win.
 */
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

const browsersPath = path.join(__dirname, '..', 'playwright-browsers')

if (!fs.existsSync(browsersPath)) {
  fs.mkdirSync(browsersPath, { recursive: true })
}

console.log(`\n[Prepare] Downloading Playwright Chromium to:\n  ${browsersPath}\n`)

try {
  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath }
  })
  console.log('\n[Prepare] ✅ Chromium ready!\n')
} catch (e) {
  console.error('\n[Prepare] ❌ Failed to download Chromium:', e.message)
  process.exit(1)
}
