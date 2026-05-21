import { ref, watch } from 'vue'

export const globalRowData = ref([])
// Tracks which history session is currently loaded / last saved
export const activeSessionId = ref(null)

// ─── Auto-save to history on rowData changes ────────────────────────────
let saveTimer = null
const SAVE_DEBOUNCE_MS = 2000

watch(globalRowData, () => {
  if (!activeSessionId.value) return
  const doneProducts = globalRowData.value.filter(r => r.status === 'DONE')
  if (doneProducts.length === 0) return

  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      const snapshot = JSON.parse(JSON.stringify(doneProducts))
      const res = await window.api.history.updateSession(activeSessionId.value, snapshot)
      if (res?.ok) {
        console.log(`[Store] Auto-saved ${snapshot.length} products to session ${activeSessionId.value}`)
      } else {
        // Session was deleted — stop auto-saving
        activeSessionId.value = null
        console.log('[Store] Session gone, auto-save disabled')
      }
    } catch (e) {
      console.warn('[Store] Auto-save failed:', e)
    }
  }, SAVE_DEBOUNCE_MS)
}, { deep: true })
