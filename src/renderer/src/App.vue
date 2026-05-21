<template>
  <div class="app-root" :class="`platform-${platform}`">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <!-- macOS traffic light spacer / Windows title bar area -->
      <div
        v-if="platform === 'darwin'"
        class="traffic-light-spacer"
        style="-webkit-app-region: drag"
      ></div>

      <!-- Logo + Toggle row -->
      <div class="sidebar-logo-row" :class="{ 'justify-center px-0': sidebarCollapsed }">
        <div class="logo-icon flex-shrink-0" :class="{ 'mx-auto': sidebarCollapsed }">
          <img src="./assets/logo.png" class="w-7 h-7 object-contain" alt="Logo" />
        </div>
        <div v-if="!sidebarCollapsed" class="logo-text-wrap flex-1 min-w-0">
          <div class="logo-text font-bold tracking-tight">eBay Engine</div>
        </div>
      </div>

      <nav class="sidebar-nav flex flex-col gap-1 p-2">
        <div
          v-if="!sidebarCollapsed"
          class="nav-label text-xs font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider"
        >
          Tools
        </div>

        <Button
          :variant="currentPage === 'queue' ? 'secondary' : 'ghost'"
          class="w-full nav-btn"
          :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
          @click="currentPage = 'queue'"
          :title="sidebarCollapsed ? 'Amazon Crawler' : ''"
        >
          <ListOrdered class="w-4 h-4 flex-shrink-0" :class="{ 'mr-2': !sidebarCollapsed }" />
          <span v-if="!sidebarCollapsed">Amazon Crawler</span>
          <Badge
            v-if="crawlerBadge > 0 && !sidebarCollapsed"
            variant="outline"
            class="ml-auto bg-background/50 border-border/50 text-[10px] px-1.5 h-4"
            >{{ crawlerBadge }}</Badge
          >
        </Button>

        <Button
          :variant="currentPage === 'workspace' ? 'secondary' : 'ghost'"
          class="w-full nav-btn"
          :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
          @click="currentPage = 'workspace'"
          :title="sidebarCollapsed ? 'Data Processing' : ''"
        >
          <LayoutDashboard class="w-4 h-4 flex-shrink-0" :class="{ 'mr-2': !sidebarCollapsed }" />
          <span v-if="!sidebarCollapsed">Data Processing</span>
          <Badge
            v-if="workspaceBadge > 0 && !sidebarCollapsed"
            variant="outline"
            class="ml-auto bg-background/50 border-border/50 text-[10px] px-1.5 h-4"
            >{{ workspaceBadge }}</Badge
          >
        </Button>

        <Button
          :variant="currentPage === 'preview' ? 'secondary' : 'ghost'"
          class="w-full nav-btn"
          :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
          @click="currentPage = 'preview'"
          :title="sidebarCollapsed ? 'Export Preview' : ''"
        >
          <FileSpreadsheet class="w-4 h-4 flex-shrink-0" :class="{ 'mr-2': !sidebarCollapsed }" />
          <span v-if="!sidebarCollapsed">Export Preview</span>
        </Button>

        <Button
          :variant="currentPage === 'history' ? 'secondary' : 'ghost'"
          class="w-full nav-btn"
          :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
          @click="currentPage = 'history'"
          :title="sidebarCollapsed ? 'Crawl History' : ''"
        >
          <HistoryIcon class="w-4 h-4 flex-shrink-0" :class="{ 'mr-2': !sidebarCollapsed }" />
          <span v-if="!sidebarCollapsed">Lịch sử Crawl</span>
        </Button>

        <div
          v-if="!sidebarCollapsed"
          class="nav-label text-xs font-semibold text-muted-foreground px-2 py-1 mt-4 uppercase tracking-wider"
        >
          Settings
        </div>
        <div v-else class="sidebar-divider my-2"></div>

        <Button
          :variant="currentPage === 'settings' ? 'secondary' : 'ghost'"
          class="w-full nav-btn"
          :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
          @click="currentPage = 'settings'"
          :title="sidebarCollapsed ? 'Settings' : ''"
        >
          <SettingsIcon class="w-4 h-4 flex-shrink-0" :class="{ 'mr-2': !sidebarCollapsed }" />
          <span v-if="!sidebarCollapsed">Settings</span>
        </Button>
      </nav>

      <div
        class="sidebar-footer flex flex-col gap-2 border-t border-border/40"
        :class="{ 'p-2': sidebarCollapsed, 'px-3 py-3': !sidebarCollapsed }"
      >
        <button
          class="w-full flex items-center justify-center p-1.5 rounded-md hover:bg-muted/40 transition-all text-muted-foreground/60 hover:text-muted-foreground border border-transparent hover:border-border/30 group"
          @click="sidebarCollapsed = !sidebarCollapsed"
          :title="sidebarCollapsed ? 'Expand menu' : 'Collapse menu'"
        >
          <ChevronLeft
            v-if="!sidebarCollapsed"
            class="w-3.5 h-3.5 opacity-50 group-hover:opacity-100"
          />
          <ChevronRight v-else class="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
          <span
            v-if="!sidebarCollapsed"
            class="ml-2 text-[11px] font-medium opacity-50 group-hover:opacity-100"
            >Collapse</span
          >
        </button>
      </div>
    </aside>

    <!-- Main area -->
    <div class="main-area">
      <Workspace
        v-if="currentPage === 'workspace'"
        :settings="settings"
        @stats-update="handleStatsUpdate"
      />
      <!-- KeepAlive: ExportPreview stays alive to avoid re-fetching category aspects on tab switch -->
      <KeepAlive>
        <ExportPreview v-if="currentPage === 'preview'" :settings="settings" />
      </KeepAlive>
      <!-- KeepAlive: Queue stays alive to preserve IPC listener + crawl state -->
      <KeepAlive>
        <Queue
          v-if="currentPage === 'queue'"
          :settings="settings"
          @stats-update="handleStatsUpdate"
        />
      </KeepAlive>
      <Settings
        v-if="currentPage === 'settings'"
        :initial-settings="settings"
        @save="handleSettingsSave"
      />
      <KeepAlive>
        <CrawlHistory v-if="currentPage === 'history'" @navigate="(p) => (currentPage = p)" />
      </KeepAlive>
    </div>
    <Toaster position="bottom-right" richColors />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import Workspace from './components/Workspace.vue'
