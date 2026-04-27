<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <div class="page-title flex items-center font-bold text-[15px]">
        <FileSpreadsheet class="w-5 h-5 mr-2.5 flex-shrink-0" />
        Export Preview
      </div>

      <div class="header-actions flex gap-2 items-center">
        <Button variant="outline" size="sm" @click="refreshPreview">
          <RefreshCw class="w-4 h-4 mr-2" />
          Làm mới
        </Button>
        <Button size="sm" @click="handleExport" :disabled="previewRows.length === 0">
          <Download class="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>
    </div>

    <div class="flex-1 overflow-hidden flex flex-col mx-4 mt-4 mb-0 h-full">
      <!-- Empty state -->
      <div v-if="readyProducts.length === 0" class="flex-1 flex flex-col items-center justify-center text-center p-8 h-full min-h-[400px]">
        <div class="bg-muted/30 p-6 rounded-full mb-4">
          <FileSpreadsheet class="w-12 h-12 text-muted-foreground" />
        </div>
        <h3 class="text-xl font-semibold mb-2">Chưa có dữ liệu để preview</h3>
        <p class="text-muted-foreground text-sm">Hãy crawl sản phẩm và chọn eBay Category trước khi xem preview.</p>
      </div>

      <!-- Stats bar -->
      <div v-else class="flex gap-3 mb-3 flex-shrink-0">
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-md border border-blue-200 dark:border-blue-800">
          <Package class="w-3.5 h-3.5 text-blue-500" />
          <span class="text-xs font-medium text-blue-700 dark:text-blue-300">{{ readyProducts.length }} sản phẩm</span>
        </div>
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
          <Rows3 class="w-3.5 h-3.5 text-green-500" />
          <span class="text-xs font-medium text-green-700 dark:text-green-300">{{ previewRows.length }} dòng CSV</span>
        </div>
        <div class="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-950/30 rounded-md border border-purple-200 dark:border-purple-800">
          <Columns3 class="w-3.5 h-3.5 text-purple-500" />
          <span class="text-xs font-medium text-purple-700 dark:text-purple-300">{{ allColumns.length }} cột</span>
        </div>
        <div v-if="missingCount > 0" class="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800">
          <AlertTriangle class="w-3.5 h-3.5 text-red-500" />
          <span class="text-xs font-medium text-red-700 dark:text-red-300">{{ missingCount }} ô trống bắt buộc</span>
        </div>
      </div>

      <!-- Legend -->
      <div v-if="readyProducts.length > 0" class="flex gap-4 mb-2 flex-shrink-0 flex-wrap">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-sm bg-blue-100 border border-blue-300 inline-block"></span>
          <span class="text-[10px] text-muted-foreground">Parent</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-sm bg-slate-50 border border-slate-200 inline-block"></span>
          <span class="text-[10px] text-muted-foreground">Child / Variation</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300 inline-block"></span>
          <span class="text-[10px] text-muted-foreground">Single (không biến thể)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-sm bg-red-100 border border-red-300 inline-block"></span>
          <span class="text-[10px] text-muted-foreground">Thiếu bắt buộc</span>
        </div>
        <div class="legend-sep"></div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-sm bg-blue-50 border border-blue-400 inline-block"></span>
          <span class="text-[10px] text-muted-foreground">*C: Bắt buộc</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-sm bg-orange-50 border border-orange-300 inline-block"></span>
          <span class="text-[10px] text-muted-foreground">C: Nên có (Recommended)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-sm bg-purple-50 border border-purple-200 inline-block"></span>
          <span class="text-[10px] text-muted-foreground">C: Tùy chọn (Optional)</span>
        </div>
      </div>

      <!-- Preview Table -->
      <div v-if="readyProducts.length > 0" class="table-scroll-wrapper">
        <div class="table-inner">
          <table class="preview-table">
            <thead>
              <tr>
                <th class="row-num-col">#</th>
                <th class="row-type-col">Loại</th>
                <th
                  v-for="col in allColumns"
                  :key="col"
                  class="col-header"
                  :class="{
                    'required-col': isRequiredCol(col),
                    'recommended-col': isRecommendedCol(col),
                    'aspect-col': col.startsWith('C:') && !isRequiredCol(col) && !isRecommendedCol(col)
                  }"
                  :title="col + (isRecommendedCol(col) ? ' (Recommended)' : isRequiredCol(col) ? ' (Required)' : '')"
                >
                  <div class="col-header-content">
                    <span>{{ col }}</span>
                    <span v-if="isRequiredCol(col)" class="required-star">*</span>
                    <span v-else-if="isRecommendedCol(col)" class="recommended-star">~</span>
                  </div>
                </th>
                <th class="w-full border-0 bg-transparent"></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, idx) in previewRows"
                :key="idx"
                :class="getRowClass(row)"
              >
                <td class="row-num-col">{{ idx + 1 }}</td>
                <td class="row-type-col">
                  <Badge
                    :variant="row._rowType === 'parent' ? 'default' : row._rowType === 'child' ? 'outline' : 'secondary'"
                    :class="{
                      'bg-blue-600 text-white': row._rowType === 'parent',
                      'bg-amber-500 text-white': row._rowType === 'single'
                    }"
                    class="text-[10px]"
                  >
                    {{ row._rowType === 'parent' ? 'Parent' : row._rowType === 'child' ? 'Child' : 'Single' }}
                  </Badge>
                </td>
                <td
                  v-for="col in allColumns"
                  :key="col"
                  class="cell editable-cell whitespace-normal min-w-[150px] max-w-[350px]"
                  :class="{
                    'empty-required': isCellMissingRequired(row, col),
                    'empty-cell': !row[col],
                    'empty-ready': !isCellMissingRequired(row, col) && !row[col] && getCellUsage(row, col) !== 'OPTIONAL',
                    'cell-required': getCellUsage(row, col) === 'REQUIRED' && !isCellMissingRequired(row, col),
                    'cell-recommended': getCellUsage(row, col) === 'RECOMMENDED',
                    'cell-optional': getCellUsage(row, col) === 'OPTIONAL',
                  }"
                  :title="editingCell?.rowIdx === idx && editingCell?.col === col ? '' : (row[col] || '')"
                  @dblclick="startEdit(idx, col, row[col])"
                >
                  <template v-if="editingCell?.rowIdx === idx && editingCell?.col === col">
                    <input
                      class="cell-input"
                      v-model="editingValue"
                      @blur="commitEdit(idx, col)"
                      @keydown.enter="commitEdit(idx, col)"
                      @keydown.escape="cancelEdit"
                      ref="editInputRef"
                    />
                  </template>
                  <template v-else-if="col === '*Title'">
                    <div class="p-2">
                      <span class="cell-content-title text-xs" :title="row[col]">{{ row[col] }}</span>
                    </div>
                  </template>
                  <template v-else>
                    <span class="cell-content">{{ truncate(row[col], 40) }}</span>
                  </template>
                </td>
                <td class="border-0 bg-transparent"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import * as xlsx from 'xlsx'
