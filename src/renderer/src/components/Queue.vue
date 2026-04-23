<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <span class="page-title">
        Amazon Crawler
      </span>

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
    <div class="workspace-body">
      <div class="grid-area flex flex-col pt-4">
        <!-- Empty state -->
        <div v-if="rowData.length === 0" class="empty-state flex flex-col items-center justify-center h-full text-center">
          <div class="empty-icon bg-muted/30 p-6 rounded-full mb-4">
            <FolderOpen class="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 class="text-xl font-semibold mb-2">Chưa có sản phẩm</h3>
          <p class="text-muted-foreground mb-6 max-w-md">Import file Excel/CSV chứa cột ASIN để bắt đầu crawl dữ liệu từ Amazon.</p>
          <Button size="lg" @click="handleImportFile" class="shadow-sm">
            <Upload class="w-5 h-5 mr-2" />
            Import file ASIN
          </Button>
        </div>

        <div v-else class="flex-1 h-full overflow-auto bg-card rounded-lg border shadow-sm mx-4 mb-4">
          <Table class="relative w-full">
            <TableHeader class="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <TableRow class="hover:bg-transparent">
                <TableHead class="w-[50px] text-center font-semibold">#</TableHead>
                <TableHead class="w-[110px] font-semibold">ASIN</TableHead>
                <TableHead class="min-w-[250px] font-semibold">Sản phẩm</TableHead>
                <TableHead class="w-[100px] text-right font-semibold">Giá gốc</TableHead>
                <TableHead class="w-[80px] text-center font-semibold">Ảnh</TableHead>
                <TableHead class="w-[80px] text-center font-semibold">Biến thể</TableHead>
                <TableHead class="w-[120px] text-center font-semibold">Trạng thái</TableHead>
                <TableHead class="min-w-[200px] font-semibold">Tiến trình</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="(row, index) in rowData"
                :key="row.id"
                class="hover:bg-muted/50 transition-colors"
                :class="{ 'bg-green-50 dark:bg-green-950/20': row.status === 'DONE', 'bg-red-50 dark:bg-red-950/20': row.status === 'ERROR' }"
              >
                <!-- # -->
                <TableCell class="text-center font-medium text-muted-foreground text-sm">{{ index + 1 }}</TableCell>

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

                <!-- Sản phẩm -->
                <TableCell>
                  <div class="flex items-start gap-2.5 py-0.5">
                    <!-- Thumbnail -->
                    <div class="w-10 h-10 rounded border bg-muted/50 flex-shrink-0 overflow-hidden flex items-center justify-center">
                      <img
                        v-if="row.images && row.images.length > 0"
                        :src="row.images[0]"
                        class="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <ImageIcon v-else class="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div class="flex flex-col min-w-0">
                      <span v-if="row.brand" class="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{{ row.brand }}</span>
                      <span class="text-sm font-medium text-foreground line-clamp-2 leading-snug" :title="row.title">{{ row.title || '—' }}</span>
                      <div v-if="row.rating" class="flex items-center gap-1 mt-0.5">
                        <Star class="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span class="text-[11px] text-muted-foreground">{{ row.rating }} ({{ formatNumber(row.reviewCount) }})</span>
                      </div>
                    </div>
                  </div>
                </TableCell>

                <!-- Giá gốc -->
                <TableCell class="text-right">
                  <span v-if="row.originalPrice" class="font-semibold text-sm">${{ row.originalPrice }}</span>
                  <span v-else class="text-muted-foreground text-sm">—</span>
                </TableCell>

                <!-- Ảnh -->
                <TableCell class="text-center">
                  <Badge v-if="row.images?.length" variant="outline" class="text-xs tabular-nums">
                    {{ row.images.length }}
                  </Badge>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>

                <!-- Biến thể -->
                <TableCell class="text-center">
                  <Badge v-if="row.variations?.length" variant="secondary" class="text-xs tabular-nums">
                    {{ row.variations.length }}
                  </Badge>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>

                <!-- Trạng thái -->
                <TableCell class="text-center">
                  <Badge 
                    :variant="row.status === 'DONE' ? 'default' : row.status === 'ERROR' ? 'destructive' : 'secondary'"
                    :class="[
                      'font-medium text-xs',
                      row.status === 'DONE' ? 'bg-green-600 hover:bg-green-700 text-white' : '',
                      row.status === 'CRAWLING' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse border-blue-200' : ''
                    ]"
                  >
                    <Loader2 v-if="row.status === 'CRAWLING'" class="w-3 h-3 mr-1 animate-spin" />
                    <CheckCircle2 v-else-if="row.status === 'DONE'" class="w-3 h-3 mr-1" />
                    <AlertCircle v-else-if="row.status === 'ERROR'" class="w-3 h-3 mr-1" />
                    <Clock v-else class="w-3 h-3 mr-1" />
                    {{ getStatusText(row.status) }}
                  </Badge>
                </TableCell>

                <!-- Tiến trình -->
                <TableCell>
                  <div class="text-xs text-muted-foreground font-mono bg-muted/30 px-2.5 py-1.5 rounded border border-border/50 truncate" :title="row.log">
                    {{ row.log }}
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar">
      <span>Tổng: <b>{{ stats.total }}</b></span>
      <span class="sep">|</span>
      <span class="s-ok flex items-center"><CheckCircle2 class="w-4 h-4 mr-1 text-green-500" /> {{ stats.done }}</span>
      <span class="sep">|</span>
      <span class="s-warn flex items-center"><Clock class="w-4 h-4 mr-1 text-yellow-500" /> {{ stats.pending }}</span>
      <span class="sep">|</span>
      <span class="s-err flex items-center"><AlertCircle class="w-4 h-4 mr-1 text-red-500" /> {{ stats.error }}</span>
      <span v-if="isCrawling" class="sep">|</span>
      <span v-if="isCrawling" class="s-warn pulse flex items-center"><Loader2 class="w-4 h-4 mr-1 animate-spin" /> Đang crawl {{ stats.crawling }} luồng...</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import * as xlsx from 'xlsx'

