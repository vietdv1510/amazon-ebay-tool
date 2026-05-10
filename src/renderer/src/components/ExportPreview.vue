<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <div class="page-title flex items-center font-bold text-[15px]">
        <FileSpreadsheet class="w-5 h-5 mr-2.5 flex-shrink-0" />
        Export Preview
      </div>

      <div class="header-actions flex gap-2 items-center">
          <!-- AI Gen button -->
          <Button
            v-if="settings.useGemini"
            variant="outline" size="sm"
            @click="handleAiGen"
            :disabled="readyProducts.length === 0 || isAiGenerating"
          >
            {{ isAiGenerating ? aiGenProgress : 'Tạo mô tả bằng AI' }}
          </Button>

          <Button size="sm" variant="destructive" @click="handleExport(true)" :disabled="previewRows.length === 0" title="Ép xuất không cần kiểm tra lỗi">
            Export thô (Bỏ qua lỗi)
          </Button>
          <Button size="sm" @click="handleExport(false)" :disabled="previewRows.length === 0">
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
        <div v-if="errorCount > 0" class="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-800">
          <AlertTriangle class="w-3.5 h-3.5 text-red-500" />
          <span class="text-xs font-medium text-red-700 dark:text-red-300">{{ errorCount }} ô có lỗi dữ liệu</span>
        </div>
      </div>

      <!-- Legend -->
      <div v-if="readyProducts.length > 0" class="legend-card">
        <div class="legend-group">
          <span class="legend-group-label">Ý nghĩa cột & Ô</span>
          <div class="legend-items">
            <div class="legend-chip chip-req">
              <span class="col-usage-badge badge-required" style="margin-left: 0;">Req</span>
              <span>Bắt buộc</span>
            </div>
            <div class="legend-chip chip-cond">
              <span class="col-usage-badge badge-conditional" style="margin-left: 0;">Cond</span>
              <span>Theo loại dòng</span>
            </div>
            <div class="legend-chip chip-rec">
              <span class="col-usage-badge badge-recommended" style="margin-left: 0;">Rec</span>
              <span>Nên có</span>
            </div>
            <div class="legend-chip chip-opt">
              <span class="col-usage-badge badge-optional" style="margin-left: 0;">Opt</span>
              <span>Không bắt buộc</span>
            </div>
            <div class="legend-chip chip-mix">
              <span class="col-usage-badge badge-mixed" style="margin-left: 0;">Mix</span>
              <span>Khác theo danh mục</span>
            </div>
          </div>
        </div>
        <div class="legend-divider"></div>
        <div class="legend-group">
          <span class="legend-group-label">Loại dòng</span>
          <div class="legend-items">
            <div class="legend-chip chip-parent">
              <span class="chip-dot dot-parent"></span>
              Parent
            </div>
            <div class="legend-chip chip-child">
              <span class="chip-dot dot-child"></span>
              Child / Variation
            </div>
            <div class="legend-chip chip-single">
              <span class="chip-dot dot-single"></span>
              Single
            </div>
          </div>
        </div>
      </div>

      <!-- Preview Table Skeleton -->
      <div v-if="isPreviewLoading" class="flex-1 flex flex-col gap-4 mx-4 mt-2 h-full overflow-hidden">
        <div class="flex items-center gap-4 border-b border-border/50 pb-3">
          <Skeleton class="h-8 w-[60px] rounded" />
          <Skeleton class="h-8 w-[100px] rounded" />
          <Skeleton class="h-8 w-[150px] rounded" />
          <Skeleton class="h-8 flex-1 rounded" />
        </div>
        <div class="space-y-3 mt-2">
          <Skeleton v-for="i in 10" :key="i" class="h-10 w-full rounded" />
        </div>
      </div>

      <!-- Preview Table -->
      <div v-else-if="readyProducts.length > 0" class="table-scroll-wrapper">
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
                    'aspect-col': isAspectCol(col) && !isRequiredCol(col) && !isRecommendedCol(col),
                    'action-col': col.startsWith('*Action')
                  }"
                  :title="getColTooltip(col)"
                >
                  <div class="col-header-content">
                    <span>{{ col }}</span>
                    <span v-if="isMixedUsageCol(col)" class="col-usage-badge badge-mixed">Mix</span>
                    <span v-else-if="isConditionalRequiredCol(col)" class="col-usage-badge badge-conditional">Cond</span>
                    <span v-else-if="isRequiredCol(col)" class="col-usage-badge badge-required">Req</span>
                    <span v-else-if="isRecommendedCol(col)" class="col-usage-badge badge-recommended">Rec</span>
                    <span v-else-if="isOptionalCol(col)" class="col-usage-badge badge-optional">Opt</span>
                  </div>
                </th>
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
                    'empty-required': isCellMissingRequired(row, col) && !validationErrors[`${idx}-${col}`],
                    'empty-cell': isValEmpty(row[col]),
                    'error-cell': !!validationErrors[`${idx}-${col}`],
                    'action-col': col.startsWith('*Action')
                  }"
                  :title="editingCell?.rowIdx === idx && editingCell?.col === col ? '' : (row[col] || '')"
                  @dblclick="startEdit(idx, col, row[col])"
                >
                  <template v-if="editingCell?.rowIdx === idx && editingCell?.col === col">
                    <div class="cell-editor-popup">
                      <div class="cell-editor-actions">
                        <button @mousedown.prevent="commitEdit(idx, col)" class="editor-btn btn-save" title="Lưu (Ctrl+Enter)">
                          <Check class="w-3 h-3" />
                        </button>
                        <button @mousedown.prevent="cancelEdit" class="editor-btn btn-cancel" title="Hủy (Esc)">
                          <X class="w-3 h-3" />
                        </button>
                      </div>
                      <textarea
                        class="cell-textarea"
                        v-model="editingValue"
                        @blur="commitEdit(idx, col)"
                        @keydown.enter.ctrl="commitEdit(idx, col)"
                        @keydown.enter.meta="commitEdit(idx, col)"
                        @keydown.escape="cancelEdit"
                        ref="editInputRef"
                        placeholder="Nhập nội dung..."
                      ></textarea>
                    </div>
                  </template>
                  <template v-else-if="col === '*Title'">
                    <div class="p-2 w-full h-full flex flex-col justify-center">
                      <span v-if="validationErrors[`${idx}-${col}`]" class="text-[10px] font-bold text-red-600 mb-1 leading-tight">{{ validationErrors[`${idx}-${col}`] }}</span>
                      <span v-if="isValEmpty(row[col]) && isCellMissingRequired(row, col) && !validationErrors[`${idx}-${col}`]" class="empty-placeholder">Bắt buộc</span>
                      <span v-else class="cell-content-title text-xs" :title="row[col]">{{ row[col] }}</span>
                    </div>
                  </template>
                  <template v-else>
                    <div class="cell-value-wrap w-full h-full flex flex-col justify-center">
                      <span v-if="validationErrors[`${idx}-${col}`]" class="text-[10px] font-bold text-red-600 mb-1 leading-tight">{{ validationErrors[`${idx}-${col}`] }}</span>
                      <span v-if="isValEmpty(row[col]) && isCellMissingRequired(row, col) && !validationErrors[`${idx}-${col}`]" class="empty-placeholder">Bắt buộc</span>
                      <span v-else class="cell-content">{{ truncate(row[col], 40) }}</span>
                      <span v-if="showCellUsageBadge(row, col)" class="cell-usage-tag" :class="'tag-' + getCellUsage(row, col)?.toLowerCase()">
                        {{ getCellUsageLabel(row, col) }}
                      </span>
                    </div>
                  </template>
                </td>
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

