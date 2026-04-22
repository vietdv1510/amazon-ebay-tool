<template>
  <div class="app-root">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-logo">
        <div class="logo-icon"><ShoppingCart class="w-8 h-8 text-primary" /></div>
        <div class="logo-text-wrap">
          <div class="logo-text">CrossList</div>
          <div class="logo-sub">Amazon → eBay</div>
        </div>
      </div>

      <nav class="sidebar-nav flex flex-col gap-1 p-2">
        <div class="nav-label text-xs font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">Công cụ</div>
        <Button 
          variant="ghost" 
          :class="['w-full justify-start', currentPage === 'workspace' ? 'bg-secondary' : '']" 
          @click="currentPage = 'workspace'"
        >
          <LayoutDashboard class="w-4 h-4 mr-2" />
          Workspace
          <Badge v-if="stats.total > 0" variant="secondary" class="ml-auto">{{ stats.total }}</Badge>
        </Button>
        <Button 
          variant="ghost" 
          :class="['w-full justify-start', currentPage === 'queue' ? 'bg-secondary' : '']" 
          @click="currentPage = 'queue'"
        >
          <ListOrdered class="w-4 h-4 mr-2" />
          Hàng đợi
          <Badge v-if="stats.pending > 0" variant="secondary" class="ml-auto">{{ stats.pending }}</Badge>
        </Button>

        <div class="nav-label text-xs font-semibold text-muted-foreground px-2 py-1 mt-4 uppercase tracking-wider">Cài đặt</div>
        <Button 
          variant="ghost" 
          :class="['w-full justify-start', currentPage === 'settings' ? 'bg-secondary' : '']" 
          @click="currentPage = 'settings'"
        >
          <SettingsIcon class="w-4 h-4 mr-2" />
          Cài đặt
        </Button>
      </nav>

      <div class="sidebar-footer">
        <div style="font-size:10px; color: var(--text-muted); text-align:center;">v1.0.0 · Playwright Engine</div>
      </div>
    </aside>

    <!-- Main area -->
    <div class="main-area">
      <Workspace
        v-if="currentPage === 'workspace' || currentPage === 'queue'"
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
import Settings from './components/Settings.vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ShoppingCart, LayoutDashboard, ListOrdered, Settings as SettingsIcon } from 'lucide-vue-next'

const currentPage = ref('workspace')
const stats = ref({ total: 0, pending: 0, done: 0, error: 0 })

const settings = ref({
  priceMultiplier: 1.5,
  defaultCondition: '1000',
  defaultFormat: 'FixedPrice',
  defaultDuration: 'GTC',
  defaultQuantity: 10,
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
/* Reset App.vue layout — use main.css classes */
</style>
