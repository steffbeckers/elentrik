<script setup lang="ts">
import { adminVerschillen } from '~/admin/verschillen';
const props = defineProps<{ voor: unknown; na: unknown }>();
const { t } = useI18n();
const resultaat = computed(() => adminVerschillen(props.voor, props.na));
</script>
<template>
  <div><p v-if="resultaat.beperkt" class="mb-4 text-sm text-muted">{{ t('admin.vergelijkingBeperkt') }}</p><p v-if="!resultaat.items.length" class="text-sm text-muted">{{ t('admin.geenVerschillen') }}</p><div v-else class="overflow-x-auto"><table class="w-full text-left text-sm"><thead class="border-b border-default"><tr><th class="p-3">{{ t('admin.veld') }}</th><th class="p-3">{{ t('admin.voor') }}</th><th class="p-3">{{ t('admin.na') }}</th></tr></thead><tbody class="divide-y divide-default"><tr v-for="(v, i) in resultaat.items" :key="i"><th scope="row" class="max-w-64 break-all p-3 align-top font-medium">{{ v.pad }}</th><td class="max-w-80 whitespace-pre-wrap break-words p-3 align-top text-muted">{{ v.voor }}</td><td class="max-w-80 whitespace-pre-wrap break-words p-3 align-top">{{ v.na }}</td></tr></tbody></table></div></div>
</template>
