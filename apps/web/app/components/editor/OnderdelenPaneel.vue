<script setup lang="ts">
import { SJABLONEN, type Onderdeel, type Toestelsoort } from "@elentrik/model";
import SymboolVoorbeeld from "~/components/editor/SymboolVoorbeeld.vue";
import { ONDERDEEL_PER_TOETS, SYMBOLEN_TOETS } from "~/composables/sneltoetsen";
import { useSymboolNamen } from "~/composables/useSymboolNamen";
import { KAARTEN, voorbeeldNode, wijktAf, type Kaart } from "~/editor/symbolen";
import { schemaKeuzes } from "~/editor/schema-navigatie";
import { VELDEN } from "~/editor/velden";
import { BEGIN_VOORINSTELLINGEN, useEditorStore } from "~/stores/editor";

/** De volgorde van spec §4.2. */
const ONDERDELEN: Onderdeel[] = [
  "contactdoos",
  "lichtpunt",
  "schakelaar",
  "toestel",
  "leiding",
  "differentieel",
  "zekering",
  "onderbord",
  "aardelektrode",
  "aardingsonderbreker",
];

const store = useEditorStore();
const emit = defineEmits<{ sjabloon: [id: string]; lichtschakeling: []; referenties: []; eigenschappen: [] }>();
const { t, te } = useI18n();
const voerUit = useDocumentFoutMelding();
const { variantTekst } = useSymboolNamen();

const kaartVan = Object.fromEntries(
  KAARTEN.flatMap((k) => (k.onderdeel === null ? [] : [[k.onderdeel, k] as const])),
) as Record<Onderdeel, Kaart>;

/** Per onderdeel het symbool van de huidige voorinstelling en, als die afwijkt van de beginwaarde, een korte tekst. */
const varianten = computed(() =>
  Object.fromEntries(
    ONDERDELEN.map((onderdeel) => {
      const kaart = kaartVan[onderdeel];
      const voorinstelling = store.voorinstellingen[onderdeel] ?? {};
      const afwijkend = wijktAf(kaart, voorinstelling, BEGIN_VOORINSTELLINGEN[onderdeel] ?? {});
      return [onderdeel, { node: voorbeeldNode(kaart, voorinstelling), afwijkend, tekst: variantTekst(kaart, voorinstelling) }];
    }),
  ) as Record<Onderdeel, { node: ReturnType<typeof voorbeeldNode>; afwijkend: boolean; tekst: string }>,
);

const toetsVan = Object.fromEntries(
  Object.entries(ONDERDEEL_PER_TOETS).map(([toets, onderdeel]) => [onderdeel, toets.toUpperCase()]),
) as Partial<Record<Onderdeel, string>>;

const toestelsoorten = computed(() =>
  (VELDEN.toestel.find((v) => v.sleutel === "soort")?.opties ?? []).map((o) => ({
    value: o.waarde as Toestelsoort,
    label: o.labelSleutel ? t(o.labelSleutel) : String(o.waarde),
  })),
);

const voorInvoegenZichtbaar = computed(() => store.onderdeel === "leiding" || store.onderdeel === "differentieel");
const voorInvoegenDoel = computed(() => {
  if (!store.document || !store.analyse || store.selectie.length !== 1) return undefined;
  return schemaKeuzes(store.document, store.analyse, type => t(`editor.types.${type}`)).find(k => k.id === store.selectie[0])?.label;
});
const voorInvoegenLabel = computed(() => t("editor.invoegenVoor.actie", {
  onderdeel: t(`editor.types.${store.onderdeel}`), doel: voorInvoegenDoel.value ?? t("editor.invoegenVoor.selectie"),
}));
function voegVoorIn(): void {
  if (!store.kanVoorSelectieInvoegen) return;
  const vorig = store.selectie[0];
  if (voerUit(() => store.voegVoorSelectieIn()) && store.selectie[0] !== vorig) emit("eigenschappen");
}

function sjabloonNaam(id: string, naam: string): string {
  const sleutel = `editor.sjablonen.${id}`;
  return te(sleutel) ? t(sleutel) : naam;
}

function voegSjabloonToe(id: string): void {
  emit('sjabloon', id);
}
</script>