import { globalRowData as rowData } from '../store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  FileSpreadsheet, Download, RefreshCw, AlertTriangle,
  Package, Rows3, Columns3
} from 'lucide-vue-next'

const props = defineProps({
  settings: { type: Object, required: true }
})

const previewRows = ref([])
const allColumns = ref([])

/**
 * Per-category aspect usage map:
 * { [categoryId]: { 'C:AspectName': 'REQUIRED'|'RECOMMENDED'|'OPTIONAL' } }
 */
const catAspectMeta = ref({})

/**
 * Strictest usage of a column across all loaded categories.
 * REQUIRED > RECOMMENDED > OPTIONAL
 */
const colHeaderUsage = computed(() => {
  const rank = { REQUIRED: 3, RECOMMENDED: 2, OPTIONAL: 1 }
  const result = {}
  for (const catMeta of Object.values(catAspectMeta.value)) {
    for (const [col, usage] of Object.entries(catMeta)) {
      if (!result[col] || rank[usage] > rank[result[col]]) {
        result[col] = usage
      }
    }
  }
  return result
})

// Header helpers
const isRequiredCol = (col) => {
  if (col.startsWith('*') && !col.startsWith('C:')) return true // standard fixed required
  return col.startsWith('C:') && colHeaderUsage.value[col] === 'REQUIRED'
}
const isRecommendedCol = (col) => {
  if (!col.startsWith('C:')) return false
  const usage = colHeaderUsage.value[col]
  return usage === 'RECOMMENDED'
}

