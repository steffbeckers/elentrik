<script setup lang="ts">
import type { Voorinstelling } from "@elentrik/model";
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import SymboolVoorbeeld from "~/components/editor/SymboolVoorbeeld.vue";
import { useSymboolNamen } from "~/composables/useSymboolNamen";
import {
  KAARTEN,
  bediening,
  combinaties,
  naarVoorinstelling,
  voorbeeldNode,
  zelfdeCombinatie,
  zoekKaarten,
  type Categorie,
  type Kaart,
} from "~/editor/symbolen";
import { useEditorStore } from "~/stores/editor";

// Het symbolenvenster (spec §4.2): links de kaarten per categorie met een zoekveld, rechts de
// geopende kaart met een live voorbeeld, de bediening per visueel veld en het raster met alle
// combinaties. In alleen-lezen is alles te bekijken, maar kiezen kan niet.

const CATEGORIEEN: readonly Categorie[] = ["punten", "leidingenEnBorden", "beveiliging", "voeding"];

const store = useEditorStore();
const { kaartNaam, uitleg, arei, soortNaam, veldNaam, korteNaam, zoekTekst } = useSymboolNamen();

const zoek = ref("");
const geopend = ref<Kaart>(KAARTEN[0]!);
/** De stand van de bediening: elk veld van de geopende kaart heeft een waarde (zie `bediening`). */
const stand = ref<Voorinstelling>({});

const groepen = computed(() => {
  const gevonden = zoekKaarten(KAARTEN, zoek.value, zoekTekst);
  return CATEGORIEEN.map((categorie) => ({
    categorie,
    kaarten: gevonden.filter((k) => k.categorie === categorie),
  })).filter((groep) => groep.kaarten.length > 0);
});

const rooster = computed(() => (geopend.value.velden.length > 0 ? combinaties(geopend.value) : []));
const magKiezen = computed(() => !store.alleenLezen && geopend.value.onderdeel !== null);

/** Opent een kaart met de huidige voorinstelling van haar onderdeel. */
function open(kaart: Kaart): void {
  geopend.value = kaart;
  const huidig = kaart.onderdeel === null ? {} : (store.voorinstellingen[kaart.onderdeel] ?? {});
  stand.value = bediening(kaart, huidig);
}

// Bij openen: een leeg zoekveld en de kaart van het gekozen onderdeel.
watch(
  () => store.symbolenOpen,
  (nuOpen) => {
    if (!nuOpen) return;
    zoek.value = "";
    open(KAARTEN.find((k) => k.onderdeel === store.onderdeel) ?? KAARTEN[0]!);
  },
  { immediate: true },
);

function zet(sleutel: keyof Voorinstelling, waarde: unknown): void {
  // Het aantal is een heel getal van minstens 1, ook als het veld leeg of kommagetal geeft.
  if (sleutel === "aantal") waarde = Math.max(1, Math.round(typeof waarde === "number" ? waarde : 1));
  stand.value = { ...stand.value, [sleutel]: waarde };
}

/** Een combinatie uit het raster zet de bediening op haar waarden; het aantal blijft. */
function zetCombinatie(combinatie: Voorinstelling): void {
  const nieuw = bediening(geopend.value, combinatie);
  if (geopend.value.heeftAantal) nieuw.aantal = stand.value.aantal;
  stand.value = nieuw;
}

function soortItems(waarden: readonly (boolean | string)[]) {
  return waarden.map((w) => ({ value: String(w), label: soortNaam(String(w)) }));
}

function kies(): void {
  const onderdeel = geopend.value.onderdeel;
  if (!magKiezen.value || onderdeel === null) return;
  store.kiesVariant(onderdeel, naarVoorinstelling(geopend.value, stand.value));
  store.symbolenOpen = false;
}

function kiesCombinatie(combinatie: Voorinstelling): void {
  zetCombinatie(combinatie);
  kies();
}
</script>

