<template>
  <div class="app-root">
    <!-- Sidebar -->
    <aside class="sidebar" :class="{ 'sidebar-collapsed': sidebarCollapsed }">
      <!-- macOS traffic light spacer / Windows title bar area -->
      <div v-if="platform === 'darwin'" class="traffic-light-spacer" style="-webkit-app-region: drag;"></div>

      <!-- Logo + Toggle row -->
      <div class="sidebar-logo-row" :class="{ 'justify-center px-0': sidebarCollapsed }">
        <div class="logo-icon flex-shrink-0" :class="{ 'mx-auto': sidebarCollapsed }">
          <img src="./assets/logo.png" class="w-6 h-6 object-contain" alt="Logo" />
        </div>
        <div v-if="!sidebarCollapsed" class="logo-text-wrap flex-1 min-w-0">
          <div class="logo-text">eBay Engine</div>
        </div>
      </div>

      <nav class="sidebar-nav flex flex-col gap-1 p-2">
        <div v-if="!sidebarCollapsed" class="nav-label text-xs font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">Công cụ</div>

        <Button
          :variant="currentPage === 'queue' ? 'secondary' : 'ghost'"
          class="w-full nav-btn"
          :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
          @click="currentPage = 'queue'"
          :title="sidebarCollapsed ? 'Amazon Crawler' : ''"
        >
          <ListOrdered class="w-4 h-4 flex-shrink-0" :class="{ 'mr-2': !sidebarCollapsed }" />
          <span v-if="!sidebarCollapsed">Amazon Crawler</span>
          <Badge v-if="stats.pending > 0 && !sidebarCollapsed" variant="outline" class="ml-auto bg-background/50 border-border/50 text-[10px] px-1.5 h-4">{{ stats.pending }}</Badge>
        </Button>

        <Button
          :variant="currentPage === 'workspace' ? 'secondary' : 'ghost'"
          class="w-full nav-btn"
          :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
          @click="currentPage = 'workspace'"
          :title="sidebarCollapsed ? 'Xử lý & Export' : ''"
        >
          <LayoutDashboard class="w-4 h-4 flex-shrink-0" :class="{ 'mr-2': !sidebarCollapsed }" />
          <span v-if="!sidebarCollapsed">Xử lý & Export</span>
          <Badge v-if="stats.total > 0 && !sidebarCollapsed" variant="outline" class="ml-auto bg-background/50 border-border/50 text-[10px] px-1.5 h-4">{{ stats.total }}</Badge>
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

        <div v-if="!sidebarCollapsed" class="nav-label text-xs font-semibold text-muted-foreground px-2 py-1 mt-4 uppercase tracking-wider">Cài đặt</div>
        <div v-else class="sidebar-divider my-2"></div>

        <Button
          :variant="currentPage === 'settings' ? 'secondary' : 'ghost'"
          class="w-full nav-btn"
          :class="sidebarCollapsed ? 'justify-center px-0' : 'justify-start'"
          @click="currentPage = 'settings'"
          :title="sidebarCollapsed ? 'Cài đặt' : ''"
        >
          <SettingsIcon class="w-4 h-4 flex-shrink-0" :class="{ 'mr-2': !sidebarCollapsed }" />
          <span v-if="!sidebarCollapsed">Cài đặt</span>
        </Button>
      </nav>

      <div class="sidebar-footer" :class="{'p-2': sidebarCollapsed, 'px-4 py-3': !sidebarCollapsed}">
        <button 
          class="w-full flex items-center justify-center p-1.5 rounded-md hover:bg-muted/40 transition-all text-muted-foreground/60 hover:text-muted-foreground border border-transparent hover:border-border/30 group" 
          @click="sidebarCollapsed = !sidebarCollapsed" 
          :title="sidebarCollapsed ? 'Mở menu' : 'Thu menu'"
        >
          <ChevronLeft v-if="!sidebarCollapsed" class="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
          <ChevronRight v-else class="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />
          <span v-if="!sidebarCollapsed" class="ml-2 text-[11px] font-medium opacity-50 group-hover:opacity-100">Thu nhỏ</span>
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
      <ExportPreview
        v-else-if="currentPage === 'preview'"
        :settings="settings"
      />
      <Queue
        v-else-if="currentPage === 'queue'"
        :settings="settings"
        @stats-update="handleStatsUpdate"
      />
      <Settings
        v-else-if="currentPage === 'settings'"
        :initial-settings="settings"
        @save="handleSettingsSave"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import Workspace from './components/Workspace.vue'
import ExportPreview from './components/ExportPreview.vue'
import Queue from './components/Queue.vue'
import Settings from './components/Settings.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard, ListOrdered,
  Settings as SettingsIcon, FileSpreadsheet,
  ChevronLeft, ChevronRight
} from 'lucide-vue-next'

const currentPage = ref('queue')
const sidebarCollapsed = ref(false)
const platform = ref(window.electron?.process?.platform || 'win32')

const stats = ref({ total: 0, pending: 0, done: 0, error: 0 })

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
  crawlThreads: 3,
  crawlDelay: 2,
  crawlRetry: 3,
  headlessMode: true,
  ebayEnv: 'sandbox',
  ebayClientId: '',
  ebayClientSecret: '',
  geminiApiKey: '',
  useGemini: false,
  useEbayAI: true
})

onMounted(async () => {
  try {
    const saved = await window.api.settings.load()
    if (saved) settings.value = { ...settings.value, ...saved }
  } catch (e) {
    console.error('Load settings failed:', e)
  }
})

const handleSettingsSave = async (newSettings) => {
  settings.value = newSettings
  await window.api.settings.save(newSettings)
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
