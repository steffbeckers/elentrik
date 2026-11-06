<script setup lang="ts">
import {
  DocumentFout,
  RuimteSchema,
  SJABLONEN,
  voegSjabloonToe,
  type Ruimte,
  type SjabloonDoel,
  type DifferentieelInstellingen,
} from "@elentrik/model";
import { useEditorStore } from "~/stores/editor";
import {
  invoegBestemmingen,
  kringBestemming,
  invoegSpecificatie,
} from "~/editor/invoegen";
import AlleenLezenMelding from "./AlleenLezenMelding.vue";
import InvoegBestemmingVelden from "./InvoegBestemmingVelden.vue";

const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ sjabloonId: string }>();
const store = useEditorStore();
const { t } = useI18n();
const voerUit = useDocumentFoutMelding();
/** De keuze "Geen" in de keuzelijst Soort ruimte; een keuzelijst kent geen lege waarde. */
const GEEN = "__geen__";
/** De ruimte die het sjabloon voorstelt (de badkamer), of undefined: dan toont de dialoog geen veld. */
const suggestie = computed(() => SJABLONEN.find((s) => s.id === props.sjabloonId)?.ruimte);
const ruimteKeuze = ref<Ruimte | typeof GEEN>(GEEN);
const ruimteItems = computed(() => [
  { value: GEEN, label: t("editor.eigenschappen.geen") },
  ...RuimteSchema.options.map((value) => ({ value, label: t(`ruimtes.${value}`) })),
]);
/** Voor het model: de gekozen ruimte, `null` voor leeggemaakt, of undefined zonder suggestie. */
const ruimte = computed<Ruimte | null | undefined>(() =>
  suggestie.value === undefined ? undefined : ruimteKeuze.value === GEEN ? null : ruimteKeuze.value,
);
const doel = ref<SjabloonDoel>();
const instellingen = ref<DifferentieelInstellingen>({
  gevoeligheid_mA: 30,
  nominaal_A: 40,
  polen: 2,
  klasse: "A",
});
const doelen = computed(() =>
  store.document ? invoegBestemmingen(store.document) : [],
);
watch(open, (value) => {
  if (!value) return;
  ruimteKeuze.value = suggestie.value ?? GEEN;
  // Het differentieel van de selectie, anders het laatst gebruikte in dit bord, anders het bord.
  doel.value = store.document ? kringBestemming(store.document, doelen.value, store.selectie, store.laatsteDifferentieel) : undefined;
  instellingen.value = {
    gevoeligheid_mA: 30,
    nominaal_A: 40,
    polen:
      store.document?.voeding.stroomtype === "3N400V"
        ? 4
        : store.document?.voeding.stroomtype === "3x230V"
          ? 3
          : 2,
    klasse: "A",
  };
});
const voorbeeld = computed(() => {
  if (!store.document || !doel.value || !props.sjabloonId) return undefined;
  try {
    const r = voegSjabloonToe(
      store.document,
      doel.value,
      props.sjabloonId,
      instellingen.value,
      ruimte.value,
    );
    return Object.values(r.doc.nodes).filter(
      (n) => !store.document!.nodes[n.id],
    );
  } catch (e) {
    if (e instanceof DocumentFout) return undefined;
    throw e;
  }
});
function voegIn() {
  if (store.alleenLezen || !doel.value || !voorbeeld.value) return;
  if (
    voerUit(() =>
      store.voegSjabloonToe(props.sjabloonId, doel.value!, instellingen.value, ruimte.value),
    )
  )
    open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.invoegen.sjabloonTitel')">
    <template #body>
      <div class="space-y-5">
        <AlleenLezenMelding />
        <p class="font-medium">{{ $t(`editor.sjablonen.${sjabloonId}`) }}</p>
        <InvoegBestemmingVelden
          v-model:doel="doel"
          v-model:instellingen="instellingen"
          :doelen="doelen"
        />
        <UFormField
          v-if="suggestie"
          :label="$t('editor.invoegen.ruimte.label')"
          :help="$t('editor.invoegen.ruimte.hulp')"
        >
          <USelect
            v-model="ruimteKeuze"
            :items="ruimteItems"
            class="w-full"
            :disabled="store.alleenLezen"
            data-testid="sjabloon-ruimte"
          />
        </UFormField>
        <p class="text-sm text-muted">
          {{ $t(suggestie ? "editor.invoegen.voorinstellingenMetRuimte" : "editor.invoegen.voorinstellingen") }}
        </p>
        <section v-if="voorbeeld" aria-live="polite" class="space-y-2">
          <h3 class="font-medium">{{ $t("editor.invoegen.onderdelen") }}</h3>
          <ul class="space-y-1 text-sm" data-testid="invoeg-voorbeelddelen">
            <li v-for="n in voorbeeld" :key="n.id">
              {{ $t(`editor.types.${n.type}`) }}
              <span class="text-muted">{{ invoegSpecificatie(n) }}</span>
            </li>
          </ul>
        </section>
        <p v-else role="status" class="text-sm text-muted">
          {{
            $t(
              doel
                ? "editor.invoegen.ongeldigeWaarden"
                : "editor.invoegen.kiesBestemming",
            )
          }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">{{
          $t("editor.invoegen.annuleren")
        }}</UButton>
        <UButton
          :disabled="store.alleenLezen || !voorbeeld"
          data-testid="bevestig-sjabloon"
          @click="voegIn"
          >{{ $t("editor.invoegen.toevoegen") }}</UButton
        >
      </div>
    </template>
  </UModal>
</template>
