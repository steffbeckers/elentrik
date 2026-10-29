<script setup lang="ts">
// De foutpagina van de app: een onbekende pagina, of een server die (even) niet antwoordt.
import type { NuxtError } from "#app";
import { isTaal } from "../shared/taal";
import { uiLocale } from "./sessie/ui-taal";

const props = defineProps<{ error: NuxtError }>();
const { t, locale } = useI18n();

// Nuxt UI (aria-labels, sluitknoppen) in dezelfde taal als de interface.
const ui = computed(() => uiLocale(isTaal(locale.value) ? locale.value : "nl"));

const nietGevonden = computed(() => props.error.statusCode === 404);

useHead({ title: () => `${t(nietGevonden.value ? "fout.nietGevonden.titel" : "fout.algemeen.titel")} · ${t("app.naam")}` });

/** Opnieuw proberen: de fout wissen en de pagina opnieuw laden (de sessie wordt opnieuw gelezen). */
function opnieuw() {
  window.location.reload();
}
</script>

<template>
  <UApp :locale="ui">
    <main class="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
      <UCard class="w-full max-w-md">
        <template #header>
          <h1 class="text-xl font-semibold" data-testid="foutpagina">
            {{ $t(nietGevonden ? "fout.nietGevonden.titel" : "fout.algemeen.titel") }}
          </h1>
        </template>
        <p class="text-sm text-muted">
          {{ $t(nietGevonden ? "fout.nietGevonden.beschrijving" : "fout.algemeen.beschrijving") }}
        </p>
        <template #footer>
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              color="neutral"
              variant="outline"
              :label="$t('fout.naarStart')"
              @click="clearError({ redirect: '/' })"
            />
            <UButton v-if="!nietGevonden" :label="$t('fout.opnieuw')" @click="opnieuw" />
          </div>
        </template>
      </UCard>
    </main>
  </UApp>
</template>
