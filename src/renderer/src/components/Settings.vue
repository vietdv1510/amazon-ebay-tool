<template>
  <div class="h-full w-full overflow-y-auto p-8 bg-background text-foreground">
    <div class="max-w-4xl mx-auto space-y-8">
      <div class="flex flex-col items-center text-center">
        <h2 class="text-3xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon class="w-8 h-8 text-primary" />
          Cài đặt
        </h2>
        <p class="text-muted-foreground mt-2">
          Cấu hình Crawler, API và các thiết lập mặc định cho ứng dụng.
        </p>
      </div>

      <Separator />

      <div class="grid gap-8">
        <!-- Section: Giá bán -->
        <div class="space-y-4">
          <div
            class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground"
          >
            <DollarSign class="w-4 h-4" />
            <span>Giá bán</span>
          </div>
          <div class="grid grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label>Nhân giá (Price Multiplier)</Label>
              <Input
                type="number"
                step="0.1"
                min="1"
                v-model.number="form.priceMultiplier"
                @input="saveNow"
                @change="save"
              />
              <p class="text-[0.8rem] text-muted-foreground">
                Giá Amazon × {{ form.priceMultiplier }} = Giá eBay
              </p>
            </div>
            <div class="space-y-2">
              <Label>Số lượng mặc định (Quantity)</Label>
              <Input
                type="number"
                min="1"
                v-model.number="form.defaultQuantity"
                @input="saveNow"
                @change="save"
              />
            </div>
          </div>
        </div>

        <Separator />

        <!-- Section: Crawler -->
        <div class="space-y-4">
          <div
            class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground"
          >
            <Bot class="w-4 h-4" />
            <span>Playwright Crawler</span>
          </div>
          <div class="grid grid-cols-3 gap-6">
            <div class="space-y-2">
              <Label>Luồng song song (Threads)</Label>
              <Input type="number" min="1" max="10" v-model.number="form.crawlThreads" />
            </div>
            <div class="space-y-2">
              <Label>Delay (giây)</Label>
              <Input type="number" min="0" step="0.5" v-model.number="form.crawlDelay" />
            </div>
            <div class="space-y-2">
              <Label>Lần retry</Label>
              <Input type="number" min="0" max="10" v-model.number="form.crawlRetry" />
            </div>
          </div>

          <div class="flex items-center justify-between space-x-2 pt-2">
            <div class="flex flex-col space-y-1">
              <Label>Ẩn trình duyệt (Headless Mode)</Label>
              <p class="text-[0.8rem] text-muted-foreground">
                Khi bật, Playwright chạy ẩn — không mở cửa sổ Chrome. Khuyên dùng để tăng hiệu suất.
              </p>
            </div>
            <SwitchRoot
              v-model="form.headlessMode"
              @update:model-value="() => saveNow()"
              :class="cn(
                'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input'
              )"
            >
              <SwitchThumb class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
            </SwitchRoot>
          </div>

          <div class="flex items-center justify-between space-x-2 pt-2">
            <div class="flex flex-col space-y-1">
              <Label>Tự động đổi vùng sang Mỹ (Zip 10001)</Label>
              <p class="text-[0.8rem] text-muted-foreground">
                Tự động thiết lập địa chỉ giao hàng tại Mỹ để lấy được giá chuẩn nhất (tránh bị lệch
                giá khi ở Việt Nam).
              </p>
            </div>
            <SwitchRoot
              v-model="form.forceUSLocation"
              @update:model-value="() => saveNow()"
              :class="cn(
                'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input'
              )"
            >
              <SwitchThumb class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
            </SwitchRoot>
          </div>
        </div>

        <Separator />

        <!-- Section: eBay -->
        <div class="space-y-4">
          <div
            class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground"
          >
            <ShoppingCart class="w-4 h-4" />
            <span>eBay API</span>
          </div>
          <div class="grid gap-6">
            <div class="space-y-2">
              <Label>Môi trường</Label>
              <Select v-model="form.ebayEnv">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox (Test)</SelectItem>
                  <SelectItem value="production">Production</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label>Client ID (App ID)</Label>
              <Input type="text" placeholder="eBay App ID..." v-model="form.ebayClientId" />
            </div>
            <div class="space-y-2">
              <Label>Client Secret (Cert ID)</Label>
              <Input
                type="password"
                placeholder="eBay Cert ID..."
                v-model="form.ebayClientSecret"
              />
            </div>
          </div>
          <div class="flex items-center justify-between space-x-2 pt-2">
            <div class="flex flex-col space-y-1">
              <Label>Dùng eBay AI Category Mapping</Label>
              <p class="text-[0.8rem] text-muted-foreground">
                Tự động gợi ý category bằng eBay Taxonomy API khi có token hợp lệ.
              </p>
            </div>
            <SwitchRoot
              v-model="form.useEbayAI"
              @update:model-value="() => saveNow()"
              :class="cn(
                'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input'
              )"
            >
              <SwitchThumb class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
            </SwitchRoot>
          </div>

          <!-- eBay Data Sync -->
          <div class="pt-4 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex flex-col space-y-1">
                <Label class="flex items-center gap-2">
                  <Database class="w-4 h-4" />
                  Đồng bộ dữ liệu eBay (Offline Cache)
                </Label>
                <p class="text-[0.8rem] text-muted-foreground">
                  Tải toàn bộ Category + Item Specifics về máy. Chỉ cần chạy 1 lần.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                @click="startSync"
                :disabled="syncing"
                class="min-w-[120px]"
              >
                <RefreshCw class="w-4 h-4 mr-2" :class="{ 'animate-spin': syncing }" />
                {{ syncing ? 'Đang sync...' : 'Sync ngay' }}
              </Button>
            </div>

            <!-- Progress bar -->
            <div v-if="syncing" class="space-y-1">
              <div class="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  class="h-full bg-primary rounded-full transition-all duration-300"
                  :style="{ width: syncProgress.percent + '%' }"
                />
              </div>
              <p class="text-xs text-muted-foreground">{{ syncProgress.message }}</p>
            </div>

            <!-- Sync status -->
            <div
              v-if="syncStatus"
              class="text-xs text-muted-foreground space-y-0.5 p-3 rounded-md bg-muted/50"
            >
              <p>
                📂 Categories:
                <span class="font-mono text-foreground">{{
                  syncStatus.categoryCount?.toLocaleString() || 0
                }}</span>
              </p>
              <p>
                📋 Aspects (categories):
                <span class="font-mono text-foreground">{{
                  syncStatus.aspectCategoryCount?.toLocaleString() || 0
                }}</span>
              </p>
              <p v-if="syncStatus.lastSyncTime">
                🕐 Lần sync cuối:
                <span class="font-mono text-foreground">{{
                  formatSyncTime(syncStatus.lastSyncTime)
                }}</span>
              </p>
              <p v-else class="text-amber-600">⚠ Chưa đồng bộ lần nào</p>
            </div>
          </div>
        </div>

        <Separator />

        <!-- Section: Gemini AI -->
        <div class="space-y-4">
          <div
            class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground"
          >
            <Sparkles class="w-4 h-4" />
            <span>Gemini AI (Tùy chọn)</span>
          </div>
          <div class="flex items-center justify-between space-x-2">
            <div class="flex flex-col space-y-1">
              <Label>Bật tối ưu nội dung bằng Gemini</Label>
              <p class="text-[0.8rem] text-muted-foreground">
                Dùng Gemini API để rewrite title/description phù hợp eBay.
              </p>
            </div>
            <SwitchRoot
              v-model="form.useGemini"
              @update:model-value="() => saveNow()"
              :class="cn(
                'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input'
              )"
            >
              <SwitchThumb class="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
            </SwitchRoot>
          </div>
          <div class="space-y-2 pt-2" v-if="form.useGemini">
            <Label>Gemini API Key</Label>
            <Input type="password" placeholder="AIza..." v-model="form.geminiApiKey" />
          </div>
        </div>

        <Separator />

        <!-- Section: eBay Listing defaults -->
        <div class="space-y-4">
          <div
            class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground"
          >
            <ClipboardList class="w-4 h-4" />
            <span>Mặc định Listing</span>
          </div>
          <div class="grid grid-cols-3 gap-6">
            <div class="space-y-2">
              <Label>Condition</Label>
              <Select v-model="form.defaultCondition">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1000">New (1000)</SelectItem>
                  <SelectItem value="1500">New other (1500)</SelectItem>
                  <SelectItem value="2000">Manufacturer refurbished (2000)</SelectItem>
                  <SelectItem value="2500">Seller refurbished (2500)</SelectItem>
                  <SelectItem value="3000">Used (3000)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label>Format</Label>
              <Select v-model="form.defaultFormat">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FixedPrice">Fixed Price</SelectItem>
                  <SelectItem value="Auction">Auction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label>Duration</Label>
              <Select v-model="form.defaultDuration">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="GTC">Good Till Cancelled</SelectItem>
                  <SelectItem value="Days_7">7 ngày</SelectItem>
                  <SelectItem value="Days_30">30 ngày</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-6 mt-4">
            <div class="space-y-2">
              <Label>Location (*Location)</Label>
              <Input type="text" placeholder="Ví dụ: US WAREHOUSE" v-model="form.defaultLocation" />
              <p class="text-[0.8rem] text-muted-foreground">
                Địa điểm kho hàng xuất hiện trong listing
              </p>
            </div>
            <div class="space-y-2">
              <Label>Shipping Profile Name</Label>
              <Input type="text" placeholder="Ví dụ: Shipping" v-model="form.shippingProfileName" />
              <p class="text-[0.8rem] text-muted-foreground">
                Tên Business Policy vận chuyển trên eBay
              </p>
            </div>
            <div class="space-y-2">
              <Label>Return Profile Name</Label>
              <Input type="text" placeholder="Ví dụ: Return" v-model="form.returnProfileName" />
              <p class="text-[0.8rem] text-muted-foreground">
                Tên Business Policy đổi trả trên eBay
              </p>
            </div>
            <div class="space-y-2">
              <Label>Payment Profile Name</Label>
              <Input type="text" placeholder="Ví dụ: Payment" v-model="form.paymentProfileName" />
              <p class="text-[0.8rem] text-muted-foreground">
                Tên Business Policy thanh toán trên eBay
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-end pt-6 pb-12">
        <Button @click="save" class="min-w-[150px]">
          <Save class="w-4 h-4 mr-2" />
          Lưu cài đặt
        </Button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, onUnmounted, watch, nextTick, toRaw } from 'vue'
