<script setup lang="ts">
const { t, localeProperties } = useI18n();

// `<html lang>` volgt de taal van de interface: nl-BE, fr-BE of en-GB.
useHead({ title: () => t("app.naam"), htmlAttrs: { lang: () => localeProperties.value.language ?? "nl-BE" } });
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
