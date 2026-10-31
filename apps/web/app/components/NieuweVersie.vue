<script setup lang="ts">
// De melding bij een nieuwe versie van de app, op elke pagina:
// - een gewone update: een toast die blijft staan, met "Herladen" en een sluitknop. Gesloten telt als
//   gemeld; pas een nog nieuwere build geeft hem opnieuw;
// - een verplichte update: een modaal venster dat niet weg te klikken is. Het vervangt de toast.
// "Herladen" gaat via de store: de editor bewaart eerst, en met alles bewaard vraagt de browser niets.
import { useVersieStore } from "~/stores/versie";

const store = useVersieStore();
const toast = useToast();
const { t } = useI18n();

const TOAST_ID = "nieuwe-versie";

// Zolang de herlading loopt (het bewaren van het concept) kan de knop niet nog eens ingedrukt worden.
const bezig = ref(false);

async function herlaad(): Promise<void> {
  bezig.value = true;
  try {
    await store.herlaad();
  } finally {
    // De gebruiker kan de vraag van de browser ("pagina verlaten?") annuleren: dan blijft de pagina staan.
    bezig.value = false;
  }
}

// `toast.remove` ruimt na 200 ms het toastobject met die id op: alleen aanroepen voor een toast die er is,
// anders wist ze een toast die er intussen weer bij kwam.
let getoond = false;

function toonToast(): void {
  getoond = true;
  toast.add({
    id: TOAST_ID,
    title: t("versie.nieuw"),
    // 0: geen automatisch verdwijnen.
    duration: 0,
    close: true,
    actions: [
      // `closeOnClick: false`: annuleert de gebruiker het herladen, dan blijft de toast staan.
      { label: t("versie.herladen"), closeOnClick: false, onClick: () => void store.herlaad() },
    ],
    // Sluiten (kruisje, vegen of Escape) zonder herladen: deze build is gemeld.
    "onUpdate:open": (open: boolean) => {
      if (open) return;
      // Nuxt UI ruimt de gesloten toast zelf op.
      getoond = false;
      store.markeerGemeld();
    },
  });
}

watch(
  () => store.toonMelding,
  (tonen) => {
    if (tonen) toonToast();
    else if (getoond) {
      getoond = false;
      toast.remove(TOAST_ID);
    }
  },
  { immediate: true },
);
</script>

<template>
  <!-- Niet weg te klikken: zonder herladen kan de app niet meer samenwerken met de server. -->
  <UModal
    :open="store.vereist"
    :title="$t('app.naam')"
    :dismissible="false"
    :close="false"
    data-testid="versie-vereist"
  >
    <template #body>
      <p>{{ $t("versie.vereist") }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton :label="$t('versie.herladen')" :loading="bezig" data-testid="versie-herladen" @click="herlaad" />
      </div>
    </template>
  </UModal>
</template>