/**
 * Per-row, per-cell usage lookup.
 * Returns 'REQUIRED'|'RECOMMENDED'|'OPTIONAL'|null
 */
const getCellUsage = (row, col) => {
  if (!col.startsWith('C:')) return null
  const catId = row._ebayCategory
  if (!catId || !catAspectMeta.value[catId]) return colHeaderUsage.value[col] || null
  return catAspectMeta.value[catId][col] || null
}

// ─── Inline Editing ───────────────────────────────────────────────────────────
const editingCell = ref(null) // { rowIdx, col }
const editingValue = ref('')
const editInputRef = ref(null)

const startEdit = async (rowIdx, col, currentValue) => {
  editingCell.value = { rowIdx, col }
  editingValue.value = currentValue || ''
  await nextTick()
  editInputRef.value?.focus?.()
  editInputRef.value?.select?.()
}

const commitEdit = (rowIdx, col) => {
  if (editingCell.value?.rowIdx === rowIdx && editingCell.value?.col === col) {
    previewRows.value[rowIdx][col] = editingValue.value
    editingCell.value = null
  }
}

const cancelEdit = () => {
  editingCell.value = null
}

// Required columns in eBay File Exchange
const REQUIRED_COLUMNS = [
  '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)',
  '*Category',
  '*Title',
  '*Description',
  '*ConditionID',
  '*Format',
  '*StartPrice',
  '*Duration',
  '*Location',
  '*ReturnsAcceptedOption'
]

const readyProducts = computed(() =>
  rowData.value.filter(r => r.status === 'DONE' && isRowReady(r))
)

// Columns intentionally blank on parent-variation rows
const PARENT_VARIATION_OPTIONAL = ['*StartPrice', '*Quantity']

// Columns intentionally blank on single (no-variation) rows
const SINGLE_OPTIONAL = ['*Relationship', '*RelationshipDetails']

const isCellMissingRequired = (row, col) => {
  // Standard fixed required columns
  if (col.startsWith('*') && !col.startsWith('C:')) {
    if (row._rowType === 'child') return false
    if (row._rowType === 'parent' && PARENT_VARIATION_OPTIONAL.includes(col)) return false
    if (row._rowType === 'single' && SINGLE_OPTIONAL.includes(col)) return false
    if (row._rowType === 'parent' && SINGLE_OPTIONAL.includes(col)) return false
    return !row[col]
  }
  // C: aspects — required only if THIS row's category marks it REQUIRED
  if (col.startsWith('C:')) {
    const usage = getCellUsage(row, col)
    if (usage !== 'REQUIRED') return false
    if (row._rowType === 'child') return false // aspect on parent only
    return !row[col]
  }
  return false
}

const missingCount = computed(() => {
  let count = 0
  for (const row of previewRows.value) {
    for (const col of allColumns.value) {
      if (isCellMissingRequired(row, col)) count++
    }
  }
  return count
})

const isRowReady = (row) =>
  !!row.ebayCategory && !!row.title && (row.sellPrice > 0 || row.variations?.length > 0)

const truncate = (str, len) => {
  if (!str) return ''
  const s = String(str)
  return s.length > len ? s.substring(0, len) + '…' : s
}

const getRowClass = (row) => ({
  'parent-row': row._rowType === 'parent',
  'child-row': row._rowType === 'child',
  'single-row': row._rowType === 'single',
})

// ─── Build preview data (same logic as Workspace export) ──────────────────────

