<template>
  <div class="panel-root">
    <!-- Panel Header -->
    <div class="panel-header">
      <span class="panel-title">Chi tiết sản phẩm</span>
      <Button variant="ghost" size="icon" class="h-6 w-6" @click="handleClose">
        <X class="w-4 h-4" />
      </Button>
    </div>

    <div class="panel-body">
      <!-- Image Gallery -->
      <div class="image-gallery" v-if="form.images && form.images.length > 0">
        <img :src="form.images[activeImg]" class="gallery-main" :alt="form.title" />
        <div class="gallery-thumbs" v-if="form.images.length > 1">
          <img
            v-for="(img, i) in form.images.slice(0, 8)"
            :key="i"
            :src="img"
            class="gallery-thumb"
            :class="{ active: i === activeImg }"
            @click="activeImg = i"
          />
        </div>
      </div>
      <div v-else class="image-placeholder">
        <ImageIcon class="w-6 h-6 mr-2 text-muted-foreground" /> Không có ảnh
      </div>

      <div class="divider"></div>

      <!-- ASIN + Status + Rating -->
      <div class="meta-row">
        <span class="tag">{{ form.asin }}</span>
        <Badge :variant="form.status === 'DONE' ? 'default' : 'secondary'" class="text-xs">{{ form.status }}</Badge>
        <div v-if="form.rating" class="flex items-center gap-1 ml-auto">
          <Star class="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
          <span class="text-xs text-muted-foreground">{{ form.rating }} ({{ form.reviewCount }})</span>
        </div>
      </div>

      <!-- Title -->
      <div class="form-group" style="margin-top:12px">
        <Label>Tiêu đề (eBay Title — max 80)</Label>
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

      <!-- Amazon Original Price -->
      <div class="two-col" style="margin-top:6px">
        <div class="form-group">
          <Label class="text-muted-foreground text-xs">Giá gốc Amazon</Label>
          <div class="text-sm mt-1 text-muted-foreground">${{ form.originalPrice?.toFixed?.(2) || form.originalPrice || '—' }}</div>
        </div>
        <div class="form-group" v-if="form.priceRange">
          <Label class="text-muted-foreground text-xs">Khoảng giá</Label>
          <div class="text-sm mt-1 text-muted-foreground">{{ form.priceRange }}</div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- eBay Category Section -->
      <div class="section-title flex items-center mt-3">
        <Tag class="w-4 h-4 mr-2" /> eBay Category
      </div>

      <!-- Category display -->
      <div v-if="form.ebayCategory" class="cat-selected mt-2" @click="showCategorySearch = true">
        <div class="flex flex-col min-w-0 flex-1">
          <span class="text-sm font-medium text-foreground">{{ form.ebayCategoryName || 'Category' }}</span>
          <span class="text-xs text-muted-foreground">ID: {{ form.ebayCategory }}</span>
        </div>
        <Button variant="ghost" size="icon" class="h-6 w-6 flex-shrink-0" @click.stop="clearCategory">
          <X class="w-3 h-3" />
        </Button>
      </div>

      <!-- Category search button -->
      <Button v-else variant="outline" size="sm" class="mt-2 w-full" @click="searchCategory">
        <Search class="w-4 h-4 mr-2" />
        <span v-if="!catSearching">Tìm eBay Category</span>
        <span v-else>Đang tìm...</span>
      </Button>

      <!-- Category search results -->
      <div v-if="showCategorySearch" class="cat-results-panel mt-2">
        <div class="cat-search-wrap">
          <Search class="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            v-model="catQuery"
            placeholder="Nhập keyword hoặc title..."
            class="h-8 border-0 shadow-none focus-visible:ring-0 p-0"
            @keydown.enter="searchCategory"
          />
          <Button variant="ghost" size="sm" @click="searchCategory" :disabled="catSearching">Tìm</Button>
        </div>

        <div v-if="catResults.length > 0" class="cat-results-list">
          <div
            v-for="cat in catResults"
            :key="cat.categoryId"
            class="cat-result-item"
            @click="selectCategory(cat)"
          >
            <div class="text-sm font-medium">{{ cat.categoryName }}</div>
            <div class="text-xs text-muted-foreground mt-0.5">{{ cat.path }}</div>
            <span class="text-[10px] text-blue-500 font-mono">ID: {{ cat.categoryId }}</span>
          </div>
        </div>
        <div v-else-if="catSearched && !catSearching" class="text-xs text-muted-foreground text-center py-4">
          Không tìm thấy category phù hợp.
        </div>
      </div>

      <!-- 🔴 Required Aspects -->
      <div v-if="requiredAspects.length > 0" class="mt-4">
        <div class="section-title flex items-center">
          <ClipboardCheck class="w-4 h-4 mr-2 text-red-500" /> Bắt buộc ({{ requiredAspects.length }})
        </div>
        <div class="aspects-list mt-2">
          <div v-for="aspect in requiredAspects" :key="aspect.name" class="aspect-row">
            <Label class="text-xs font-medium">
              {{ aspect.name }}
              <span class="text-destructive">*</span>
            </Label>
            <div v-if="aspect.mode === 'SELECTION_ONLY' && aspect.values.length > 0" class="mt-1">
              <Select v-model="form.aspectValues[aspect.name]">
                <SelectTrigger class="h-8 text-xs">
                  <SelectValue :placeholder="`Chọn ${aspect.name}`" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="v in aspect.values.slice(0, 50)" :key="v" :value="v">{{ v }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input v-else v-model="form.aspectValues[aspect.name]" class="mt-1 h-8 text-xs" :placeholder="aspect.name" />
          </div>
        </div>
      </div>

      <!-- 🟡 Recommended Aspects -->
      <div v-if="recommendedAspects.length > 0" class="mt-3">
        <Collapsible :default-open="true">
          <CollapsibleTrigger class="flex items-center gap-2 text-xs text-amber-600 hover:text-amber-500 cursor-pointer font-semibold [&[data-state=open]>svg]:rotate-90">
            <ChevronRight class="w-3 h-3 transition-transform duration-200" />
            Nên có ({{ recommendedAspects.length }})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="aspects-list mt-2">
              <div v-for="aspect in recommendedAspects" :key="aspect.name" class="aspect-row">
                <Label class="text-xs font-medium text-amber-700 dark:text-amber-400">{{ aspect.name }}</Label>
                <div v-if="aspect.mode === 'SELECTION_ONLY' && aspect.values.length > 0" class="mt-1">
                  <Select v-model="form.aspectValues[aspect.name]">
                    <SelectTrigger class="h-8 text-xs">
                      <SelectValue :placeholder="`Chọn ${aspect.name}`" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="v in aspect.values.slice(0, 50)" :key="v" :value="v">{{ v }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input v-else v-model="form.aspectValues[aspect.name]" class="mt-1 h-8 text-xs" :placeholder="aspect.name" />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <!-- ⚪ Optional Aspects (collapsed by default) -->
      <div v-if="optionalAspects.length > 0" class="mt-3">
        <Collapsible>
          <CollapsibleTrigger class="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer [&[data-state=open]>svg]:rotate-90">
            <ChevronRight class="w-3 h-3 transition-transform duration-200" />
            Không bắt buộc ({{ optionalAspects.length }})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div class="aspects-list mt-2">
              <div v-for="aspect in optionalAspects.slice(0, 15)" :key="aspect.name" class="aspect-row">
                <Label class="text-xs font-medium text-muted-foreground">{{ aspect.name }}</Label>
                <div v-if="aspect.mode === 'SELECTION_ONLY' && aspect.values.length > 0" class="mt-1">
                  <Select v-model="form.aspectValues[aspect.name]">
                    <SelectTrigger class="h-8 text-xs">
                      <SelectValue :placeholder="`Chọn ${aspect.name}`" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="v in aspect.values.slice(0, 50)" :key="v" :value="v">{{ v }}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input v-else v-model="form.aspectValues[aspect.name]" class="mt-1 h-8 text-xs" :placeholder="aspect.name" />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div class="divider"></div>

      <!-- Variations -->
      <div class="section-title flex items-center mt-4">
        <Palette class="w-4 h-4 mr-2" /> Biến thể ({{ form.variations?.length || 0 }} SKUs)
      </div>

      <div v-if="form.variations && form.variations.length > 0" class="variations-section mt-2">
        <div class="overflow-auto max-h-[300px] border rounded-md">
          <table class="w-full text-xs">
            <thead class="sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th class="text-left px-2 py-1.5 font-semibold">ASIN</th>
                <th v-for="dimName in variationDimNames" :key="dimName" class="text-left px-2 py-1.5 font-semibold">{{ dimName }}</th>
                <th class="text-right px-2 py-1.5 font-semibold">Giá ($)</th>
                <th class="text-center px-2 py-1.5 font-semibold">SL</th>
                <th class="text-center px-2 py-1.5 font-semibold">Ảnh</th>
                <th class="w-7"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(v, i) in form.variations" :key="i" class="border-t hover:bg-muted/30">
                <td class="px-2 py-1 font-mono text-[10px] text-muted-foreground">{{ v.asin?.slice(0, 10) || '—' }}</td>
                <td v-for="dimName in variationDimNames" :key="dimName" class="px-2 py-1">
                  <span class="inline-block px-1.5 py-0.5 bg-muted rounded text-[10px]">{{ v.attributes?.[dimName] || '—' }}</span>
                </td>
                <td class="text-right px-2 py-1">
                  <Input class="h-6 w-[65px] text-[11px] px-1 text-right inline-flex" type="number" step="0.01" v-model.number="v.price" />
                </td>
                <td class="text-center px-2 py-1">
                  <Input class="h-6 w-[45px] text-[11px] px-1 text-center inline-flex" type="number" v-model.number="v.quantity" />
                </td>
                <td class="text-center px-2 py-1">
                  <img v-if="v.image" :src="v.image" class="w-6 h-6 rounded border object-cover inline-block" />
                  <span v-else class="text-muted-foreground">—</span>
                </td>
                <td class="px-1">
                  <Button variant="ghost" size="icon" class="h-5 w-5" @click="removeVariation(i)">
                    <X class="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="text-xs text-muted-foreground mt-2">
        <p>Sản phẩm đơn (không có biến thể).</p>
      </div>

      <div class="divider"></div>

      <!-- Bullet Points (editable) -->
      <div class="mt-3">
        <div class="section-title flex items-center justify-between">
          <span class="flex items-center"><List class="w-4 h-4 mr-2" /> Đặc điểm sản phẩm ({{ form.bulletPoints?.length || 0 }})</span>
          <button
            @click="form.bulletPoints = [...(form.bulletPoints || []), '']"
            class="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-400"
          >
            <PlusCircle class="w-3 h-3" /> Thêm
          </button>
        </div>
        <div class="mt-2 space-y-1.5">
          <div
            v-for="(bp, i) in (form.bulletPoints || [])"
            :key="i"
            class="flex items-start gap-1.5"
          >
            <span class="text-muted-foreground text-xs mt-1.5 flex-shrink-0">•</span>
            <Textarea
              :value="bp"
              @input="form.bulletPoints[i] = $event.target.value"
              rows="2"
              class="flex-1 text-xs min-h-0 resize-none py-1 px-2"
              :placeholder="`Đặc điểm ${i + 1}`"
            />
            <button
              @click="form.bulletPoints.splice(i, 1)"
              class="mt-1 text-muted-foreground hover:text-red-500 flex-shrink-0"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
          <div v-if="!form.bulletPoints?.length" class="text-xs text-muted-foreground italic">Chưa có đặc điểm nào</div>
        </div>
      </div>

      <!-- Description (editable) -->
      <div class="mt-3">
        <div class="section-title flex items-center">
          <FileText class="w-4 h-4 mr-2" /> Mô tả sản phẩm
        </div>
        <Textarea
          v-model="form.description"
          rows="6"
          class="mt-2 text-xs resize-y"
          placeholder="Nhập mô tả sản phẩm..."
        />
        <div v-if="form.descriptionImages?.length > 0" class="description-images mt-2">
          <div class="description-images-header">
            <span>Ảnh mô tả</span>
            <Badge variant="secondary" class="text-[10px] h-5 px-1.5">
              {{ form.descriptionImages.length }}
            </Badge>
          </div>
          <div class="description-images-grid">
            <a
              v-for="(img, i) in form.descriptionImages"
              :key="`${img}-${i}`"
              :href="img"
              target="_blank"
              class="description-image-item"
              :title="img"
            >
              <img :src="img" :alt="`Ảnh mô tả ${i + 1}`" loading="lazy" />
              <span>{{ i + 1 }}</span>
            </a>
          </div>
        </div>
      </div>

      <!-- Specs (editable) -->
      <div class="mt-3">
        <div class="section-title flex items-center justify-between">
          <span class="flex items-center"><ClipboardList class="w-4 h-4 mr-2" /> Thông số kỹ thuật ({{ Object.keys(form.specs || {}).length }})</span>
          <button
            @click="addSpecRow"
            class="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-400"
          >
            <PlusCircle class="w-3 h-3" /> Thêm dòng
          </button>
        </div>
        <div class="mt-2 space-y-1.5">
          <div
            v-for="(val, key) in (form.specs || {})"
            :key="key"
            class="flex items-center gap-1.5"
          >
            <Input
              :value="key"
              @change="renameSpecKey(key, $event.target.value)"
              class="h-7 text-xs w-[38%] flex-shrink-0 text-blue-400"
              placeholder="Tên thông số"
            />
            <Input
              :value="val"
              @input="form.specs[key] = $event.target.value"
              class="h-7 text-xs flex-1"
              placeholder="Giá trị"
            />
            <button
              @click="deleteSpec(key)"
              class="text-muted-foreground hover:text-red-500 flex-shrink-0"
            >
              <Trash2 class="w-3.5 h-3.5" />
            </button>
          </div>
          <div v-if="!Object.keys(form.specs || {}).length" class="text-xs text-muted-foreground italic">Chưa có thông số nào</div>
        </div>
      </div>

      <!-- Categories (Amazon breadcrumb) -->
      <div v-if="form.categories?.length > 0" class="mt-3">
        <div class="section-title flex items-center">
          <FolderOpen class="w-4 h-4 mr-2" /> Danh mục Amazon
        </div>
        <div class="text-xs text-muted-foreground mt-1">{{ form.categories.join(' › ') }}</div>
      </div>

      <!-- BSR & Availability -->
      <div class="mt-3 flex flex-wrap gap-2">
        <Badge v-if="form.inStock" variant="outline" class="text-xs text-green-600 border-green-600/30">In Stock</Badge>
        <Badge v-if="form.inStock === false" variant="outline" class="text-xs text-red-500 border-red-500/30">Out of Stock</Badge>
      </div>
    </div>

    <!-- Panel Footer -->
    <div class="panel-footer bg-background">
      <Button variant="ghost" size="sm" @click="handleClose">Đóng</Button>
      <Button size="sm" @click="save"><Save class="w-4 h-4 mr-2" /> Lưu thay đổi</Button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, ref, watch, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible'
import {
  X, Image as ImageIcon, Palette, Plus, ClipboardList, Save,
  Search, Tag, Star, ClipboardCheck, ChevronRight, List, FileText, FolderOpen,
  Trash2, PlusCircle
} from 'lucide-vue-next'

const props = defineProps({
  row: { type: Object, required: true },
  settings: { type: Object, required: true }
})
const emit = defineEmits(['close', 'update'])

const form = reactive({
  ...props.row,
  variations: props.row.variations ? props.row.variations.map(v => ({ ...v, attributes: { ...v.attributes } })) : [],
  aspectValues: props.row.aspectValues ? { ...props.row.aspectValues } : {},
  ebayCategoryName: props.row.ebayCategoryName || '',
})

const activeImg = ref(0)

// ─── Dirty Check ──────────────────────────────────────────────────────────────
const getFormState = (source) => JSON.stringify({
  title: source.title,
  brand: source.brand,
  sellPrice: source.sellPrice,
  ebayCategory: source.ebayCategory,
  aspectValues: source.aspectValues || {},
  variations: source.variations || [],
})

const isDirty = computed(() => getFormState(props.row) !== getFormState(form))
defineExpose({ isDirty })

const handleClose = () => {
  if (isDirty.value) {
    if (!confirm('Sản phẩm này có thay đổi chưa lưu. Bạn có chắc chắn muốn đóng?')) return
  }
  emit('close')
}

// ─── Category Search ──────────────────────────────────────────────────────────
const showCategorySearch = ref(false)
const catQuery = ref(props.row.title?.substring(0, 80) || '')
const catResults = ref([])
const catSearching = ref(false)
const catSearched = ref(false)
const allAspects = ref([])

const searchCategory = async () => {
  if (!catQuery.value.trim()) return
  catSearching.value = true
  catSearched.value = false
  showCategorySearch.value = true
  try {
    const res = await window.api.ebay.categorySuggestions(catQuery.value.trim())
    if (res.ok) {
      catResults.value = res.data
    } else {
      console.error('Category search error:', res.error)
      catResults.value = []
    }
  } catch (err) {
    console.error(err)
    catResults.value = []
  } finally {
    catSearching.value = false
    catSearched.value = true
  }
}

const loadCategoryAspects = async (categoryId) => {
  try {
    const res = await window.api.ebay.categoryAspects(categoryId)
    if (res.ok) {
      allAspects.value = res.data

      // Auto-fill known aspects from Amazon data
      for (const aspect of res.data) {
        if (form.aspectValues[aspect.name]) continue // Already has value
        const autoVal = autoMapAspect(aspect.name)
        if (autoVal) form.aspectValues[aspect.name] = autoVal
      }
    }
  } catch (err) {
    console.error('Failed to load aspects:', err)
  }
}

const selectCategory = async (cat) => {
  form.ebayCategory = cat.categoryId
  form.ebayCategoryName = cat.categoryName
  form.aspectValues = {}
  showCategorySearch.value = false
  await loadCategoryAspects(cat.categoryId)
}

const autoSelectCategory = async () => {
  if (form.ebayCategory) return // Already has category
  if (!props.row.title?.trim()) return // No title to search with
  try {
    catSearching.value = true
    const res = await window.api.ebay.categorySuggestions(
      (props.row.title || '').substring(0, 150)
    )
    if (res.ok && res.data?.length > 0) {
      await selectCategory(res.data[0]) // Auto-select first (highest relevancy)
    }
  } catch (err) {
    console.warn('[AutoCategory] Failed:', err.message)
  } finally {
    catSearching.value = false
  }
}

onMounted(async () => {
  if (form.ebayCategory) {
    await loadCategoryAspects(form.ebayCategory)
  } else {
    await autoSelectCategory()
  }
})

const clearCategory = () => {
  form.ebayCategory = ''
  form.ebayCategoryName = ''
  allAspects.value = []
  form.aspectValues = {}
}

// Auto-map Amazon specs → eBay aspects
const autoMapAspect = (aspectName) => {
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normName = normalize(aspectName)
  const specs = form.specs || {}

  // 1. Exact match after normalization
  for (const [key, val] of Object.entries(specs)) {
    if (normalize(key) === normName) return val
  }
  
  // 2. Custom robust keyword mapping
  const matchKeys = (keywords) => {
    for (const [key, val] of Object.entries(specs)) {
      const normKey = normalize(key)
      if (keywords.some(k => normKey.includes(k))) return val
    }
    return null
  }

  if (normName === 'brand' || normName === 'brandname') return form.brand || matchKeys(['brand']) || 'Unbranded'
  if (normName === 'mpn' || normName === 'partnumber') return matchKeys(['partnumber', 'mpn']) || 'Does Not Apply'
  if (normName === 'model') return matchKeys(['modelnumber', 'itemmodelnumber', 'model']) || ''
  if (normName === 'upc') return matchKeys(['upc']) || 'Does Not Apply'
  if (normName === 'ean') return matchKeys(['ean']) || 'Does Not Apply'
  if (normName === 'isbn') return matchKeys(['isbn']) || 'Does Not Apply'
  if (normName === 'color' || normName === 'colour') return matchKeys(['color', 'colour']) || ''
  if (normName === 'size') return matchKeys(['size', 'dimensions']) || ''
  if (normName === 'material') return matchKeys(['material', 'fabric']) || ''
  if (normName === 'type' || normName === 'style') return matchKeys(['type', 'style']) || ''
  if (normName === 'theme') return matchKeys(['theme', 'subject']) || ''
  if (normName === 'features') return matchKeys(['features', 'specialfeature']) || ''
  if (normName === 'department') return matchKeys(['department', 'targetgender']) || ''
  if (normName === 'pattern') return matchKeys(['pattern']) || ''
  if (normName === 'shape') return matchKeys(['shape', 'itemshape']) || ''
  if (normName === 'weight') return matchKeys(['weight', 'itemweight']) || ''
  if (normName === 'countryregionofmanufacture' || normName === 'countryoforigin') return matchKeys(['countryoforigin']) || ''

  // 3. Fallback substring match
  for (const [key, val] of Object.entries(specs)) {
    const normKey = normalize(key)
    if (normKey.includes(normName) || normName.includes(normKey)) {
      return val
    }
  }

  return ''
}

const requiredAspects = computed(() => allAspects.value.filter(a => a.required || a.usage === 'REQUIRED'))
const recommendedAspects = computed(() => allAspects.value.filter(a => !a.required && a.usage === 'RECOMMENDED'))
const optionalAspects = computed(() => allAspects.value.filter(a => !a.required && a.usage !== 'RECOMMENDED'))

// ─── Variations ────────────────────────────────────────────────────────────────
const variationDimNames = computed(() => {
  if (!form.variations || form.variations.length === 0) return []
  const allKeys = new Set()
  form.variations.forEach(v => {
    Object.keys(v.attributes || {}).forEach(k => allKeys.add(k))
  })
  return [...allKeys]
})

const removeVariation = (i) => {
  form.variations.splice(i, 1)
}

// ─── Spec helpers ──────────────────────────────────────────────────────────────
const addSpecRow = () => {
  if (!form.specs) form.specs = {}
  const key = `Thông số ${Object.keys(form.specs).length + 1}`
  form.specs[key] = ''
}

const renameSpecKey = (oldKey, newKey) => {
  if (!newKey || newKey === oldKey) return
  const entries = Object.entries(form.specs)
  form.specs = Object.fromEntries(
    entries.map(([k, v]) => (k === oldKey ? [newKey, v] : [k, v]))
  )
}

const deleteSpec = (key) => {
  const { [key]: _, ...rest } = form.specs
  form.specs = rest
}

// ─── Save ──────────────────────────────────────────────────────────────────────
const save = () => {
  emit('update', {
    ...form,
    variations: form.variations.map(v => ({ ...v })),
    aspectValues: { ...form.aspectValues },
  })
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
  width: 100%; height: 80px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
}

.meta-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
.form-hint { font-size: 10px; color: var(--text-muted); }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.section-title { font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em; }

.description-images {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--muted) / 0.35);
  padding: 8px;
}

