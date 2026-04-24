<script setup>
import { cn } from '@/utils';

const props = defineProps({
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true,
  },
  wrapperClass: {
    type: [String, Object, Array],
    required: false,
    default: '',
  }
});
</script>

<template>
  <div :class="cn('relative w-full overflow-auto table-scroll-wrapper flex flex-col', props.wrapperClass)">
    <table :class="cn('w-full caption-bottom text-sm', props.class)">
      <slot />
    </table>
  </div>
</template>

<style scoped>
.table-scroll-wrapper {
  scrollbar-gutter: stable;
}

.table-scroll-wrapper::-webkit-scrollbar {
  height: 10px;
  width: 8px;
}

.table-scroll-wrapper::-webkit-scrollbar-track {
  background: hsl(var(--muted));
  border-radius: 0 0 8px 8px;
}

.table-scroll-wrapper::-webkit-scrollbar-thumb {
  background: hsl(var(--muted-foreground) / 0.35);
  border-radius: 5px;
}

.table-scroll-wrapper::-webkit-scrollbar-thumb:hover {
  background: hsl(var(--muted-foreground) / 0.6);
}
</style>