import { toast } from 'vue-sonner'
import { globalRowData as rowData } from '../store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FileSpreadsheet, Download, RefreshCw, AlertTriangle,
  Package, Rows3, Columns3, Check, X, Sparkles
} from 'lucide-vue-next'

const props = defineProps({
  settings: { type: Object, required: true }
})

const previewRows = ref([])
const allColumns = ref([])

// ─── AI Gen ──────────────────────────────────────────────────────────────
const isAiGenerating = ref(false)
const aiGenProgress = ref('✨ AI Gen')

const isAiResultOk = (result) =>
  result?.ok === true || result?.success === true || !!result?.title || !!result?.description

const getTableScrollState = () => {
  const el = document.querySelector('.table-scroll-wrapper')
  return {
    el,
    top: el?.scrollTop || 0,
    left: el?.scrollLeft || 0
  }
}

const restoreTableScrollState = async (state) => {
  await nextTick()
  requestAnimationFrame(() => {
    const el = document.querySelector('.table-scroll-wrapper') || state.el
    if (!el) return
    el.scrollTop = state.top
    el.scrollLeft = state.left
  })
}

const handleAiGen = async () => {
  if (readyProducts.value.length === 0) return

  isAiGenerating.value = true
  aiGenProgress.value = `0/${readyProducts.value.length}`

  const unsub = window.api.ai.onProgress(({ asin, message, total, current }) => {
    aiGenProgress.value = `${current}/${total}`
  })

  try {
    const products = JSON.parse(JSON.stringify(readyProducts.value.map(r => ({
      asin: r.asin,
      title: r._originalTitle || r.title,
      bulletPoints: r.bulletPoints || [],
      description: r._originalDescription || r.description || '',
      specs: r.specs || {}
    }))))

    const res = await window.api.ai.batchGenerate(products)

    // Save table scroll before preview rows rebuild after AI updates.
    const scrollState = getTableScrollState()

    if (res.ok) {
      // Apply results to globalRowData (shared store)
      for (const result of res.data) {
        const row = rowData.value.find(r => r.asin === result.asin)
        if (row && isAiResultOk(result)) {
          // Save originals for re-gen
          if (!row._originalTitle) row._originalTitle = row.title
          if (!row._originalDescription) row._originalDescription = row.description || row.descriptionHtml || ''
          if (result.title) row.title = result.title
          if (result.description) {
            row.descriptionHtml = result.description
            row.description = result.description
          }
          row._aiGenerated = true
        }
      }

      await restoreTableScrollState(scrollState)

      const successCount = res.data.filter(isAiResultOk).length
      const failed = res.data.filter(r => !isAiResultOk(r))
      if (failed.length > 0) {
        const firstError = failed[0]?.error ? `: ${failed[0].error}` : ''
        toast.error(`AI Gen lỗi ${failed.length}/${readyProducts.value.length} sản phẩm${firstError}`)
      } else {
        toast.success(`AI Gen hoàn tất: ${successCount}/${readyProducts.value.length} sản phẩm`)
      }
    } else {
      toast.error('Lỗi AI Gen: ' + res.error)
    }
  } catch (e) {
    toast.error('Lỗi AI Gen: ' + e.message)
  } finally {
    isAiGenerating.value = false
    aiGenProgress.value = 'AI Gen'
    unsub()
  }
}

