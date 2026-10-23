<script setup lang="ts">
import { SJABLONEN, type Onderdeel, type Toestelsoort } from "@elentrik/model";
import { ONDERDEEL_PER_TOETS } from "~/composables/sneltoetsen";
import { VELDEN } from "~/editor/velden";
import { useEditorStore } from "~/stores/editor";

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
];

const store = useEditorStore();
const { t, te } = useI18n();
const voerUit = useDocumentFoutMelding();

const toetsVan = Object.fromEntries(
  Object.entries(ONDERDEEL_PER_TOETS).map(([toets, onderdeel]) => [onderdeel, toets.toUpperCase()]),
) as Partial<Record<Onderdeel, string>>;

const toestelsoorten = computed(() =>
  (VELDEN.toestel.find((v) => v.sleutel === "soort")?.opties ?? []).map((o) => ({
    value: o.waarde as Toestelsoort,
    label: o.label,
  })),
);

function sjabloonNaam(id: string, naam: string): string {
  const sleutel = `editor.sjablonen.${id}`;
  return te(sleutel) ? t(sleutel) : naam;
}

function voegSjabloonToe(id: string): void {
  voerUit(() => store.voegSjabloonToe(id));
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
            class="justify-between"
            @click="store.onderdeel = onderdeel"
          >
            <span>{{ $t(`editor.onderdelen.${onderdeel}`) }}</span>
            <UKbd v-if="toetsVan[onderdeel]" :value="toetsVan[onderdeel]" />
            <span v-else class="text-muted">{{ $t("editor.onderdelenPaneel.geenSneltoets") }}</span>
          </UButton>
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
  </aside>
</template>
