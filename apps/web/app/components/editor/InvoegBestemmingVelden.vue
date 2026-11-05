<script setup lang="ts">
import type {
  DifferentieelInstellingen,
  LichtschakelingDoel,
} from "@elentrik/model";
import { useEditorStore } from "~/stores/editor";
import { invoegSpecificatie } from "~/editor/invoegen";
import { invoegDoelKeuzes } from "~/editor/schema-navigatie";

const props = defineProps<{ doelen: LichtschakelingDoel[] }>();
const doel = defineModel<LichtschakelingDoel | undefined>("doel");
const instellingen = defineModel<DifferentieelInstellingen>("instellingen", {
  required: true,
});
const store = useEditorStore();
const { t } = useI18n();
const waarde = computed({
  get: () =>
    doel.value ? `${doel.value.soort}:${doel.value.nodeId}` : undefined,
  set: (value: string | undefined) => {
    doel.value = props.doelen.find((d) => `${d.soort}:${d.nodeId}` === value);
  },
});
const items = computed(() => store.document && store.analyse
  ? invoegDoelKeuzes(store.document, store.analyse, props.doelen,
    type => t(`editor.types.${type}`), soort => t(`editor.invoegen.doelen.${soort}`))
  : []);
const bestaandeDifferentieel = computed(() =>
  doel.value?.soort === "bestaande-differentieel"
    ? store.document?.nodes[doel.value.nodeId]
    : undefined,
);
</script>

<template>
  <UFormField :label="$t('editor.invoegen.bestemming')" required>
    <USelect
      v-model="waarde"
      :items="items"
      :placeholder="$t('editor.invoegen.kiesBestemming')"
      class="w-full"
      data-testid="invoeg-bestemming"
      :disabled="store.alleenLezen"
    />
  </UFormField>
  <p
    v-if="bestaandeDifferentieel"
    class="text-sm text-muted"
    data-testid="hergebruik-differentieel"
  >
    {{ $t("editor.invoegen.hergebruik") }}
    {{ invoegSpecificatie(bestaandeDifferentieel) }}
  </p>
  <fieldset
    v-if="doel?.soort === 'nieuw-op-bord'"
    class="space-y-3"
    :disabled="store.alleenLezen"
  >
    <legend class="mb-2 font-medium">
      {{ $t("editor.invoegen.nieuweDifferentieel") }}
    </legend>
    <div class="grid grid-cols-2 gap-3">
      <UFormField :label="$t('velden.gevoeligheid_mA.label')"
        ><UInput
          v-model.number="instellingen.gevoeligheid_mA"
          type="number"
          :min="1"
          class="w-full"
      /></UFormField>
      <UFormField :label="$t('velden.nominaal_A.label')"
        ><UInput
          v-model.number="instellingen.nominaal_A"
          type="number"
          :min="1"
          class="w-full"
      /></UFormField>
      <UFormField :label="$t('velden.polen.label')"
        ><USelect
          v-model="instellingen.polen"
          :items="[1, 2, 3, 4]"
          class="w-full"
      /></UFormField>
      <UFormField :label="$t('velden.klasse.label')"
        ><USelect
          v-model="instellingen.klasse"
          :items="['AC', 'A', 'F', 'B']"
          class="w-full"
      /></UFormField>
    </div>
  </fieldset>
</template>
