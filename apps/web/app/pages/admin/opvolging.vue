<script setup lang="ts">
import AdminStatus from '~/components/admin/AdminStatus.vue';
definePageMeta({ layout: 'admin', middleware: ['superuser'] });
const { t } = useI18n(); const { datum } = useAdminDatums(); const api = useAdminApi();
const route = useRoute();
const pagina = computed({ get: () => Math.max(1, Number(route.query.pagina) || 1), set: value => { navigateTo({ query: { pagina: value } }); } });
const { data, error, status, refresh } = useAdminGegevens('opvolging', () => api.opvolging({ pagina: pagina.value }), [pagina]);
useHead({ title: () => `${t('admin.opvolging')} · ${t('admin.titel')}` });
</script>
<template>
  <h1 class="mb-7 text-2xl font-semibold">{{ t('admin.opvolging') }}</h1>
  <AdminStatus :fout="error" :bezig="status === 'pending' || !data" @opnieuw="refresh()">
    <p v-if="!data?.items.length" class="text-muted">{{ t('admin.geenOpvolging') }}</p>
    <ul v-else class="divide-y divide-default"><li v-for="n in data.items" :key="n.id" class="py-4"><NuxtLink :to="n.projectId ? `/admin/projecten/${n.projectId}` : `/admin/organisaties/${n.organisatieId}`" class="block max-w-prose whitespace-pre-wrap break-words text-primary underline underline-offset-4">{{ n.tekst }}</NuxtLink><p class="mt-2 text-sm text-muted">{{ datum(n.opvolgdatum, false) }} · {{ n.auteur.naam }}</p></li></ul>
    <UPagination v-if="data && data.totaal > data.perPagina" v-model:page="pagina" :total="data.totaal" :items-per-page="data.perPagina" class="mt-6" />
  </AdminStatus>
</template>
