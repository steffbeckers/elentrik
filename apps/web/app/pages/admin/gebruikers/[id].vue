<script setup lang="ts">
import AdminStatus from '~/components/admin/AdminStatus.vue';
import AdminCorrectieFormulier from '~/components/admin/AdminCorrectieFormulier.vue';
import AdminAudit from '~/components/admin/AdminAudit.vue';
import { useSessieStore } from '~/stores/sessie';
definePageMeta({ layout: 'admin', middleware: ['superuser'] });
const id = String(useRoute().params.id); const api = useAdminApi(); const { t } = useI18n(); const { datum } = useAdminDatums(); const sessie = useSessieStore();
const { data, error, status, refresh } = useAdminGegevens(`gebruiker:${id}`, () => api.gebruiker(id));
const bewerkt = ref(false); const naam = ref(''); const verwacht = ref(''); const auditVersie = ref(0);
function begin() { if (!data.value) return; naam.value = data.value.naam; verwacht.value = data.value.verwacht; bewerkt.value = true; }
const bewaar = (reden: string) => api.corrigeerGebruiker(id, { reden, verwacht: verwacht.value, gegevens: { naam: naam.value } });
async function opgeslagen() { bewerkt.value = false; auditVersie.value++; await refresh(); if (sessie.gebruiker?.id === id) await sessie.laad(); }
useHead({ title: () => `${data.value?.naam ?? t('admin.gebruiker')} · ${t('admin.titel')}` });
</script>
<template>
  <UButton to="/admin/gebruikers" color="neutral" variant="link" icon="i-lucide-arrow-left" class="mb-5 px-0">{{ t('admin.gebruikers') }}</UButton>
  <AdminStatus :fout="error" :bezig="status === 'pending' || !data" @opnieuw="refresh()"><div v-if="data" class="space-y-8">
    <header><div class="flex flex-wrap items-center justify-between gap-4"><h1 class="break-words text-2xl font-semibold">{{ data.naam }}</h1><UButton v-if="!bewerkt" color="neutral" variant="outline" @click="begin">{{ t('admin.naamCorrigeren') }}</UButton></div><p class="mt-2 break-words text-muted">{{ data.email }}</p><p class="mt-2 break-all text-xs text-muted">{{ data.id }}</p></header>
    <AdminCorrectieFormulier v-if="bewerkt" :titel="t('admin.naamCorrigeren')" :bewaar="bewaar" @annuleer="bewerkt = false" @opgeslagen="opgeslagen"><UFormField :label="t('admin.naam')" required><UInput v-model="naam" class="w-full" required maxlength="200" /></UFormField></AdminCorrectieFormulier>
    <dl class="flex flex-wrap gap-x-12 gap-y-4 text-sm"><div><dt class="text-muted">{{ t('admin.emailBevestigd') }}</dt><dd class="mt-1">{{ t(data.emailBevestigd ? 'admin.ja' : 'admin.nee') }}</dd></div><div><dt class="text-muted">{{ t('admin.aangemaakt') }}</dt><dd class="mt-1">{{ datum(data.aangemaakt) }}</dd></div></dl>
    <section><h2 class="mb-4 text-xl font-semibold">{{ t('admin.organisaties') }} ({{ data.organisaties.totaal }})</h2><p v-if="!data.organisaties.totaal" class="text-muted">{{ t('admin.geenResultaten') }}</p><ul class="divide-y divide-default"><li v-for="o in data.organisaties.items" :key="o.id" class="py-3"><NuxtLink :to="`/admin/organisaties/${o.id}`" class="font-medium text-primary hover:underline">{{ o.naam }}</NuxtLink><span class="ml-3 text-sm text-muted">{{ t(`admin.groepen.${o.groep}`) }}</span></li></ul><NuxtLink v-if="data.organisaties.totaal > data.organisaties.items.length" :to="{ path: '/admin/organisaties', query: { gebruikerId: id } }" class="text-primary underline">{{ t('admin.alleResultaten') }}</NuxtLink></section>
    <AdminAudit :key="auditVersie" :filters="{ doelId: id }" />
  </div></AdminStatus>
</template>
