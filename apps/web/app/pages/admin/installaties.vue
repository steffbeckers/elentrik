<script setup lang="ts">
import AdminStatus from '~/components/admin/AdminStatus.vue';
definePageMeta({ layout: 'admin', middleware: ['superuser'] });
const { t } = useI18n(); const { datum } = useAdminDatums(); const api = useAdminApi();
const route = useRoute();
const kolommen = ['instanceHost', 'instanceVersie', 'instanceStripe', 'instanceOrganisaties', 'instanceGebruikers', 'instanceEerste', 'instanceLaatste', 'instanceIp'];
const pagina = computed({ get: () => Math.max(1, Number(route.query.pagina) || 1), set: value => { navigateTo({ query: { pagina: value } }); } });
const { data, error, status, refresh } = useAdminGegevens('installaties', () => api.instances({ pagina: pagina.value }), [pagina]);
useHead({ title: () => `${t('admin.installaties')} · ${t('admin.titel')}` });
</script>
<template>
  <h1 class="mb-7 text-2xl font-semibold">{{ t('admin.installaties') }}</h1>
  <AdminStatus :fout="error" :bezig="status === 'pending' || !data" @opnieuw="refresh()">
    <p v-if="!data?.items.length" role="status" class="border-y border-default py-8 text-muted">{{ t('admin.geenInstances') }}</p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-left text-sm tabular-nums">
        <caption class="sr-only">{{ t('admin.installaties') }}</caption>
        <thead class="border-b border-default text-muted"><tr>
          <th v-for="k in kolommen" :key="k" class="whitespace-nowrap px-3 py-3 font-medium">{{ t(`admin.${k}`) }}</th>
        </tr></thead>
        <tbody class="divide-y divide-default">
          <tr v-for="i in data.items" :key="i.instanceId" class="hover:bg-elevated/50">
            <th scope="row" class="min-w-40 break-words px-3 py-4 font-medium">{{ i.host }}</th>
            <td class="px-3 py-4">{{ i.versie }}</td>
            <td class="px-3 py-4">{{ i.abonnementenAan ? t('admin.instanceAan') : t('admin.instanceUit') }}</td>
            <td class="px-3 py-4">{{ i.aantalOrganisaties }}</td>
            <td class="px-3 py-4">{{ i.aantalGebruikers }}</td>
            <td class="whitespace-nowrap px-3 py-4">{{ datum(i.eersteMeldingOp) }}</td>
            <td class="whitespace-nowrap px-3 py-4">{{ datum(i.laatsteMeldingOp) }} <UBadge v-if="i.stil" color="warning" variant="subtle" class="ml-1">{{ t('admin.stil') }}</UBadge></td>
            <td class="px-3 py-4">{{ i.laatsteIp ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <UPagination v-if="data && data.totaal > data.perPagina" v-model:page="pagina" :total="data.totaal" :items-per-page="data.perPagina" class="mt-6" />
  </AdminStatus>
</template>
