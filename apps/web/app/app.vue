<script setup lang="ts">
import { titelVoor, toonBalk } from "../shared/omgeving";
import { LOCALES, isTaal } from "../shared/taal";
import { uiLocale } from "./sessie/ui-taal";

const { t, locale, localeProperties } = useI18n();

// Nuxt UI (aria-labels, sluitknoppen) in dezelfde taal als de interface.
const ui = computed(() => uiLocale(isTaal(locale.value) ? locale.value : "nl"));

const omgeving = useOmgeving();

// `<html lang>` volgt de taal van de interface: nl-BE, fr-BE of en-GB.
// Op staging krijgt elke titel (ook die van de pagina's) het voorvoegsel "[Staging] "; de klasse op <html>
// geeft de pagina's met een vaste schermhoogte ruimte voor de balk (main.css).
useHead({
  title: () => t("app.naam"),
  titleTemplate: (titel) => titelVoor(titel, omgeving.value),
  htmlAttrs: {
    lang: () => localeProperties.value.language ?? LOCALES.nl,
    class: () => (toonBalk(omgeving.value) ? "omgeving-staging" : undefined),
  },
});
</script>

<template>
  <UApp :locale="ui">
    <StagingBalk />
    <NuxtPage />
  </UApp>
</template>
