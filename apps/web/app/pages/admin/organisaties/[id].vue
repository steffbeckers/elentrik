<script setup lang="ts">
import AdminStatus from '~/components/admin/AdminStatus.vue';
import AdminCorrectieFormulier from '~/components/admin/AdminCorrectieFormulier.vue';
import AdminAudit from '~/components/admin/AdminAudit.vue';
import AdminNotities from '~/components/admin/AdminNotities.vue';
import AdminToegang from '~/components/admin/AdminToegang.vue';
import AdresVelden from '~/components/editor/AdresVelden.vue';
import { formulierUitPartij, leegFormulier, partijUitFormulier } from '~/instellingen/formulier';
definePageMeta({ layout: 'admin', middleware: ['superuser'] });
const id = String(useRoute().params.id); const api = useAdminApi(); const { t } = useI18n(); const { datum } = useAdminDatums();
const { data, error, status, refresh } = useAdminGegevens(`organisatie:${id}`, () => api.organisatie(id));
const bewerkt = ref(false); const naam = ref(''); const verwacht = ref(''); const formulier = reactive(leegFormulier()); const auditVersie = ref(0);
function begin() { if (!data.value) return; naam.value = data.value.naam; verwacht.value = data.value.verwacht; Object.assign(formulier, formulierUitPartij(data.value.installateur)); bewerkt.value = true; }
const bewaar = (reden: string) => api.corrigeerOrganisatie(id, { reden, verwacht: verwacht.value, gegevens: { naam: naam.value, installateur: partijUitFormulier(formulier) } });
async function gewijzigd() { bewerkt.value = false; auditVersie.value++; await refresh(); }
useHead({ title: () => `${data.value?.naam ?? t('admin.organisatie')} · ${t('admin.titel')}` });
</script>
<template>
  <UButton to="/admin/organisaties" color="neutral" variant="link" icon="i-lucide-arrow-left" class="mb-5 px-0">{{ t('admin.organisaties') }}</UButton>
  <AdminStatus :fout="error" :bezig="status === 'pending' || !data" @opnieuw="refresh()"><div v-if="data" class="space-y-8">
    <header><div class="flex flex-wrap items-center justify-between gap-4"><h1 class="break-words text-2xl font-semibold">{{ data.naam }}</h1><UButton v-if="!bewerkt" color="neutral" variant="outline" @click="begin">{{ t('admin.bedrijfCorrigeren') }}</UButton></div><p class="mt-2 break-all text-xs text-muted">{{ data.id }} · {{ datum(data.aangemaakt) }}</p></header>
    <AdminCorrectieFormulier v-if="bewerkt" :titel="t('admin.bedrijfCorrigeren')" :bewaar="bewaar" @annuleer="bewerkt = false" @opgeslagen="gewijzigd">
      <UFormField :label="t('admin.organisatieNaam')" required><UInput v-model="naam" class="w-full" required maxlength="200" /></UFormField>
      <div class="grid gap-4 sm:grid-cols-2"><UFormField v-for="veld in (['naam', 'ondernemingsnummer', 'email', 'telefoon'] as const)" :key="veld" :label="t(`bedrijf.velden.${veld}`)"><UInput v-model="formulier[veld]" class="w-full" /></UFormField></div>
      <AdresVelden :model-value="formulier" /><p class="text-sm text-muted">{{ t('admin.logoBehouden') }}</p>
    </AdminCorrectieFormulier>
    <section v-else><h2 class="mb-4 text-xl font-semibold">{{ t('admin.bedrijfsgegevens') }}</h2><dl class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><div v-for="veld in (['naam', 'ondernemingsnummer', 'email', 'telefoon'] as const)" :key="veld"><dt class="text-muted">{{ t(`bedrijf.velden.${veld}`) }}</dt><dd class="mt-1 break-words">{{ data.installateur[veld] || '—' }}</dd></div></dl><p v-if="data.installateur.adres" class="mt-4 text-sm">{{ data.installateur.adres.straat }} {{ data.installateur.adres.nummer }} {{ data.installateur.adres.bus }} · {{ data.installateur.adres.postcode }} {{ data.installateur.adres.gemeente }} · {{ data.installateur.adres.land }}</p></section>
    <AdminToegang :bedrijf="data" @gewijzigd="gewijzigd" />
    <div class="grid gap-8 border-t border-default pt-7 lg:grid-cols-2">
      <section><h2 class="mb-4 text-xl font-semibold">{{ t('admin.leden') }} ({{ data.gebruikers.totaal }})</h2><p v-if="!data.gebruikers.totaal" class="text-muted">{{ t('admin.geenResultaten') }}</p><ul class="divide-y divide-default"><li v-for="u in data.gebruikers.items" :key="u.id" class="py-3"><NuxtLink :to="`/admin/gebruikers/${u.id}`" class="font-medium text-primary hover:underline">{{ u.naam }}</NuxtLink><p class="mt-1 break-words text-sm text-muted">{{ u.email }} · {{ t(u.rol === 'eigenaar' ? 'admin.eigenaar' : 'admin.lid') }}</p></li></ul><NuxtLink v-if="data.gebruikers.totaal > data.gebruikers.items.length" :to="{ path: '/admin/gebruikers', query: { organisatieId: id } }" class="text-primary underline">{{ t('admin.alleResultaten') }}</NuxtLink></section>
      <section><h2 class="mb-4 text-xl font-semibold">{{ t('admin.projecten') }} ({{ data.projectLijst.totaal }})</h2><p v-if="!data.projectLijst.totaal" class="text-muted">{{ t('admin.geenResultaten') }}</p><ul class="divide-y divide-default"><li v-for="p in data.projectLijst.items" :key="p.id" class="py-3"><NuxtLink :to="`/admin/projecten/${p.id}`" class="font-medium text-primary hover:underline">{{ p.naam }}</NuxtLink><p class="mt-1 text-sm text-muted">{{ p.klantnaam }} · {{ datum(p.gewijzigd) }}</p></li></ul><NuxtLink :to="{ path: '/admin/projecten', query: { organisatieId: id } }" class="text-sm text-primary underline underline-offset-4">{{ t('admin.alleProjecten') }}</NuxtLink></section>
    </div>
    <AdminNotities :organisatie-id="id" @gewijzigd="auditVersie++" />
    <AdminAudit :key="auditVersie" :filters="{ organisatieId: id }" />
  </div></AdminStatus>
</template>
