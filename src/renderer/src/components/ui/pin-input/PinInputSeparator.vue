<script setup>
import { MinusIcon } from '@radix-icons/vue';
import { Primitive, useForwardProps } from "reka-ui";

const props = defineProps({
  asChild: { type: Boolean, required: false },
  as: { type: null, required: false },
});
const forwardedProps = useForwardProps(props);
</script>

<template>
  <Primitive v-bind="forwardedProps">
    <slot>
      <MinusIcon class="w-2" />
    </slot>
  </Primitive>
</template>