import {
  DollarSign,
  Bot,
  ShoppingCart,
  Sparkles,
  ClipboardList,
  Save,
  Database,
  RefreshCw,
  Settings as SettingsIcon
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'vue-sonner'
import { Label } from '@/components/ui/label'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/utils'

const props = defineProps({
  initialSettings: { type: Object, required: true }
})

const emit = defineEmits(['save'])

// Robust coercion: ensure specific keys have correct defaults if missing
const coerceSettings = (raw) => {
  const result = { ...raw }
  if (result.headlessMode === undefined) result.headlessMode = true
  if (result.useEbayAI === undefined) result.useEbayAI = true
  if (result.forceUSLocation === undefined) result.forceUSLocation = true
  if (result.useGemini === undefined) result.useGemini = false
  return result
}

const form = reactive(coerceSettings(props.initialSettings))

watch(
  () => props.initialSettings,
  (newVal) => {
    if (newVal) {
      console.log('[Settings] External sync')
      Object.assign(form, coerceSettings(newVal))
    }
  },
  { deep: true }
)

const saveNow = () => {
  const data = toRaw(form)
  console.log('[Settings] Auto-saving...')
  emit('save', JSON.parse(JSON.stringify(data))) // Deep clone to be safe
}

const save = () => {
  saveNow()
  toast.success('Lưu cài đặt thành công!')
}

// ─── eBay Sync ─────────────────────────────────────────────────────────────────
const syncing = ref(false)
const syncProgress = ref({ step: '', message: '', percent: 0 })
const syncStatus = ref(null)

let cleanupProgress = null

onMounted(async () => {
  // Load sync status
  try {
    const res = await window.api.ebay.getSyncStatus()
    if (res.ok) syncStatus.value = res.data
  } catch (e) {
    console.warn('Failed to load sync status:', e)
  }

  // Listen for progress events
  cleanupProgress = window.api.ebay.onSyncProgress((progress) => {
    syncProgress.value = progress
  })
})

onUnmounted(() => {
  if (cleanupProgress) cleanupProgress()
})

const startSync = async () => {
  syncing.value = true
  syncProgress.value = { step: '', message: 'Bắt đầu đồng bộ...', percent: 0 }

  try {
    const result = await window.api.ebay.syncData()
    if (result.ok) {
      syncProgress.value = { step: 'done', message: '✓ Đồng bộ thành công!', percent: 100 }
      // Refresh status
      const res = await window.api.ebay.getSyncStatus()
      if (res.ok) syncStatus.value = res.data
    } else {
      syncProgress.value = { step: 'error', message: '✗ Lỗi: ' + result.error, percent: 0 }
    }
  } catch (e) {
    syncProgress.value = { step: 'error', message: '✗ Lỗi: ' + e.message, percent: 0 }
  } finally {
    setTimeout(() => {
      syncing.value = false
    }, 2000)
  }
}

const formatSyncTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return (
    d.toLocaleDateString('vi-VN') +
    ' ' +
    d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  )
}
</script>
