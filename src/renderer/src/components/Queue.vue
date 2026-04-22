<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <span class="page-title">
        Tiến trình Crawl
      </span>



      <div class="header-actions flex gap-2">
        <Button variant="outline" size="sm" @click="handleImportFile">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Import
        </Button>

        <Button v-if="!isCrawling" size="sm" :disabled="!hasPendingRows" @click="startCrawl">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Start Crawl
        </Button>
        <Button v-else variant="destructive" size="sm" @click="stopCrawl">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><rect x="3" y="3" width="18" height="18"/></svg>
          Stop
        </Button>
      </div>
    </div>

    <!-- Progress bar -->
    <div class="progress-wrap" v-if="isCrawling">
      <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
    </div>

    <!-- Content: Grid + Detail Panel -->
    <div class="workspace-body">
      <!-- Custom Table -->
      <div class="grid-area flex flex-col pt-4">
        <!-- Empty state -->
        <div v-if="rowData.length === 0" class="empty-state flex flex-col items-center justify-center h-full text-center">
          <div class="empty-icon bg-muted/30 p-6 rounded-full mb-4">
            <FolderOpen class="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 class="text-xl font-semibold mb-2">Chưa có sản phẩm</h3>
          <p class="text-muted-foreground mb-6 max-w-md">Import file Excel/CSV chứa cột ASIN để bắt đầu crawl dữ liệu từ Amazon.</p>
          <Button size="lg" @click="handleImportFile" class="shadow-sm">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Import file ASIN
          </Button>
        </div>

        <div v-else class="flex-1 h-full overflow-auto bg-card rounded-lg border shadow-sm mx-4 mb-4">
          <Table class="relative w-full">
            <TableHeader class="sticky top-0 bg-secondary/90 backdrop-blur z-10 shadow-sm">
              <TableRow class="hover:bg-transparent">
                <TableHead class="w-[60px] text-center font-bold">#</TableHead>
                <TableHead class="w-[140px] font-bold">Link Amazon</TableHead>
                <TableHead class="font-bold">Sản phẩm</TableHead>
                <TableHead class="w-[140px] font-bold">Trạng thái</TableHead>
                <TableHead class="min-w-[200px] font-bold">Log</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="(row, index) in rowData"
                :key="row.id"
                class="hover:bg-muted/50 transition-colors"
              >
                <TableCell class="text-center font-medium text-muted-foreground">{{ index + 1 }}</TableCell>
                <TableCell>
                  <a
                    v-if="row.amazonUrl || row.asin"
                    :href="row.amazonUrl || `https://www.amazon.com/dp/${row.asin}`"
                    target="_blank"
                    class="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline"
                    @click.stop
                  >
                    <Link2 class="w-4 h-4 mr-1.5" /> Mở link
                  </a>
                </TableCell>
                <TableCell>
                  <div class="flex flex-col py-1">
                    <span v-if="row.brand" class="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{{ row.brand }}</span>
                    <span class="font-medium text-foreground line-clamp-2 leading-tight" :title="row.title">{{ row.title || '...' }}</span>
                    <span class="text-xs text-muted-foreground mt-1.5 font-mono bg-muted/50 w-fit px-1.5 py-0.5 rounded">ASIN: {{ row.asin }}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge 
                    :variant="row.status === 'DONE' ? 'default' : row.status === 'ERROR' ? 'destructive' : 'secondary'"
                    :class="[
                      'font-medium tracking-wide',
                      row.status === 'DONE' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200' : '',
                      row.status === 'CRAWLING' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse' : ''
                    ]"
                  >
                    <span v-if="row.status === 'CRAWLING'" class="mr-1.5 inline-block w-2 h-2 bg-blue-600 rounded-full animate-bounce"></span>
                    {{ getStatusText(row.status) }}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div class="text-sm text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-md border border-border/50 font-mono text-xs">
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
      <span class="s-warn flex items-center"><Hourglass class="w-4 h-4 mr-1 text-yellow-500" /> {{ stats.pending }}</span>
      <span class="sep">|</span>
      <span class="s-err flex items-center"><XCircle class="w-4 h-4 mr-1 text-red-500" /> {{ stats.error }}</span>
      <span v-if="isCrawling" class="sep">|</span>
      <span v-if="isCrawling" class="s-warn pulse flex items-center"><Bot class="w-4 h-4 mr-1" /> Đang crawl {{ stats.crawling }} luồng...</span>
    </div>
  </div>


</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as xlsx from 'xlsx'

import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  FolderOpen, Link2, CheckCircle2, Hourglass, 
  XCircle, Bot, Folder, Search, AlertTriangle, Lightbulb, X 
} from 'lucide-vue-next'

const props = defineProps({
  settings: { type: Object, required: true }
})
const emit = defineEmits(['stats-update'])

import { globalRowData as rowData } from '../store'

const gridApi = ref(null)
const isCrawling = ref(false)
let stopRequested = false

// Helpers for template
const getStatusText = (status) => {
  const map = { PENDING: 'Chờ lệnh', CRAWLING: 'Đang crawl', DONE: 'Hoàn tất', ERROR: 'Lỗi' }
  return map[status] || status
}

