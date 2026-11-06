<script setup lang="ts">
import { SJABLONEN, type Onderdeel, type Toestelsoort } from "@elentrik/model";
import OnderdeelKnop from "~/components/editor/OnderdeelKnop.vue";
import { SYMBOLEN_TOETS } from "~/composables/sneltoetsen";
import { schemaKeuzes } from "~/editor/schema-navigatie";
import { VELDEN } from "~/editor/velden";
import { useEditorStore } from "~/stores/editor";

/** De groepen van het paneel; de minder gebruikte onderdelen staan achter "Meer…". */
const KRING: Onderdeel[] = ["leiding", "differentieel", "zekering", "onderbord"];
const KRING_MEER: Onderdeel[] = ["aardelektrode", "aardingsonderbreker"];
const EINDPUNTEN: Onderdeel[] = ["contactdoos", "lichtpunt", "schakelaar", "toestel"];

const store = useEditorStore();
const emit = defineEmits<{ sjabloon: [id: string]; lichtschakeling: []; referenties: []; eigenschappen: [] }>();
const { t, te } = useI18n();
const voerUit = useDocumentFoutMelding();

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

/** "Meer…" gaat open zodra een onderdeel erachter het gekozen onderdeel is, zodat het nooit verborgen actief staat. */
const meerOpen = ref(false);
watch(() => store.onderdeel, (onderdeel) => {
  if (KRING_MEER.includes(onderdeel)) meerOpen.value = true;
}, { immediate: true });
</script>

<template>
  <aside class="flex flex-col gap-6 p-3" :aria-label="$t('editor.onderdelenPaneel.titel')">
    <div class="flex items-center justify-between gap-2 px-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
        {{ $t("editor.onderdelenPaneel.titel") }}
      </h2>
      <UButton
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-shapes"
        data-testid="symbolen-openen"
        @click="store.symbolenOpen = true"
      >
        {{ $t("editor.symbolen.openen") }}
        <UKbd :value="SYMBOLEN_TOETS.toUpperCase()" />
      </UButton>
    </div>

    <section aria-labelledby="onderdelen-groep-kring">
      <h3 id="onderdelen-groep-kring" class="mb-2 px-2 text-xs font-semibold text-highlighted">
        {{ $t("editor.onderdelenPaneel.groepen.kring") }}
      </h3>
      <ul class="flex flex-col gap-0.5">
        <li v-for="onderdeel in KRING" :key="onderdeel">
          <OnderdeelKnop :onderdeel="onderdeel" />
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
        icon="i-lucide-git-branch-plus"
        class="mt-2 justify-start"
        :label="$t('editor.aftakkingen.toevoegen')"
        :disabled="!store.kanAftakkingToevoegen"
        aria-describedby="aftakkingen-hulp"
        data-testid="aftakking-toevoegen"
        @click="voerUit(() => store.voegAftakkingToeBijSelectie())"
      />
      <p id="aftakkingen-hulp" class="mt-1 px-2 text-xs text-muted">
        {{ $t("editor.aftakkingen.hulp") }}
      </p>
      <UCollapsible v-model:open="meerOpen" class="mt-2">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          block
          class="justify-start"
          :trailing-icon="meerOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :label="meerOpen ? $t('editor.onderdelenPaneel.minder') : $t('editor.onderdelenPaneel.meer')"
          data-testid="onderdelen-meer"
        />
        <template #content>
          <ul class="mt-0.5 flex flex-col gap-0.5">
            <li v-for="onderdeel in KRING_MEER" :key="onderdeel">
              <OnderdeelKnop :onderdeel="onderdeel" />
            </li>
          </ul>
        </template>
      </UCollapsible>
    </section>

    <section aria-labelledby="onderdelen-groep-eindpunten">
      <h3 id="onderdelen-groep-eindpunten" class="mb-2 px-2 text-xs font-semibold text-highlighted">
        {{ $t("editor.onderdelenPaneel.groepen.eindpunten") }}
      </h3>
      <ul class="flex flex-col gap-0.5">
        <li v-for="onderdeel in EINDPUNTEN" :key="onderdeel">
          <OnderdeelKnop :onderdeel="onderdeel" />
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
      <UButton block color="neutral" variant="outline" icon="i-lucide-lightbulb" class="mt-2 justify-start" :label="$t('editor.invoegen.lichtTitel')" :disabled="store.alleenLezen" data-testid="lichtschakeling-openen" @click="emit('lichtschakeling')" />
    </section>

    <section aria-labelledby="onderdelen-groep-sjablonen">
      <h3 id="onderdelen-groep-sjablonen" class="mb-2 px-2 text-xs font-semibold text-highlighted">
        {{ $t("editor.onderdelenPaneel.sjablonen") }}
      </h3>
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
        <UButton block color="neutral" variant="outline" icon="i-lucide-list-ordered" class="justify-start" :label="$t('editor.referenties.titel')" :disabled="store.alleenLezen" data-testid="referenties-openen" @click="emit('referenties')" />
      </div>
    </section>
  </aside>
</template>