<template>
  <aside class="flex flex-col gap-6 p-3" :aria-label="$t('editor.onderdelenPaneel.titel')">
    <section>
      <h2 class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {{ $t("editor.onderdelenPaneel.titel") }}
      </h2>
      <ul class="flex flex-col gap-0.5">
        <li v-for="onderdeel in ONDERDELEN" :key="onderdeel">
          <UButton
            block
            :color="store.onderdeel === onderdeel ? 'primary' : 'neutral'"
            :variant="store.onderdeel === onderdeel ? 'soft' : 'ghost'"
            :aria-pressed="store.onderdeel === onderdeel"
            :disabled="store.alleenLezen"
            :data-testid="`onderdeel-${onderdeel}`"
            class="gap-2"
            @click="store.onderdeel = onderdeel"
          >
            <span class="flex size-8 shrink-0 items-center justify-center">
              <SymboolVoorbeeld :node="varianten[onderdeel].node" :schaal="2" class="max-h-full max-w-full" />
            </span>
            <span class="flex-1 text-left">{{ $t(`editor.onderdelen.${onderdeel}`) }}</span>
            <UKbd v-if="toetsVan[onderdeel]" :value="toetsVan[onderdeel]" />
            <span v-else class="text-muted">{{ $t("editor.onderdelenPaneel.geenSneltoets") }}</span>
          </UButton>
          <!-- De toestelsoort staat al in de keuzelijst eronder; alleen de knop Standaard. -->
          <div
            v-if="varianten[onderdeel].afwijkend"
            class="mt-0.5 mb-1 flex items-center gap-1 pr-1 pl-12 text-xs text-muted"
            :data-testid="`variant-${onderdeel}`"
          >
            <span v-if="onderdeel !== 'toestel'" class="min-w-0 flex-1 truncate" :title="varianten[onderdeel].tekst">
              {{ varianten[onderdeel].tekst }}
            </span>
            <UButton
              color="neutral"
              variant="link"
              size="xs"
              class="ml-auto shrink-0"
              :label="$t('editor.symbolen.standaard')"
              :disabled="store.alleenLezen"
              :data-testid="`standaard-${onderdeel}`"
              @click="store.zetStandaard(onderdeel)"
            />
          </div>
          <UFormField
            v-if="onderdeel === 'toestel'"
            :label="$t('editor.onderdelenPaneel.toestelsoort')"
            class="mt-1 mb-2 px-2"
            size="sm"
          >
            <!-- Een soort kiezen kiest ook het onderdeel Toestel. -->
            <USelect
              v-model="store.toestelsoort"
              :items="toestelsoorten"
              size="sm"
              class="w-full"
              :disabled="store.alleenLezen"
              data-testid="toestelsoort"
              @update:model-value="store.onderdeel = 'toestel'"
            />
          </UFormField>
        </li>
      </ul>
      <div v-if="voorInvoegenZichtbaar" class="mt-3 space-y-2">
        <UButton block color="neutral" variant="outline" class="justify-start whitespace-normal text-left"
          :label="voorInvoegenLabel" :disabled="!store.kanVoorSelectieInvoegen"
          data-testid="invoegen-voor-selectie" @click="voegVoorIn" />
        <p class="text-xs text-muted">{{ $t("editor.invoegenVoor.uitleg") }}</p>
      </div>
      <UButton
        block
        color="neutral"
        variant="outline"
        icon="i-lucide-shapes"
        class="mt-2 justify-between"
        data-testid="symbolen-openen"
        @click="store.symbolenOpen = true"
      >
        <span class="flex-1 text-left">{{ $t("editor.symbolen.openen") }}</span>
        <UKbd :value="SYMBOLEN_TOETS.toUpperCase()" />
      </UButton>
    </section>

    <section aria-labelledby="aftakkingen-titel">
      <UButton block color="neutral" variant="outline" icon="i-lucide-lightbulb" class="mb-3 justify-start" :label="$t('editor.invoegen.lichtTitel')" :disabled="store.alleenLezen" data-testid="lichtschakeling-openen" @click="emit('lichtschakeling')" />
      <h2 id="aftakkingen-titel" class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {{ $t("editor.aftakkingen.titel") }}
      </h2>
      <p id="aftakkingen-hulp" class="mb-3 px-2 text-xs text-muted">
        {{ $t("editor.aftakkingen.hulp") }}
      </p>
      <UButton
        block
        color="neutral"
        variant="outline"
        icon="i-lucide-git-branch-plus"
        class="justify-start"
        :label="$t('editor.aftakkingen.toevoegen')"
        :disabled="!store.kanAftakkingToevoegen"
        aria-describedby="aftakkingen-hulp"
        data-testid="aftakking-toevoegen"
        @click="voerUit(() => store.voegAftakkingToeBijSelectie())"
      />
    </section>

    <section>
      <h2 class="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {{ $t("editor.onderdelenPaneel.sjablonen") }}
      </h2>
      <div class="flex flex-col gap-1">
        <UButton
          v-for="sjabloon in SJABLONEN"
          :key="sjabloon.id"
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-layout-template"
          class="justify-start"
          :label="sjabloonNaam(sjabloon.id, sjabloon.naam)"
          :disabled="store.alleenLezen"
          @click="voegSjabloonToe(sjabloon.id)"
        />
      </div>
    </section>
    <UButton block color="neutral" variant="outline" icon="i-lucide-list-ordered" class="justify-start" :label="$t('editor.referenties.titel')" :disabled="store.alleenLezen" data-testid="referenties-openen" @click="emit('referenties')" />
  </aside>
</template>