const getBadgeClass = (status) => {
  const map = { PENDING: 'badge-warning', CRAWLING: 'badge-crawling', DONE: 'badge-done', ERROR: 'badge-error' }
  return map[status] || ''
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

const onRowClick = (row) => {
  // Do nothing in Queue
}

// ─── Import ───────────────────────────────────────────────────────────────
/**
 * Extract ASIN từ Amazon URL hoặc ASIN trực tiếp
 * VD: https://www.amazon.com/.../dp/B00N5XRYTE/... → B00N5XRYTE
 */
const extractAsin = (val) => {
  if (!val) return null
  const str = String(val).trim()
  // Đã là ASIN thuần (10 ký tự alphanumeric bắt đầu bằng B hoặc số)
  if (/^[A-Z0-9]{10}$/.test(str)) return str
  // Extract từ Amazon URL: /dp/XXXXXXXXXX/
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

    // Parse header — ép về string để tránh undefined
    const header = (jsonData[0] || []).map(h => String(h ?? '').toUpperCase().trim())

    // Ưu tiên cột ASIN > cột URL > fallback cột 0
    let colIdx = header.findIndex(h => ['ASIN', 'ID', 'ITEM', 'SKU'].includes(h))
    if (colIdx === -1) colIdx = header.findIndex(h => h && (h.includes('URL') || h.includes('AMAZON') || h.includes('LINK')))
    if (colIdx === -1) colIdx = 1  // fallback cột 1 (file hay có STT ở cột 0)

    const newRows = []
    let skipped = 0
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i]
      if (!row || !Array.isArray(row)) { skipped++; continue }

      let asin = null
      let amazonUrl = ''
      // Thử cột ưu tiên trước, rồi scan toàn row
      for (let c = 0; c < row.length; c++) {
        const cellAsin = extractAsin(row[c])
        if (cellAsin) {
          asin = cellAsin
          // Lưu URL gốc nếu cell chứa URL
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
        images: [], variations: []
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
  updateRow({ ...row, status: 'CRAWLING', log: 'Khởi động Playwright...' })
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
        status: 'DONE',
        log: '✓ Hoàn tất',
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



/* Custom Table Styles */
.custom-table-container {
  width: 100%;
  height: 100%;
  overflow: auto;
  background: var(--bg-primary);
  border-radius: 6px;
  border: 1px solid var(--border);
}

.custom-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  text-align: left;
}

.custom-table th {
  position: sticky;
  top: 0;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  z-index: 10;
  white-space: nowrap;
}

.custom-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}

.custom-table tbody tr {
  background: var(--bg-primary);
  transition: background 0.15s;
  cursor: pointer;
}
.custom-table tbody tr:nth-child(even) {
  background: rgba(255,255,255,0.015);
}
.custom-table tbody tr:hover {
  background: var(--bg-hover);
}
.custom-table tbody tr.row-selected {
  background: var(--accent-dim);
}

.table-input, .table-select {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-primary);
  padding: 4px 6px;
  font-size: 13px;
  border-radius: 4px;
}
.table-input:hover, .table-select:hover {
  border-color: var(--border);
}
.table-input:focus, .table-select:focus {
  outline: none;
  border-color: var(--accent);
  background: rgba(0,0,0,0.2);
}

</style>

<style scoped>
/* ─── Category selected chip ─────────────────────────────────────────────── */
.cat-selected {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px;
  background: var(--accent-dim);
  border: 1px solid rgba(99,102,241,0.3);
  border-radius: 7px; cursor: pointer; transition: background 0.12s;
  max-width: 320px;
}
.cat-selected:hover { background: rgba(99,102,241,0.2); }
.cat-path { font-size: 12px; color: var(--accent); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.cat-id { font-size: 10px; color: var(--text-muted); flex-shrink: 0; }
.cat-clear { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 12px; padding: 0 2px; }
.cat-clear:hover { color: #ef4444; }
.cat-search-btn { gap: 6px; }

/* ─── Category search modal ─────────────────────────────────────────────── */
.cat-search-wrap {
  display: flex; align-items: center; gap: 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px; padding: 8px 12px; margin-bottom: 12px;
}
.cat-search-wrap:focus-within { border-color: var(--accent); }
.cat-results { display: flex; flex-direction: column; gap: 2px; max-height: 340px; overflow-y: auto; }
.cat-result-item { padding: 10px 12px; border-radius: 7px; cursor: pointer; border: 1px solid transparent; transition: all 0.1s; }
.cat-result-item:hover { background: var(--bg-hover); border-color: var(--border); }
.cat-result-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.cat-result-path { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.cat-result-id { font-size: 10px; color: var(--accent); margin-top: 3px; display: block; }
.cat-hint, .cat-no-results { font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px; }
.cat-api-notice {
  background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2);
  border-radius: 7px; padding: 10px 12px; font-size: 12px; color: #f59e0b;
  margin-bottom: 10px; line-height: 1.5;
}

/* ─── Auto-suggest toast ─────────────────────────────────────────────────── */
.auto-suggest-toast {
  position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%);
  z-index: 500; animation: slideUp 0.2s ease;
}
@keyframes slideUp { from { opacity: 0; transform: translateX(-50%) translateY(12px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
.toast-content {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; padding: 12px 16px;
  display: flex; align-items: center; gap: 10px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.5);
  font-size: 12px; color: var(--text-secondary); white-space: nowrap;
}
.toast-cats { display: flex; gap: 6px; }
.toast-cat-btn { font-size: 11px; }
.toast-close { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 14px; margin-left: 4px; }
.toast-close:hover { color: var(--text-primary); }
</style>
