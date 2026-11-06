<script setup lang="ts">
import GenummerdeSectie from "~/components/editor/GenummerdeSectie.vue";
import type { MetingenFormulier } from "~/editor/projectformulier";

// De sectie Metingen van de projectgegevens: geregistreerde waarden zonder grenswaarde of
// beoordeling. De veldnamen (`metingen.aardingsweerstand_ohm`) volgen de fouten van
// `valideerProjectFormulier`, zodat `UForm` ze bij het juiste veld toont.
const metingen = defineModel<MetingenFormulier>({ required: true });
/** Het nummer van de sectie in het formulier. */
defineProps<{ nummer: number }>();
</script>

<template>
  <GenummerdeSectie
    :nummer="nummer"
    :titel="$t('editor.projectgegevens.metingen.titel')"
    :uitleg="$t('editor.projectgegevens.metingen.uitleg')"
    data-testid="metingen"
  >
    <div class="grid grid-cols-2 gap-4">
      <UFormField name="metingen.datum" :label="$t('editor.projectgegevens.metingen.datum')" class="col-span-2 sm:col-span-1">
        <UInput v-model="metingen.datum" type="date" class="w-full" data-testid="meting-datum" />
      </UFormField>
      <UFormField name="metingen.meettoestel" :label="$t('editor.projectgegevens.metingen.meettoestel')" class="col-span-2 sm:col-span-1">
        <UInput v-model="metingen.meettoestel" class="w-full" data-testid="meting-meettoestel" />
      </UFormField>
      <UFormField name="metingen.aardingsweerstand_ohm" :label="$t('editor.projectgegevens.metingen.aardingsweerstand')" class="col-span-2 sm:col-span-1">
        <UInput
          v-model="metingen.aardingsweerstand_ohm"
          type="number"
          min="0"
          step="any"
          class="w-full"
          data-testid="meting-aardingsweerstand"
          :ui="{ trailing: 'pointer-events-none' }"
        >
          <template #trailing><span class="text-xs text-muted">Ω</span></template>
        </UInput>
      </UFormField>
      <UFormField name="metingen.isolatieweerstand_MOhm" :label="$t('editor.projectgegevens.metingen.isolatieweerstand')" class="col-span-2 sm:col-span-1">
        <UInput
          v-model="metingen.isolatieweerstand_MOhm"
          type="number"
          min="0"
          step="any"
          class="w-full"
          data-testid="meting-isolatieweerstand"
          :ui="{ trailing: 'pointer-events-none' }"
        >
          <template #trailing><span class="text-xs text-muted">MΩ</span></template>
        </UInput>
      </UFormField>
      <UFormField name="metingen.opmerking" :label="$t('editor.projectgegevens.metingen.opmerking')" class="col-span-2">
        <UTextarea v-model="metingen.opmerking" :rows="2" autoresize class="w-full" data-testid="meting-opmerking" />
      </UFormField>
    </div>
  </GenummerdeSectie>
</template>
