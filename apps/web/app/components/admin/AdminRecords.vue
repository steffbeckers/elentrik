<script setup lang="ts">
import AdminLijst, { type AdminRij } from './AdminLijst.vue';
import AdminStatus from './AdminStatus.vue';
import type { AdminPagina } from '../../../shared/admin/basis';
const props = defineProps<{ soort: 'gebruikers' | 'organisaties' | 'projecten' }>();
const { t } = useI18n(); const route = useRoute(); const router = useRouter();
const api = useAdminApi(); const { datum } = useAdminDatums();
const lees = (key: string) => typeof route.query[key] === 'string' ? route.query[key] as string : '';
const zoek = ref(lees('zoek')); const toegang = ref(lees('toegang')); const status = ref(lees('status')); const verwijderd = ref(lees('verwijderd') || 'nee');
const q = computed(() => ({ zoek: lees('zoek'), pagina: lees('pagina') || '1', toegang: lees('toegang') || undefined, status: lees('status') || undefined, verwijderd: lees('verwijderd') || 'nee', organisatieId: lees('organisatieId') || undefined, aandacht: lees('aandacht') || undefined, gebruikerId: lees('gebruikerId') || undefined }));
const toegangKeuzes = computed(() => [{ value: '', label: t('admin.alleToegang') }, ...['uit', 'vrijgesteld', 'abonnement', 'betalingsgratie', 'proef', 'alleenLezen'].map(value => ({ value, label: t(`admin.groepen.${value}`) }))]);
async function haal(): Promise<AdminPagina<AdminRij>> {
  if (props.soort === 'gebruikers') { const r = await api.gebruikers(q.value); return { ...r, items: r.items.map(v => ({ id: v.id, naam: v.naam, naar: `/admin/gebruikers/${v.id}`, waarden: [v.email, String(v.bedrijven), datum(v.aangemaakt)] })) }; }
  if (props.soort === 'organisaties') { const r = await api.organisaties(q.value); return { ...r, items: r.items.map(v => ({ id: v.id, naam: v.naam, naar: `/admin/organisaties/${v.id}`, waarden: [v.eigenaren.map(e => e.email).join(', ') || '—', String(v.leden), String(v.projecten), t(`admin.groepen.${v.groep}`), v.status ?? '—'] })) }; }
  const r = await api.projecten(q.value); return { ...r, items: r.items.map(v => ({ id: v.id, naam: v.naam, naar: `/admin/projecten/${v.id}`, waarden: [v.klantnaam, v.organisatieNaam ?? '—', String(v.versie), datum(v.gewijzigd), v.verwijderd ? t('admin.verwijderd') : t('admin.actief')] })) };
}
const { data, error, status: laden, refresh } = useAdminGegevens(`lijst:${props.soort}`, haal, [q]);
const kolommen = computed(() => (props.soort === 'gebruikers' ? ['email', 'organisaties', 'aangemaakt'] : props.soort === 'organisaties' ? ['eigenaren', 'leden', 'projecten', 'toegang', 'stripeStatus'] : ['klant', 'organisatie', 'versie', 'gewijzigd', 'status']).map(k => t(`admin.${k}`)));
function filter() { return router.replace({ query: { ...route.query, zoek: zoek.value || undefined, pagina: undefined, toegang: toegang.value || undefined, status: status.value || undefined, verwijderd: props.soort === 'projecten' ? verwijderd.value : undefined } }); }
useHead({ title: () => `${t(`admin.${props.soort}`)} · ${t('admin.titel')}` });
</script>
<template>
  <h1 class="mb-6 text-2xl font-semibold">{{ t(`admin.${soort}`) }}</h1>
  <form class="mb-6 flex flex-wrap items-end gap-3" @submit.prevent="filter">
    <UFormField :label="t('admin.zoeken')" class="min-w-56 flex-1"><UInput v-model="zoek" class="w-full" maxlength="200" icon="i-lucide-search" /></UFormField>
    <template v-if="soort === 'organisaties'">
      <UFormField :label="t('admin.toegang')"><USelect v-model="toegang" :items="toegangKeuzes" class="w-48" /></UFormField>
      <UFormField :label="t('admin.stripeStatus')"><USelect v-model="status" :items="[{ value: '', label: t('admin.alleStatussen') }, ...['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused'].map(value => ({ value, label: value }))]" class="w-44" /></UFormField>
    </template>
    <UFormField v-if="soort === 'projecten'" :label="t('admin.status')"><USelect v-model="verwijderd" :items="[{ value: 'nee', label: t('admin.actief') }, { value: 'ja', label: t('admin.verwijderd') }]" /></UFormField>
    <UButton type="submit" color="neutral" variant="outline">{{ t('admin.filteren') }}</UButton>
  </form>
  <AdminStatus :fout="error" :bezig="laden === 'pending' || !data" @opnieuw="refresh()">
    <AdminLijst v-if="data" :rijen="data.items" :kolommen="kolommen" :titel="t(`admin.${soort}`)" :totaal="data.totaal" :pagina="data.pagina" :per-pagina="data.perPagina" @pagina="router.replace({ query: { ...route.query, pagina: $event } })" />
  </AdminStatus>
</template>
