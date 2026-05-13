/**
 * Prebuild script: Download Playwright Chromium into ./playwright-browsers/
 * Downloads for BOTH the current platform AND Windows x64 (cross-compile support).
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

// Download for current platform (needed for dev mode)
try {
  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browsersPath }
  })
  console.log('\n[Prepare] ✅ Chromium (host platform) ready!\n')
} catch (e) {
  console.error('\n[Prepare] ❌ Failed to download Chromium (host):', e.message)
  process.exit(1)
}

// Download for Windows x64 (for cross-platform build:win from Mac)
// Playwright respects PLAYWRIGHT_DOWNLOAD_HOST and can be forced to download
// specific platform binaries via the internal registry download approach.
console.log('\n[Prepare] Downloading Windows x64 Chromium...\n')
try {
  execSync('npx playwright install chromium', {
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '0',
      // Force Windows x64 download
      npm_config_os: 'win32',
      npm_config_cpu: 'x64',
      PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: '60000'
    }
  })
  console.log('\n[Prepare] ✅ Chromium (Windows x64) ready!\n')
} catch (e) {
  // Non-fatal — warn but don't exit, host platform binary is sufficient for dev
  console.warn('\n[Prepare] ⚠ Could not download Windows Chromium automatically.')
  console.warn('[Prepare] Run manually on a Windows machine: npx playwright install chromium\n')
}
