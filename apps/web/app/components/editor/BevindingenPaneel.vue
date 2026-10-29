<script setup lang="ts">
import { formatteerBericht, type Bevinding, type Ernst } from "@elentrik/arei";
import AfwijkingDialoog from "~/components/editor/AfwijkingDialoog.vue";
import { useEditorStore } from "~/stores/editor";

const ERNSTEN: Ernst[] = ["fout", "waarschuwing", "info"];
const ICOON: Record<Ernst, string> = {
  fout: "i-lucide-circle-x",
  waarschuwing: "i-lucide-triangle-alert",
  info: "i-lucide-info",
};
const KLEUR: Record<Ernst, string> = {
  fout: "text-error",
  waarschuwing: "text-warning",
  info: "text-info",
};

const store = useEditorStore();
const voerUit = useDocumentFoutMelding();
// De bevindingen staan in de taal van de interface (spec §2.3), niet in de dossiertaal.
const { taal } = useTaal();

/** `store.bevindingen` is al gesorteerd; hier alleen gegroepeerd in de volgorde fout, waarschuwing, info. */
const groepen = computed(() =>
  ERNSTEN.map((ernst) => ({ ernst, bevindingen: store.bevindingen.filter((b) => b.ernst === ernst) })).filter(
    (g) => g.bevindingen.length > 0,
  ),
);

function sleutel(b: Bevinding): string {
  return `${b.regelId}:${b.berichtSleutel}:${b.nodeIds.join(",")}`;
}

function onderwerp(b: Bevinding): string | undefined {
  const id = b.nodeIds[0];
  const analyse = store.analyse;
  if (id === undefined || !analyse) return undefined;
  if (Object.hasOwn(analyse.puntLabels, id)) return analyse.puntLabels[id];
  return analyse.kringen.find((k) => k.beveiligingId === id)?.label;
}

function motivatieVan(b: Bevinding): string {
  const id = b.nodeIds[0];
  return store.document?.afwijkingen.find((a) => a.regelId === b.regelId && a.nodeId === id)?.motivatie ?? "";
}

function selecteer(b: Bevinding): void {
  const id = b.nodeIds[0];
  if (id !== undefined) store.selectie = [id];
}

const teMotiveren = ref<Bevinding | null>(null);
/** Blijft staan na het sluiten, zodat de tekst niet wegvalt tijdens de sluitanimatie. */
const dialoogBericht = ref("");
watch(teMotiveren, (b) => {
  if (b) dialoogBericht.value = formatteerBericht(b, taal.value);
});
const dialoogOpen = computed({
  get: () => teMotiveren.value !== null,
  set: (open) => {
    if (!open) teMotiveren.value = null;
  },
});

function motiveer(motivatie: string): void {
  const b = teMotiveren.value;
  const id = b?.nodeIds[0];
  if (!b || id === undefined) return;
  voerUit(() => store.zetAfwijking(b.regelId, id, motivatie));
}

function verwijderAfwijking(b: Bevinding): void {
  const id = b.nodeIds[0];
  if (id !== undefined) voerUit(() => store.wisAfwijking(b.regelId, id));
}
</script>

<template>
  <section class="p-3" :aria-label="$t('editor.bevindingen.titel')">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
      {{ $t("editor.bevindingen.titel") }}
    </h2>
    <p v-if="groepen.length === 0" class="text-sm text-muted">{{ $t("editor.bevindingen.leeg") }}</p>

    <div v-for="groep in groepen" :key="groep.ernst" class="mb-4" :data-testid="`bevindingen-${groep.ernst}`">
      <h3 class="mb-1 flex items-center gap-1 text-sm font-medium" :class="KLEUR[groep.ernst]">
        <UIcon :name="ICOON[groep.ernst]" class="size-4" />
        {{ $t(`editor.bevindingen.ernst.${groep.ernst}`) }} ({{ groep.bevindingen.length }})
      </h3>
      <ul class="flex flex-col gap-1">
        <li
          v-for="b in groep.bevindingen"
          :key="sleutel(b)"
          class="rounded-md border border-default p-2 text-sm"
          :class="b.afgeweken ? 'opacity-70' : ''"
        >
          <button type="button" class="block w-full text-left hover:underline" @click="selecteer(b)">
            <span v-if="onderwerp(b)" class="mr-1 font-semibold">{{ onderwerp(b) }}</span>
            <span>{{ formatteerBericht(b, taal) }}</span>
          </button>
          <p v-if="b.afgeweken" class="mt-1 text-xs text-muted">
            {{ $t("editor.bevindingen.afgeweken", { motivatie: motivatieVan(b) }) }}
          </p>
          <div class="mt-1 flex justify-end">
            <UButton
              v-if="b.afgeweken"
              size="xs"
              color="neutral"
              variant="link"
              :label="$t('editor.bevindingen.verwijderen')"
              :disabled="store.alleenLezen"
              @click="verwijderAfwijking(b)"
            />
            <UButton
              v-else
              size="xs"
              color="neutral"
              variant="link"
              :label="$t('editor.bevindingen.motiveren')"
              :disabled="store.alleenLezen"
              @click="teMotiveren = b"
            />
          </div>
        </li>
      </ul>
    </div>

    <AfwijkingDialoog
      v-model:open="dialoogOpen"
      :bericht="dialoogBericht"
      @bevestig="motiveer"
    />
  </section>
</template>
