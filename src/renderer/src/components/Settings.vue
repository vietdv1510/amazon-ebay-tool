<template>
  <div class="h-full w-full overflow-y-auto p-8 bg-background text-foreground">
    <div class="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 class="text-3xl font-bold tracking-tight">Cài đặt</h2>
        <p class="text-muted-foreground mt-2">Cấu hình Crawler, API và các thiết lập mặc định cho ứng dụng.</p>
      </div>

      <Separator />

      <div class="grid gap-8">
        <!-- Section: Giá bán -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground">
            <DollarSign class="w-4 h-4" />
            <span>Giá bán</span>
          </div>
          <div class="grid grid-cols-2 gap-6">
            <div class="space-y-2">
              <Label>Nhân giá (Price Multiplier)</Label>
              <Input type="number" step="0.1" min="1" v-model.number="form.priceMultiplier" />
              <p class="text-[0.8rem] text-muted-foreground">Giá Amazon × {{ form.priceMultiplier }} = Giá eBay</p>
            </div>
            <div class="space-y-2">
              <Label>Số lượng mặc định (Quantity)</Label>
              <Input type="number" min="1" v-model.number="form.defaultQuantity" />
            </div>
          </div>
        </div>

        <Separator />

        <!-- Section: Crawler -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground">
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
              <p class="text-[0.8rem] text-muted-foreground">Khi bật, Playwright chạy ẩn — không mở cửa sổ Chrome. Khuyên dùng để tăng hiệu suất.</p>
            </div>
            <Switch :checked="form.headlessMode" @update:checked="form.headlessMode = $event" />
          </div>
        </div>

        <Separator />

        <!-- Section: eBay -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground">
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
              <Input type="password" placeholder="eBay Cert ID..." v-model="form.ebayClientSecret" />
            </div>
          </div>
          <div class="flex items-center justify-between space-x-2 pt-2">
            <div class="flex flex-col space-y-1">
              <Label>Dùng eBay AI Category Mapping</Label>
              <p class="text-[0.8rem] text-muted-foreground">Tự động gợi ý category bằng eBay Taxonomy API khi có token hợp lệ.</p>
            </div>
            <Switch :checked="form.useEbayAI" @update:checked="form.useEbayAI = $event" />
          </div>
        </div>

        <Separator />

        <!-- Section: Gemini AI -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground">
            <Sparkles class="w-4 h-4" />
            <span>Gemini AI (Tùy chọn)</span>
          </div>
          <div class="flex items-center justify-between space-x-2">
            <div class="flex flex-col space-y-1">
              <Label>Bật tối ưu nội dung bằng Gemini</Label>
              <p class="text-[0.8rem] text-muted-foreground">Dùng Gemini API để rewrite title/description phù hợp eBay.</p>
            </div>
            <Switch :checked="form.useGemini" @update:checked="form.useGemini = $event" />
          </div>
          <div class="space-y-2 pt-2" v-if="form.useGemini">
            <Label>Gemini API Key</Label>
            <Input type="password" placeholder="AIza..." v-model="form.geminiApiKey" />
          </div>
        </div>

        <Separator />

        <!-- Section: eBay Listing defaults -->
        <div class="space-y-4">
          <div class="flex items-center gap-2 text-sm font-semibold tracking-tight uppercase text-muted-foreground">
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
import { reactive } from 'vue'
import { DollarSign, Bot, ShoppingCart, Sparkles, ClipboardList, Save } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const props = defineProps({
  initialSettings: { type: Object, required: true }
})

const emit = defineEmits(['save'])

const form = reactive({ ...props.initialSettings })

const save = () => {
  emit('save', { ...form })
}
</script>
