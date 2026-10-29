<script setup lang="ts">
// Het menu van de ingelogde gebruiker: zijn naam, "Mijn organisatie", "Bedrijfsgegevens", "Abonnement" en
// "Uitloggen", en de taal als submenu (dezelfde keuzes als `TaalKiezer`). Uitloggen gaat via de
// sessie-store, dus eerst langs `voorVertrek`.
import type { DropdownMenuItem } from "@nuxt/ui";
import { taalKeuzes } from "~/sessie/taal";
import { useSessieStore } from "~/stores/sessie";

/** Compact (de editor): de naam pas vanaf een breed scherm, anders alleen het icoon. */
defineProps<{ compact?: boolean }>();

const { t } = useI18n();
const sessie = useSessieStore();
const toast = useToast();
const { taal, zetTaal } = useTaal();

const bezig = ref(false);

async function uitloggen() {
  if (bezig.value) return;
  bezig.value = true;
  try {
    if (await sessie.uitloggen()) await navigateTo("/inloggen", { replace: true });
  } catch {
    toast.add({ title: t("menu.uitloggenMislukt"), color: "error" });
  } finally {
    bezig.value = false;
  }
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: "label", label: sessie.gebruiker?.naam ?? "", description: sessie.gebruiker?.email ?? "" }],
  // Zonder organisatie hebben deze pagina's niets te tonen.
  ...(sessie.actieveOrganisatie
    ? [
        [
          { label: t("menu.mijnOrganisatie"), icon: "i-lucide-users", to: "/organisatie", slot: "organisatie" as const },
          { label: t("menu.bedrijfsgegevens"), icon: "i-lucide-building-2", to: "/instellingen" },
          { label: t("menu.abonnement"), icon: "i-lucide-credit-card", to: "/abonnement" },
        ],
      ]
    : []),
  [
    {
      label: t("taal.label"),
      icon: "i-lucide-languages",
      slot: "taal" as const,
      children: taalKeuzes(taal.value, zetTaal),
    },
  ],
  [{ label: t("menu.uitloggen"), icon: "i-lucide-log-out", slot: "uitloggen" as const, onSelect: uitloggen }],
]);
</script>

<template>
  <UDropdownMenu v-if="sessie.gebruiker" :items="items" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      icon="i-lucide-circle-user-round"
      class="min-w-0 max-w-48"
      :loading="bezig"
      :aria-label="$t('menu.gebruiker')"
      :title="$t('menu.gebruiker')"
      data-testid="gebruiker-menu"
    >
      <span class="hidden truncate" :class="compact ? 'xl:inline' : 'sm:inline'">{{ sessie.gebruiker.naam }}</span>
    </UButton>
    <template #organisatie-label>
      <span data-testid="mijn-organisatie">{{ $t("menu.mijnOrganisatie") }}</span>
    </template>
    <template #taal-label>
      <span data-testid="taal-menu">{{ $t("taal.label") }}</span>
    </template>
    <template #uitloggen-label>
      <span data-testid="uitloggen">{{ $t("menu.uitloggen") }}</span>
    </template>
  </UDropdownMenu>
</template>
