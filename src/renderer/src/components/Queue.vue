<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <div class="page-title flex items-center font-bold text-[15px]">
        <ListOrdered class="w-5 h-5 mr-2.5 flex-shrink-0" />
        Amazon Crawler
      </div>

      <div class="header-actions flex gap-2">
        <Button variant="outline" size="sm" @click="handleImportFile">
          <Upload class="w-4 h-4 mr-2" />
          Import
        </Button>

        <Button v-if="!isCrawling" size="sm" :disabled="!hasPendingRows" @click="startCrawl">
          <Play class="w-4 h-4 mr-2" />
          Start Crawl
        </Button>
        <Button v-else variant="destructive" size="sm" @click="stopCrawl">
          <Square class="w-4 h-4 mr-2" />
          Stop
        </Button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="progress-wrap" v-if="isCrawling">
      <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
    </div>

    <!-- Content -->
    <div class="workspace-body h-full">
      <div class="flex-1 overflow-hidden flex flex-col mx-4 mt-4 h-full">
        <!-- Empty state -->
        <div
          v-if="rowData.length === 0"
          class="flex-1 flex flex-col items-center justify-center text-center p-8 h-full min-h-[400px]"
        >
          <div class="empty-icon bg-muted/30 p-6 rounded-full mb-4">
            <FolderOpen class="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 class="text-xl font-semibold mb-2">Chưa có sản phẩm</h3>
          <p class="text-muted-foreground mb-6 max-w-sm">
            Import file Excel/CSV chứa cột ASIN để bắt đầu crawl dữ liệu từ Amazon.
          </p>
          <Button size="lg" @click="handleImportFile" class="shadow-sm">
            <Upload class="w-5 h-5 mr-2" />
            Import file ASIN
          </Button>
        </div>

        <div
          v-else
          class="flex-1 h-full overflow-hidden flex flex-col bg-card rounded-t-xl shadow-sm mx-4 border-0 ring-1 ring-border/50 border-b-0"
        >
          <Table class="relative w-full" wrapperClass="flex-1 min-h-0">
            <TableHeader class="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <TableRow class="hover:bg-transparent">
                <TableHead class="w-[50px] text-center font-semibold">#</TableHead>
                <TableHead class="w-[110px] font-semibold">ASIN</TableHead>
                <TableHead class="w-[280px] min-w-[280px] font-semibold">Sản phẩm</TableHead>
                <TableHead class="w-[100px] text-right font-semibold">Giá gốc</TableHead>
                <TableHead class="w-[80px] text-center font-semibold">Ảnh</TableHead>
                <TableHead class="w-[80px] text-center font-semibold">Biến thể</TableHead>
                <TableHead class="w-[120px] text-center font-semibold">Trạng thái</TableHead>
                <TableHead class="min-w-[200px] font-semibold">Tiến trình</TableHead>
                <TableHead class="w-full"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="(row, index) in rowData"
                :key="row.id"
                class="hover:bg-muted/50 transition-colors"
                :class="{
                  'bg-green-50 dark:bg-green-950/20': row.status === 'DONE',
                  'bg-red-50 dark:bg-red-950/20': row.status === 'ERROR'
                }"
              >
                <!-- # -->
                <TableCell class="text-center font-medium text-muted-foreground text-sm">{{
                  index + 1
                }}</TableCell>

                <!-- ASIN -->
                <TableCell>
                  <a
                    v-if="row.amazonUrl || row.asin"
                    :href="row.amazonUrl || `https://www.amazon.com/dp/${row.asin}`"
                    target="_blank"
                    class="inline-flex items-center text-xs font-mono font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                    @click.stop
                  >
                    {{ row.asin }}
                    <ExternalLink class="w-3 h-3 ml-1 opacity-50" />
                  </a>
                </TableCell>

                <!-- Product -->
                <TableCell>
                  <div class="flex items-start gap-2 max-w-[260px] whitespace-normal">
                    <div
                      class="w-8 h-8 rounded border bg-muted/50 flex-shrink-0 overflow-hidden mt-0.5 flex items-center justify-center"
                    >
                      <img
                        v-if="row.images && row.images.length > 0"
                        :src="row.images[0]"
                        class="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <ImageIcon v-else class="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div class="flex flex-col min-w-0 flex-1 whitespace-normal">
                      <span
                        v-if="row.brand"
                        class="text-[9px] font-bold uppercase tracking-wider text-muted-foreground"
                        >{{ row.brand }}</span
                      >
                      <span
                        class="text-xs font-medium text-foreground line-clamp-2 leading-tight"
                        :title="row.title"
                        >{{ row.title || '—' }}</span
                      >
                      <div v-if="row.rating" class="flex items-center gap-1 mt-0.5">
                        <Star class="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span class="text-[11px] text-muted-foreground"
                          >{{ row.rating }} ({{ formatNumber(row.reviewCount) }})</span
                        >
                      </div>
                    </div>
                  </div>
                </TableCell>

                <!-- Original Price -->
                <TableCell class="text-right">
                  <span v-if="row.originalPrice" class="font-semibold text-sm"
                    >${{ row.originalPrice }}</span
                  >
                  <span v-else class="text-muted-foreground text-sm">—</span>
                </TableCell>

                <!-- Image -->
                <TableCell class="text-center">
                  <Badge v-if="row.images?.length" variant="outline" class="text-xs tabular-nums">
                    {{ row.images.length }}
                  </Badge>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>

                <!-- Variations -->
                <TableCell class="text-center">
                  <Badge
                    v-if="row.variations?.length"
                    variant="secondary"
                    class="text-xs tabular-nums"
                  >
                    {{ row.variations.length }}
                  </Badge>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>

                <!-- Status -->
                <TableCell class="text-center">
                  <Badge
                    :variant="
                      row.status === 'DONE'
                        ? 'default'
                        : row.status === 'ERROR'
                          ? 'destructive'
                          : 'secondary'
                    "
                    :class="[
                      'font-medium text-xs',
                      row.status === 'DONE' ? 'bg-green-600 hover:bg-green-700 text-white' : '',
                      row.status === 'CRAWLING'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse border-blue-200'
                        : ''
                    ]"
                  >
                    <Loader2 v-if="row.status === 'CRAWLING'" class="w-3 h-3 mr-1 animate-spin" />
                    <CheckCircle2 v-else-if="row.status === 'DONE'" class="w-3 h-3 mr-1" />
                    <AlertCircle v-else-if="row.status === 'ERROR'" class="w-3 h-3 mr-1" />
                    <Clock v-else class="w-3 h-3 mr-1" />
                    {{ getStatusText(row.status) }}
                  </Badge>
                </TableCell>

                <!-- Progress -->
                <TableCell>
                  <div
                    class="text-[11px] text-muted-foreground font-mono truncate max-w-[250px]"
                    :title="row.log"
                  >
                    {{ row.log }}
                  </div>
                </TableCell>
                <!-- Actions -->
                <TableCell class="text-center pr-3">
                  <button
                    @click.stop="deleteRow(row)"
                    :disabled="row.status === 'CRAWLING'"
                    :title="
                      row.status === 'CRAWLING'
                        ? 'Đang crawl, chờ hoàn tất mới xóa được'
                        : 'Xóa sản phẩm này'
                    "
                    class="inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors"
                    :class="
                      row.status === 'CRAWLING'
                        ? 'text-muted-foreground/30 cursor-not-allowed'
                        : 'text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30'
                    "
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar">
      <span
        >Tổng: <b>{{ stats.total }}</b></span
      >
      <span class="sep">|</span>
      <span class="s-ok"
        >Thành công: <b>{{ stats.done }}</b></span
      >
      <span class="sep">|</span>
      <span class="s-warn"
        >Chờ: <b>{{ stats.pending }}</b></span
      >
      <span class="sep">|</span>
      <span class="s-err"
        >Lỗi: <b>{{ stats.error }}</b></span
      >
      <span v-if="isCrawling" class="sep">|</span>
      <span v-if="isCrawling" class="s-warn pulse flex items-center"
        ><Loader2 class="w-4 h-4 mr-1 animate-spin" /> Đang crawl
        {{ stats.crawling }} luồng...</span
      >
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as xlsx from 'xlsx'
import { toast } from 'vue-sonner'

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  Play,
  Pause,
  Square,
  Search,
  Trash2,
  FolderOpen,
  ArrowRight,
  ExternalLink,
  Settings,
  Download,
  X,
  ListOrdered,
  Upload,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Star,
  Image as ImageIcon,
  Sparkles,
  Cloud
} from 'lucide-vue-next'