import ExportPreview from './components/ExportPreview.vue'
import Queue from './components/Queue.vue'
import Settings from './components/Settings.vue'
import CrawlHistory from './components/CrawlHistory.vue'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  ListOrdered,
  Settings as SettingsIcon,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  History as HistoryIcon
} from 'lucide-vue-next'
import { globalRowData as rowData } from './store'

const currentPage = ref('queue')
const sidebarCollapsed = ref(false)
const platform = ref(window.electron?.process?.platform || 'win32')

const stats = ref({ total: 0, pending: 0, done: 0, error: 0 })

// ── Badges computed trực tiếp từ store (không phụ thuộc vào tab đang active) ──
// Amazon Crawler: số item chưa xử lý xong (PENDING + ERROR)
const crawlerBadge = computed(
  () => rowData.value.filter((r) => r.status === 'PENDING' || r.status === 'ERROR').length
)
// Data Processing: tổng sản phẩm đã crawl xong
const workspaceBadge = computed(() => rowData.value.filter((r) => r.status === 'DONE').length)

const settings = ref({
  priceMultiplier: 1.5,
  defaultCondition: '1000',
  defaultFormat: 'FixedPrice',
  defaultDuration: 'GTC',
  defaultQuantity: 10,
  defaultLocation: 'US WAREHOUSE',
  shippingProfileName: 'Shipping',
  returnProfileName: 'Return',
  paymentProfileName: 'Payment',
  crawlThreads: 2,
  crawlDelay: 2,
  crawlRetry: 3,
  headlessMode: true,
  ebayEnv: 'sandbox',
  ebayClientId: '',
  ebayClientSecret: '',
  geminiApiKey: '',
  useGemini: false,
  useEbayAI: true,
  forceUSLocation: true
})

onMounted(async () => {
  try {
    console.log('[App] Calling window.api.settings.load()...')
    const saved = await window.api.settings.load()
    console.log('[App] Received from main:', JSON.stringify(saved, null, 2))
    if (saved && Object.keys(saved).length > 0) {
      settings.value = { ...settings.value, ...saved }
      console.log('[App] State updated with:', JSON.stringify(settings.value, null, 2))
    } else {
      console.log('[App] Using default settings')
    }
  } catch (e) {
    console.error('[App] Load settings failed:', e)
  }
})

const handleSettingsSave = async (newSettings) => {
  try {
    console.log('[App] Saving settings:', JSON.stringify(newSettings, null, 2))
    settings.value = newSettings
    const result = await window.api.settings.save(newSettings)
    console.log('[App] Save result:', result)
  } catch (e) {
    console.error('[App] Save settings failed:', e)
  }
}

const handleStatsUpdate = (s) => {
  stats.value = s
}
</script>

<style>
/* ─── Sidebar collapsible ───────────────────────────────────── */
.sidebar {
  transition: width 0.2s ease;
}

.sidebar-collapsed {
  width: 68px !important;
}

/* Spacer for system title bars (macOS traffic lights) */
.traffic-light-spacer {
  height: 38px; /* Standard height for hiddenInset buttons */
  width: 100%;
  flex-shrink: 0;
  display: block;
}

/* Logo row — sits BELOW traffic lights */
.sidebar-logo-row {
  height: 44px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid var(--border);
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-toggle {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s;
  margin-left: auto;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.sidebar-toggle:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-collapsed .sidebar-logo-row {
  justify-content: center;
  padding: 0;
  gap: 0;
}

.nav-btn {
  transition: all 0.15s;
}

.sidebar-divider {
  height: 1px;
  background: var(--border);
  margin: 0 8px;
}
</style>
