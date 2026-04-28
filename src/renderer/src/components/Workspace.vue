<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <div class="page-title flex items-center font-bold text-[15px]">
        <LayoutDashboard class="w-5 h-5 mr-2.5 flex-shrink-0" />
        Xử lý Dữ liệu
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

// Removed local export logic as it is now strictly handled in ExportPreview.vue

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
