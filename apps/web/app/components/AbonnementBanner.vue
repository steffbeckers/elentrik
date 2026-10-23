<script setup lang="ts">
// De banner onder de bovenbalk: de laatste week van de proefperiode, een mislukte betaling, of
// alleen-lezen. Welke (of geen) volgt uit de toegang van de actieve organisatie en de rol.
import { bannerVoor, datumTekst } from "~/abonnement/weergave";
import { useSessieStore } from "~/stores/sessie";

const sessie = useSessieStore();

// Het aantal dagen hangt van het huidige moment af; elke minuut bijwerken is ruim genoeg.
const nu = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  nu.value = new Date();
  timer = setInterval(() => (nu.value = new Date()), 60_000);
});
onBeforeUnmount(() => clearInterval(timer));

const banner = computed(() => bannerVoor(sessie.toegang, sessie.rol, nu.value));
</script>

<template>
  <UAlert
    v-if="banner"
    :color="banner.soort === 'proef' ? 'info' : 'warning'"
    variant="subtle"
    icon="i-lucide-info"
    class="rounded-none"
    :title="
      banner.soort === 'proef'
        ? $t('abonnement.banner.proef', { n: banner.dagen ?? 0 }, banner.dagen ?? 0)
        : banner.soort === 'betaling'
          ? banner.tot
            ? $t('abonnement.banner.betaling', { datum: datumTekst(banner.tot) })
            : $t('abonnement.banner.betalingZonderDatum')
          : $t('abonnement.banner.alleenLezen')
    "
    :actions="
      banner.knop
        ? [
            {
              label: $t(banner.knopSleutel ?? 'abonnement.banner.kies'),
              color: 'neutral',
              variant: 'outline',
              to: '/abonnement',
            },
          ]
        : undefined
    "
    :data-testid="`abonnement-banner-${banner.soort}`"
  />
</template>
