<script setup lang="ts">
import AdminStatus from '~/components/admin/AdminStatus.vue';
import AdminAudit from '~/components/admin/AdminAudit.vue';
import AdminNotities from '~/components/admin/AdminNotities.vue';
definePageMeta({ layout: 'admin', middleware: ['superuser'] });
const auditVersie = ref(0);
const id = String(useRoute().params.id); const api = useAdminApi(); const { t } = useI18n(); const { datum } = useAdminDatums();
const { data, error, status, refresh } = useAdminGegevens(`project:${id}`, () => api.project(id));
const { data: exports, error: exportError, status: exportStatus, refresh: refreshExports } = useAdminGegevens(`exports:${id}`, () => api.exports(id));
useHead({ title: () => `${data.value?.naam ?? t('admin.project')} · ${t('admin.titel')}` });
</script>
<template>
  <UButton to="/admin/projecten" color="neutral" variant="link" icon="i-lucide-arrow-left" class="mb-5 px-0">{{ t('admin.projecten') }}</UButton>
  <AdminStatus :fout="error" :bezig="status === 'pending' || !data" @opnieuw="refresh()"><div v-if="data" class="space-y-8">
    <header><div class="flex flex-wrap items-start justify-between gap-4"><div><h1 class="break-words text-2xl font-semibold">{{ data.naam }}</h1><p class="mt-2 text-muted">{{ data.klantnaam }}</p></div><UButton v-if="!data.verwijderd && data.organisatieId" :to="`/admin/projecten/${id}/bewerken`" icon="i-lucide-folder-open">{{ t('admin.projectOpenen') }}</UButton><UBadge v-else color="warning" variant="subtle">{{ t(data.verwijderd ? 'admin.verwijderd' : 'admin.zonderOrganisatie') }}</UBadge></div><p class="mt-2 break-all text-xs text-muted">{{ id }}</p></header>
    <p v-if="data.verwijderd" class="text-sm text-muted">{{ t('admin.verwijderdUitleg') }}</p><p v-else class="text-sm text-muted">{{ t('admin.projectOpenenUitleg') }}</p>
    <dl class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt class="text-muted">{{ t('admin.organisatie') }}</dt><dd class="mt-1"><NuxtLink v-if="data.organisatieId" :to="`/admin/organisaties/${data.organisatieId}`" class="text-primary underline underline-offset-4">{{ data.organisatieNaam }}</NuxtLink><span v-else>—</span></dd></div><div><dt class="text-muted">{{ t('admin.versie') }}</dt><dd class="mt-1 tabular-nums">{{ data.versie }}</dd></div><div><dt class="text-muted">{{ t('admin.aangemaakt') }}</dt><dd class="mt-1">{{ datum(data.aangemaakt) }}</dd></div><div><dt class="text-muted">{{ t('admin.gewijzigd') }}</dt><dd class="mt-1">{{ datum(data.gewijzigd) }}</dd></div><div><dt class="text-muted">{{ t('admin.gekochtOp') }}</dt><dd class="mt-1">{{ data.gekochtOp ? datum(data.gekochtOp) : '—' }}</dd></div><div><dt class="text-muted">{{ t('admin.abonnementStempelOp') }}</dt><dd class="mt-1">{{ data.abonnementStempelOp ? datum(data.abonnementStempelOp) : '—' }}</dd></div></dl>
    <section class="border-t border-default pt-7"><h2 class="mb-4 text-xl font-semibold">{{ t('admin.projectaankopen') }}</h2><p v-if="!data.projectaankopen.length" class="text-muted">{{ t('admin.geenProjectaankopen') }}</p><ul v-else class="divide-y divide-default"><li v-for="a in data.projectaankopen" :key="a.id" class="flex flex-wrap items-center justify-between gap-3 py-3"><UBadge :color="a.status === 'betaald' ? 'success' : a.status === 'open' ? 'info' : 'neutral'" variant="subtle">{{ t(`admin.aankoopStatus.${a.status}`) }}</UBadge><p class="text-sm text-muted">{{ t('admin.aankoopAangemaakt', { datum: datum(a.aangemaakt) }) }}<template v-if="a.betaaldOp"> · {{ t('admin.aankoopBetaald', { datum: datum(a.betaaldOp) }) }}</template></p></li></ul></section>
    <section class="border-t border-default pt-7"><h2 class="mb-4 text-xl font-semibold">{{ t('admin.exports') }}</h2><AdminStatus :fout="exportError" :bezig="exportStatus === 'pending'" @opnieuw="refreshExports()"><p v-if="!exports?.length" class="text-muted">{{ t('admin.geenExports') }}</p><ul class="divide-y divide-default"><li v-for="e in exports" :key="e.id" class="flex flex-wrap items-center justify-between gap-3 py-3"><div><span class="font-medium">{{ e.versieLabel }}</span><p class="text-sm text-muted">{{ datum(e.aangemaakt) }} · {{ e.papier }}</p></div><UButton :to="api.bestandUrl(e.bestandId)" external target="_blank" color="neutral" variant="outline" icon="i-lucide-download">{{ t('admin.downloaden') }}</UButton></li></ul></AdminStatus></section>
    <AdminNotities v-if="data.organisatieId" :organisatie-id="data.organisatieId" :project-id="id" @gewijzigd="auditVersie++" />
    <AdminAudit :key="auditVersie" :filters="{ projectId: id }" />
  </div></AdminStatus>
</template>