<template>
  <UModal
    v-model:open="store.symbolenOpen"
    :title="$t('editor.symbolen.titel')"
    :ui="{ content: 'max-w-6xl h-[calc(100dvh-4rem)]', body: 'flex min-h-0 flex-col gap-4 overflow-hidden' }"
  >
    <template #body>
      <AlleenLezenMelding />
      <div class="grid min-h-0 flex-1 gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" data-testid="symbolenvenster">
        <!-- Links: zoeken en de kaarten per categorie. -->
        <div class="flex min-h-0 flex-col gap-3">
          <UInput
            v-model="zoek"
            icon="i-lucide-search"
            class="w-full"
            autofocus
            :placeholder="$t('editor.symbolen.zoeken')"
            :aria-label="$t('editor.symbolen.zoeken')"
            data-testid="symbolen-zoeken"
          />
          <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            <p v-if="groepen.length === 0" class="p-2 text-sm text-muted" role="status" data-testid="symbolen-geen">
              {{ $t("editor.symbolen.geenResultaten", { zoek }) }}
            </p>
            <section v-for="groep in groepen" :key="groep.categorie" class="mb-4">
              <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {{ $t(`editor.symbolen.categorieen.${groep.categorie}`) }}
              </h3>
              <ul class="flex flex-col gap-1">
                <li v-for="kaart in groep.kaarten" :key="kaart.type">
                  <button
                    type="button"
                    class="flex w-full items-center gap-3 rounded-md p-2 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                    :class="geopend.type === kaart.type ? 'bg-primary/10 ring-1 ring-primary' : ''"
                    :aria-pressed="geopend.type === kaart.type"
                    :data-testid="`symbolenkaart-${kaart.type}`"
                    @click="open(kaart)"
                  >
                    <span class="flex size-16 shrink-0 items-center justify-center">
                      <SymboolVoorbeeld :node="voorbeeldNode(kaart, {})" :schaal="2.5" />
                    </span>
                    <span class="flex min-w-0 flex-col gap-0.5">
                      <span class="font-medium">{{ kaartNaam(kaart) }}</span>
                      <span class="text-sm text-muted">{{ uitleg(kaart) }}</span>
                      <span class="text-xs text-dimmed">{{ arei(kaart) }}</span>
                      <span v-if="kaart.waaromNiet" class="text-xs text-warning">
                        {{ $t(`editor.symbolen.waaromNiet.${kaart.waaromNiet}`) }}
                      </span>
                    </span>
                  </button>
                </li>
              </ul>
            </section>
          </div>
        </div>

        <!-- Rechts: de geopende kaart. -->
        <section
          class="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1"
          :aria-label="kaartNaam(geopend)"
          data-testid="symbolen-geopend"
        >
          <div>
            <h3 class="text-lg font-semibold">{{ kaartNaam(geopend) }}</h3>
            <p class="text-sm text-muted">{{ uitleg(geopend) }}</p>
            <p class="text-xs text-dimmed">{{ arei(geopend) }}</p>
          </div>

          <div class="flex items-center justify-center rounded-md bg-elevated/50 p-4" data-testid="symbolen-voorbeeld">
            <SymboolVoorbeeld :node="voorbeeldNode(geopend, stand)" :schaal="8" />
          </div>

          <UAlert
            v-if="geopend.waaromNiet"
            color="neutral"
            variant="subtle"
            icon="i-lucide-info"
            :description="$t(`editor.symbolen.waaromNiet.${geopend.waaromNiet}`)"
          />

          <div v-if="geopend.velden.length > 0 || geopend.heeftAantal" class="flex flex-col gap-3">
            <template v-for="veld in geopend.velden" :key="veld.sleutel">
              <UFormField v-if="veld.sleutel === 'soort'" :label="veldNaam('soort')" size="sm">
                <USelect
                  :model-value="String(stand.soort)"
                  :items="soortItems(veld.waarden)"
                  class="w-full"
                  data-testid="symbolen-veld-soort"
                  @update:model-value="(w: unknown) => zet('soort', w)"
                />
              </UFormField>
              <USwitch
                v-else
                :model-value="stand[veld.sleutel] === true"
                :label="veldNaam(veld.sleutel)"
                size="sm"
                :data-testid="`symbolen-veld-${veld.sleutel}`"
                @update:model-value="(w: boolean) => zet(veld.sleutel, w)"
              />
            </template>
            <UFormField v-if="geopend.heeftAantal" :label="veldNaam('aantal')" size="sm">
              <UInputNumber
                :model-value="stand.aantal ?? 1"
                :min="1"
                :step="1"
                class="w-32"
                data-testid="symbolen-veld-aantal"
                @update:model-value="(w: number | null) => zet('aantal', w ?? 1)"
              />
            </UFormField>
          </div>

          <div v-if="rooster.length > 0">
            <h4 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              {{ $t("editor.symbolen.combinaties") }}
            </h4>
            <ul class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2">
              <li v-for="(combinatie, index) in rooster" :key="index">
                <button
                  type="button"
                  class="flex h-full w-full flex-col items-center gap-1 rounded-md p-2 text-center text-xs hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary"
                  :class="zelfdeCombinatie(geopend, combinatie, stand) ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'ring-1 ring-default'"
                  :aria-pressed="zelfdeCombinatie(geopend, combinatie, stand)"
                  :data-testid="`combinatie-${index}`"
                  @click="zetCombinatie(combinatie)"
                  @dblclick="kiesCombinatie(combinatie)"
                >
                  <SymboolVoorbeeld :node="voorbeeldNode(geopend, combinatie)" :schaal="3" />
                  <span>{{ korteNaam(geopend, combinatie) }}</span>
                </button>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :label="$t('algemeen.annuleren')"
          @click="store.symbolenOpen = false"
        />
        <UButton
          icon="i-lucide-pencil"
          :label="$t('editor.symbolen.kiezen')"
          :disabled="!magKiezen"
          data-testid="symbolen-kiezen"
          @click="kies"
        />
      </div>
    </template>
  </UModal>
</template>
