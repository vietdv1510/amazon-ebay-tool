import shutil
import os

src = '/Users/doanvanviet1510/.gemini/antigravity/brain/2bf929c3-69c1-454f-8969-b4e780d59786/icon_1777050984720.png'
dest_build = '/Volumes/Data/Dev/Web/ebay/amazon-ebay-tool/build/icon.png'
dest_assets = '/Volumes/Data/Dev/Web/ebay/amazon-ebay-tool/src/renderer/src/assets/logo.png'

# Ensure assets dir exists
os.makedirs(os.path.dirname(dest_assets), exist_ok=True)

try:
    shutil.copy2(src, dest_build)
    print(f"Copied to {dest_build}")
    shutil.copy2(src, dest_assets)
    print(f"Copied to {dest_assets}")
except Exception as e:
    print(f"Error: {e}")
