<script setup lang="ts">
defineOptions({ inheritAttrs: false });
const waarde = defineModel<string>({ default: "" });
const zichtbaar = ref(false);
</script>

<template>
  <UInput v-model="waarde" v-bind="$attrs" :type="zichtbaar ? 'text' : 'password'" :ui="{ trailing: 'pe-1' }">
    <template #trailing>
      <UButton
        type="button"
        color="neutral"
        variant="ghost"
        :icon="zichtbaar ? 'i-lucide-eye-off' : 'i-lucide-eye'"
        :aria-label="$t(zichtbaar ? 'werkbaarheidBeheer.wachtwoordVerbergen' : 'werkbaarheidBeheer.wachtwoordTonen')"
        :aria-pressed="zichtbaar"
        @click="zichtbaar = !zichtbaar"
      />
    </template>
  </UInput>
</template>
