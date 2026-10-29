<script setup lang="ts">
// De taalkiezer op de aanmeld-, registratie- en uitnodigingspagina's (AuthKader). Elke taal staat
// er in haar eigen taal. Het gebruikersmenu toont dezelfde keuzes als submenu (`taalKeuzes`).
import { TAALNAMEN, taalKeuzes } from "~/sessie/taal";

const { taal, zetTaal } = useTaal();
const items = computed(() => taalKeuzes(taal.value, zetTaal));
</script>

<template>
  <UDropdownMenu :items="items" :content="{ align: 'center' }">
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-languages"
      :label="TAALNAMEN[taal]"
      :aria-label="$t('taal.kiezen')"
      :title="$t('taal.kiezen')"
      data-testid="taal-kiezer"
    />
  </UDropdownMenu>
</template>
