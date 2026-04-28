<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <div class="page-title flex items-center font-bold text-[15px]">
        <LayoutDashboard class="w-5 h-5 mr-2.5 flex-shrink-0" />
        Xử lý & Export
      </div>

      <div class="header-actions flex gap-2">
        <Button variant="outline" size="sm" @click="handleExport" :disabled="doneRows.length === 0">
          <Download class="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>
    </div>

    <!-- Content: Grid + Detail Panel -->
    <div class="workspace-body h-full">
      <div class="grid-area mx-4 mt-4 h-full" :class="{ 'with-panel': selectedRow }">
        <div v-if="doneRows.length === 0" class="flex-1 flex flex-col items-center justify-center text-center p-8 h-full min-h-[400px]">
          <div class="bg-muted/30 p-6 rounded-full mb-4">
            <FolderOpen class="w-12 h-12 text-muted-foreground" />
          </div>
          <h3 class="text-xl font-semibold mb-2">Chưa có sản phẩm</h3>
          <p class="text-muted-foreground text-sm max-w-sm">Sử dụng Amazon Crawler để crawl dữ liệu trước khi xử lý tại đây.</p>
        </div>

        <div v-else class="flex-1 h-full overflow-hidden flex flex-col bg-card rounded-t-xl ring-1 ring-border/50 shadow-sm border-b-0">
          <Table class="relative w-full" wrapperClass="flex-1 min-h-0">
            <TableHeader class="sticky top-0 bg-muted/80 backdrop-blur z-10">
              <TableRow class="hover:bg-transparent">
                <TableHead class="w-[40px] text-center font-semibold whitespace-nowrap">#</TableHead>
                <TableHead class="w-[90px] font-semibold whitespace-nowrap">ASIN</TableHead>
                <TableHead class="w-[280px] min-w-[280px] font-semibold">Sản phẩm</TableHead>
                <TableHead class="w-[85px] text-right font-semibold whitespace-nowrap">Giá gốc</TableHead>
                <TableHead class="w-[85px] text-right font-semibold whitespace-nowrap">Giá eBay</TableHead>
                <TableHead class="w-[70px] text-center font-semibold whitespace-nowrap">Biến thể</TableHead>
                <TableHead class="w-[150px] font-semibold whitespace-nowrap">Category</TableHead>
                <TableHead class="w-[100px] text-center font-semibold whitespace-nowrap">Trạng thái</TableHead>
                <TableHead class="w-full"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="(row, index) in doneRows"
                :key="row.id"
                @click="onRowClick(row)"
                :class="{ 'bg-blue-50 dark:bg-blue-950/20': selectedRow?.id === row.id }"
                class="cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <TableCell class="text-center text-muted-foreground text-sm">{{ index + 1 }}</TableCell>

                <TableCell>
                  <a
                    :href="row.amazonUrl || `https://www.amazon.com/dp/${row.asin}`"
                    target="_blank"
                    class="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline"
                    @click.stop
                  >{{ row.asin }}</a>
                </TableCell>

                <TableCell>
                  <div class="flex items-start gap-2 max-w-[260px] whitespace-normal">
                    <div class="w-8 h-8 rounded border bg-muted/50 flex-shrink-0 overflow-hidden mt-0.5">
                      <img v-if="row.images?.length" :src="row.images[0]" class="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div class="flex flex-col min-w-0">
                      <span v-if="row.brand" class="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">{{ row.brand }}</span>
                      <span class="text-xs font-medium line-clamp-2 leading-tight" :title="row.title">{{ row.title || '—' }}</span>
                    </div>
                  </div>
                </TableCell>

                <TableCell class="text-right text-sm whitespace-nowrap">
                  ${{ typeof row.originalPrice === 'number' ? row.originalPrice.toFixed(2) : (row.originalPrice || '—') }}
                </TableCell>

                <TableCell class="text-right text-sm font-semibold text-green-600 whitespace-nowrap">
                  <span v-if="row.sellPrice">${{ Number(row.sellPrice).toFixed(2) }}</span>
                  <span v-else class="text-muted-foreground">—</span>
                </TableCell>

                <TableCell class="text-center whitespace-nowrap">
                  <Badge v-if="row.variations?.length" variant="secondary" class="text-xs tabular-nums">{{ row.variations.length }}</Badge>
                  <span v-else class="text-muted-foreground text-xs">—</span>
                </TableCell>

                <TableCell class="whitespace-nowrap">
                  <div v-if="row.ebayCategory" class="flex items-center gap-1.5">
                    <CheckCircle2 class="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                    <span class="text-xs truncate max-w-[120px]" :title="row.ebayCategoryName">{{ row.ebayCategoryName || row.ebayCategory }}</span>
                  </div>
                  <span v-else class="text-xs text-amber-500 flex items-center gap-1">
                    <AlertTriangle class="w-3 h-3" /> Chưa chọn
                  </span>
                </TableCell>

                <TableCell class="text-center whitespace-nowrap">
                  <Badge
                    :variant="isRowReady(row) ? 'default' : 'secondary'"
                    :class="isRowReady(row) ? 'bg-green-600 hover:bg-green-700 text-white' : ''"
                    class="text-xs"
                  >
                    {{ isRowReady(row) ? 'Sẵn sàng' : 'Thiếu dữ liệu' }}
                  </Badge>
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <!-- Detail Panel -->
      <transition name="panel">
        <div v-if="selectedRow" class="detail-panel" :style="{ width: panelWidth + 'px' }">
          <div class="resize-handle" @mousedown="startResize"></div>
          <DetailPanel
            :key="selectedRow.id"
            ref="detailPanelRef"
            :row="selectedRow"
            :settings="props.settings"
            @close="selectedRow = null"
            @update="onDetailUpdate"
          />
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import * as xlsx from 'xlsx'
import DetailPanel from './DetailPanel.vue'

