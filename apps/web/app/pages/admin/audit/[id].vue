<script setup lang="ts">
import type { AdminRevisie } from '../../../../shared/admin/projecten';
import AdminStatus from '~/components/admin/AdminStatus.vue';
import AdminWijzigingen from '~/components/admin/AdminWijzigingen.vue';
definePageMeta({ layout: 'admin', middleware: ['superuser'] });
const id = String(useRoute().params.id); const api = useAdminApi(); const { t } = useI18n(); const { datum } = useAdminDatums();
const { data, error, status, refresh } = useAdminGegevens(`auditdetail:${id}`, () => api.auditDetail(id));
const revisie = shallowRef<AdminRevisie | null>(null); const revisieBezig = ref(false); const revisieFout = shallowRef<unknown>(null);
const revisieId = computed(() => { const na = data.value?.na; return na && typeof na === 'object' && 'revisieId' in na && typeof na.revisieId === 'string' ? na.revisieId : null; });
async function laadRevisie() { if (!revisieId.value) return; revisieBezig.value = true; revisieFout.value = null; try { revisie.value = await api.revisie(revisieId.value); } catch (e) { revisieFout.value = e; } finally { revisieBezig.value = false; } }
function download(kant: 'voor' | 'na') { if (!revisie.value) return; const url = URL.createObjectURL(new Blob([JSON.stringify(revisie.value[kant], null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `revisie-${id}-${kant}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
const doelUrl = computed(() => { const d = data.value?.doel; if (!d) return null; if (d.type === 'gebruiker') return `/admin/gebruikers/${d.id}`; if (d.projectId) return `/admin/projecten/${d.projectId}`; return d.organisatieId ? `/admin/organisaties/${d.organisatieId}` : null; });
useHead({ title: () => `${t('admin.auditDetail')} · ${t('admin.titel')}` });
</script>
<template>
  <UButton to="/admin/audit" color="neutral" variant="link" icon="i-lucide-arrow-left" class="mb-5 px-0">{{ t('admin.audit') }}</UButton>
  <AdminStatus :fout="error" :bezig="status === 'pending' || !data" @opnieuw="refresh()"><div v-if="data" class="space-y-7">
    <header><h1 class="text-2xl font-semibold">{{ t(`admin.acties.${data.actie.replaceAll('.', '_')}`) }}</h1><p class="mt-2 text-sm text-muted">{{ data.actor.naam }} · {{ datum(data.tijd) }}</p></header>
    <div><h2 class="mb-2 text-lg font-semibold">{{ t('admin.reden') }}</h2><p class="max-w-prose whitespace-pre-wrap break-words">{{ data.reden }}</p></div>
    <NuxtLink v-if="doelUrl" :to="doelUrl" class="inline-block text-primary underline underline-offset-4">{{ t('admin.recordOpenen') }}</NuxtLink>
    <section><h2 class="mb-4 text-lg font-semibold">{{ t('admin.wijzigingen') }}</h2><AdminWijzigingen :voor="data.voor" :na="data.na" /></section>
    <section v-if="revisieId" class="space-y-4 border-t border-default pt-7"><h2 class="text-xl font-semibold">{{ t('admin.projectRevisie') }}</h2><UButton v-if="!revisie" color="neutral" variant="outline" :loading="revisieBezig" @click="laadRevisie">{{ t('admin.revisieLaden') }}</UButton><AdminStatus :fout="revisieFout" @opnieuw="laadRevisie"><template v-if="revisie"><AdminWijzigingen :voor="revisie.voor" :na="revisie.na" /><div class="flex flex-wrap gap-3"><UButton v-for="kant in (['voor', 'na'] as const)" :key="kant" color="neutral" variant="outline" icon="i-lucide-download" @click="download(kant)">{{ t('admin.revisieDownloaden', { versie: revisie[kant].versie }) }}</UButton></div><p class="text-sm text-muted">{{ t('admin.jsonGeenArchief') }}</p></template></AdminStatus></section>
  </div></AdminStatus>
</template>