.description-images-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.description-images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(54px, 1fr));
  gap: 6px;
  max-height: 150px;
  overflow-y: auto;
}

.description-image-item {
  position: relative;
  display: block;
  aspect-ratio: 1;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  background: var(--bg-card);
}

.description-image-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.description-image-item span {
  position: absolute;
  right: 3px;
  bottom: 3px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.68);
  color: white;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

/* Category */
.cat-selected {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: hsl(var(--muted));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  cursor: pointer;
}
.cat-selected:hover { border-color: hsl(var(--primary)); }

.cat-results-panel {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 8px;
  background: hsl(var(--card));
}
.cat-search-wrap { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.cat-results-list { max-height: 250px; overflow-y: auto; }
.cat-result-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid transparent;
}
.cat-result-item:hover { background: hsl(var(--muted)); border-color: hsl(var(--border)); }

/* Aspects */
.aspects-list { display: flex; flex-direction: column; gap: 8px; }
.aspect-row { }

/* Specs */
.specs-table { display: flex; flex-direction: column; gap: 0; }
.spec-row { display: flex; gap: 8px; padding: 4px 0; border-bottom: 1px solid hsl(var(--border) / 0.3); font-size: 11px; }
.spec-key { color: var(--text-muted); min-width: 100px; flex-shrink: 0; font-weight: 500; }
.spec-val { color: var(--text-secondary); }
</style>
