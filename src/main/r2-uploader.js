/**
 * Cloudflare R2 Image Uploader Module
 * Uploads product images to R2 with optional WebP conversion.
 *
 * R2 is S3-compatible, so we use @aws-sdk/client-s3.
 * Images are stored under: products/{asin}/{index}.{ext}
 */

import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@aws-sdk/node-http-handler'
import https from 'node:https'
import sharp from 'sharp'

let s3Client = null
let cachedSettings = null

/**
 * Get or create S3 client (cached, recreated if settings change)
 */
function getClient(settings) {
  const settingsKey = `${settings.r2AccountId}:${settings.r2AccessKeyId}:${settings.r2BucketName}`
  if (s3Client && cachedSettings === settingsKey) return s3Client

  if (!settings.r2AccountId || !settings.r2AccessKeyId || !settings.r2SecretAccessKey) {
    throw new Error('Cloudflare R2 credentials chưa được cấu hình đầy đủ')
  }

  s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${settings.r2AccountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.r2AccessKeyId,
      secretAccessKey: settings.r2SecretAccessKey
    },
    requestHandler: new NodeHttpHandler({
      httpsAgent: new https.Agent({
        secureProtocol: 'TLSv1_2_method',
        rejectUnauthorized: true
      })
    })
  })

  cachedSettings = settingsKey
  return s3Client
}

/**
 * Download image from URL
 */
async function downloadImage(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
      Accept: 'image/*'
    },
    signal: AbortSignal.timeout(30000)
  })

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${url}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

/**
 * Process image: optionally convert to WebP
 */
async function processImage(buffer, settings) {
  if (settings.r2ConvertWebp !== false) {
    const quality = settings.r2WebpQuality || 80
    const webpBuffer = await sharp(buffer).webp({ quality }).toBuffer()

    console.log(
      `[R2] WebP conversion: ${(buffer.length / 1024).toFixed(0)}KB → ${(webpBuffer.length / 1024).toFixed(0)}KB (${Math.round((1 - webpBuffer.length / buffer.length) * 100)}% smaller)`
    )

    return {
      buffer: webpBuffer,
      ext: 'webp',
      contentType: 'image/webp'
    }
  }

  // Keep original format — detect via sharp
  try {
    const meta = await sharp(buffer).metadata()
    const format = meta.format || 'jpeg'
    return {
      buffer,
      ext: format === 'jpeg' ? 'jpg' : format,
      contentType: `image/${format}`
    }
  } catch {
    // Fallback if sharp can't detect
    return { buffer, ext: 'jpg', contentType: 'image/jpeg' }
  }
}

/**
 * Build CDN URL for an uploaded file
 */
function buildCdnUrl(key, settings) {
  if (settings.r2CustomDomain) {
    // Custom domain or R2.dev subdomain (e.g. pub-xxx.r2.dev or images.example.com)
    const domain = settings.r2CustomDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '')
    return `https://${domain}/${key}`
  }
  // Fallback: use R2 public bucket URL format (requires public access enabled)
  // Note: S3 API endpoint requires auth, so we use the pub- format
  console.warn('[R2] No custom domain set — using S3 endpoint URL (images won\'t display without public access or custom domain)')
  return `https://pub-${settings.r2AccountId}.r2.dev/${key}`
}

/**
 * Upload a single image to R2
 */
async function uploadSingle(client, buffer, key, contentType, settings) {
  await client.send(
    new PutObjectCommand({
      Bucket: settings.r2BucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable'
    })
  )
  return buildCdnUrl(key, settings)
}

/**
 * Upload multiple images for a product to R2
 *
 * @param {string[]} imageUrls - Array of image URLs (Amazon)
 * @param {string} asin - Product ASIN (used as folder name)
 * @param {Object} settings - App settings with R2 config
 * @param {Function} progressCb - Optional progress callback (message)
 * @returns {string[]} Array of CDN URLs
 */
export async function uploadToR2(imageUrls, asin, settings, progressCb = () => {}) {
  if (!settings.useR2Cdn) return imageUrls
  if (!imageUrls || imageUrls.length === 0) return []

  const client = getClient(settings)
  const cdnUrls = []

  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i]
    progressCb(`☁️ Upload ảnh ${i + 1}/${imageUrls.length}...`)

    try {
      // Download
      const buffer = await downloadImage(url)

      // Process (WebP conversion)
      const processed = await processImage(buffer, settings)

      // Upload
      const key = `products/${asin}/${i + 1}.${processed.ext}`
      const cdnUrl = await uploadSingle(
        client,
        processed.buffer,
        key,
        processed.contentType,
        settings
      )

      cdnUrls.push(cdnUrl)
      console.log(`[R2] ✓ Uploaded ${key} (${(processed.buffer.length / 1024).toFixed(0)}KB)`)
    } catch (err) {
      console.error(`[R2] ✗ Failed to upload image ${i + 1} for ${asin}:`, err.message)
      // Keep original URL on failure
      cdnUrls.push(url)
    }
  }

  return cdnUrls
}

/**
 * Test R2 connection by uploading and deleting a tiny test file
 */
export async function testR2Connection(settings) {
  try {
    const client = getClient(settings)
    const testKey = '_connection_test.txt'

    // Upload test file
    await client.send(
      new PutObjectCommand({
        Bucket: settings.r2BucketName,
        Key: testKey,
        Body: Buffer.from('connection test'),
        ContentType: 'text/plain'
      })
    )

    // Clean up
    await client.send(
      new DeleteObjectCommand({
        Bucket: settings.r2BucketName,
        Key: testKey
      })
    )

    return { ok: true, message: 'Kết nối R2 thành công! ✓' }
  } catch (err) {
    return { ok: false, message: `Lỗi kết nối: ${err.message}` }
  }
}

/**
 * Reset cached client (call when settings change)
 */
export function resetR2Client() {
  s3Client = null
  cachedSettings = null
}
