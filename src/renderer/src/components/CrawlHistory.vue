<template>
  <div class="workspace-root">
    <!-- Header -->
    <div class="page-header">
      <div class="page-title flex items-center font-bold text-[15px]">
        <History class="w-5 h-5 mr-2.5 flex-shrink-0" />
        Lịch sử Crawl
      </div>
      <div class="header-actions flex gap-2 items-center">
        <Button v-if="currentView === 'detail'" size="sm" variant="outline" @click="backToList">
          <ArrowLeft class="w-4 h-4 mr-1.5" /> Quay lại
        </Button>
        <Button v-if="currentView === 'detail'" size="sm" @click="loadSelectedToExport" :disabled="selectedAsins.size === 0">
          <Upload class="w-4 h-4 mr-1.5" /> Load vào Export ({{ selectedAsins.size }})
        </Button>
      </div>
    </div>

    <div class="flex-1 overflow-hidden flex flex-col mx-4 mt-4 mb-0">
      <!-- Loading -->
      <div v-if="isLoading" class="flex-1 flex items-center justify-center">
        <Loader2 class="w-8 h-8 animate-spin text-muted-foreground" />
      </div>

      <!-- Empty state -->
      <div v-else-if="sessions.length === 0 && currentView === 'list'" class="flex-1 flex flex-col items-center justify-center text-center p-8 min-h-[400px]">
        <div class="bg-muted/30 p-6 rounded-full mb-4">
          <History class="w-12 h-12 text-muted-foreground" />
        </div>
        <h3 class="text-xl font-semibold mb-2">Chưa có lịch sử crawl</h3>
        <p class="text-muted-foreground text-sm">Dữ liệu sẽ tự động lưu sau mỗi lần crawl thành công.</p>
      </div>

      <!-- SESSION LIST VIEW -->
      <div v-else-if="currentView === 'list'" class="flex-1 overflow-y-auto space-y-3 pb-4">
        <!-- Search -->
        <div class="flex items-center gap-2 mb-3">
          <div class="relative flex-1 max-w-sm">
            <Search class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Tìm theo tên session hoặc ASIN..."
              class="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Badge variant="outline" class="text-xs h-8 px-3">
            {{ filteredSessions.length }} sessions
          </Badge>
        </div>

        <!-- Session cards -->
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          class="session-card"
        >
          <div class="session-header">
            <div class="session-info">
              <div class="session-name-row">
                <template v-if="editingSessionId === session.id">
                  <input
                    v-model="editingName"
                    class="session-name-input"
                    @keydown.enter="commitRename(session.id)"
                    @keydown.escape="editingSessionId = null"
                    @blur="commitRename(session.id)"
                    ref="renameInputRef"
                  />
                </template>
                <template v-else>
                  <span class="session-name" @dblclick="startRename(session)">
                    <Package class="w-4 h-4 text-primary mr-1.5 flex-shrink-0" />
                    {{ session.name }}
                  </span>
                </template>
              </div>
              <div class="session-meta">
                <span class="meta-item">
                  <Calendar class="w-3 h-3" />
                  {{ formatDate(session.createdAt) }}
                </span>
                <span class="meta-item">
                  <Layers class="w-3 h-3" />
                  {{ session.productCount }} sản phẩm
                </span>
              </div>
              <div v-if="session.previewAsins?.length" class="session-asins">
                <Badge v-for="asin in session.previewAsins" :key="asin" variant="outline" class="text-[10px] h-5">
                  {{ asin }}
                </Badge>
                <span v-if="session.productCount > 5" class="text-[10px] text-muted-foreground">
                  +{{ session.productCount - 5 }} nữa
                </span>
              </div>
            </div>
            <div class="session-actions">
              <Button size="sm" variant="outline" @click="openSession(session.id)" title="Xem chi tiết">
                <Eye class="w-4 h-4 mr-1" /> Chi tiết
              </Button>
              <Button size="sm" @click="loadSessionToExport(session.id)" title="Load tất cả vào Export Preview">
                <Upload class="w-4 h-4 mr-1" /> Load vào Export
              </Button>
              <Button size="sm" variant="destructive" @click="confirmDeleteSession(session)" title="Xóa session">
                <Trash2 class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- SESSION DETAIL VIEW -->
      <div v-else-if="currentView === 'detail' && activeSession" class="flex-1 overflow-hidden flex flex-col">
        <!-- Detail header -->
        <div class="flex items-center gap-3 mb-3 flex-shrink-0">
          <h3 class="font-semibold text-sm">{{ activeSession.name }}</h3>
          <Badge variant="outline" class="text-xs">{{ activeSession.products?.length || 0 }} sản phẩm</Badge>
          <div class="ml-auto flex gap-2">
            <Button size="sm" variant="outline" @click="toggleSelectAllDetail">
              {{ isAllDetailSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả' }}
            </Button>
            <Button size="sm" variant="destructive" @click="deleteSelectedProducts" :disabled="selectedAsins.size === 0">
              <Trash2 class="w-3.5 h-3.5 mr-1" /> Xóa đã chọn ({{ selectedAsins.size }})
            </Button>
          </div>
        </div>

        <!-- Detail table -->
        <div class="detail-table-wrap">
          <table class="detail-table">
            <thead>
              <tr>
                <th class="checkbox-col">
                  <input type="checkbox" :checked="isAllDetailSelected" @change="toggleSelectAllDetail" class="product-checkbox" />
                </th>
                <th class="w-[60px]">#</th>
                <th class="w-[120px]">ASIN</th>
                <th>Title</th>
                <th class="w-[80px]">Giá gốc</th>
                <th class="w-[80px]">Giá bán</th>
                <th class="w-[100px]">Brand</th>
                <th class="w-[60px]">Ảnh</th>
                <th class="w-[80px]">Biến thể</th>
                <th class="w-[100px]">Category</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(product, idx) in activeSession.products"
                :key="product.asin"
                :class="{ 'selected-row': selectedAsins.has(product.asin) }"
              >
                <td class="checkbox-col">
                  <input
                    type="checkbox"
                    :checked="selectedAsins.has(product.asin)"
                    @change="toggleDetailProduct(product.asin)"
                    class="product-checkbox"
                  />
                </td>
                <td class="text-center text-muted-foreground text-xs">{{ idx + 1 }}</td>
                <td>
                  <a :href="`https://amazon.com/dp/${product.asin}`" target="_blank" class="text-xs font-mono text-primary hover:underline">
                    {{ product.asin }}
                  </a>
                </td>
                <td>
                  <div class="editable-cell-wrap" @dblclick="startDetailEdit(product, 'title')">
                    <template v-if="detailEditing?.asin === product.asin && detailEditing?.field === 'title'">
                      <input
                        v-model="detailEditValue"
                        class="detail-edit-input"
                        @blur="commitDetailEdit(product)"
                        @keydown.enter="commitDetailEdit(product)"
                        @keydown.escape="detailEditing = null"
                        ref="detailEditRef"
                      />
                    </template>
                    <span v-else class="text-xs line-clamp-2" :title="product.title">{{ product.title }}</span>
                  </div>
                </td>
                <td class="text-center text-xs">${{ product.originalPrice }}</td>
                <td>
                  <div class="editable-cell-wrap" @dblclick="startDetailEdit(product, 'sellPrice')">
                    <template v-if="detailEditing?.asin === product.asin && detailEditing?.field === 'sellPrice'">
                      <input
                        v-model="detailEditValue"
                        class="detail-edit-input w-[70px]"
                        type="number"
                        step="0.01"
                        @blur="commitDetailEdit(product)"
                        @keydown.enter="commitDetailEdit(product)"
                        @keydown.escape="detailEditing = null"
                        ref="detailEditRef"
                      />
                    </template>
                    <span v-else class="text-xs font-semibold text-green-600">${{ product.sellPrice }}</span>
                  </div>
                </td>
                <td>
                  <div class="editable-cell-wrap" @dblclick="startDetailEdit(product, 'brand')">
                    <template v-if="detailEditing?.asin === product.asin && detailEditing?.field === 'brand'">
                      <input
                        v-model="detailEditValue"
                        class="detail-edit-input w-[90px]"
                        @blur="commitDetailEdit(product)"
                        @keydown.enter="commitDetailEdit(product)"
                        @keydown.escape="detailEditing = null"
                        ref="detailEditRef"
                      />
                    </template>
                    <span v-else class="text-xs">{{ product.brand || '—' }}</span>
                  </div>
                </td>
                <td class="text-center text-xs">{{ product.images?.length || 0 }}</td>
                <td class="text-center text-xs">{{ product.variations?.length || 0 }}</td>
                <td>
                  <div class="editable-cell-wrap" @dblclick="startDetailEdit(product, 'ebayCategory')">
                    <template v-if="detailEditing?.asin === product.asin && detailEditing?.field === 'ebayCategory'">
                      <input
                        v-model="detailEditValue"
                        class="detail-edit-input w-[90px]"
                        @blur="commitDetailEdit(product)"
                        @keydown.enter="commitDetailEdit(product)"
                        @keydown.escape="detailEditing = null"
                        ref="detailEditRef"
                      />
                    </template>
                    <span v-else class="text-xs">{{ product.ebayCategory || '—' }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Delete confirmation dialog -->
    <div v-if="deleteConfirm" class="dialog-overlay" @click.self="deleteConfirm = null">
      <div class="dialog-box">
        <h4 class="font-semibold mb-2">Xác nhận xóa</h4>
        <p class="text-sm text-muted-foreground mb-4">{{ deleteConfirm.message }}</p>
        <div class="flex justify-end gap-2">
          <Button size="sm" variant="outline" @click="deleteConfirm = null">Hủy</Button>
          <Button size="sm" variant="destructive" @click="executeDelete">Xóa</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, nextTick } from 'vue'
import { toast } from 'vue-sonner'
import { globalRowData as rowData } from '../store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  History, ArrowLeft, Search, Package, Calendar, Layers, Eye,
  Upload, Trash2, Loader2
} from 'lucide-vue-next'

const emit = defineEmits(['navigate'])

// ─── State ──────────────────────────────────────────────────────────────
const isLoading = ref(false)
const sessions = ref([])
const currentView = ref('list') // 'list' | 'detail'
const activeSession = ref(null)
const searchQuery = ref('')

// Rename
const editingSessionId = ref(null)
const editingName = ref('')
const renameInputRef = ref(null)

// Detail edit
const detailEditing = ref(null)
const detailEditValue = ref('')
const detailEditRef = ref(null)

// Selection
const selectedAsins = ref(new Set())

// Delete confirm
const deleteConfirm = ref(null)

// ─── Computed ───────────────────────────────────────────────────────────
const filteredSessions = computed(() => {
  if (!searchQuery.value.trim()) return sessions.value
  const q = searchQuery.value.toLowerCase()
  return sessions.value.filter(s =>
    s.name.toLowerCase().includes(q) ||
    s.previewAsins?.some(a => a.toLowerCase().includes(q))
  )
})

const isAllDetailSelected = computed(() => {
  if (!activeSession.value?.products?.length) return false
  return selectedAsins.value.size === activeSession.value.products.length
})

// ─── Load sessions ──────────────────────────────────────────────────────
const loadSessions = async () => {
  isLoading.value = true
  try {
    sessions.value = await window.api.history.listSessions()
  } catch (e) {
    console.error('[History] Load failed:', e)
  } finally {
    isLoading.value = false
  }
}

onMounted(loadSessions)
onActivated(loadSessions)

// ─── Session actions ────────────────────────────────────────────────────
const openSession = async (sessionId) => {
  isLoading.value = true
  try {
    const data = await window.api.history.loadSession(sessionId)
    if (data) {
      activeSession.value = data
      currentView.value = 'detail'
      selectedAsins.value = new Set()
    }
  } catch (e) {
    toast.error('Không thể mở session')
  } finally {
    isLoading.value = false
  }
}

const backToList = () => {
  currentView.value = 'list'
  activeSession.value = null
  selectedAsins.value = new Set()
  loadSessions() // Refresh list
}

const loadSessionToExport = async (sessionId) => {
  const data = await window.api.history.loadSession(sessionId)
  if (!data?.products?.length) return toast.error('Session rỗng')
  // Replace globalRowData with history products (set status DONE)
  rowData.value = data.products.map(p => ({
    ...p,
    id: p.asin,
    status: 'DONE',
    log: '✓ Loaded from history'
  }))
  toast.success('Đã load vào Export', {
    description: `${data.products.length} sản phẩm từ "${data.name}"`,
    duration: 3000
  })
  emit('navigate', 'preview')
}

const loadSelectedToExport = () => {
  if (!activeSession.value?.products?.length || selectedAsins.value.size === 0) return
  const selected = activeSession.value.products.filter(p => selectedAsins.value.has(p.asin))
  rowData.value = selected.map(p => ({
    ...p,
    id: p.asin,
    status: 'DONE',
    log: '✓ Loaded from history'
  }))
  toast.success('Đã load vào Export', {
    description: `${selected.length} sản phẩm đã chọn`,
    duration: 3000
  })
  emit('navigate', 'preview')
}

// ─── Rename ─────────────────────────────────────────────────────────────
const startRename = (session) => {
  editingSessionId.value = session.id
  editingName.value = session.name
  nextTick(() => renameInputRef.value?.[0]?.focus())
}

const commitRename = async (sessionId) => {
  if (!editingName.value.trim()) {
    editingSessionId.value = null
    return
  }
  await window.api.history.renameSession(sessionId, editingName.value.trim())
  editingSessionId.value = null
  loadSessions()
}

// ─── Delete ─────────────────────────────────────────────────────────────
const confirmDeleteSession = (session) => {
  deleteConfirm.value = {
    type: 'session',
    sessionId: session.id,
    message: `Xóa session "${session.name}" với ${session.productCount} sản phẩm?`
  }
}

const deleteSelectedProducts = () => {
  deleteConfirm.value = {
    type: 'products',
    message: `Xóa ${selectedAsins.value.size} sản phẩm đã chọn khỏi session?`
  }
}

const executeDelete = async () => {
  if (!deleteConfirm.value) return
  if (deleteConfirm.value.type === 'session') {
    await window.api.history.deleteSession(deleteConfirm.value.sessionId)
    toast.success('Đã xóa session')
    loadSessions()
  } else if (deleteConfirm.value.type === 'products' && activeSession.value) {
    for (const asin of selectedAsins.value) {
      await window.api.history.deleteProduct(activeSession.value.id, asin)
    }
    toast.success(`Đã xóa ${selectedAsins.value.size} sản phẩm`)
    selectedAsins.value = new Set()
    // Reload active session
    const refreshed = await window.api.history.loadSession(activeSession.value.id)
    if (refreshed && refreshed.products?.length > 0) {
      activeSession.value = refreshed
    } else {
      backToList()
    }
  }
  deleteConfirm.value = null
}

// ─── Detail selection ───────────────────────────────────────────────────
const toggleDetailProduct = (asin) => {
  const next = new Set(selectedAsins.value)
  if (next.has(asin)) next.delete(asin)
  else next.add(asin)
  selectedAsins.value = next
}

const toggleSelectAllDetail = () => {
  if (isAllDetailSelected.value) {
    selectedAsins.value = new Set()
  } else {
    selectedAsins.value = new Set(activeSession.value.products.map(p => p.asin))
  }
}

// ─── Detail inline edit ─────────────────────────────────────────────────
const startDetailEdit = (product, field) => {
  detailEditing.value = { asin: product.asin, field }
  detailEditValue.value = product[field] || ''
  nextTick(() => detailEditRef.value?.[0]?.focus())
}

const commitDetailEdit = async (product) => {
  if (!detailEditing.value) return
  const field = detailEditing.value.field
  const newVal = field === 'sellPrice' ? Number(detailEditValue.value) : detailEditValue.value

  // Update in activeSession locally
  product[field] = newVal
  // Persist to disk
  await window.api.history.updateProduct(activeSession.value.id, product.asin, { [field]: newVal })
  detailEditing.value = null
}

// ─── Helpers ────────────────────────────────────────────────────────────
const formatDate = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.workspace-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
}