const buildPreview = async () => {
  const rows = []
  // Per-category aspect meta: { [catId]: { 'C:Name': usage } }
  const newCatMeta = {}

  for (const r of readyProducts.value) {
    // Fetch aspect meta for this category (deduplicated)
    if (r.ebayCategory && !newCatMeta[r.ebayCategory]) {
      newCatMeta[r.ebayCategory] = {} // mark as loading (prevent duplicate fetch)
      try {
        const res = await window.api.ebay.categoryAspects(r.ebayCategory)
        if (res.ok) {
          const catMap = {}
          for (const asp of res.data) {
            catMap[`C:${asp.name}`] = asp.usage // REQUIRED | RECOMMENDED | OPTIONAL
          }
          newCatMeta[r.ebayCategory] = catMap
        }
      } catch (e) { /* ignore — catMeta stays empty {} for this cat */ }
    }
    const description = buildDescription(r)
    const aspectCols = buildAspectColumns(r)

    if (r.variations && r.variations.length > 0) {
      // Parent row
      const parentRelDetails = buildParentRelationshipDetails(r.variations)
      rows.push({
        _rowType: 'parent',
        _ebayCategory: r.ebayCategory || '',
        '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)': 'Add',
        '*Category': r.ebayCategory || '',
        '*Title': cleanTitle(r.title),
        '*Description': description,
        '*ConditionID': props.settings.defaultCondition || '1000',
        'PicURL': (r.images || []).slice(0, 12).join('|'),
        '*Quantity': '',
        '*Format': props.settings.defaultFormat || 'FixedPrice',
        '*StartPrice': '',
        '*Duration': props.settings.defaultDuration || 'GTC',
        '*Location': props.settings.defaultLocation || 'US WAREHOUSE',
        '*ReturnsAcceptedOption': 'ReturnsAccepted',
        'CustomLabel': r.asin,
        '*Relationship': '',
        '*RelationshipDetails': parentRelDetails,
        'ShippingProfileName': props.settings.shippingProfileName || '',
        'ReturnProfileName': props.settings.returnProfileName || '',
        'PaymentProfileName': props.settings.paymentProfileName || '',
        ...aspectCols,
      })

      // Child rows
      for (const v of r.variations) {
        const childRelDetails = Object.entries(v.attributes || {})
          .map(([k, val]) => `${k}=${val}`)
          .join('|')
        rows.push({
          _rowType: 'child',
          _ebayCategory: r.ebayCategory || '',
          '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)': '',
          '*Category': '',
          '*Title': '',
          '*Description': '',
          '*ConditionID': '',
          'PicURL': v.image || '',
          '*Quantity': v.quantity || props.settings.defaultQuantity || 10,
          '*Format': '',
          '*StartPrice': v.price || r.sellPrice,
          '*Duration': '',
          '*Location': '',
          '*ReturnsAcceptedOption': '',
          'CustomLabel': v.asin || '',
          '*Relationship': 'Variation',
          '*RelationshipDetails': childRelDetails,
          'ShippingProfileName': '',
          'ReturnProfileName': '',
          'PaymentProfileName': '',
        })
      }
    } else {
      // Single product
      rows.push({
        _rowType: 'single',
        _ebayCategory: r.ebayCategory || '',
        '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)': 'Add',
        '*Category': r.ebayCategory || '',
        '*Title': cleanTitle(r.title),
        '*Description': description,
        '*ConditionID': props.settings.defaultCondition || '1000',
        'PicURL': (r.images || []).slice(0, 12).join('|'),
        '*Quantity': props.settings.defaultQuantity || 10,
        '*Format': props.settings.defaultFormat || 'FixedPrice',
        '*StartPrice': r.sellPrice,
        '*Duration': props.settings.defaultDuration || 'GTC',
        '*Location': props.settings.defaultLocation || 'US WAREHOUSE',
        '*ReturnsAcceptedOption': 'ReturnsAccepted',
        'CustomLabel': r.asin,
        '*Relationship': '',
        '*RelationshipDetails': '',
        'ShippingProfileName': props.settings.shippingProfileName || '',
        'ReturnProfileName': props.settings.returnProfileName || '',
        'PaymentProfileName': props.settings.paymentProfileName || '',
        ...aspectCols,
      })
    }
  }

  catAspectMeta.value = newCatMeta

  // Collect all unique columns (exclude internal _ prefixed fields)
  const colSet = new Set()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!key.startsWith('_')) colSet.add(key)
    }
  }

  // Sort: std required → *C: required → C: recommended → C: optional → others
  // Use colHeaderUsage (computed from catAspectMeta) for sorting
  const sorted = [...colSet].sort((a, b) => {
    const rank = (c) => {
      if (c.startsWith('*') && !c.startsWith('C:')) return 0
      const u = colHeaderUsage.value[c]
      if (c.startsWith('C:') && u === 'REQUIRED') return 1
      if (c.startsWith('C:') && u === 'RECOMMENDED') return 2
      if (c.startsWith('C:')) return 3
      return 1.5
    }
    const diff = rank(a) - rank(b)
    if (diff !== 0) return diff
    return a.localeCompare(b)
  })

  allColumns.value = sorted
  previewRows.value = rows
}

