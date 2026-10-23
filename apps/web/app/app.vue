<script setup lang="ts">
import { LOCALES, isTaal } from "../shared/taal";
import { uiLocale } from "./sessie/ui-taal";

const { t, locale, localeProperties } = useI18n();

// Nuxt UI (aria-labels, sluitknoppen) in dezelfde taal als de interface.
const ui = computed(() => uiLocale(isTaal(locale.value) ? locale.value : "nl"));

// `<html lang>` volgt de taal van de interface: nl-BE, fr-BE of en-GB.
useHead({ title: () => t("app.naam"), htmlAttrs: { lang: () => localeProperties.value.language ?? LOCALES.nl } });
</script>

<template>
  <UApp :locale="ui">
    <NuxtPage />
  </UApp>
</template>
