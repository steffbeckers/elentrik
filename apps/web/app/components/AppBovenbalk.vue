<script setup lang="ts">
// De bovenbalk van de pagina's buiten de editor: de app, de organisatiekeuze en het menu van de
// gebruiker.
</script>

<template>
  <header class="flex items-center gap-2 border-b border-default px-3 py-2 sm:px-4">
    <NuxtLink to="/" class="flex shrink-0 items-center gap-2 font-semibold" :title="$t('bedrijf.terug')">
      <UIcon name="i-lucide-zap" class="size-5 text-primary" />
      <span class="hidden sm:inline">{{ $t("app.naam") }}</span>
    </NuxtLink>
    <OrganisatieKeuze />
    <div class="ml-auto flex shrink-0 items-center">
      <GebruikerMenu />
    </div>
  </header>
</template>
