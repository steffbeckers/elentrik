<script setup lang="ts">
// De actieve organisatie kiezen in de bovenbalk. Wisselen gaat via de sessie-store, dus eerst
// langs `voorVertrek` (de editor slaat dan nog op); daarna volgt de projectenlijst van de nieuwe
// organisatie. Onderaan: een nieuw bedrijf aanmaken.
import type { DropdownMenuItem } from "@nuxt/ui";
import { useSessieStore } from "~/stores/sessie";

/** Compact (de editor): de naam pas vanaf een breed scherm, anders alleen het icoon. */
defineProps<{ compact?: boolean }>();

const { t } = useI18n();
const sessie = useSessieStore();
const toast = useToast();

const nieuwOpen = ref(false);
const bezig = ref(false);

async function kies(organisatieId: string) {
  if (bezig.value || organisatieId === sessie.actieveOrganisatieId) return;
  bezig.value = true;
  try {
    if (await sessie.wissel(organisatieId)) await navigateTo("/");
  } catch {
    toast.add({ title: t("menu.wisselenMislukt"), color: "error" });
  } finally {
    bezig.value = false;
  }
}

const items = computed<DropdownMenuItem[][]>(() => [
  sessie.organisaties.map((organisatie) => ({
    type: "checkbox" as const,
    label: organisatie.naam,
    description: t(`rollen.${organisatie.rol}`),
    checked: organisatie.id === sessie.actieveOrganisatieId,
    onSelect: () => kies(organisatie.id),
  })),
  [
    {
      label: t("menu.nieuwBedrijf"),
      icon: "i-lucide-plus",
      slot: "nieuw" as const,
      onSelect: () => {
        nieuwOpen.value = true;
      },
    },
  ],
]);

async function aangemaakt() {
  nieuwOpen.value = false;
  await navigateTo("/");
}
</script>

<template>
  <UDropdownMenu v-if="sessie.actieveOrganisatie" :items="items" :content="{ align: 'start' }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-building-2"
      trailing-icon="i-lucide-chevrons-up-down"
      class="min-w-0 max-w-48 sm:max-w-64"
      :loading="bezig"
      :title="`${$t('menu.organisatieKeuze')}: ${sessie.actieveOrganisatie.naam}`"
      data-testid="organisatie-keuze"
    >
      <span class="truncate" :class="compact ? 'sr-only xl:not-sr-only' : ''">{{ sessie.actieveOrganisatie.naam }}</span>
    </UButton>
    <template #nieuw-label>
      <span data-testid="organisatie-nieuw">{{ $t("menu.nieuwBedrijf") }}</span>
    </template>
  </UDropdownMenu>

  <UModal v-model:open="nieuwOpen" :title="$t('geenOrganisatie.nieuw.titel')">
    <template #body>
      <NieuwBedrijfFormulier @aangemaakt="aangemaakt" />
    </template>
  </UModal>
</template>
