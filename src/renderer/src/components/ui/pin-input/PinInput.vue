<script setup>
import { reactiveOmit } from "@vueuse/core";
import { PinInputRoot, useForwardPropsEmits } from "reka-ui";
import { cn } from '@/utils';

const props = defineProps({
  modelValue: { type: null, required: false, default: () => [] },
  defaultValue: { type: null, required: false },
  placeholder: { type: String, required: false },
  mask: { type: Boolean, required: false },
  otp: { type: Boolean, required: false },
  type: { type: null, required: false },
  dir: { type: String, required: false },
  disabled: { type: Boolean, required: false },
  id: { type: String, required: false },
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
  name: { type: String, required: false },
  required: { type: Boolean, required: false },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true,
  },
});
const emits = defineEmits(["update:modelValue", "complete"]);

const delegatedProps = reactiveOmit(props, "class");

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <PinInputRoot
    v-bind="forwarded"
    :class="cn('flex gap-2 items-center', props.class)"
  >
    <slot />
  </PinInputRoot>
</template>