import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, Filter, RefreshCw, FileSpreadsheet, ListTree, Play, Square, Download, ChevronRight, CheckCircle2, CircleDashed, LayoutDashboard, FolderOpen, AlertTriangle } from 'lucide-vue-next'

const props = defineProps({
  settings: { type: Object, required: true }
})

import { globalRowData as rowData } from '../store'

const selectedRow = ref(null)
const detailPanelRef = ref(null)

const doneRows = computed(() => rowData.value.filter(r => r.status === 'DONE'))

const isRowReady = (row) => !!row.ebayCategory && !!row.title && (row.sellPrice > 0 || row.variations?.length > 0)

const onRowClick = (row) => {
  if (selectedRow.value?.id === row.id) return
  if (detailPanelRef.value?.isDirty) {
    if (!confirm('Sản phẩm hiện tại có thay đổi chưa lưu. Bạn có chắc chắn muốn chuyển sang sản phẩm khác?')) {
      return
    }
  }
  selectedRow.value = { ...row, variations: (row.variations || []).map(v => ({ ...v })) }
}

const onDetailUpdate = (updatedRow) => {
  const idx = rowData.value.findIndex(r => r.id === updatedRow.id)
  if (idx !== -1) {
    rowData.value[idx] = updatedRow
  }
  selectedRow.value = { ...updatedRow }
}

