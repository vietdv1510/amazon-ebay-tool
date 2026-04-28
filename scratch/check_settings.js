const fs = require('fs');
const path = require('path');
const os = require('os');

const settingsPath = path.join(os.homedir(), 'Library/Application Support/eBay Engine/settings.json');

if (fs.existsSync(settingsPath)) {
  console.log('File found at:', settingsPath);
  console.log('Content:');
  console.log(fs.readFileSync(settingsPath, 'utf-8'));
} else {
  console.log('File NOT found at:', settingsPath);
}