const validationErrors = computed(() => {
  const errors = {}
  previewRows.value.forEach((row, idx) => {
    // 1. Check title length (max 80 for eBay)
    if (row['*Title'] && row['*Title'].length > 80) {
      errors[`${idx}-*Title`] = `*Title quá dài (${row['*Title'].length}/80)`
    }
    // 2. Check business policies on parent/single rows
    if (row._rowType === 'parent' || row._rowType === 'single') {
      if (isValEmpty(row['ShippingProfileName'])) {
        errors[`${idx}-ShippingProfileName`] = 'Thiếu Shipping Policy'
      }
      if (isValEmpty(row['ReturnProfileName'])) {
        errors[`${idx}-ReturnProfileName`] = 'Thiếu Return Policy'
      }
      if (isValEmpty(row['PaymentProfileName'])) {
        errors[`${idx}-PaymentProfileName`] = 'Thiếu Payment Policy'
      }
    }
  })
  return errors
})

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

const isAspectCol = (col) => col.startsWith('C:') || col.startsWith('*C:')
const aspectMetaKey = (col) => col.replace(/^\*C:/, 'C:')  // normalize *C:Brand → C:Brand for lookups
const aspectNameFromCol = (col) => col.replace(/^\*?C:/, '')
const getAspectHeader = (aspectName, usage) => usage === 'REQUIRED' ? `*C:${aspectName}` : `C:${aspectName}`

// Header helpers
const isRequiredCol = (col) => {
  if (!isAspectCol(col)) return getColumnRequiredState(col) === 'REQUIRED'
  return colHeaderUsage.value[aspectMetaKey(col)] === 'REQUIRED'
}
const isConditionalRequiredCol = (col) => {
  if (!isAspectCol(col)) return getColumnRequiredState(col) === 'CONDITIONAL'
  return false
}
const isRecommendedCol = (col) => {
  if (!isAspectCol(col)) return false
  const usage = colHeaderUsage.value[aspectMetaKey(col)]
  return usage === 'RECOMMENDED'
}
const isOptionalCol = (col) =>
  !isMixedUsageCol(col) &&
  !isConditionalRequiredCol(col) &&
  !isRequiredCol(col) &&
  !isRecommendedCol(col)

/**
 * Does this column have DIFFERENT usage levels across categories?
 * e.g. Required in Cat A but Optional in Cat B
 */
const isMixedUsageCol = (col) => {
  if (!isAspectCol(col)) return false
  const key = aspectMetaKey(col)
  const usages = new Set()
  for (const catMeta of Object.values(catAspectMeta.value)) {
    usages.add(catMeta[key] || 'OPTIONAL')
  }
  return usages.size > 1
}

/**
 * Is this specific cell's usage different from the header's strictest usage?
 */
const isCellMixedUsage = (row, col) => {
  if (!isAspectCol(col) || row._rowType === 'child') return false
  const cellUsage = getCellUsage(row, col)
  const headerUsage = colHeaderUsage.value[aspectMetaKey(col)]
  return cellUsage && headerUsage && cellUsage !== headerUsage
}

/**
 * Show per-cell usage badge when column has mixed usage across categories
 */
const showCellUsageBadge = (row, col) => {
  if (!isAspectCol(col) || row._rowType === 'child') return false
  return isMixedUsageCol(col)
}

/**
 * Build tooltip showing per-category usage breakdown
 */
const getColTooltip = (col) => {
  if (!isAspectCol(col)) {
    const state = getColumnRequiredState(col)
    if (state === 'REQUIRED') return `${col} (REQUIRED)`
    if (state === 'CONDITIONAL') return `${col} (CONDITIONAL)`
    return `${col} (OPTIONAL)`
  }
  const parts = [col]
  const key = aspectMetaKey(col)
  const categories = Object.entries(catAspectMeta.value)
  if (categories.length <= 1) {
    const usage = colHeaderUsage.value[key]
    if (usage) parts.push(`(${usage})`)
    return parts.join(' ')
  }
  // Multi-category: show breakdown
  if (isMixedUsageCol(col)) parts.push('(MIXED)')
  for (const [catId, meta] of categories) {
    parts.push(`\n• Cat ${catId}: ${meta[key] || 'OPTIONAL'}`)
  }
  return parts.join('')
}

/**
 * Per-row, per-cell usage lookup.
 * Returns 'REQUIRED'|'RECOMMENDED'|'OPTIONAL'|null
 */
