<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <span class="page-title">
        Xử lý & Export
      </span>

      <div class="header-actions flex gap-2">
        <Button variant="outline" size="sm" @click="handleExport" :disabled="doneRows.length === 0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export CSV
        </Button>
      </div>
    </div>

    <!-- Content: Grid + Detail Panel -->
    <div class="workspace-body">
      <!-- Custom Table -->
      <div class="grid-area" :class="{ 'with-panel': selectedRow }">
        <div v-if="doneRows.length === 0" class="empty-state">
          <div class="empty-icon text-muted-foreground"><FolderOpen class="w-12 h-12 mx-auto" /></div>
          <h3>Chưa có sản phẩm</h3>
          <p>Sử dụng Amazon Crawler để crawl dữ liệu trước khi xử lý tại đây.</p>
        </div>

        <div v-else class="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-[45px] text-center">#</TableHead>
                <TableHead class="w-[100px]">Link Amazon</TableHead>
                <TableHead class="w-[280px]">Sản phẩm</TableHead>
                <TableHead class="w-[100px] text-right">Giá eBay</TableHead>
                <TableHead class="w-[100px] text-right">Lợi nhuận</TableHead>
                <TableHead class="w-[85px] text-center">Biến thể</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="(row, index) in doneRows"
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

    <!-- Workspace Body End -->
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

import { globalRowData as rowData } from '../store'

// ─── State ────────────────────────────────────────────────────────────────────
const selectedRow = ref(null)

const doneRows = computed(() => rowData.value.filter(r => r.status === 'DONE'))


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

const renderProfit = (row) => {
  const sell = Number(row.sellPrice) || 0
  const buy = Number(row.originalPrice) || 0
  if (!sell || !buy) return '<span style="color:var(--text-muted)">—</span>'
  const profit = sell - buy
  const color = profit > 0 ? '#22c55e' : profit < 0 ? '#ef4444' : 'var(--text-muted)'
  return `<span style="color:${color}; font-weight:500">$${profit.toFixed(2)}</span>`
}
const handleExport = async () => {
  const exportPath = await window.api.dialog.saveFile({ defaultPath: 'ebay-upload-template.csv' })
  if (!exportPath) return

  const rows = []
  for (const r of doneRows.value) {
    if (r.variations && r.variations.length > 0) {
      // Parent row
      rows.push(buildExportRow(r, 'Add', true))
      // Variation rows
      for (const v of r.variations) {
        rows.push({
          '*Action(SiteID=US|Country=US|Currency=USD|Version=1193)': 'Add',
          '*Category': r.ebayCategory || '',
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
  '*Category': r.ebayCategory || '',
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
