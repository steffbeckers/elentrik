<script setup lang="ts">
import type { AdminNotitie } from '../../../shared/admin/notities';
import AdminStatus from './AdminStatus.vue';
import AdminCorrectieFormulier from './AdminCorrectieFormulier.vue';
const props = defineProps<{ organisatieId: string; projectId?: string }>();
const emit = defineEmits<{ gewijzigd: [] }>();
const { t } = useI18n(); const { datum } = useAdminDatums(); const api = useAdminApi();
const archief = ref(false); const pagina = ref(1); const q = computed(() => ({ organisatieId: props.organisatieId, projectId: props.projectId, gearchiveerd: archief.value, pagina: pagina.value }));
const { data, error, status, refresh } = useAdminGegevens(`notities:${props.organisatieId}:${props.projectId ?? ''}`, () => api.notities(q.value), [q]);
watch(archief, () => pagina.value = 1);
const open = ref(false); const selectie = shallowRef<AdminNotitie | null>(null); const tekst = ref(''); const opvolgdatum = ref(''); const gearchiveerd = ref(false);
function begin(n: AdminNotitie | null) { selectie.value = n; tekst.value = n?.tekst ?? ''; opvolgdatum.value = n?.opvolgdatum ?? ''; gearchiveerd.value = !!n?.gearchiveerd; open.value = true; }
async function bewaar(reden: string) {
  const inhoud = { tekst: tekst.value, opvolgdatum: opvolgdatum.value || null };
  return selectie.value ? api.wijzigNotitie(selectie.value.id, { reden, verwacht: selectie.value.verwacht, gegevens: { ...inhoud, gearchiveerd: gearchiveerd.value } }) : api.maakNotitie({ ...inhoud, organisatieId: props.organisatieId, projectId: props.projectId ?? null });
}
</script>
<template>
  <section class="space-y-5 border-t border-default pt-7">
    <div class="flex flex-wrap items-center justify-between gap-3"><h2 class="text-xl font-semibold">{{ t('admin.notities') }}</h2><UButton v-if="!open" color="neutral" variant="outline" icon="i-lucide-plus" @click="begin(null)">{{ t('admin.notitieToevoegen') }}</UButton></div>
    <p class="text-sm text-muted">{{ t('admin.notitiePrivé') }}</p>
    <AdminCorrectieFormulier v-if="open" :key="selectie?.id ?? 'nieuw'" :titel="t(selectie ? 'admin.notitieBewerken' : 'admin.notitieToevoegen')" :bewaar="bewaar" :zonder-reden="!selectie" @annuleer="open = false" @opgeslagen="open = false; refresh(); emit('gewijzigd')">
      <UFormField :label="t('admin.notitie')" required><UTextarea v-model="tekst" class="w-full" :rows="4" maxlength="5000" required /></UFormField>
      <UFormField :label="t('admin.opvolgdatum')" :description="t('admin.datumBrussel')"><UInput v-model="opvolgdatum" type="date" /></UFormField>
      <UCheckbox v-if="selectie" v-model="gearchiveerd" :label="t('admin.archiveren')" />
    </AdminCorrectieFormulier>
    <UCheckbox v-model="archief" :label="t('admin.archiefTonen')" />
    <AdminStatus :fout="error" :bezig="status === 'pending' || !data" @opnieuw="refresh()">
      <p v-if="!data?.items.length" class="text-muted">{{ t('admin.geenNotities') }}</p>
      <ul v-else class="divide-y divide-default">
        <li v-for="n in data.items" :key="n.id" class="py-4 first:pt-0">
          <div class="mb-2 flex flex-wrap items-start justify-between gap-3"><div class="text-sm text-muted"><span class="font-medium text-default">{{ n.auteur.naam }}</span> · {{ datum(n.aangemaakt) }}<span v-if="n.gewijzigd !== n.aangemaakt"> · {{ t('admin.gewijzigd') }} {{ datum(n.gewijzigd) }}</span><p v-if="n.opvolgdatum">{{ t('admin.opvolgdatum') }}: {{ datum(n.opvolgdatum, false) }}</p></div><UButton color="neutral" variant="ghost" size="sm" @click="begin(n)">{{ t('admin.bewerken') }}</UButton></div>
          <NuxtLink v-if="n.projectId && !projectId" :to="`/admin/projecten/${n.projectId}`" class="mb-2 block break-all text-sm text-primary underline underline-offset-4">{{ t('admin.project') }} {{ n.projectId }}</NuxtLink>
          <p class="max-w-prose whitespace-pre-wrap break-words">{{ n.tekst }}</p>
        </li>
      </ul>
      <UPagination v-if="data && data.totaal > data.perPagina" v-model:page="pagina" :total="data.totaal" :items-per-page="data.perPagina" />
    </AdminStatus>
  </section>
</template>
