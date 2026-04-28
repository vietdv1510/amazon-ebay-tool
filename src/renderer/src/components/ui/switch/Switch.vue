<script setup>
import { SwitchRoot, SwitchThumb } from "reka-ui";
import { cn } from '@/utils';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, required: false },
  id: { type: String, required: false },
  name: { type: String, required: false },
  required: { type: Boolean, required: false },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true,
  },
});

const emit = defineEmits(['update:modelValue']);

const handleUpdate = (checked) => {
  console.log('[Switch] handleUpdate: checked =', checked, 'emitting update:modelValue');
  emit('update:modelValue', checked);
};
</script>

<template>
  <SwitchRoot
    v-model="props.modelValue"
    @update:model-value="handleUpdate"
    :disabled="props.disabled"
    :id="props.id"
    :name="props.name"
    :required="props.required"
    :class="
      cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
        props.class,
      )
    "
  >
    <SwitchThumb
      :class="
        cn(
          'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
        )
      "
    >
      <slot name="thumb" />
    </SwitchThumb>
  </SwitchRoot>
</template>
