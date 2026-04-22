<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <span class="page-title">
        Workspace
        <span v-if="selectedCategory">· {{ selectedCategory.name }}</span>
      </span>

      <!-- Category Selector -->
      <div class="category-selector flex items-center">
        <!-- Show selected category -->
        <div v-if="selectedCategory" class="cat-selected flex items-center bg-secondary text-secondary-foreground rounded-md px-3 py-1.5" @click="openCategorySearch">
          <span class="cat-path text-sm font-medium">{{ selectedCategory.path || selectedCategory.name }}</span>
          <span class="cat-id ml-2 text-xs text-muted-foreground">#{{ selectedCategory.categoryId }}</span>
          <Button variant="ghost" size="icon" class="h-6 w-6 ml-2 rounded-full" @click.stop="clearCategory"><X class="w-4 h-4" /></Button>
        </div>
        <!-- Search trigger -->
        <Button v-else variant="outline" size="sm" @click="openCategorySearch">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Chọn eBay Category...
        </Button>
      </div>

      <div class="header-actions flex gap-2">
        <Button variant="outline" size="sm" @click="handleImportFile">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          Import
        </Button>
        <Button variant="outline" size="sm" @click="handleExport" :disabled="rowData.length === 0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
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
      <div class="grid-area" :class="{ 'with-panel': selectedRow }">
        <!-- Empty state -->
        <div v-if="rowData.length === 0" class="empty-state">
          <div class="empty-icon text-muted-foreground"><FolderOpen class="w-12 h-12 mx-auto" /></div>
          <h3>Chưa có sản phẩm</h3>
          <p>Import file Excel/CSV chứa cột ASIN để bắt đầu crawl dữ liệu từ Amazon.</p>
          <Button class="mt-4" @click="handleImportFile">
            Import file
          </Button>
        </div>

        <div v-else class="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[45px] text-center">#</TableHead>
                <TableHead class="w-[100px]">Link Amazon</TableHead>
                <TableHead class="w-[280px]">Sản phẩm</TableHead>
                <TableHead class="w-[120px]">Trạng thái</TableHead>
                <TableHead class="w-[100px] text-right">Giá eBay</TableHead>
                <TableHead class="w-[100px] text-right">Lợi nhuận</TableHead>
                <TableHead class="w-[85px] text-center">Biến thể</TableHead>
                <TableHead class="min-w-[160px]">Log</TableHead>
                <TableHead v-for="col in dynamicCols" :key="col.field" :class="col.headerClass">
                  {{ col.headerName }}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="(row, index) in rowData"
                :key="row.id"
                @click="onRowClick(row)"
                :class="{ 'bg-muted/50': selectedRow?.id === row.id }"
                class="cursor-pointer"
              >
                <TableCell class="text-center text-muted-foreground">{{ index + 1 }}</TableCell>
                <TableCell>
                  <a
                    v-if="row.amazonUrl || row.asin"
                    :href="row.amazonUrl || `https://www.amazon.com/dp/${row.asin}`"
                    target="_blank"
                    class="text-blue-500 hover:underline flex items-center"
                    @click.stop
                  >
                    <Link2 class="w-4 h-4 mr-1" /> Mở link
                  </a>
                </TableCell>
                <TableCell>
                  <div class="flex flex-col">
                    <span v-if="row.brand" class="text-xs font-semibold text-muted-foreground">{{ row.brand }}</span>
                    <span class="font-medium truncate max-w-[260px]" :title="row.title">{{ row.title || '...' }}</span>
                    <span class="text-xs text-muted-foreground mt-1">ASIN: {{ row.asin }}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge :variant="row.status === 'DONE' ? 'default' : row.status === 'ERROR' ? 'destructive' : 'secondary'">
                    {{ getStatusText(row.status) }}
                  </Badge>
                </TableCell>
                <TableCell class="text-right font-medium">
                  <span v-if="row.sellPrice">${{ row.sellPrice }}</span>
                </TableCell>
                <TableCell class="text-right">
                  <span v-html="renderProfit(row)"></span>
                </TableCell>
                <TableCell class="text-center">
                  <Badge variant="outline" v-if="row.variations?.length">{{ row.variations.length }} SKUs</Badge>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>
                <TableCell class="text-xs text-muted-foreground">{{ row.log }}</TableCell>
                <TableCell v-for="col in dynamicCols" :key="col.field">
                  <Select
                    v-if="col.isSelect"
                    v-model="row.specs[col.aspectName]"
                  >
                    <SelectTrigger @click.stop class="h-8 w-[140px]">
                      <SelectValue placeholder="Chọn..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="val in col.values" :key="val" :value="val">{{ val || '--' }}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    v-else
                    type="text"
                    v-model="row.specs[col.aspectName]"
                    @click.stop
                    class="h-8 w-[140px]"
                  />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <!-- Detail Panel -->
      <transition name="panel">
        <div v-if="selectedRow" class="detail-panel">
          <DetailPanel
            :row="selectedRow"
            :settings="props.settings"
            @close="selectedRow = null"
            @update="onDetailUpdate"
          />
        </div>
      </transition>
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
      <span v-if="selectedCategory" class="sep">|</span>
      <span v-if="selectedCategory" style="color:var(--accent)" class="flex items-center"><Folder class="w-4 h-4 mr-1" /> {{ selectedCategory.name }}</span>
    </div>
  </div>

  <!-- Category Search Modal -->
  <div v-if="showCategoryModal" class="modal-overlay" @click.self="showCategoryModal = false">
    <div class="modal" style="width:520px">
      <div class="modal-header">
        <span class="modal-title flex items-center"><Search class="w-5 h-5 mr-2" /> Tìm eBay Category</span>
        <Button variant="ghost" size="icon" class="h-6 w-6" @click="showCategoryModal = false">
          <X class="w-5 h-5" />
        </Button>
      </div>
      <div class="modal-body" style="padding: 16px 20px">
        <!-- Search input -->
        <div class="cat-search-wrap flex items-center">
          <Search class="w-4 h-4 text-muted-foreground shrink-0 mr-2" />
          <Input
            ref="catSearchInput"
            class="flex-1 border-0 bg-transparent p-0 outline-none focus-visible:ring-0 shadow-none h-8 text-sm"
            placeholder="Nhập tên sản phẩm hoặc category (vd: Laptop, iPhone, Yoga Mat)..."
            v-model="catQuery"
            @input="onCatQueryInput"
          />
          <span v-if="catLoading" class="spinner" style="flex-shrink:0"></span>
        </div>

        <!-- API error / no credentials notice -->
        <div v-if="catApiError" class="cat-api-notice flex items-center text-yellow-600">
          <AlertTriangle class="w-4 h-4 mr-1 shrink-0" />
          <span>{{ catApiError }}</span>
          <span v-if="catApiError.includes('Client ID')">&nbsp;→ Vào <b>Settings</b> điền eBay credentials để dùng tính năng này.</span>
        </div>

        <!-- Results -->
        <div v-if="catResults.length > 0" class="cat-results">
          <div
            v-for="cat in catResults"
            :key="cat.categoryId"
            class="cat-result-item"
            @click="selectCategory(cat)"
          >
            <div class="cat-result-name">{{ cat.categoryName }}</div>
            <div class="cat-result-path">{{ cat.path }}</div>
            <span class="cat-result-id">#{{ cat.categoryId }}</span>
          </div>
        </div>

        <div v-else-if="!catLoading && catQuery.length > 2 && !catApiError" class="cat-no-results">
          Không tìm thấy kết quả cho "{{ catQuery }}"
        </div>

        <div v-if="!catQuery" class="cat-hint">
          Gõ ít nhất 3 ký tự để tìm. eBay sẽ trả về các category phù hợp nhất.
        </div>
      </div>
    </div>
  </div>

  <!-- Auto-suggest toast -->
  <div v-if="autoSuggestToast" class="auto-suggest-toast">
    <div class="toast-content flex items-center">
      <Lightbulb class="w-4 h-4 text-yellow-400 mr-2 shrink-0" />
      <span>Gợi ý category cho <b>{{ autoSuggestToast.asin }}</b>:</span>
      <div class="toast-cats">
        <Button
          v-for="cat in autoSuggestToast.suggestions"
          :key="cat.categoryId"
          variant="outline"
          size="sm"
          class="h-6 text-xs px-2"
          @click="applyAutoSuggest(cat)"
        >
          {{ cat.categoryName }}
        </Button>
      </div>
      <Button variant="ghost" size="icon" class="h-6 w-6 ml-2" @click="autoSuggestToast = null"><X class="w-4 h-4" /></Button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as xlsx from 'xlsx'