const getCellUsage = (row, col) => {
  if (!isAspectCol(col)) return null
  const catId = row._ebayCategory
  const key = aspectMetaKey(col)
  if (!catId || !catAspectMeta.value[catId]) return colHeaderUsage.value[key] || 'OPTIONAL'
  return catAspectMeta.value[catId][key] || 'OPTIONAL'
}

const getCellUsageLabel = (row, col) => {
  const usage = getCellUsage(row, col)
  if (usage === 'REQUIRED') return 'Req'
  if (usage === 'RECOMMENDED') return 'Rec'
  if (usage === 'OPTIONAL') return 'Opt'
  return ''
}

const isStandardCellRequired = (row, col) => {
  if (isAspectCol(col)) return false
  const requiredCols = ROW_REQUIRED_COLUMNS[row._rowType] || []
  return requiredCols.includes(col)
}

const getColumnRequiredState = (col) => {
  if (isAspectCol(col)) return 'OPTIONAL'
  const relevantRows = previewRows.value.filter((row) => col in row)
  if (relevantRows.length === 0) return 'OPTIONAL'

  const requiredCount = relevantRows.filter((row) => isStandardCellRequired(row, col)).length
  if (requiredCount === 0) return 'OPTIONAL'
  if (requiredCount === relevantRows.length) return 'REQUIRED'
  return 'CONDITIONAL'
}

// ─── Inline Editing ───────────────────────────────────────────────────────────
const editingCell = ref(null) // { rowIdx, col }
const editingValue = ref('')
const editInputRef = ref(null)

const startEdit = async (rowIdx, col, currentValue) => {
  // If editing another cell, commit it first
  if (editingCell.value && (editingCell.value.rowIdx !== rowIdx || editingCell.value.col !== col)) {
    commitEdit(editingCell.value.rowIdx, editingCell.value.col)
  }

  editingCell.value = { rowIdx, col }
  editingValue.value = currentValue || ''
  await nextTick()
  const el = (Array.isArray(editInputRef.value) ? editInputRef.value[0] : editInputRef.value) || document.querySelector('.cell-textarea')
  if (el) {
    el.focus()
    el.select()
  }
}

const commitEdit = (rowIdx, col) => {
  if (editingCell.value?.rowIdx === rowIdx && editingCell.value?.col === col) {
    let val = editingValue.value
    if (val !== undefined && val !== null) {
      previewRows.value[rowIdx][col] = String(val).trim()
    }
    editingCell.value = null
  }
}

const cancelEdit = () => {
  editingCell.value = null
}

// Required columns in eBay File Exchange for item/listing rows.
const ACTION_HEADER = '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)'
const ALWAYS_REQUIRED_COLUMNS = [
  ACTION_HEADER,
  '*Category',
  '*Title',
  '*Description',
  '*ConditionID',
  '*Format',
  '*Duration',
  '*Location',
  '*DispatchTimeMax',
]

const ROW_REQUIRED_COLUMNS = {
  parent: [...ALWAYS_REQUIRED_COLUMNS, 'RelationshipDetails'],
  child: ['Relationship', 'RelationshipDetails', '*Quantity', '*StartPrice', 'CustomLabel'],
  single: [...ALWAYS_REQUIRED_COLUMNS, '*StartPrice', '*Quantity']
}

const readyProducts = computed(() =>
  rowData.value.filter(r => r.status === 'DONE' && isRowReady(r))
)

const isValEmpty = (val) => val == null || String(val).trim() === ''

const isCellMissingRequired = (row, col) => {
  const empty = isValEmpty(row[col])
  // Standard fixed required columns (includes *, Relationship*, CustomLabel, etc.)
  const requiredCols = ROW_REQUIRED_COLUMNS[row._rowType] || []
  if (requiredCols.includes(col)) {
    return empty
  }
  // C: aspects — required only if THIS row's category marks it REQUIRED
  if (isAspectCol(col)) {
    const usage = getCellUsage(row, col)
    if (usage !== 'REQUIRED') return false
    if (row._rowType === 'child') return false // aspect on parent only
    return empty
  }
  return false
}