/* ─── Session Cards ──────────────────────────────────────────── */
.session-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  padding: 16px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.session-card:hover {
  border-color: hsl(var(--primary) / 0.3);
  box-shadow: 0 2px 8px hsl(var(--primary) / 0.06);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-name-row {
  margin-bottom: 6px;
}

.session-name {
  display: inline-flex;
  align-items: center;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}
.session-name:hover {
  color: hsl(var(--primary));
}

.session-name-input {
  font-size: 14px;
  font-weight: 600;
  border: 1px solid hsl(var(--primary));
  border-radius: 6px;
  padding: 2px 8px;
  outline: none;
  background: hsl(var(--background));
  width: 300px;
}

.session-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.session-asins {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.session-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

/* ─── Detail Table ────────────────────────────────────────── */
.detail-table-wrap {
  flex: 1;
  overflow: auto;
  background: hsl(var(--card));
  border-radius: 10px;
  border: 1px solid hsl(var(--border));
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.detail-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
  background: hsl(var(--muted));
}

.detail-table th {
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: hsl(var(--muted-foreground));
  border-bottom: 1px solid hsl(var(--border));
  white-space: nowrap;
}

.detail-table td {
  padding: 8px 10px;
  border-bottom: 1px solid hsl(var(--border) / 0.5);
  vertical-align: middle;
}

.detail-table tbody tr:hover {
  background: hsl(var(--muted) / 0.3);
}

.selected-row {
  background: hsl(var(--primary) / 0.06) !important;
}

.checkbox-col {
  width: 36px;
  text-align: center;
  padding: 0 8px !important;
}

.product-checkbox {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: hsl(var(--primary));
}

.editable-cell-wrap {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  min-height: 24px;
  display: flex;
  align-items: center;
}
.editable-cell-wrap:hover {
  background: hsl(var(--muted) / 0.5);
}

.detail-edit-input {
  font-size: 12px;
  border: 1px solid hsl(var(--primary));
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  background: hsl(var(--background));
  width: 100%;
}

/* ─── Delete Dialog ──────────────────────────────────────── */
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.dialog-box {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  padding: 24px;
  min-width: 360px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
</style>
