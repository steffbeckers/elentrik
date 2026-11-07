<script setup lang="ts">
import type { AdminOrganisatieDetail } from '../../../shared/admin/records';
import AdminCorrectieFormulier from './AdminCorrectieFormulier.vue';
const props = defineProps<{ bedrijf: AdminOrganisatieDetail }>();
const emit = defineEmits<{ gewijzigd: [] }>();
const { t } = useI18n(); const { datum } = useAdminDatums(); const api = useAdminApi();
const actie = ref<'vrijstelling' | 'onderwijs' | 'proef' | null>(null); const verwacht = ref(''); const vrijgesteld = ref(false); const onderwijs = ref(false); const einddatum = ref(''); const stripeBevestigd = ref(false);
const stripeAanwezig = computed(() => !!props.bedrijf.abonnement.abonnementId || props.bedrijf.abonnement.openCheckout);
function begin(soort: 'vrijstelling' | 'onderwijs' | 'proef') { actie.value = soort; verwacht.value = props.bedrijf.toegangVerwacht; vrijgesteld.value = !props.bedrijf.toegang.vrijgesteld; onderwijs.value = !props.bedrijf.toegang.onderwijs; einddatum.value = ''; stripeBevestigd.value = false; }
async function bewaar(reden: string) {
  const basis = { reden, verwacht: verwacht.value };
  if (actie.value === 'onderwijs') return api.onderwijs(props.bedrijf.id, { ...basis, gegevens: { onderwijs: onderwijs.value, stripeBevestigd: stripeBevestigd.value } });
  return actie.value === 'vrijstelling' ? api.vrijstelling(props.bedrijf.id, { ...basis, gegevens: { vrijgesteld: vrijgesteld.value, stripeBevestigd: stripeBevestigd.value } }) : api.proef(props.bedrijf.id, { ...basis, gegevens: { einddatum: einddatum.value, stripeBevestigd: stripeBevestigd.value } });
}
const proefReden = computed(() => ['uit', 'vrijgesteld', 'onderwijs', 'actief'].includes(props.bedrijf.toegang.reden) || (props.bedrijf.toegang.reden === 'betaling-mislukt' && props.bedrijf.toegang.niveau === 'abonnement') ? props.bedrijf.toegang.reden : 'proef');
</script>
<template>
  <section class="space-y-5 border-t border-default pt-7">
    <h2 class="text-xl font-semibold">{{ t(bedrijf.toegang.niveau === 'gratis' ? 'admin.waaromGratis' : 'admin.waaromToegang') }}</h2>
    <div class="flex flex-wrap items-center gap-3"><UBadge :color="bedrijf.toegang.niveau === 'gratis' ? 'warning' : 'success'" variant="subtle">{{ t(`admin.groepen.${bedrijf.toegang.niveau}`) }}</UBadge><p class="font-medium">{{ t(`admin.redenen.${bedrijf.toegang.reden}`) }}</p></div>
    <p class="text-sm text-muted">{{ t('admin.beoordeeldOp', { datum: datum(bedrijf.toegang.beoordeeldOp) }) }} · {{ t('admin.rechtenUitleg') }}</p>
    <dl class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div><dt class="text-muted">{{ t('admin.proefEinde') }}</dt><dd class="mt-1">{{ datum(bedrijf.toegang.proefEinde) }} · {{ t('admin.tijdzone') }}</dd></div>
      <div><dt class="text-muted">{{ t('admin.gratieEinde') }}</dt><dd class="mt-1">{{ bedrijf.toegang.achterstalligTot ? datum(bedrijf.toegang.achterstalligTot) : t('admin.onbekendOfNietVanToepassing') }}</dd></div>
      <div><dt class="text-muted">{{ t('admin.vrijstelling') }}</dt><dd class="mt-1">{{ t(bedrijf.toegang.vrijgesteld ? 'admin.ingeschakeld' : 'admin.uitgeschakeld') }}</dd></div>
      <div><dt class="text-muted">{{ t('admin.onderwijs') }}</dt><dd class="mt-1">{{ t(bedrijf.toegang.onderwijs ? 'admin.ingeschakeld' : 'admin.uitgeschakeld') }}</dd></div>
    </dl>
    <div v-if="!actie" class="flex flex-wrap gap-3"><UButton color="neutral" variant="outline" @click="begin('proef')">{{ t('admin.proefVerlengen') }}</UButton><UButton v-if="bedrijf.toegang.vrijgesteld || !bedrijf.toegang.onderwijs" color="neutral" variant="outline" @click="begin('vrijstelling')">{{ t(bedrijf.toegang.vrijgesteld ? 'admin.vrijstellingStoppen' : 'admin.vrijstellingGeven') }}</UButton><UButton v-if="bedrijf.toegang.onderwijs || !bedrijf.toegang.vrijgesteld" color="neutral" variant="outline" @click="begin('onderwijs')">{{ t(bedrijf.toegang.onderwijs ? 'admin.onderwijsStoppen' : 'admin.onderwijsGeven') }}</UButton></div>
    <AdminCorrectieFormulier v-if="actie" :key="actie" :titel="t(actie === 'proef' ? 'admin.proefVerlengen' : actie === 'onderwijs' ? 'admin.onderwijs' : 'admin.vrijstelling')" :bewaar="bewaar" @annuleer="actie = null" @opgeslagen="actie = null; emit('gewijzigd')">
      <template v-if="actie === 'proef'"><UFormField :label="t('admin.nieuweEinddatum')" :description="t('admin.datumBrussel')" required><UInput v-model="einddatum" type="date" required /></UFormField><p v-if="einddatum" class="text-sm">{{ t('admin.proefVoorbeeld', { datum: datum(einddatum, false) }) }} {{ t(`admin.redenen.${proefReden}`) }}</p></template>
      <template v-else-if="actie === 'onderwijs'"><UCheckbox v-model="onderwijs" :label="t('admin.onderwijs')" /><p class="text-sm text-muted">{{ t(onderwijs ? 'admin.onderwijsUitleg' : 'admin.onderwijsVerwijderenUitleg') }}</p></template>
      <template v-else><UCheckbox v-model="vrijgesteld" :label="t('admin.vrijstelling')" /><p class="text-sm text-muted">{{ t(vrijgesteld ? 'admin.vrijstellingUitleg' : 'admin.vrijstellingVerwijderenUitleg') }}</p></template>
      <p v-if="!bedrijf.toegang.ingeschakeld" class="text-sm text-muted">{{ t('admin.billingUit') }}</p>
      <UAlert v-if="stripeAanwezig" color="warning" variant="subtle" :title="t('admin.stripeOngewijzigd')" :description="t('admin.stripeWaarschuwing')" />
      <UCheckbox v-if="stripeAanwezig" v-model="stripeBevestigd" required :label="t('admin.stripeBevestigen')" />
    </AdminCorrectieFormulier>
    <h3 class="pt-2 text-lg font-semibold">{{ t('admin.abonnement') }}</h3>
    <dl class="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
      <div><dt class="text-muted">{{ t('admin.stripeStatus') }}</dt><dd class="mt-1">{{ bedrijf.abonnement.status ?? t('admin.geenAbonnement') }}</dd></div>
      <div><dt class="text-muted">{{ t('admin.formule') }}</dt><dd class="mt-1">{{ bedrijf.abonnement.formule ? t(`abonnement.formules.${bedrijf.abonnement.formule}`) : '—' }}</dd></div>
      <div><dt class="text-muted">{{ t('admin.periodeEinde') }}</dt><dd class="mt-1">{{ datum(bedrijf.abonnement.periodeEinde) }}</dd></div>
      <div><dt class="text-muted">{{ t('admin.opzegging') }}</dt><dd class="mt-1">{{ t(bedrijf.abonnement.opgezegd ? 'admin.ja' : 'admin.nee') }}</dd></div>
      <div><dt class="text-muted">{{ t('admin.synchronisatie') }}</dt><dd class="mt-1">{{ datum(bedrijf.abonnement.bijgewerkt) }}</dd></div>
      <div><dt class="text-muted">{{ t('admin.openCheckout') }}</dt><dd class="mt-1">{{ t(bedrijf.abonnement.openCheckout ? 'admin.ja' : 'admin.nee') }}</dd></div>
    </dl>
    <p v-if="bedrijf.abonnement.abonnementId" class="break-all text-sm text-muted">{{ bedrijf.abonnement.abonnementId }} · {{ bedrijf.abonnement.klantId }}</p>
    <div class="flex flex-wrap gap-3"><UButton v-if="bedrijf.abonnement.links.abonnement" :to="bedrijf.abonnement.links.abonnement" target="_blank" rel="noopener noreferrer" trailing-icon="i-lucide-external-link" color="neutral" variant="outline">{{ t('admin.openStripeAbonnement') }}</UButton><UButton v-if="bedrijf.abonnement.links.klant" :to="bedrijf.abonnement.links.klant" target="_blank" rel="noopener noreferrer" trailing-icon="i-lucide-external-link" color="neutral" variant="ghost">{{ t('admin.openStripeKlant') }}</UButton></div>
    <p v-if="!bedrijf.abonnement.links.klant && bedrijf.abonnement.klantId" class="text-sm text-muted">{{ t('admin.stripeLinkOnbeschikbaar') }}</p>
  </section>
</template>
