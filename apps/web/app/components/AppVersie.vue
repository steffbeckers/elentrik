<script setup lang="ts">
// De versie van de app klein onderaan elke pagina: de semantische versie en, als die bekend is, de korte
// git-sha. Vast in de hoek en zonder klikgedrag: hij duwt geen pagina met een vaste schermhoogte (de
// editor) op en zit niets in de weg.
import { APP_VERSIE } from "../../shared/versie";

const revisie = useRevisie();
const tekst = computed(() => (revisie.value ? `${APP_VERSIE} ${revisie.value}` : APP_VERSIE));
</script>

<template>
  <footer
    class="pointer-events-none fixed bottom-1 left-2 z-10 font-mono text-[10px] leading-none text-dimmed select-none"
    data-testid="app-versie"
  >
    {{ $t("appVersie", { versie: tekst }) }}
  </footer>
</template>
