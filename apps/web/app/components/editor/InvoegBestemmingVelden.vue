<script setup lang="ts">
import type {
  DifferentieelInstellingen,
  LichtschakelingDoel,
} from "@elentrik/model";
import { useEditorStore } from "~/stores/editor";
import { differentieelBezetting, invoegSpecificatie } from "~/editor/invoegen";
import { KEUZELIJST_IN_DIALOOG } from "~/editor/keuzelijst";
import { invoegDoelKeuzes } from "~/editor/schema-navigatie";

/**
 * `opBord`: de bestemming is het bord zelf (de aarding), zonder differentieel. De keuzelijst noemt
 * een bord dan "Rechtstreeks op het bord" en de velden van een nieuw differentieel blijven weg.
 */
const props = defineProps<{ doelen: LichtschakelingDoel[]; opBord?: boolean }>();
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
/** De bezetting van een bestaand differentieel van maximaal 30 mA; een andere bestemming heeft er geen. */
function bezettingVan(bestemming: LichtschakelingDoel | undefined) {
  return store.document && bestemming?.soort === "bestaande-differentieel"
    ? differentieelBezetting(store.document, bestemming.nodeId)
    : undefined;
}
const items = computed(() => {
  if (!store.document || !store.analyse) return [];
  const bezettingen = new Map(props.doelen.map((d) => [`${d.soort}:${d.nodeId}`, bezettingVan(d)]));
  return invoegDoelKeuzes(store.document, store.analyse, props.doelen,
    type => t(`editor.types.${type}`),
    soort => t(`editor.invoegen.doelen.${props.opBord && soort === "nieuw-op-bord" ? "op-bord" : soort}`),
  ).map((keuze) => {
    // "6 van 8 kringen": zo is te zien welk differentieel nog plaats heeft.
    const bezetting = bezettingen.get(keuze.value);
    return bezetting
      ? { ...keuze, label: `${keuze.label} — ${t("editor.invoegen.bezetting", { aantal: bezetting.aantal, max: bezetting.max })}` }
      : keuze;
  });
});
const bestaandeDifferentieel = computed(() =>
  doel.value?.soort === "bestaande-differentieel"
    ? store.document?.nodes[doel.value.nodeId]
    : undefined,
);
/** Het gekozen differentieel zit vol: nog een kring erachter geeft een bevinding. */
const volleBezetting = computed(() => {
  const bezetting = bezettingVan(doel.value);
  return bezetting?.vol ? bezetting : undefined;
});
</script>

<template>
  <UFormField :label="$t('editor.invoegen.bestemming')" required>
    <USelect
      v-model="waarde"
      :items="items"
      :placeholder="$t('editor.invoegen.kiesBestemming')"
      class="w-full"
      :content="KEUZELIJST_IN_DIALOOG"
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
  <p
    v-if="volleBezetting"
    role="status"
    class="flex items-start gap-2 text-sm text-warning"
    data-testid="differentieel-vol"
  >
    <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
    <span>{{ $t("editor.invoegen.differentieelVol", { aantal: volleBezetting.aantal, max: volleBezetting.max }) }}</span>
  </p>
  <fieldset
    v-if="doel?.soort === 'nieuw-op-bord' && !opBord"
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
          :content="KEUZELIJST_IN_DIALOOG"
          class="w-full"
      /></UFormField>
      <UFormField :label="$t('velden.klasse.label')"
        ><USelect
          v-model="instellingen.klasse"
          :items="['AC', 'A', 'F', 'B']"
          :content="KEUZELIJST_IN_DIALOOG"
          class="w-full"
      /></UFormField>
    </div>
  </fieldset>
</template>
