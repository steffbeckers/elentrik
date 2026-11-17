<script setup lang="ts">
// De versie van de app klein onderaan elke pagina: de semver en de korte git-sha, voor zover bekend.
// Vast in de hoek en zonder klikgedrag: hij duwt geen pagina met een vaste schermhoogte (de editor) op
// en zit niets in de weg.
import { versieTekst } from "../../shared/versie";

const appVersie = useAppVersie();
const tekst = computed(() => versieTekst(appVersie.value));
</script>

<template>
  <footer
    v-if="tekst"
    class="pointer-events-none fixed bottom-1 left-2 z-10 font-mono text-[10px] leading-none text-dimmed select-none"
    data-testid="app-versie"
  >
    {{ $t("appVersie", { versie: tekst }) }}
  </footer>
</template>
