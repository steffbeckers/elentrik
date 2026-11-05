<template>
  <header class="flex items-center gap-2 border-b border-default px-3 py-2 sm:px-4">
    <NuxtLink to="/" class="flex shrink-0 items-center gap-2 font-semibold" :title="$t('bedrijf.terug')">
      <UIcon name="i-lucide-zap" class="size-5 text-primary" />
      <span>{{ $t("app.naam") }}</span>
    </NuxtLink>
    <div class="ml-auto flex min-w-0 items-center gap-1">
      <OrganisatieKeuze />
      <GebruikerMenu />
    </div>
  </header>
</template>
