<script setup lang="ts">
import { formatteerBericht, REGELSETS, type Bevinding, type Ernst } from "@elentrik/arei";
import AfwijkingDialoog from "~/components/editor/AfwijkingDialoog.vue";
import ProjectgegevensDialoog from "~/components/editor/ProjectgegevensDialoog.vue";
import DossierChecklist from "~/components/editor/DossierChecklist.vue";
import MarkeringSymbool from "~/components/editor/MarkeringSymbool.vue";
import { MARKERING_SOORTEN } from "~/editor/markeringen";
import { groepeerBevindingen, herstelDoel, bevindingVoorNode } from "~/editor/bevindingengroepen";
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
const emit = defineEmits<{ selecteer: [bevinding: Bevinding]; navigeer: [doel: "gegevens" | "schema" | "situatie"] }>();
const { t } = useI18n();
const projectgegevensOpen = ref(false);
const voorlopigeControle = computed(() => !REGELSETS[store.document?.regelset ?? ""]?.gepubliceerd);
const voerUit = useDocumentFoutMelding();
// De bevindingen staan in de taal van de interface (spec §2.3), niet in de dossiertaal.
const { taal } = useTaal();

// Placement belongs to dossier completion, rather than repeating one electrical finding per point.
const elektrischeBevindingen = computed(() => store.bevindingen.filter(b => b.regelId !== "arei.situatie.niet-geplaatst"));
const bundels = computed(() => groepeerBevindingen(elektrischeBevindingen.value, store.analyse).map(groep => ({
  ...groep,
  kringLabel: store.analyse?.kringen.find(k => k.id === groep.kringId)?.label,
  doel: herstelDoel(groep.voorbeeld, store.analyse, store.document),
  nodeIds: [...new Set(groep.bevindingen.flatMap(b => b.nodeIds))],
})));
/** De telling blijft het aantal originele bevindingen, niet het aantal samenvattingen. */
const groepen = computed(() =>
  ERNSTEN.map(ernst => ({
    ernst,
    bundels: bundels.value.filter(g => g.voorbeeld.ernst === ernst),
    aantal: elektrischeBevindingen.value.filter(b => b.ernst === ernst).length,
  })).filter(
    g => g.aantal > 0,
  ),
);

function sleutel(b: Bevinding): string {
  return `${b.regelId}:${b.berichtSleutel}:${b.nodeIds.join(",")}`;
}

function onderwerp(id: string | undefined): string {
  const analyse = store.analyse;
  if (id === undefined) return t("editor.bevindingen.installatie");
  const node = store.document?.nodes[id];
  return analyse?.puntLabels[id]
    ?? analyse?.kringen.find(k => k.beveiligingId === id)?.label
    ?? node?.label
    ?? (node?.type === "verdeelbord" ? node.naam : undefined)
    ?? (node ? t(`editor.types.${node.type}`) : t("editor.bevindingen.installatie"));
}

function motivatieVan(b: Bevinding): string {
  const id = b.nodeIds[0];
  return store.document?.afwijkingen.find((a) => a.regelId === b.regelId && a.nodeId === id)?.motivatie ?? "";
}

function selecteer(id: string, bevinding: Bevinding): void {
  if (!store.document?.nodes[id]) return;
  store.selectie = [id];
  if (bevinding.regelId === "arei.situatie.niet-geplaatst") { emit("navigeer", "situatie"); return; }
  emit("selecteer", bevinding);
}

