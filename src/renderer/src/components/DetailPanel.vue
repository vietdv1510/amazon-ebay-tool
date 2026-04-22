<template>
  <div class="panel-root">
    <!-- Panel Header -->
    <div class="panel-header">
      <span class="panel-title">Chi tiết sản phẩm</span>
      <Button variant="ghost" size="icon" class="h-6 w-6" @click="$emit('close')">
        <X class="w-4 h-4" />
      </Button>
    </div>

    <div class="panel-body">
      <!-- Image Gallery -->
      <div class="image-gallery" v-if="form.images && form.images.length > 0">
        <img :src="form.images[activeImg]" class="gallery-main" :alt="form.title" />
        <div class="gallery-thumbs" v-if="form.images.length > 1">
          <img
            v-for="(img, i) in form.images.slice(0, 6)"
            :key="i"
            :src="img"
            class="gallery-thumb"
            :class="{ active: i === activeImg }"
            @click="activeImg = i"
          />
        </div>
      </div>
      <div v-else class="image-placeholder text-muted-foreground"><Image class="w-6 h-6 mr-2" /> Không có ảnh</div>

      <div class="divider"></div>

      <!-- ASIN + Status -->
      <div class="meta-row">
        <span class="tag">{{ form.asin }}</span>
        <span :class="['badge', statusBadgeClass]">{{ form.status }}</span>
      </div>

      <!-- Title -->
      <div class="form-group" style="margin-top:12px">
        <Label>Tiêu đề (eBay Title)</Label>
        <Textarea v-model="form.title" rows="3"
          :class="{ 'border-destructive': form.title?.length > 80 }" class="mt-1" />
        <span class="form-hint" :class="{ 'text-destructive': form.title?.length > 80 }">
          {{ form.title?.length || 0 }}/80 ký tự
        </span>
      </div>

      <!-- Brand + Price -->
      <div class="two-col" style="margin-top:10px">
        <div class="form-group">
          <Label>Thương hiệu</Label>
          <Input v-model="form.brand" class="mt-1" />
        </div>
        <div class="form-group">
          <Label>Giá eBay ($)</Label>
          <Input type="number" step="0.01" v-model.number="form.sellPrice" class="mt-1 text-green-600 font-semibold" />
        </div>
      </div>

      <!-- eBay Category -->
      <div class="form-group" style="margin-top:10px">
        <Label>eBay Category ID</Label>
        <Input v-model="form.ebayCategory" placeholder="e.g. 58058" class="mt-1" />
      </div>

      <div class="divider"></div>

      <!-- Variations -->
      <div class="section-title flex items-center mt-4"><Palette class="w-4 h-4 mr-2" /> Biến thể ({{ form.variations?.length || 0 }} SKUs)</div>
      <div v-if="form.variations && form.variations.length > 0" class="variations-table">
        <div class="var-header">
          <span>Thuộc tính</span>
          <span>Giá</span>
          <span>Số lượng</span>
          <span></span>
        </div>
        <div
          v-for="(v, i) in form.variations"
          :key="i"
          class="var-row"
        >
          <span class="var-attrs">
            <span v-for="(val, key) in v.attributes" :key="key" class="tag" style="margin-right:4px; font-size:10px">
              {{ key }}: {{ val }}
            </span>
          </span>
          <Input class="h-8 w-[70px] text-xs px-2" type="number" step="0.01" v-model.number="v.price" :placeholder="form.sellPrice" />
          <Input class="h-8 w-[60px] text-xs px-2" type="number" v-model.number="v.quantity" placeholder="10" />
          <Button variant="ghost" size="icon" class="h-8 w-8 text-muted-foreground" @click="removeVariation(i)">
            <X class="w-4 h-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" class="w-full mt-2" @click="addVariation"><Plus class="w-4 h-4 mr-1" /> Thêm biến thể</Button>
      </div>
      <div v-else class="var-empty">
        <p>Sản phẩm đơn (không có biến thể).</p>
        <Button variant="outline" size="sm" class="mt-2" @click="addVariation"><Plus class="w-4 h-4 mr-1" /> Thêm biến thể</Button>
      </div>

      <div class="divider"></div>

      <!-- Specs -->
      <div v-if="Object.keys(form.specs || {}).length > 0">
        <div class="section-title flex items-center mt-4"><ClipboardList class="w-4 h-4 mr-2" /> Thông số kỹ thuật (Amazon)</div>
        <div class="specs-table">
          <div v-for="(val, key) in form.specs" :key="key" class="spec-row">
            <span class="spec-key">{{ key }}</span>
            <span class="spec-val">{{ val }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Panel Footer -->
    <div class="panel-footer bg-background">
      <Button variant="ghost" size="sm" @click="$emit('close')">Đóng</Button>
      <Button size="sm" @click="save"><Save class="w-4 h-4 mr-2" /> Lưu thay đổi</Button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { X, Image, Palette, Plus, ClipboardList, Save } from 'lucide-vue-next'

const props = defineProps({
  row: { type: Object, required: true },
  settings: { type: Object, required: true }
})
const emit = defineEmits(['close', 'update'])

const form = reactive({ ...props.row, variations: props.row.variations ? props.row.variations.map(v => ({ ...v })) : [] })
const activeImg = ref(0)

const statusBadgeClass = computed(() => ({
  PENDING: 'badge-warning',
  CRAWLING: 'badge-crawling',
  DONE: 'badge-done',
  ERROR: 'badge-error',
}[form.status] || ''))

const addVariation = () => {
  form.variations.push({ attributes: { 'Size': '', 'Color': '' }, price: form.sellPrice, quantity: props.settings.defaultQuantity || 10, image: '' })
}

const removeVariation = (i) => {
  form.variations.splice(i, 1)
}

const save = () => {
  emit('update', { ...form })
}
</script>

<style scoped>
.panel-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
}

.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.panel-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}

.panel-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

/* Gallery */
.image-gallery { display: flex; flex-direction: column; gap: 8px; }
.gallery-main {
  width: 100%; height: 180px;
  object-fit: contain;
  background: var(--bg-card);
  border-radius: 8px;
  border: 1px solid var(--border);
}
.gallery-thumbs { display: flex; gap: 6px; flex-wrap: wrap; }
.gallery-thumb {
  width: 44px; height: 44px;
  object-fit: cover;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  background: var(--bg-card);
}
.gallery-thumb.active { border-color: var(--accent); }

.image-placeholder {
  width: 100%; height: 100px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 24px;
  color: var(--text-muted);
}

.meta-row { display: flex; align-items: center; gap: 8px; }
.form-hint { font-size: 10px; color: var(--text-muted); }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.section-title { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }

/* Variations */
.var-header, .var-row {
  display: grid;
  grid-template-columns: 1fr 70px 60px 28px;
  gap: 6px;
  align-items: center;
  padding: 4px 0;
}
.var-header { font-size: 10px; color: var(--text-muted); text-transform: uppercase; border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 4px; }
.var-row { border-bottom: 1px solid rgba(255,255,255,0.04); }
.var-attrs { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; }
.var-empty { font-size: 12px; color: var(--text-muted); }
.variations-table { margin-top: 8px; }

/* Specs */
.specs-table { display: flex; flex-direction: column; gap: 0; }
.spec-row { display: flex; gap: 8px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 11px; }
.spec-key { color: var(--text-muted); min-width: 110px; flex-shrink: 0; }
.spec-val { color: var(--text-secondary); }
</style>
