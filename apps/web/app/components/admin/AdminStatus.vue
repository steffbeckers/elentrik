<script setup lang="ts">
import { vertaalFout } from "~/fouten";
defineProps<{ fout?: unknown; bezig?: boolean }>();
defineEmits<{ opnieuw: [] }>();
const { t } = useI18n();
</script>
<template>
  <UAlert v-if="fout" color="error" variant="subtle" :title="vertaalFout(fout, t)" :actions="[{ label: t('admin.opnieuw'), onClick: () => $emit('opnieuw'), color: 'error' }]" />
  <p v-else-if="bezig" role="status" class="py-6 text-muted">{{ t('admin.laden') }}</p>
  <slot v-else />
</template>