import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  FolderOpen, Upload, Play, Square, ExternalLink, 
  CheckCircle2, AlertCircle, Clock, Loader2, Star,
  Image as ImageIcon,
} from 'lucide-vue-next'

const props = defineProps({
  settings: { type: Object, required: true }
})
const emit = defineEmits(['stats-update'])

import { globalRowData as rowData } from '../store'

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

// ─── Stats ────────────────────────────────────────────────────────────────
const stats = computed(() => {
  const total = rowData.value.length
  const done = rowData.value.filter(r => r.status === 'DONE').length
  const error = rowData.value.filter(r => r.status === 'ERROR').length
  const crawling = rowData.value.filter(r => r.status === 'CRAWLING').length
  const pending = rowData.value.filter(r => r.status === 'PENDING').length
  return { total, done, error, crawling, pending }
})

watch(stats, (s) => emit('stats-update', s))

const hasPendingRows = computed(() => rowData.value.some(r => r.status === 'PENDING' || r.status === 'ERROR'))

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

    const header = (jsonData[0] || []).map(h => String(h ?? '').toUpperCase().trim())
    let colIdx = header.findIndex(h => ['ASIN', 'ID', 'ITEM', 'SKU'].includes(h))
    if (colIdx === -1) colIdx = header.findIndex(h => h && (h.includes('URL') || h.includes('AMAZON') || h.includes('LINK')))
    if (colIdx === -1) colIdx = 1

    const newRows = []
    let skipped = 0
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      if (!row || !Array.isArray(row)) { skipped++; continue }

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

      if (!asin) { skipped++; continue }
      if (rowData.value.some(r => r.asin === asin)) { skipped++; continue }

      newRows.push({
        id: `${Date.now()}_${i}`,
        asin,
        amazonUrl,
        status: 'PENDING',
        log: 'Chờ lệnh...',
        title: '', brand: '', originalPrice: '', sellPrice: '',
        images: [], variations: [], rating: 0, reviewCount: 0,
      })
    }

    if (newRows.length === 0) {
      return alert(`Không tìm được ASIN hợp lệ nào.\nKiểm tra file có cột ASIN hoặc Amazon URL không.\n(Bỏ qua: ${skipped} dòng)`)
    }

    rowData.value = [...rowData.value, ...newRows]
    if (skipped > 0) alert(`Import thành công ${newRows.length} ASIN. Bỏ qua ${skipped} dòng không hợp lệ/trùng.`)
  } catch (err) {
    console.error(err)
    alert('Lỗi import: ' + err.message)
  }
}


// ─── Crawl ────────────────────────────────────────────────────────────────
const startCrawl = async () => {
  isCrawling.value = true
  stopRequested = false
  const pending = rowData.value.filter(r => r.status === 'PENDING' || r.status === 'ERROR')
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
}

const stopCrawl = () => {
  stopRequested = true
  isCrawling.value = false
}

const crawlItem = async (row) => {
  updateRow({ ...row, status: 'CRAWLING', log: 'Khởi động trình duyệt...' })
  try {
    const response = await window.api.crawl.asin(row.asin)
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
        variations: p.variations || [],
        specs: p.specs || {},
        rating: p.rating || 0,
        reviewCount: p.reviewCount || 0,
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
        log: `✓ Hoàn tất — ${(p.images || []).length} ảnh, ${(p.variations || []).length} biến thể`,
      }
      updateRow(doneRow)
    } else {
      throw new Error(response.error)
    }
  } catch (err) {
    updateRow({ ...row, status: 'ERROR', log: err.message || 'Lỗi crawler' })
  }
}

const updateRow = (row) => {
  const idx = rowData.value.findIndex(r => r.id === row.id)
  if (idx !== -1) {
    rowData.value[idx] = row
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────
let unsubProgress = null
onMounted(() => {
  unsubProgress = window.api.crawl.onProgress(({ asin, message }) => {
    const row = rowData.value.find(r => r.asin === asin)
    if (row && row.status === 'CRAWLING') {
      updateRow({ ...row, log: message })
    }
  })
})
onUnmounted(() => { if (unsubProgress) unsubProgress() })
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

.grid-area {
  flex: 1;
  padding: 0;
  overflow: hidden;
  min-width: 0;
}
</style>