const refreshPreview = () => buildPreview()

// ─── Build helpers (copied from Workspace.vue to keep 1:1 parity) ─────────────

const buildDescription = (row) => {
  const parts = []
  parts.push('<div style="max-width:800px;margin:0 auto;font-family:Arial,sans-serif">')

  if (row.bulletPoints?.length > 0) {
    parts.push('<h3 style="margin-bottom:8px">Product Features</h3>')
    parts.push('<ul style="padding-left:18px">')
    row.bulletPoints.forEach(bp => {
      parts.push(`<li style="margin-bottom:4px">${escapeHtml(bp)}</li>`)
    })
    parts.push('</ul>')
  }

  if (row.description) {
    parts.push(`<p style="margin-top:12px">${escapeHtml(row.description.substring(0, 2000))}</p>`)
  }

  if (row.specs && Object.keys(row.specs).length > 0) {
    parts.push('<h3 style="margin-top:16px;margin-bottom:8px">Specifications</h3>')
    parts.push('<table style="border-collapse:collapse;width:100%">')
    for (const [key, val] of Object.entries(row.specs)) {
      parts.push(`<tr><td style="border:1px solid #ddd;padding:6px 10px;font-weight:bold;width:35%">${escapeHtml(key)}</td>`)
      parts.push(`<td style="border:1px solid #ddd;padding:6px 10px">${escapeHtml(val)}</td></tr>`)
    }
    parts.push('</table>')
  }

  parts.push('</div>')
  return parts.join('')
}

const escapeHtml = (str) => {
  if (!str) return ''
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const buildAspectColumns = (row) => {
  const cols = {}
  if (row.aspectValues) {
    for (const [name, val] of Object.entries(row.aspectValues)) {
      if (val) cols[`C:${name}`] = val
    }
  }
  if (!cols['C:Brand'] && row.brand) {
    cols['C:Brand'] = row.brand
  }
  return cols
}

const buildParentRelationshipDetails = (variations) => {
  const dimValues = {}
  for (const v of variations) {
    for (const [key, val] of Object.entries(v.attributes || {})) {
      if (!dimValues[key]) dimValues[key] = new Set()
      if (val) dimValues[key].add(val)
    }
  }
  return Object.entries(dimValues)
    .map(([key, vals]) => `${key}=${[...vals].join(';')}`)
    .join('|')
}

/**
 * Clean title for eBay: strip problematic chars, limit to 80 chars
 */
const cleanTitle = (title) => {
  if (!title) return ''
  return title
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // strip emoji
    .replace(/[【】「」『』]/g, ' ')  // CJK brackets → space
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80)
}

// ─── Export (reuses preview data) ─────────────────────────────────────────────

const handleExport = async () => {
  const exportPath = await window.api.dialog.saveFile({ defaultPath: 'ebay-upload-template.csv' })
  if (!exportPath) return

  // Remove internal fields before export
  const exportRows = previewRows.value.map(r => {
    const clean = { ...r }
    delete clean._rowType
    delete clean._ebayCategory
    return clean
  })

  const ws = xlsx.utils.json_to_sheet(exportRows)
  const csv = xlsx.utils.sheet_to_csv(ws)
  // eBay requires UTF-8 BOM for correct Unicode parsing
  const csvWithBom = '\uFEFF' + csv
  await window.api.file.write(exportPath, csvWithBom)
  alert(`Export thành công! ${readyProducts.value.length} sản phẩm (${exportRows.length} dòng CSV).`)
}

