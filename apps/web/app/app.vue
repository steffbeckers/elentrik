<script setup lang="ts">
const { t } = useI18n();

useHead({ title: () => t("app.naam") });
</script>

<template>
  <UApp>
    <NuxtPage />
  </UApp>
</template>
