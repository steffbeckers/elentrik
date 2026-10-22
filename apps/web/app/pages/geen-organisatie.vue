<script setup lang="ts">
import { useSessieStore } from "~/stores/sessie";

const { t } = useI18n();
const sessie = useSessieStore();

/** Wie al een bedrijf heeft, komt hier om er een bij te maken. */
const bijkomend = computed(() => sessie.organisaties.length > 0);
const titel = computed(() => (bijkomend.value ? t("geenOrganisatie.titelBijkomend") : t("geenOrganisatie.titel")));

useHead({ title: () => `${titel.value} · ${t("app.naam")}` });

async function aangemaakt() {
  await navigateTo("/", { replace: true });
}
</script>

<template>
  <AuthKader :titel="titel">
    <div class="space-y-6">
      <section class="space-y-3">
        <h2 class="font-semibold">{{ $t("geenOrganisatie.nieuw.titel") }}</h2>
        <NieuwBedrijfFormulier @aangemaakt="aangemaakt" />
      </section>
      <template v-if="!bijkomend">
        <USeparator :label="$t('inloggen.of')" />
        <section class="space-y-2">
          <h2 class="font-semibold">{{ $t("geenOrganisatie.uitnodiging.titel") }}</h2>
          <p class="text-sm text-muted">{{ $t("geenOrganisatie.uitnodiging.uitleg") }}</p>
        </section>
      </template>
    </div>
    <template #voet>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="truncate text-sm text-muted">{{ sessie.gebruiker?.email }}</span>
        <div class="flex gap-2">
          <UButton
            v-if="bijkomend"
            to="/"
            color="neutral"
            variant="ghost"
            size="sm"
            :label="$t('geenOrganisatie.terug')"
          />
          <GebruikerMenu />
        </div>
      </div>
    </template>
  </AuthKader>
</template>