import DetailPanel from './DetailPanel.vue'

import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
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

// ─── State ────────────────────────────────────────────────────────────────────
const gridApi = ref(null)
const rowData = ref([])
const isCrawling = ref(false)
const selectedRow = ref(null)
const categoryAspects = ref([])
let stopRequested = false

// ─── Category Search (real eBay API) ─────────────────────────────────────────
const showCategoryModal = ref(false)
const catQuery = ref('')
const catResults = ref([])
const catLoading = ref(false)
const catApiError = ref('')
const catSearchInput = ref(null)
const selectedCategory = ref(null)
const autoSuggestToast = ref(null)

let catDebounceTimer = null

const openCategorySearch = async () => {
  showCategoryModal.value = true
  catQuery.value = ''
  catResults.value = []
  catApiError.value = ''
  await nextTick()
  catSearchInput.value?.focus()
}

const clearCategory = () => {
  selectedCategory.value = null
  categoryAspects.value = []
  rebuildColumns()
}

const onCatQueryInput = () => {
  clearTimeout(catDebounceTimer)
  catApiError.value = ''
  if (catQuery.value.length < 3) { catResults.value = []; return }
  catDebounceTimer = setTimeout(searchCategories, 400)
}

const searchCategories = async () => {
  catLoading.value = true
  try {
    const res = await window.api.ebay.categorySuggestions(catQuery.value)
    if (res.ok) {
      catResults.value = res.data
    } else {
      catApiError.value = res.error
    }
  } catch (e) {
    catApiError.value = e.message
  } finally {
    catLoading.value = false
  }
}