const errorCount = computed(() => {
  let count = 0
  for (const [idx, row] of previewRows.value.entries()) {
    for (const col of allColumns.value) {
      if (isCellMissingRequired(row, col)) {
        count++
      } else if (validationErrors.value[`${idx}-${col}`]) {
        count++
      }
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

const isPreviewLoading = ref(false)

// ─── Build preview data (same logic as Workspace export) ──────────────────────

const buildPreview = async () => {
  isPreviewLoading.value = true
  try {
    const rows = []
    // Per-category aspect meta: { [catId]: { 'C:Name': usage } }
    const newCatMeta = {}
    // Per-category aspect valid values: { [catId]: { aspectName: string[] } }
    const catAspectValues = {}
    const categoryIds = [...new Set(readyProducts.value.map((r) => r.ebayCategory).filter(Boolean))]

    for (const categoryId of categoryIds) {
      newCatMeta[categoryId] = {}
      catAspectValues[categoryId] = {}
      try {
        const res = await window.api.ebay.categoryAspects(categoryId)
        if (res.ok) {
          const catMap = {}
          for (const asp of res.data) {
            catMap[`C:${asp.name}`] = asp.usage
            // Store valid values for "Does Not Apply" detection
            if (asp.values?.length) catAspectValues[categoryId][asp.name] = asp.values
          }
          newCatMeta[categoryId] = catMap
        }
      } catch (e) { /* ignore: catMeta stays empty {} for this cat */ }
    }

    const strictestUsage = getStrictestAspectUsage(newCatMeta)

    for (const r of readyProducts.value) {
      const description = buildDescription(r)
      const aspectCols = buildAspectColumns(r, newCatMeta[r.ebayCategory], strictestUsage)
      const aspValues = catAspectValues[r.ebayCategory] || {}

      // Ensure REQUIRED aspects are included; auto-fill "Does Not Apply" if it's a valid value.
      if (newCatMeta[r.ebayCategory]) {
        for (const [colName, usage] of Object.entries(newCatMeta[r.ebayCategory])) {
          if (usage === 'REQUIRED' && !(colName in aspectCols)) {
            const aspName = aspectNameFromCol(colName)
            const validVals = aspValues[aspName] || []
            const fallback = validVals.includes('Does Not Apply') ? 'Does Not Apply' : ''
            aspectCols[getAspectHeader(aspName, strictestUsage[colName])] = fallback
          }
        }
      }

      if (r.variations && r.variations.length > 0) {
        // Parent row
        const parentRelDetails = buildParentRelationshipDetails(r.variations)
        rows.push({
          _rowType: 'parent',
          _ebayCategory: r.ebayCategory || '',
          [ACTION_HEADER]: 'Add',
          'CustomLabel': r.asin,
          '*Category': r.ebayCategory || '',
          'StoreCategory': '',
          '*Title': cleanTitle(r.title),
          'Subtitle': '',
          'Relationship': '',
          'RelationshipDetails': parentRelDetails,
          'ScheduleTime': '',
          '*ConditionID': props.settings.defaultCondition || '1000',
          ...aspectCols,
          'PicURL': (r.images || []).slice(0, 12).join('|'),
          'GalleryType': '',
          'VideoID': '',
          '*Description': description,
          '*Format': props.settings.defaultFormat || 'FixedPrice',
          '*Duration': props.settings.defaultDuration || 'GTC',
          '*StartPrice': '',
          'BuyItNowPrice': '',
          'BestOfferEnabled': '',
          '*Quantity': '',
          'ImmediatePayRequired': '',
          '*Location': props.settings.defaultLocation || 'US WAREHOUSE',
          '*DispatchTimeMax': props.settings.dispatchTimeMax || '7',
          // Business Policies — sử dụng profile đã tạo trong Seller Hub (loại bỏ legacy fields)
          'ShippingProfileName': props.settings.shippingProfileName || '',
          'ReturnProfileName': props.settings.returnProfileName || '',
          'PaymentProfileName': props.settings.paymentProfileName || '',
        })

        // Child rows
        for (const v of r.variations) {
          const childRelDetails = Object.entries(v.attributes || {})
            .map(([k, val]) => `${k}=${val}`)
            .join('|')
          rows.push({
            _rowType: 'child',
            _ebayCategory: r.ebayCategory || '',
            [ACTION_HEADER]: '',
            'CustomLabel': v.asin || '',
            '*Category': '',
            'StoreCategory': '',
            '*Title': '',
            'Subtitle': '',
            'Relationship': 'Variation',
            'RelationshipDetails': childRelDetails,
            'ScheduleTime': '',
            '*ConditionID': '',
            'PicURL': v.image || '',
            'GalleryType': '',
            'VideoID': '',
            '*Description': '',
            '*Format': '',
            '*Duration': '',
            '*StartPrice': v.price != null && v.price > 0 ? v.price : r.sellPrice,
            'BuyItNowPrice': '',
            'BestOfferEnabled': '',
            '*Quantity': props.settings.defaultQuantity || v.quantity || 10,
            'ImmediatePayRequired': '',
            '*Location': '',
            '*DispatchTimeMax': '',
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
          [ACTION_HEADER]: 'Add',
          'CustomLabel': r.asin,
          '*Category': r.ebayCategory || '',
          'StoreCategory': '',
          '*Title': cleanTitle(r.title),
          'Subtitle': '',
          'Relationship': '',
          'RelationshipDetails': '',
          'ScheduleTime': '',
          '*ConditionID': props.settings.defaultCondition || '1000',
          ...aspectCols,
          'PicURL': (r.images || []).slice(0, 12).join('|'),
          'GalleryType': '',
          'VideoID': '',
          '*Description': description,
          '*Format': props.settings.defaultFormat || 'FixedPrice',
          '*Duration': props.settings.defaultDuration || 'GTC',
          '*StartPrice': r.sellPrice,
          'BuyItNowPrice': '',
          'BestOfferEnabled': '',
          '*Quantity': props.settings.defaultQuantity || 10,
          'ImmediatePayRequired': '',
          '*Location': props.settings.defaultLocation || 'US WAREHOUSE',
          '*DispatchTimeMax': props.settings.dispatchTimeMax || '7',
          // Business Policies — sử dụng profile đã tạo trong Seller Hub (loại bỏ legacy fields)
          'ShippingProfileName': props.settings.shippingProfileName || '',
          'ReturnProfileName': props.settings.returnProfileName || '',
          'PaymentProfileName': props.settings.paymentProfileName || '',
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

    // Sort columns in logical order for eBay File Exchange:
    // 0: Action header
    // 1: Core identity (CustomLabel, Category, Title, Subtitle)
    // 2: Variation (Relationship, RelationshipDetails)
    // 3: Listing type (ConditionID, Format, Duration)
    // 4: Required item specifics (C: REQUIRED)
    // 5: Recommended item specifics (C: RECOMMENDED)
    // 6: Optional item specifics (C: OPTIONAL)
    // 7: Media (PicURL, GalleryType, VideoID)
    // 8: Description
    // 9: Pricing & Quantity
    // 10: Shipping & Policy
    // 11: Everything else
    const COLUMN_ORDER = [
      ACTION_HEADER,
      'CustomLabel', '*Category', 'StoreCategory', '*Title', 'Subtitle',
      'Relationship', 'RelationshipDetails', 'ScheduleTime',
      '*ConditionID', '*Format', '*Duration',
      // aspect cols go here (ranks 4-6)
      'PicURL', 'GalleryType', 'VideoID',
      '*Description',
      '*StartPrice', 'BuyItNowPrice', 'BestOfferEnabled', '*Quantity', 'ImmediatePayRequired',
      '*Location', '*DispatchTimeMax',
      'ShippingProfileName', 'ReturnProfileName', 'PaymentProfileName',
    ]
    const sorted = [...colSet].sort((a, b) => {
      const rank = (c) => {
        const fixedIdx = COLUMN_ORDER.indexOf(c)
        if (fixedIdx !== -1) {
          // Aspect cols slot in between ConditionID block and PicURL
          // fixed index < PicURL index means before aspects
          return fixedIdx < COLUMN_ORDER.indexOf('PicURL') ? fixedIdx * 10 : fixedIdx * 10 + 30
        }
        const u = strictestUsage[aspectMetaKey(c)]
        if (isAspectCol(c) && u === 'REQUIRED') return COLUMN_ORDER.indexOf('*ConditionID') * 10 + 5
        if (isAspectCol(c) && u === 'RECOMMENDED') return COLUMN_ORDER.indexOf('*ConditionID') * 10 + 6
        if (isAspectCol(c)) return COLUMN_ORDER.indexOf('*ConditionID') * 10 + 7
        return 999
      }
      const diff = rank(a) - rank(b)
      if (diff !== 0) return diff
      return a.localeCompare(b)
    })

    allColumns.value = sorted
    previewRows.value = rows
  } finally {
    isPreviewLoading.value = false
  }
}

const isRefreshing = ref(false)

const refreshPreview = async () => {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await buildPreview()
  } finally {
    setTimeout(() => {
      isRefreshing.value = false
    }, 500)
  }
}

// ─── Build helpers (copied from Workspace.vue to keep 1:1 parity) ─────────────

const buildDescription = (row) => {
  const parts = []
  parts.push('<div style=\'max-width:800px;margin:0 auto;font-family:Arial,sans-serif\'>')

  if (row.bulletPoints?.length > 0) {
    parts.push('<h3 style=\'margin-bottom:8px\'>Product Features</h3>')
    parts.push('<ul style=\'padding-left:18px\'>')
    row.bulletPoints.forEach(bp => {
      parts.push(`<li style='margin-bottom:4px'>${escapeHtml(bp)}</li>`)
    })
    parts.push('</ul>')
  }

  if (row.images?.length > 0) {
    parts.push('<div style=\'margin:16px 0\'>')
    row.images.slice(0, 5).forEach(img => {
      parts.push(`<img src='${img}' style='max-width:700px;width:100%;display:block;margin:8px 0' />`)
    })
    parts.push('</div>')
  }

  if (row.description) {
    parts.push(`<p style='margin-top:12px'>${escapeHtml(row.description.substring(0, 2000))}</p>`)
  }

  if (row.specs && Object.keys(row.specs).length > 0) {
    parts.push('<h3 style=\'margin-top:16px;margin-bottom:8px\'>Specifications</h3>')
    parts.push('<table style=\'border-collapse:collapse;width:100%\'>')
    for (const [key, val] of Object.entries(row.specs)) {
      parts.push(`<tr><td style='border:1px solid #ddd;padding:6px 10px;font-weight:bold;width:35%'>${escapeHtml(key)}</td>`)
      parts.push(`<td style='border:1px solid #ddd;padding:6px 10px'>${escapeHtml(val)}</td></tr>`)
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

const getStrictestAspectUsage = (categoryMetaById) => {
  const rank = { REQUIRED: 3, RECOMMENDED: 2, OPTIONAL: 1 }
  const result = {}
  for (const categoryMeta of Object.values(categoryMetaById)) {
    for (const [col, usage] of Object.entries(categoryMeta)) {
      if (!result[col] || rank[usage] > rank[result[col]]) {
        result[col] = usage
      }
    }
  }
  return result
}

const buildAspectColumns = (row, categoryMeta = null, strictestUsage = {}) => {
  const cols = {}
  const allowedAspects = categoryMeta ? new Set(Object.keys(categoryMeta).map((col) => col.replace(/^\*?C:/, ''))) : null

  if (row.aspectValues) {
    for (const [name, val] of Object.entries(row.aspectValues)) {
      if (val && (!allowedAspects || allowedAspects.has(name))) {
        const metaKey = `C:${name}`
        cols[getAspectHeader(name, strictestUsage[metaKey] || categoryMeta?.[metaKey])] = val
      }
    }
  }
  if (row.brand && (!allowedAspects || allowedAspects.has('Brand'))) {
    const brandHeader = getAspectHeader('Brand', strictestUsage['C:Brand'] || categoryMeta?.['C:Brand'])
    if (!cols[brandHeader]) cols[brandHeader] = row.brand
  }
  return cols
}

const buildParentRelationshipDetails = (variations) => {
  const dimValues = {}       // key → Map<lowerVal, originalVal> (giữ giá trị gốc, dedup theo lowercase)
  for (const v of variations) {
    for (const [key, val] of Object.entries(v.attributes || {})) {
      if (!dimValues[key]) dimValues[key] = new Map()
      if (val) {
        const lk = String(val).toLowerCase()
        // Chỉ thêm nếu chưa có giá trị tương đương (case-insensitive)
        if (!dimValues[key].has(lk)) {
          dimValues[key].set(lk, val)
        }
      }
    }
  }
  return Object.entries(dimValues)
    .map(([key, valMap]) => `${key}=${[...valMap.values()].join(',')}`)
    .join('|')
}

/**
 * Clean title for eBay: strip problematic chars
 */
const cleanTitle = (title) => {
  if (!title) return ''
  let cleaned = title
    .replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '') // strip emoji
    .replace(/[【】「」『』]/g, ' ')  // CJK brackets → space
    .replace(/\s+/g, ' ')
    .trim()
  // eBay enforces 80-char title limit
  if (cleaned.length > 80) cleaned = cleaned.substring(0, 80).trim()
  return cleaned
}

// ─── Export (reuses preview data) ─────────────────────────────────────────────

const validatePreview = () => {
  let hasErrors = Object.keys(validationErrors.value).length > 0

  previewRows.value.forEach((row, idx) => {
    // Check missing required fields
    allColumns.value.forEach(col => {
      if (isCellMissingRequired(row, col)) {
        hasErrors = true
        // We do NOT add to validationErrors here because missing fields
        // already have the empty-placeholder (Required) visual indicator.
      }
    })
  })

  return !hasErrors
}

const handleExport = async (force = false) => {
  if (!force) {
    if (!validatePreview()) {
      toast.error('Có lỗi dữ liệu!', {
        description: 'Vui lòng kiểm tra các ô bị viền đỏ và sửa lại trước khi xuất CSV.',
        duration: 4000
      })
      return
    }
  }

  const exportPath = await window.api.dialog.saveFile({ defaultPath: 'ebay-upload-template.csv' })
  if (!exportPath) return

  // Remove internal fields before export
  const exportRows = previewRows.value.map(r => {
    const clean = { ...r }
    delete clean._rowType
    delete clean._ebayCategory
    return clean
  })

  // Build CSV manually — eBay's parser struggles with RFC 4180 "" escaping
  const headers = allColumns.value
  const csvEscape = (val) => {
    if (val == null) return ''
    let s = String(val)
    // Replace any remaining double quotes with single quotes (safety net)
    s = s.replace(/"/g, "'")
    // Quote the field if it contains comma, newline, or single quote
    if (s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return `"${s}"`
    }
    return s
  }

  const csvLines = []
  // Metadata line (eBay requires this as first row)
  const metaCells = ['Info', 'Version=1.0.0', 'Template=fx_category_template_EBAY_US']
  while (metaCells.length < headers.length) metaCells.push('')
  csvLines.push(metaCells.join(','))
  // Header line
  csvLines.push(headers.join(','))
  // Data rows
  for (const row of exportRows) {
    const cells = headers.map(h => csvEscape(row[h]))
    csvLines.push(cells.join(','))
  }

  const csvContent = '\uFEFF' + csvLines.join('\r\n') + '\r\n'
  await window.api.file.write(exportPath, csvContent)
  toast.success('Export thành công!', {
    description: `${readyProducts.value.length} sản phẩm (${exportRows.length} dòng CSV).`,
    duration: 3000
  })
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

/* ─── Legend Card ────────────────────────────────────────────────────────── */
.legend-card {
  display: flex;
  align-items: stretch;
  gap: 0;
  padding: 10px 16px;
  margin-bottom: 10px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0,0,0,.04);
  flex-shrink: 0;
}

.legend-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 0 auto;
  padding: 0 16px;
}
.legend-group:first-child { padding-left: 0; }
.legend-group:last-child { padding-right: 0; }

.legend-group-label {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: hsl(var(--muted-foreground));
  opacity: 0.7;
}

.legend-divider {
  width: 1px;
  background: hsl(var(--border));
  align-self: stretch;
  margin: 0;
}

.legend-items {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  border: 1px solid transparent;
}

.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chip-icon {
  font-size: 11px;
  flex-shrink: 0;
  line-height: 1;
}

/* Row type chips */
.chip-parent { background: hsl(210 100% 95%); border-color: hsl(210 80% 80%); color: hsl(210 70% 35%); }
.dot-parent { background: hsl(210 80% 55%); }

.chip-child { background: hsl(220 10% 96%); border-color: hsl(220 10% 82%); color: hsl(220 10% 40%); }
.dot-child { background: hsl(220 10% 65%); }

.chip-single { background: hsl(40 100% 94%); border-color: hsl(40 80% 72%); color: hsl(35 70% 35%); }
.dot-single { background: hsl(35 85% 55%); }

.chip-req { background: hsl(0 80% 95%); border-color: hsl(0 75% 80%); color: hsl(0 75% 50%); }
.chip-req .chip-icon { color: hsl(0 75% 50%); }

.chip-cond { background: hsl(38 92% 95%); border-color: hsl(38 92% 75%); color: hsl(35 92% 35%); }

.chip-rec { background: hsl(142 70% 95%); border-color: hsl(142 70% 80%); color: hsl(142 70% 35%); }
.chip-rec .chip-icon { color: hsl(142 70% 45%); }

.chip-opt { background: hsl(270 50% 95%); border-color: hsl(270 50% 80%); color: hsl(270 60% 40%); }
.chip-opt .chip-icon { color: hsl(270 60% 40%); }

.chip-mix { background: hsl(210 80% 96%); border-color: hsl(210 80% 75%); color: hsl(210 80% 35%); }

/* ─── Column header usage badges ─────────────────────────────────────────── */
.col-usage-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.badge-required { background: hsl(0 75% 55%); color: white; }
.badge-conditional { background: hsl(38 92% 50%); color: white; }
.badge-recommended { background: hsl(142 70% 45%); color: white; }
.badge-optional { background: hsl(270 60% 50%); color: white; }
.badge-mixed { background: hsl(210 80% 50%); color: white; }

.col-multi-marker {
  font-size: 9px;
  margin-left: 2px;
  cursor: help;
  opacity: 0.7;
}

/* ─── Cell-level usage tag ───────────────────────────────────────────────── */
.cell-value-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 16px 0 0;
  width: 100%;
  overflow: hidden;
}

.cell-usage-tag {
  position: absolute;
  top: 4px;
  right: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: auto;
  padding: 0 3px;
  height: 13px;
  border-radius: 3px;
  font-size: 8px;
  font-weight: 700;
  line-height: 1;
  flex-shrink: 0;
  opacity: 0.85;
}

.tag-required { background: hsl(0 80% 95%); color: hsl(0 75% 50%); border: 1px solid hsl(0 75% 80%); }
.tag-recommended { background: hsl(142 70% 95%); color: hsl(142 70% 35%); border: 1px solid hsl(142 70% 80%); }
.tag-optional { background: hsl(270 50% 95%); color: hsl(270 60% 40%); border: 1px solid hsl(270 50% 80%); }


.preview-table th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: hsl(var(--muted));
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-top: none; /* Prevent double borders when scrolling */
  padding: 6px 8px;
  font-weight: 600;
  white-space: nowrap;
  text-align: left;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: hsl(var(--muted-foreground));
  box-shadow: 0 1px 0 rgba(128, 128, 128, 0.25); /* Bottom border that scrolls with sticky */
}

.preview-table td {
  border: 1px solid rgba(128, 128, 128, 0.25);
  padding: 0;
  white-space: nowrap;
  max-width: 220px;
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

.cell-editor-popup {
  position: absolute;
  top: -1px;
  left: -1px;
  min-width: 250px;
  z-index: 50;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  background: hsl(var(--background));
  border: 2px solid hsl(210 80% 55%);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  white-space: normal;
}

.cell-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 2px;
  padding: 2px 4px;
  background: hsl(210 20% 98%);
  border-bottom: 1px solid hsl(210 20% 90%);
  border-radius: 2px 2px 0 0;
}

.editor-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  transition: all 0.1s;
}

.editor-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--accent-foreground));
}

.btn-save:hover {
  background: hsl(142 70% 90%);
  color: hsl(142 70% 30%);
}

.btn-cancel:hover {
  background: hsl(0 70% 94%);
  color: hsl(0 70% 40%);
}

.cell-textarea {
  min-width: 250px;
  min-height: 70px;
  padding: 6px 8px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 11px;
  font-family: inherit;
  resize: both;
  line-height: 1.4;
  white-space: pre-wrap;
  display: block;
}

.cell-content {
  display: block;
  padding: 4px 8px;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  box-shadow: inset 0 0 0 2px hsl(0 70% 50%) !important;
  background: rgba(255, 0, 0, 0.05) !important;
  position: relative;
}

.error-cell {
  box-shadow: inset 0 0 0 2px hsl(0 70% 50%) !important;
  background: rgba(255, 0, 0, 0.05) !important;
  position: relative;
}

.action-col {
  min-width: 60px !important;
  max-width: 80px !important;
  text-align: center;
}

.empty-placeholder {
  color: hsl(0 70% 50%);
  font-size: 10px;
  font-style: italic;
  font-weight: 500;
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
  width: 100%;
}
</style>
