<script setup lang="ts">
import type { AdresFormulier } from "~/editor/adres";

// De adresvelden van een formulier. `naam` is het voorvoegsel van de veldnamen (`klant.straat`),
// zodat `UForm` de fouten bij het juiste veld toont; `verplicht` zet het sterretje.
defineProps<{ naam: string; verplicht?: boolean }>();

const adres = defineModel<AdresFormulier>({ required: true });
</script>

<template>
  <div class="grid grid-cols-6 gap-4">
    <UFormField
      :name="`${naam}.straat`"
      :label="$t('editor.projectgegevens.adres.straat')"
      :required="verplicht"
      class="col-span-6 sm:col-span-4"
    >
      <UInput v-model="adres.straat" class="w-full" :data-testid="`${naam}-straat`" />
    </UFormField>
    <UFormField
      :name="`${naam}.nummer`"
      :label="$t('editor.projectgegevens.adres.nummer')"
      :required="verplicht"
      class="col-span-3 sm:col-span-1"
    >
      <UInput v-model="adres.nummer" class="w-full" :data-testid="`${naam}-nummer`" />
    </UFormField>
    <UFormField :name="`${naam}.bus`" :label="$t('editor.projectgegevens.adres.bus')" class="col-span-3 sm:col-span-1">
      <UInput v-model="adres.bus" class="w-full" />
    </UFormField>
    <UFormField
      :name="`${naam}.postcode`"
      :label="$t('editor.projectgegevens.adres.postcode')"
      :required="verplicht"
      class="col-span-2"
    >
      <UInput v-model="adres.postcode" class="w-full" :data-testid="`${naam}-postcode`" />
    </UFormField>
    <UFormField
      :name="`${naam}.gemeente`"
      :label="$t('editor.projectgegevens.adres.gemeente')"
      :required="verplicht"
      class="col-span-4"
    >
      <UInput v-model="adres.gemeente" class="w-full" :data-testid="`${naam}-gemeente`" />
    </UFormField>
    <UFormField :name="`${naam}.land`" :label="$t('editor.projectgegevens.adres.land')" class="col-span-6">
      <UInput v-model="adres.land" class="w-full" />
    </UFormField>
  </div>
</template>