// Auto-build on mount and when data changes
onMounted(buildPreview)
watch(readyProducts, buildPreview, { deep: true })
</script>

<style scoped>
/* ─── Scroll wrapper — scrollbar always at bottom ────────────────────────── */
.workspace-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.table-scroll-wrapper {
  flex: 1;
  overflow-x: scroll;
  overflow-y: auto;
  scrollbar-gutter: stable;
  background: hsl(var(--card));
  border-radius: 12px 12px 0 0;
  box-shadow: 0 0 0 1px hsl(var(--border) / 0.5), 0 1px 3px rgba(0,0,0,.05);
  display: flex;
  flex-direction: column;
}

.table-scroll-wrapper::-webkit-scrollbar {
  height: 10px;
  width: 8px;
}

.table-scroll-wrapper::-webkit-scrollbar-track {
  background: hsl(var(--muted));
  border-radius: 0 0 8px 8px;
}

.table-scroll-wrapper::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.35);
  border-radius: 5px;
}

.table-scroll-wrapper::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.6);
}

.table-inner {
  width: max-content;
  min-width: 100%;
}

.preview-table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  line-height: 1.3;
}

.legend-sep {
  width: 1px;
  height: 14px;
  background: var(--border);
  align-self: center;
}


.preview-table th {
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  padding: 6px 8px;
  font-weight: 600;
  white-space: nowrap;
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: hsl(var(--muted-foreground));
}

.preview-table td {
  border: 1px solid hsl(var(--border));
  padding: 0;
  white-space: nowrap;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
}

.editable-cell:hover {
  outline: 2px solid hsl(210 80% 60% / 0.4);
  outline-offset: -2px;
  cursor: text;
}

.editable-cell:hover::after {
  content: '✏';
  position: absolute;
  right: 3px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 8px;
  opacity: 0.4;
  pointer-events: none;
}

.cell-input {
  width: 100%;
  height: 100%;
  min-width: 120px;
  padding: 4px 8px;
  border: 2px solid hsl(210 80% 55%);
  border-radius: 0;
  outline: none;
  background: hsl(0 0% 100%);
  font-size: 11px;
  font-family: inherit;
  box-sizing: border-box;
}

.cell-content {
  display: block;
  padding: 4px 8px;
  max-width: 350px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-num-col {
  width: 35px;
  text-align: center;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.row-type-col {
  width: 60px;
  text-align: center;
}

.col-header-content {
  display: flex;
  align-items: center;
  gap: 2px;
}

.required-star {
  color: hsl(0 84% 60%);
  font-weight: bold;
}

.required-col {
  background: hsl(210 40% 96%);
}

.cell-required {
  background: hsl(210 80% 97%);
}

.cell-recommended {
  background: hsl(35 100% 97%);
}

.cell-optional {
  background: hsl(270 40% 98%);
}

.recommended-col {
  background: hsl(30 100% 96%);
}

.recommended-star {
  color: hsl(25 95% 55%);
  font-weight: bold;
  font-size: 10px;
}

.aspect-col {
  background: hsl(270 40% 96%);
}

/* Row types */
.parent-row {
  background: hsl(210 100% 97%);
}

.parent-row:hover {
  background: hsl(210 100% 94%);
}

.child-row {
  background: hsl(0 0% 99%);
}

.child-row:hover {
  background: hsl(0 0% 96%);
}

.child-row td:first-child {
  border-left: 3px solid hsl(210 40% 80%);
}

.single-row {
  background: hsl(45 100% 98%);
}

.single-row:hover {
  background: hsl(45 100% 95%);
}

/* Cell states */
.empty-cell {
  color: hsl(var(--muted-foreground));
}

.empty-required {
  background: hsl(0 80% 95%) !important;
  position: relative;
}

.empty-required::after {
  content: '—';
  color: hsl(0 70% 60%);
  font-weight: 600;
}

.aspect-cell {
  color: hsl(270 60% 40%);
  font-style: italic;
}

.cell-content-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
  line-height: 1.3;
  max-width: 300px;
}
</style>
