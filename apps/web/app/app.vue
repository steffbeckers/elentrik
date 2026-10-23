<script setup lang="ts">
import { LOCALES } from "../shared/taal";

const { t, localeProperties } = useI18n();

// `<html lang>` volgt de taal van de interface: nl-BE, fr-BE of en-GB.
useHead({ title: () => t("app.naam"), htmlAttrs: { lang: () => localeProperties.value.language ?? LOCALES.nl } });
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