function bekijkBeveiliging(id: string, bevinding: Bevinding): void {
  store.tabblad = "eendraadschema";
  selecteer(id, bevinding);
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
    <h2 class="mb-3 text-sm font-semibold">
      {{ $t("editor.bevindingen.titel") }}
    </h2>
    <details :open="groepen.length === 0" class="mb-3 border-b border-default pb-2"><summary class="cursor-pointer py-2 text-sm font-medium">{{ $t('werkbaarheid.dossier.titel') }}</summary><DossierChecklist class="pb-2" @navigeer="emit('navigeer', $event)" /></details>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="bevindingen-context">
      <span>{{ $t("editor.bevindingen.context") }}: <strong class="font-medium">{{ $t(`editor.projectgegevens.context.${store.document?.meta.installatieContext ?? 'onbekend'}`) }}</strong></span>
      <UButton color="neutral" variant="link" size="sm" :label="$t('editor.bevindingen.contextWijzigen')" @click="projectgegevensOpen = true" />
    </div>
    <details v-if="voorlopigeControle" class="mb-3 text-xs text-muted" data-testid="voorlopige-controle"><summary class="cursor-pointer py-2">{{ $t('werkbaarheid.bevindingen.controle') }}</summary><p class="pb-2">{{ $t("editor.bevindingen.voorlopig") }}</p></details>
    <p v-if="groepen.length === 0" class="text-sm text-muted">{{ $t("werkbaarheid.bevindingen.geenElektrische") }}</p>
    <section class="mb-4 rounded-md border border-default p-2" aria-labelledby="markeringen-legenda" data-testid="markeringen-legenda">
      <h3 id="markeringen-legenda" class="mb-1 text-sm font-medium">{{ $t("editor.bevindingen.legenda.titel") }}</h3>
      <ul class="space-y-1 text-xs text-muted">
        <li v-for="soort in MARKERING_SOORTEN" :key="soort" class="flex items-start gap-2">
          <svg viewBox="-1.5 -1.5 3 3" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true"><MarkeringSymbool :soort="soort" :x="0" :y="0" :r="1.1" /></svg>
          <span>{{ $t(`editor.bevindingen.legenda.${soort}`) }}</span>
        </li>
      </ul>
    </section>

    <div v-for="groep in groepen" :key="groep.ernst" class="mb-4" :data-testid="`bevindingen-${groep.ernst}`">
      <h3 class="mb-1 flex items-center gap-1 text-sm font-medium" :class="KLEUR[groep.ernst]">
        <UIcon :name="ICOON[groep.ernst]" class="size-4" />
        {{ $t(`editor.bevindingen.ernst.${groep.ernst}`) }} ({{ groep.aantal }})
      </h3>
      <ul class="divide-y divide-default">
        <li
          v-for="bundel in groep.bundels"
          :key="bundel.sleutel"
          class="py-3 text-sm"
          data-testid="bevindingengroep"
        >
          <details :open="bundel.voorbeeld.ernst === 'fout'" class="group">
          <summary class="cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-primary">
          <span class="mb-1 font-semibold">
            {{ bundel.kringLabel ? $t('editor.bevindingen.kring', { kring: bundel.kringLabel }) : $t('editor.bevindingen.installatie') }}
          </span>
          <span class="ml-2 text-xs text-muted">{{ $t('werkbaarheid.bevindingen.punten', { aantal: bundel.nodeIds.length }) }}</span>
          <!-- Preview only while closed: opened, the full message below takes over. -->
          <span class="mt-1 block line-clamp-2 text-xs text-muted group-open:hidden" data-testid="bevinding-preview">{{ formatteerBericht(bundel.voorbeeld, taal) }}</span>
          </summary>
          <div class="pt-3">
          <p class="break-words">{{ formatteerBericht(bundel.voorbeeld, taal) }}</p>
          <div class="mt-2 flex flex-wrap gap-1" :aria-label="$t('editor.bevindingen.betrokkenPunten')">
            <UButton
              v-for="nodeId in bundel.nodeIds"
              :key="nodeId"
              size="sm"
              color="neutral"
              variant="outline"
              :label="onderwerp(nodeId)"
              :aria-label="$t('editor.bevindingen.bekijkPunt', { punt: onderwerp(nodeId) })"
              @click="selecteer(nodeId, bevindingVoorNode(bundel, nodeId))"
            />
          </div>
          <UButton
            v-if="bundel.doel"
            color="primary"
            variant="soft"
            size="sm"
            class="mt-2"
            icon="i-lucide-arrow-right"
            :label="$t(`editor.bevindingen.bekijk.${bundel.doel.soort}`)"
            @click="bekijkBeveiliging(bundel.doel.nodeId, bundel.voorbeeld)"
          />
          <details class="mt-3 text-xs" :open="bundel.voorbeeld.afgeweken">
            <summary class="cursor-pointer rounded py-1 text-muted focus-visible:outline-2 focus-visible:outline-primary">{{ $t('editor.bevindingen.afwijkingenPerPunt') }}</summary>
            <ul class="mt-2 space-y-3">
              <li v-for="b in bundel.bevindingen" :key="sleutel(b)">
                <p class="font-medium">{{ onderwerp(b.nodeIds[0]) }}</p>
                <p v-if="b.afgeweken" class="mt-1 break-words">{{ $t('editor.bevindingen.afgeweken', { motivatie: motivatieVan(b) }) }}</p>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="link"
                  class="mt-1"
                  :label="$t(b.afgeweken ? 'editor.bevindingen.verwijderen' : 'editor.bevindingen.motiveren')"
                  :disabled="store.alleenLezen"
                  @click="b.afgeweken ? verwijderAfwijking(b) : teMotiveren = b"
                />
              </li>
            </ul>
          </details>
          </div>
          </details>
        </li>
      </ul>
    </div>

    <AfwijkingDialoog
      v-model:open="dialoogOpen"
      :bericht="dialoogBericht"
      @bevestig="motiveer"
    />
    <ProjectgegevensDialoog v-model:open="projectgegevensOpen" />
  </section>
</template>