const props = defineProps({
  settings: { type: Object, required: true }
})
const emit = defineEmits(['stats-update'])

import { globalRowData as rowData, activeSessionId } from '../store'

const isCrawling = ref(false)
let stopRequested = false

// Helpers
const getStatusText = (status) => {
  const map = { PENDING: 'Chờ lệnh', CRAWLING: 'Đang crawl', DONE: 'Hoàn tất', ERROR: 'Lỗi' }
  return map[status] || status
}

const formatNumber = (n) => {
  if (!n) return '0'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

// ─── Stats (single-pass — was 4× .filter()) ─────────────────────────────
const stats = computed(() => {
  const counts = { total: 0, done: 0, error: 0, crawling: 0, pending: 0 }
  for (const r of rowData.value) {
    counts.total++
    if (r.status === 'DONE') counts.done++
    else if (r.status === 'ERROR') counts.error++
    else if (r.status === 'CRAWLING') counts.crawling++
    else if (r.status === 'PENDING') counts.pending++
  }
  return counts
})

watch(stats, (s) => emit('stats-update', s))

const hasPendingRows = computed(() =>
  rowData.value.some((r) => r.status === 'PENDING' || r.status === 'ERROR')
)
const hasDoneRows = computed(() => rowData.value.some((r) => r.status === 'DONE'))

// ─── AI Gen ──────────────────────────────────────────────────────────────
const isAiGenerating = ref(false)
const aiGenProgress = ref('✨ AI Gen')

const isAiResultOk = (result) =>
  result?.ok === true || result?.success === true || !!result?.title || !!result?.description

const handleAiGen = async () => {
  const doneRows = rowData.value.filter((r) => r.status === 'DONE')
  if (doneRows.length === 0) return

  isAiGenerating.value = true
  aiGenProgress.value = `0/${doneRows.length}`

  // Listen for progress
  const unsub = window.api.ai.onProgress(({ asin, message, total, current }) => {
    aiGenProgress.value = `${current}/${total}`
  })

  try {
    // Always send ORIGINAL content to AI (not previously gen'd)
    const products = JSON.parse(
      JSON.stringify(
        doneRows.map((r) => ({
          asin: r.asin,
          title: r._originalTitle || r.title,
          bulletPoints: r.bulletPoints || [],
          description: r._originalDescription || r.description || '',
          specs: r.specs || {}
        }))
      )
    )

    const res = await window.api.ai.batchGenerate(products)
    if (res.ok) {
      // Apply results to store
      for (const result of res.data) {
        const row = rowData.value.find((r) => r.asin === result.asin)
        if (row && isAiResultOk(result)) {
          // Save originals for re-gen
          if (!row._originalTitle) row._originalTitle = row.title
          if (!row._originalDescription)
            row._originalDescription = row.description || row.descriptionHtml || ''
          if (result.title) row.title = result.title
          if (result.description) {
            row.descriptionHtml = result.description
            row.description = result.description
          }
          row._aiGenerated = true
        }
      }
      const successCount = res.data.filter(isAiResultOk).length
      const failed = res.data.filter((r) => !isAiResultOk(r))
      if (failed.length > 0) {
        const firstError = failed[0]?.error ? `\n${failed[0].error}` : ''
        alert(`Lỗi AI Gen ${failed.length}/${doneRows.length} sản phẩm${firstError}`)
      } else {
        alert(`✨ AI Gen hoàn tất: ${successCount}/${doneRows.length} sản phẩm`)
      }
    } else {
      alert('Lỗi AI Gen: ' + res.error)
    }
  } catch (e) {
    alert('Lỗi AI Gen: ' + e.message)
  } finally {
    isAiGenerating.value = false
    aiGenProgress.value = 'AI Gen'
    unsub()
  }
}

// ─── CDN Upload (Manual mode) ────────────────────────────────────────────
const isCdnUploading = ref(false)
const cdnUploadProgress = ref('Upload CDN')

const handleCdnUpload = async () => {
  const doneRows = rowData.value.filter((r) => r.status === 'DONE' && r.images?.length > 0)
  if (doneRows.length === 0) return

  isCdnUploading.value = true
  let processed = 0

  try {
    for (const row of doneRows) {
      cdnUploadProgress.value = `${++processed}/${doneRows.length}`
      const res = await window.api.r2.uploadImages({
        images: JSON.parse(JSON.stringify(row.images)),
        asin: row.asin
      })
      if (res.ok) {
        row.images = res.data
        row._cdnUploaded = true
      }
    }
    alert(`CDN upload hoàn tất: ${processed}/${doneRows.length} sản phẩm`)
  } catch (e) {
    alert('Lỗi CDN upload: ' + e.message)
  } finally {
    isCdnUploading.value = false
    cdnUploadProgress.value = 'Upload CDN'
  }
}

const progressPct = computed(() => {
  if (stats.value.total === 0) return 0
  return Math.round(((stats.value.done + stats.value.error) / stats.value.total) * 100)
})

// ─── Import ───────────────────────────────────────────────────────────────
const extractAsin = (val) => {
  if (!val) return null
  const str = String(val).trim()
  if (/^[A-Z0-9]{10}$/.test(str)) return str
  const match = str.match(/\/dp\/([A-Z0-9]{10})/i)
  if (match) return match[1].toUpperCase()
  return null
}

const handleImportFile = async () => {
  try {
    const filePath = await window.api.dialog.openFile()
    if (!filePath) return
    const fileContent = await window.api.file.read(filePath)
    const workbook = xlsx.read(fileContent, { type: 'buffer' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (jsonData.length < 2) return alert('File cần ít nhất 1 dòng tiêu đề + 1 dòng dữ liệu.')

    const header = (jsonData[0] || []).map((h) =>
      String(h ?? '')
        .toUpperCase()
        .trim()
    )
    let colIdx = header.findIndex((h) => ['ASIN', 'ID', 'ITEM', 'SKU'].includes(h))
    if (colIdx === -1)
      colIdx = header.findIndex(
        (h) => h && (h.includes('URL') || h.includes('AMAZON') || h.includes('LINK'))
      )
    if (colIdx === -1) colIdx = 1

    const newRows = []
    let skipped = 0
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      if (!row || !Array.isArray(row)) {
        skipped++
        continue
      }

      let asin = null
      let amazonUrl = ''
      for (let c = 0; c < row.length; c++) {
        const cellAsin = extractAsin(row[c])
        if (cellAsin) {
          asin = cellAsin
          const cellStr = String(row[c] || '')
          if (cellStr.includes('amazon.com')) amazonUrl = cellStr.trim()
          break
        }
      }

      if (!asin) {
        skipped++
        continue
      }
      if (rowData.value.some((r) => r.asin === asin)) {
        skipped++
        continue
      }

      newRows.push({
        id: `${Date.now()}_${i}`,
        asin,
        amazonUrl,
        status: 'PENDING',
        log: 'Chờ lệnh...',
        title: '',
        brand: '',
        originalPrice: '',
        sellPrice: '',
        images: [],
        variations: [],
        rating: 0,
        reviewCount: 0
      })
    }

    if (newRows.length === 0) {
      return alert(
        `Không tìm được ASIN hợp lệ nào.\nKiểm tra file có cột ASIN hoặc Amazon URL không.\n(Bỏ qua: ${skipped} dòng)`
      )
    }

    rowData.value = [...rowData.value, ...newRows]
    if (skipped > 0)
      alert(`Import thành công ${newRows.length} ASIN. Bỏ qua ${skipped} dòng không hợp lệ/trùng.`)
  } catch (err) {
    console.error(err)
    alert('Lỗi import: ' + err.message)
  }
}

// ─── Crawl ────────────────────────────────────────────────────────────────
const startCrawl = async () => {
  isCrawling.value = true
  stopRequested = false
  const pending = rowData.value.filter((r) => r.status === 'PENDING' || r.status === 'ERROR')
  const queue = [...pending]
  const threads = props.settings.crawlThreads || 3

  const worker = async () => {
    while (queue.length > 0 && !stopRequested) {
      const item = queue.shift()
      await crawlItem(item)
    }
  }

  const workers = Array.from({ length: Math.min(threads, queue.length) }, () => worker())
  await Promise.all(workers)
  isCrawling.value = false

  // Auto-save crawled products to history
  const doneProducts = rowData.value.filter((r) => r.status === 'DONE')
  if (doneProducts.length > 0) {
    try {
      const result = await window.api.history.saveCurrent(JSON.parse(JSON.stringify(doneProducts)))
      if (result?.ok) {
        activeSessionId.value = result.sessionId
        toast.success('Đã lưu lịch sử', {
          description: `${doneProducts.length} sản phẩm đã được lưu vào lịch sử crawl.`,
          duration: 3000
        })
      }
    } catch (e) {
      console.error('[Queue] Auto-save history failed:', e)
    }
  }
}

const stopCrawl = () => {
  stopRequested = true
  isCrawling.value = false
}

const crawlItem = async (row) => {
  updateRow({ id: row.id, status: 'CRAWLING', log: 'Khởi động trình duyệt...' })
  try {
    const response = await window.api.crawl.asin(row.asin, row.amazonUrl || '')
    if (response.ok) {
      const p = response.data
      const mul = props.settings.priceMultiplier || 1.5
      const doneRow = {
        ...row,
        title: p.title,
        originalPrice: p.priceConfigured,
        sellPrice: (p.priceConfigured * mul).toFixed(2),
        brand: p.brand,
        images: p.images || [],
        variations: (p.variations || []).map((v) => ({
          ...v,
          price: v.price ? Number((v.price * mul).toFixed(2)) : undefined
        })),
        specs: p.specs || {},
        importantInfo: p.importantInfo || {},
        bulletPoints: p.bulletPoints || [],
        description: p.description || '',
        descriptionHtml: p.descriptionHtml || '',
        descriptionImages: p.descriptionImages || [],
        categories: p.categories || [],
        bsr: p.bsr || '',
        inStock: p.inStock,
        availability: p.availability || '',
        priceRange: p.priceRange || '',
        status: 'DONE',
        log: `✓ Hoàn tất — ${(p.images || []).length} ảnh, ${(p.variations || []).length} biến thể`
      }
      updateRow(doneRow)
      // Auto-select eBay category sau khi crawl xong (fire & forget)
      autoSelectCategory(doneRow)
    } else {
      throw new Error(response.error)
    }
  } catch (err) {
    updateRow({ id: row.id, status: 'ERROR', log: err.message || 'Lỗi crawler' })
  }
}

// Tự động gợi ý và chọn category đầu tiên sau khi crawl DONE
const autoSelectCategory = async (doneRow) => {
  if (!doneRow.title?.trim()) return

  // Skip auto-category for rows with no meaningful crawl data
  // (no images + no price = likely a failed/empty crawl that somehow passed)
  const hasNoImages = !doneRow.images || doneRow.images.length === 0
  const hasNoPrice = !doneRow.originalPrice || doneRow.originalPrice <= 0
  if (hasNoImages && hasNoPrice) {
    console.warn(
      '[AutoCategory] Skipping — no images and no price, data likely invalid:',
      doneRow.asin
    )
    return
  }

  try {
    // Use full title — same query as DetailPanel.autoSelectCategory
    // eBay API handles full titles well; offline SQLite fallback is only for API failure
    const query = (doneRow.title || '').substring(0, 150).trim()
    if (!query || query.length < 3) {
      console.warn('[AutoCategory] Skipping — title too short:', query, doneRow.asin)
      return
    }
    const res = await window.api.ebay.categorySuggestions(query)
    if (res.ok && res.data?.length > 0) {
      const cat = res.data[0]
      const current = rowData.value.find((r) => r.id === doneRow.id)
      if (current && !current.ebayCategory) {
        updateRow({
          id: doneRow.id,
          ebayCategory: cat.categoryId,
          ebayCategoryName: cat.categoryName,
          log: `✓ Hoàn tất — ${cat.categoryName} (ID: ${cat.categoryId})`
        })
      }
    }
  } catch (err) {
    console.warn('[AutoCategory]', doneRow.asin, err.message)
  }
}

// Trích xuất keyword từ title để search offline SQLite
// Offline DB chỉ match theo categoryName → cần dùng noun phổ thông, KHÔNG dùng brand
// Ví dụ: "REACH Ultraclean Flosser Refill..." → "Flosser Refill" (bỏ brand REACH)
const buildCategoryQuery = (row) => {
  // Reject known non-product titles early
  const titleLower = (row.title || '').toLowerCase().trim()
  const NON_PRODUCT_PATTERNS = [
    'amazon.com',
    'amazon',
    'page not found',
    'robot check',
    'something went wrong',
    'sign in',
    'error',
    '404'
  ]
  if (!titleLower || NON_PRODUCT_PATTERNS.includes(titleLower)) {
    console.warn('[buildCategoryQuery] Rejected non-product title:', row.title)
    return ''
  }

  // Ưu tiên 1: Amazon breadcrumb — thử từng term từ cuối (specific nhất) lên
  // categories = ['Health', 'Oral Care', 'Dental Floss'] → thử 'Dental Floss', rồi 'Oral Care', rồi 'Health'
  // Tránh ghép multi-term AND "Oral Care Dental Floss" gây AND-miss → OR noise
  if (row.categories?.length > 0) {
    const reversed = [...row.categories].reverse()
    for (const cat of reversed) {
      const term = cat.trim()
      if (term.length > 3) return term // dùng single term cụ thể nhất còn lại
    }
  }

  // Ưu tiên 2: Lấy noun chính từ title, BỎ brand (brand hiếm khi có trong categoryName eBay)
  const stopWords = new Set([
    'for',
    'with',
    'and',
    'the',
    'a',
    'an',
    'of',
    'in',
    'to',
    'by',
    'set',
    'pack',
    'pcs',
    'piece',
    'pieces',
    'lot',
    'new',
    'best',
    'top',
    'pro',
    'max',
    'plus',
    'mini',
    'ultra',
    'ultraclean',
    'inch',
    'mm',
    'cm',
    'ft',
    'oz',
    'lb',
    'kg',
    'x',
    'vs',
    'black',
    'white',
    'gray',
    'grey',
    'blue',
    'red',
    'green',
    'silver',
    'gold',
    'free',
    'resistant',
    'remover',
    'shred',
    'hard',
    'areas',
    'adults',
    'kids',
    'count',
    'care',
    'oral',
    'mint',
    'plaque',
    'refill',
    'heads',
    'access'
  ])

  const brand = (row.brand || '').toLowerCase()
  const brandWords = new Set(brand.split(/\s+/).filter(Boolean))

  const title = row.title || ''
  const words = title
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length > 2 &&
        !/^\d+$/.test(w) &&
        !stopWords.has(w.toLowerCase()) &&
        !brandWords.has(w.toLowerCase()) // bỏ brand words
    )

  // Lấy 2-3 noun đầu tiên còn lại (thường là loại sản phẩm)
  const query = words.slice(0, 3).join(' ')
  return query.substring(0, 80) || title.substring(0, 80)
}

const updateRow = (updates) => {
  const existing = rowData.value.find((r) => r.id === updates.id)
  if (existing) {
    Object.assign(existing, updates)
  }
}

const deleteRow = (row) => {
  if (row.status === 'CRAWLING') return
  if (!confirm(`Xóa sản phẩm "${row.title || row.asin}"?`)) return
  rowData.value = rowData.value.filter((r) => r.id !== row.id)
}

// ─── Lifecycle ───────────────────────────────────────────────────────────
let unsubProgress = null
onMounted(() => {
  unsubProgress = window.api.crawl.onProgress(({ asin, message }) => {
    const row = rowData.value.find((r) => r.asin === asin)
    if (row && row.status === 'CRAWLING') {
      row.log = message // mutate directly — avoids spread + full object replace
    }
  })
})
onUnmounted(() => {
  if (unsubProgress) unsubProgress()
})
</script>

<style scoped>
.workspace-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.workspace-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

/* Table wrap fix */
.table-container {
  width: 100%;
  overflow: auto;
}

.table-container :deep(th) {
  white-space: nowrap;
}

.table-container :deep(td) {
  white-space: nowrap;
}
</style>
