<script setup lang="ts">
export type AdminRij = { id: string; naam: string; naar: string; waarden: string[] };
defineProps<{ rijen: AdminRij[]; kolommen: string[]; totaal?: number; pagina?: number; perPagina?: number; titel: string }>();
defineEmits<{ pagina: [pagina: number] }>();
const { t } = useI18n();
</script>
<template>
  <div>
    <p v-if="!rijen.length" role="status" class="border-y border-default py-8 text-muted">{{ t('admin.geenResultaten') }}</p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-left text-sm tabular-nums">
        <caption class="sr-only">{{ titel }}</caption>
        <thead class="border-b border-default text-muted"><tr><th class="px-3 py-3 font-medium">{{ t('admin.naam') }}</th><th v-for="k in kolommen" :key="k" class="whitespace-nowrap px-3 py-3 font-medium">{{ k }}</th></tr></thead>
        <tbody class="divide-y divide-default"><tr v-for="rij in rijen" :key="rij.id" class="hover:bg-elevated/50"><th scope="row" class="min-w-40 px-3 py-4 font-medium"><NuxtLink :to="rij.naar" class="break-words text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary">{{ rij.naam || '—' }}</NuxtLink></th><td v-for="(v, index) in rij.waarden" :key="index" class="max-w-72 break-words px-3 py-4">{{ v }}</td></tr></tbody>
      </table>
    </div>
    <div v-if="totaal !== undefined" class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <p>{{ t('admin.totaal', { aantal: totaal }) }}</p>
      <UPagination v-if="totaal > (perPagina ?? 25)" :page="pagina ?? 1" :items-per-page="perPagina ?? 25" :total="totaal" @update:page="$emit('pagina', $event)" />
    </div>
  </div>
</template>
