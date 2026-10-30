<script setup lang="ts">
import type { AdresFormulier } from "~/editor/adres";

// De adresvelden van een formulier. `naam` is het voorvoegsel van de veldnamen (`klant.straat`),
// zodat `UForm` de fouten bij het juiste veld toont; zonder `naam` heten de velden `straat`,
// `nummer`..., voor een formulier dat de adresvelden zelf op het hoogste niveau heeft. Welke velden
// ingevuld moeten zijn, bepaalt de validatie van het formulier, niet dit component.
const props = defineProps<{ naam?: string }>();

const adres = defineModel<AdresFormulier>({ required: true });

/** De veldnaam voor `UFormField`, met het voorvoegsel als dat er is. */
const veld = (naam: keyof AdresFormulier) => (props.naam ? `${props.naam}.${naam}` : naam);
/** De `data-testid` van een veld: `klant-straat`, of `adres-straat` zonder voorvoegsel. */
const testId = (naam: keyof AdresFormulier) => `${props.naam || "adres"}-${naam}`;
</script>

<template>
  <div class="grid grid-cols-6 gap-4">
    <UFormField :name="veld('straat')" :label="$t('editor.projectgegevens.adres.straat')" class="col-span-6 sm:col-span-4">
      <UInput v-model="adres.straat" class="w-full" :data-testid="testId('straat')" />
    </UFormField>
    <UFormField :name="veld('nummer')" :label="$t('editor.projectgegevens.adres.nummer')" class="col-span-3 sm:col-span-1">
      <UInput v-model="adres.nummer" class="w-full" :data-testid="testId('nummer')" />
    </UFormField>
    <UFormField :name="veld('bus')" :label="$t('editor.projectgegevens.adres.bus')" class="col-span-3 sm:col-span-1">
      <UInput v-model="adres.bus" class="w-full" />
    </UFormField>
    <UFormField :name="veld('postcode')" :label="$t('editor.projectgegevens.adres.postcode')" class="col-span-2">
      <UInput v-model="adres.postcode" class="w-full" :data-testid="testId('postcode')" />
    </UFormField>
    <UFormField :name="veld('gemeente')" :label="$t('editor.projectgegevens.adres.gemeente')" class="col-span-4">
      <UInput v-model="adres.gemeente" class="w-full" :data-testid="testId('gemeente')" />
    </UFormField>
    <UFormField :name="veld('land')" :label="$t('editor.projectgegevens.adres.land')" class="col-span-6">
      <UInput v-model="adres.land" class="w-full" />
    </UFormField>
  </div>
</template>
