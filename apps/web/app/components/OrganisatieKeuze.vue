<script setup lang="ts">
import { useSessieStore } from "~/stores/sessie";

defineProps<{ compact?: boolean }>();
const sessie = useSessieStore();
const { bezig, organisatieItems, organisatieOptie } = useOrganisatieKeuzes();
</script>

<template>
  <UDropdownMenu v-if="sessie.actieveOrganisatie && sessie.organisaties.length > 2" :items="organisatieItems" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-building-2"
      trailing-icon="i-lucide-chevrons-up-down"
      class="min-w-0 max-w-32 sm:max-w-64"
      :loading="bezig"
      :aria-label="$t('menu.organisatieKeuzeMet', { organisatie: sessie.actieveOrganisatie.naam })"
      :title="$t('menu.organisatieKeuzeMet', { organisatie: sessie.actieveOrganisatie.naam })"
      data-testid="organisatie-keuze"
    >
      <span class="truncate" :class="compact ? 'sr-only' : ''">{{ sessie.actieveOrganisatie.naam }}</span>
    </UButton>
    <template #organisatie-optie-label="{ item }">
      <span :data-testid="'organisatie-optie-' + organisatieOptie(item).organisatieId">{{ organisatieOptie(item).label }}</span>
    </template>
  </UDropdownMenu>
</template>