const selectCategory = async (cat) => {
  selectedCategory.value = cat
  showCategoryModal.value = false
  catQuery.value = ''
  catResults.value = []
  await loadCategoryAspects(cat.categoryId)
}

const loadCategoryAspects = async (categoryId) => {
  try {
    const res = await window.api.ebay.categoryAspects(categoryId)
    if (res.ok) {
      categoryAspects.value = res.data
      rebuildColumns()
    }
  } catch (e) {
    console.error('Aspects load failed:', e)
  }
}

const applyAutoSuggest = (cat) => {
  selectCategory(cat)
  autoSuggestToast.value = null
}

// Auto-suggest khi crawl xong 1 item và chưa chọn category
const triggerAutoSuggest = async (row) => {
  if (selectedCategory.value || !row.title) return
  try {
    const res = await window.api.ebay.categorySuggestions(row.title)
    if (res.ok && res.data.length > 0) {
      autoSuggestToast.value = { asin: row.asin, suggestions: res.data.slice(0, 3) }
      setTimeout(() => { autoSuggestToast.value = null }, 12000) // auto-hide sau 12s
    }
  } catch (_) {}
}

// ─── Table Config ────────────────────────────────────────────────────────
const dynamicCols = ref([])

const rebuildColumns = () => {
  dynamicCols.value = categoryAspects.value.map(aspect => {
    const name = aspect.name || aspect
    const field = `spec_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
    return {
      headerName: `${name}${aspect.required ? ' *' : ''}`,
      field,
      aspectName: name, // for v-model mapping
      isSelect: aspect.values && aspect.values.length > 0,
      values: aspect.values || [],
      headerClass: aspect.required ? 'dynamic-col-required' : 'dynamic-col-header'
    }
  })
}

// Helpers for template
const getStatusText = (status) => {
  const map = { PENDING: 'Chờ lệnh', CRAWLING: 'Đang crawl', DONE: 'Hoàn tất', ERROR: 'Lỗi' }
  return map[status] || status
}

const getBadgeClass = (status) => {
  const map = { PENDING: 'badge-warning', CRAWLING: 'badge-crawling', DONE: 'badge-done', ERROR: 'badge-error' }
  return map[status] || ''
}

const renderProfit = (row) => {
  const sell = Number(row.sellPrice) || 0
  const buy = Number(row.originalPrice) || 0
  if (!sell || !buy) return '<span style="color:var(--text-muted)">—</span>'
  const profit = sell - buy
  const color = profit > 0 ? '#22c55e' : profit < 0 ? '#ef4444' : 'var(--text-muted)'
  return `<span style="color:${color}; font-weight:500">$${profit.toFixed(2)}</span>`
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
  if (row.status === 'DONE') {
    selectedRow.value = { ...row }
  }
}

const onDetailUpdate = (updatedRow) => {
  const idx = rowData.value.findIndex(r => r.id === updatedRow.id)
  if (idx !== -1) {
    rowData.value[idx] = updatedRow
  }
  selectedRow.value = { ...updatedRow }
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

// ─── Export ───────────────────────────────────────────────────────────────
const handleExport = async () => {
  const exportPath = await window.api.dialog.saveFile({ defaultPath: 'ebay-upload-template.csv' })
  if (!exportPath) return

  const rows = []
  for (const r of rowData.value) {
    if (r.variations && r.variations.length > 0) {
      // Parent row
      rows.push(buildExportRow(r, 'Add', true))
      // Variation rows
      for (const v of r.variations) {
        rows.push({
          '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)': 'Add',
          '*Category': r.ebayCategory || selectedCategory.value?.categoryId || '',
          '*Title': r.title,
          '*ConditionID': props.settings.defaultCondition,
          '*Quantity': v.quantity || props.settings.defaultQuantity,
          '*Format': props.settings.defaultFormat,
          '*StartPrice': v.price || r.sellPrice,
          '*Duration': props.settings.defaultDuration,
          '*Location': 'United States',
          '*ReturnsAcceptedOption': 'ReturnsAccepted',
          'Brand': r.brand,
          '*Relationship': 'Variation',
          '*RelationshipDetails': Object.entries(v.attributes || {}).map(([k, v]) => `${k}=${v}`).join(';'),
          'PicURL': v.image || (r.images?.[0] || ''),
        })
      }
    } else {
      rows.push(buildExportRow(r, 'Add', false))
    }
  }

  const ws = xlsx.utils.json_to_sheet(rows)
  const csv = xlsx.utils.sheet_to_csv(ws)
  await window.api.file.write(exportPath, csv)
  alert('Export thành công!')
}

const buildExportRow = (r, action, hasVariation) => ({
  '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)': action,
  '*Category': r.ebayCategory || selectedCategory.value?.categoryId || '',
  '*Title': r.title,
  '*ConditionID': props.settings.defaultCondition,
  'PicURL': r.images?.join('|') || '',
  '*Quantity': hasVariation ? '' : props.settings.defaultQuantity,
  '*Format': props.settings.defaultFormat,
  '*StartPrice': r.sellPrice,
  '*Duration': props.settings.defaultDuration,
  '*Location': 'United States',
  '*ReturnsAcceptedOption': 'ReturnsAccepted',
  'Brand': r.brand,
  '*Relationship': hasVariation ? 'VariationsParent' : '',
  '*RelationshipDetails': '',
})

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
      // Auto-suggest category nếu chưa chọn
      triggerAutoSuggest(doneRow)
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

.grid-area.with-panel { flex: 0 0 calc(100% - 360px); }

.detail-panel {
  width: 360px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Category selector */
.category-selector { flex-shrink: 0; }

/* Panel transition */
.panel-enter-active, .panel-leave-active { transition: all 0.2s ease; }
.panel-enter-from, .panel-leave-to { width: 0; opacity: 0; transform: translateX(20px); }

:deep(.dynamic-col-header) {
  background: rgba(99, 102, 241, 0.08) !important;
  color: var(--accent) !important;
}

:deep(.dynamic-col-required) {
  background: rgba(99, 102, 241, 0.18) !important;
  color: var(--accent) !important;
  font-weight: 700 !important;
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