// ─── Build HTML Description ───────────────────────────────────────────────────
const buildDescription = (row) => {
  const parts = []
  parts.push('<div style="max-width:800px;margin:0 auto;font-family:Arial,sans-serif">')

  // Bullet points
  if (row.bulletPoints?.length > 0) {
    parts.push('<h3 style="margin-bottom:8px">Product Features</h3>')
    parts.push('<ul style="padding-left:18px">')
    row.bulletPoints.forEach(bp => {
      parts.push(`<li style="margin-bottom:4px">${escapeHtml(bp)}</li>`)
    })
    parts.push('</ul>')
  }

  // Main images (max 5 to keep desc size reasonable)
  if (row.images?.length > 0) {
    parts.push('<div style="margin:16px 0">')
    row.images.slice(0, 5).forEach(img => {
      parts.push(`<img src="${img}" style="max-width:700px;width:100%;display:block;margin:8px 0" />`)
    })
    parts.push('</div>')
  }

  // Text description
  if (row.description) {
    parts.push(`<p style="margin-top:12px">${escapeHtml(row.description.substring(0, 2000))}</p>`)
  }

  // Specs table
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

// ─── Export ───────────────────────────────────────────────────────────────────
const handleExport = async () => {
  const exportPath = await window.api.dialog.saveFile({ defaultPath: 'ebay-upload-template.csv' })
  if (!exportPath) return

  const rows = []
  const readyRows = doneRows.value.filter(r => isRowReady(r))
  
  if (readyRows.length === 0) {
    alert('Không có sản phẩm nào sẵn sàng export.\nVui lòng chọn eBay Category cho từng sản phẩm trước.')
    return
  }

  for (const r of readyRows) {
    const description = buildDescription(r)
    const aspectCols = buildAspectColumns(r)

    if (r.variations && r.variations.length > 0) {
      // ─ Parent row ─
      const parentRelDetails = buildParentRelationshipDetails(r.variations)
      rows.push({
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

      // ─ Child (Variation) rows ─
      for (const v of r.variations) {
        const childRelDetails = Object.entries(v.attributes || {}).map(([k, val]) => `${k}=${val}`).join('|')
        rows.push({
          '*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)': '',
          '*Category': '',
          '*Title': '',
          '*Description': '',
          '*ConditionID': '',
          'PicURL': v.image || '',
          '*Quantity': props.settings.defaultQuantity || v.quantity || 10,
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
      // ─ Single product (no variations) ─
      rows.push({
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

  const ws = xlsx.utils.json_to_sheet(rows)
  const csv = xlsx.utils.sheet_to_csv(ws)
  // eBay requires UTF-8 BOM for correct Unicode parsing
  const csvWithBom = '\uFEFF' + csv
  await window.api.file.write(exportPath, csvWithBom)
  alert(`Export thành công! ${readyRows.length} sản phẩm (${rows.length} dòng CSV).`)
}

// Build parent RelationshipDetails: all dimension values combined
// e.g. "Color=Red;Blue;Green|Size=S;M;L"
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
}

// Build C:Brand, C:Color, etc. columns from aspectValues
const buildAspectColumns = (row) => {
  const cols = {}
  if (row.aspectValues) {
    for (const [name, val] of Object.entries(row.aspectValues)) {
      if (val) cols[`C:${name}`] = val
    }
  }
  // Ensure Brand is always present
  if (!cols['C:Brand'] && row.brand) {
    cols['C:Brand'] = row.brand
  }
  return cols
}

// ─── Resizable Panel ─────────────────────────────────────────────────────────
const panelWidth = ref(380)
const isResizing = ref(false)

const startResize = (e) => {
  isResizing.value = true
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', stopResize)
}

const onMouseMove = (e) => {
  if (!isResizing.value) return
  const newWidth = document.body.clientWidth - e.clientX
  if (newWidth > 300 && newWidth < 800) {
    panelWidth.value = newWidth
  }
}

const stopResize = () => {
  isResizing.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', stopResize)
}
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
  display: flex;
  flex-direction: column;
}

.resize-handle {
  position: absolute;
  top: 0;
  left: -4px;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 20;
  background: transparent;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.resize-handle::after {
  content: '';
  width: 2px;
  height: 30px;
  background: hsl(var(--border));
  border-radius: 2px;
}
.resize-handle:hover, .resize-handle:active {
  background: hsl(var(--primary) / 0.1);
}
.resize-handle:hover::after, .resize-handle:active::after {
  background: hsl(var(--primary));
}

.detail-panel {
  position: relative;
  flex-shrink: 0;
  border-left: 1px solid hsl(var(--border));
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Table wrap fix */
.table-container {
  flex: 1;
  width: 100%;
  overflow: auto;
  min-height: 0;
}

.table-container :deep(th) {
  white-space: nowrap;
}

.table-container :deep(td) {
  white-space: nowrap;
}


</style>
