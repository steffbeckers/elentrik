<script setup lang="ts">
import type { AdminAuditItem } from '../../../shared/admin/audit';
import AdminStatus from './AdminStatus.vue';
const props = withDefaults(defineProps<{ filters?: Record<string, string | undefined>; titel?: boolean }>(), { titel: true });
const { t } = useI18n(); const { datum } = useAdminDatums(); const api = useAdminApi(); const pagina = ref(1);
const q = computed(() => ({ ...props.filters, pagina: pagina.value }));
const { data, error, status, refresh } = useAdminGegevens(`audit:${JSON.stringify(props.filters ?? {})}`, () => api.audit(q.value), [q]);
const groepen = computed(() => {
  const result: Array<{ id: string; sessie: boolean; items: AdminAuditItem[] }> = [];
  for (const entry of data.value?.items ?? []) {
    const id = entry.correctieId ?? entry.id;
    const group = result.find(g => g.id === id);
    if (group) group.items.push(entry); else result.push({ id, sessie: !!entry.correctieId, items: [entry] });
  }
  return result;
});
watch(() => JSON.stringify(props.filters), () => pagina.value = 1);
</script>
<template>
  <section class="space-y-5 border-t border-default pt-7">
    <h2 v-if="titel" class="text-xl font-semibold">{{ t('admin.audit') }}</h2>
    <AdminStatus :fout="error" :bezig="status === 'pending' || !data" @opnieuw="refresh()">
      <p v-if="!groepen.length" class="text-muted">{{ t('admin.geenAudit') }}</p>
      <div v-for="groep in groepen" :key="groep.id" class="border-b border-default pb-4">
        <details v-if="groep.sessie"><summary class="cursor-pointer rounded py-2 font-medium focus-visible:outline-2 focus-visible:outline-primary">{{ t('admin.correctiesessie') }} · {{ groep.items[0]?.actor.naam }} · {{ t('admin.aantalWijzigingen', { aantal: groep.items.length }) }}<span class="mt-1 block pl-4 text-sm font-normal text-muted">{{ groep.items[0]?.reden }}</span></summary>
          <ul class="mt-2 space-y-3 pl-4"><li v-for="a in groep.items" :key="a.id"><NuxtLink :to="`/admin/audit/${a.id}`" class="text-primary underline underline-offset-4">{{ t(`admin.acties.${a.actie.replaceAll('.', '_')}`) }}</NuxtLink><p class="text-xs text-muted">{{ datum(a.tijd) }}</p></li></ul>
        </details>
        <div v-else><NuxtLink :to="`/admin/audit/${groep.items[0]!.id}`" class="font-medium text-primary underline underline-offset-4">{{ t(`admin.acties.${groep.items[0]!.actie.replaceAll('.', '_')}`) }}</NuxtLink><p class="mt-1 whitespace-pre-wrap break-words text-sm">{{ groep.items[0]?.reden }}</p><p class="mt-2 text-xs text-muted">{{ groep.items[0]?.actor.naam }} · {{ datum(groep.items[0]?.tijd) }}</p></div>
      </div>
      <UPagination v-if="data && data.totaal > data.perPagina" v-model:page="pagina" :total="data.totaal" :items-per-page="data.perPagina" />
    </AdminStatus>
  </section>
</template>
