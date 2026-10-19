<script setup lang="ts">
import type { NodeId } from "@elentrik/model";
import BevindingenPaneel from "~/components/editor/BevindingenPaneel.vue";
import ConceptDialoog from "~/components/editor/ConceptDialoog.vue";
import ConflictDialoog from "~/components/editor/ConflictDialoog.vue";
import EditorBovenbalk from "~/components/editor/EditorBovenbalk.vue";
import EigenschappenPaneel from "~/components/editor/EigenschappenPaneel.vue";
import OnderdelenPaneel from "~/components/editor/OnderdelenPaneel.vue";
import SchemaCanvas from "~/components/editor/SchemaCanvas.vue";
import PaginaTabs from "~/components/situatie/PaginaTabs.vue";
import PlanCanvas from "~/components/situatie/PlanCanvas.vue";
import PlanToevoegenDialoog from "~/components/situatie/PlanToevoegenDialoog.vue";
import SchaalDialoog from "~/components/situatie/SchaalDialoog.vue";
import TePlaatsenPaneel from "~/components/situatie/TePlaatsenPaneel.vue";
import { nieuwsteConcept, wisAangebodenConcept, type AangebodenConcept } from "~/composables/concepten";
import { useAutosave, waarschuwBijVerlaten } from "~/composables/useAutosave";
import { httpStatus } from "~/composables/useProjectenApi";
import { nodeLabel } from "~/situatie/items";
import { useEditorStore } from "~/stores/editor";
import { useSituatieStore } from "~/stores/situatie";

const route = useRoute();
// Een ander id geeft een nieuwe pagina-instantie (NuxtPage sleutelt op het pad).
const id = String(route.params.id);
const api = useProjectenApi();
const store = useEditorStore();
const situatie = useSituatieStore();
const { t } = useI18n();
const toast = useToast();

useHead({ title: () => (store.projectId === id && store.naam ? `${store.naam} · ${t("app.naam")}` : t("app.naam")) });

type Laadstatus = "laden" | "klaar" | "nietGevonden" | "fout";
const laadstatus = ref<Laadstatus>("laden");

const autosave = useAutosave({
  store,
  bewaar: api.bewaar,
  haal: api.haal,
  dupliceer: api.dupliceer,
  naarProject: async (kopieId) => {
    await navigateTo(`/projecten/${kopieId}`);
  },
});

// --- Laden en het lokale concept -------------------------------------------

const concept = ref<AangebodenConcept | null>(null);
const conceptOpen = ref(false);

async function laad(): Promise<void> {
  laadstatus.value = "laden";
  let project;
  try {
    project = await api.haal(id);
  } catch (fout) {
    laadstatus.value = httpStatus(fout) === 404 ? "nietGevonden" : "fout";
    return;
  }
  store.laad({ id: project.id, naam: project.naam, versie: project.versie, document: project.document });
  // Een kapot conceptarchief mag het openen niet tegenhouden. Pas na de conceptcontrole is de pagina klaar.
  // Elk concept van het project telt, los van de klok: het bestaat alleen zolang er onbewaard werk is.
  concept.value = await nieuwsteConcept(project.id).catch(() => null);
  conceptOpen.value = concept.value !== null;
  laadstatus.value = "klaar";
}

async function laadConcept(): Promise<void> {
  const aangeboden = concept.value;
  concept.value = null;
  if (!aangeboden || store.projectId !== id) return;
  const c = aangeboden.concept;
  store.laad({ id, naam: c.naam, versie: c.versie, document: c.document });
  // Het concept staat nog niet op de server: als wijziging tellen, zodat de autosave het bewaart.
  // Is de server intussen verder dan `c.versie`, dan volgt een conflict.
  store.markeerGewijzigd();
  // Eerst staat het werk in het concept van dit venster, pas dan gaat het aangeboden concept weg.
  // Lukte die eigen schrijfactie niet (bv. een vol archief), dan blijft het aangeboden concept staan.
  if (await autosave.wachtOpConcept()) await wisAangebodenConcept(aangeboden).catch(() => {});
}

async function verwerpConcept(): Promise<void> {
  const aangeboden = concept.value;
  concept.value = null;
  if (aangeboden) await wisAangebodenConcept(aangeboden).catch(() => {});
}

// --- Conflict, fout en verlaten --------------------------------------------

const conflictOpen = ref(false);
const conflictBezig = ref(false);

watch(autosave.status, (status) => {
  conflictOpen.value = status === "conflict";
});

async function losConflictOp(actie: () => Promise<void>): Promise<void> {
  conflictBezig.value = true;
  try {
    await actie();
  } catch {
    toast.add({ title: t("algemeen.fout"), color: "error" });
  } finally {
    conflictBezig.value = false;
  }
}

async function opnieuwProberen(): Promise<void> {
  await autosave.nuOpslaan().catch(() => {
    toast.add({ title: t("algemeen.fout"), color: "error" });
  });
}

function toonBevindingen(): void {
  window.document.getElementById("bevindingen")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bijVerlaten(event: BeforeUnloadEvent): void {
  if (waarschuwBijVerlaten(autosave.status.value)) event.preventDefault();
}

// Navigeren in de app: dezelfde vraag als bij `beforeunload`. Annuleren houdt de gebruiker hier.
// Bij een conflict of fout bewaart `stop()` niets, maar het concept blijft staan.
onBeforeRouteLeave(() => {
  if (!waarschuwBijVerlaten(autosave.status.value)) return true;
  return window.confirm(t("editor.verlaten.bevestiging"));
});

// --- Situatieschema ----------------------------------------------------------

/** Het punt dat met een klik op het plan geplaatst wordt (gekozen in "Te plaatsen"), of null. */
const teplaatsen = ref<NodeId | null>(null);
/** De pagina waarop twee klikken een afstand meten (schaalmodus), of null. */
const meetPaginaId = ref<string | null>(null);
const meetSchaal = computed(() => meetPaginaId.value !== null && meetPaginaId.value === situatie.actievePaginaId);
const schaalOpen = ref(false);
const schaalAfstandPx = ref(0);
const planDialoogOpen = ref(false);
const vervangPaginaId = ref<string | undefined>(undefined);

const heeftPaginas = computed(() => (store.document?.situatie.paginas.length ?? 0) > 0);

/** Plaatsen en meten stoppen: na een plaatsing, bij Escape of met "Annuleren". */
function stopPlaatsenEnMeten(): void {
  teplaatsen.value = null;
  meetPaginaId.value = null;
}

// Een meting hoort bij haar pagina: een andere pagina stopt ze. Een ander tabblad stopt ook het plaatsen.
watch(
  () => situatie.actievePaginaId,
  (id) => {
    if (id !== meetPaginaId.value) meetPaginaId.value = null;
  },
);
watch(
  () => store.tabblad,
  () => stopPlaatsenEnMeten(),
);
// Na de schaaldialoog (bevestigd of geannuleerd) is de meting klaar.
watch(schaalOpen, (open) => {
  if (!open) meetPaginaId.value = null;
});

/** Het label van een node, of zijn type als hij geen label heeft (een punt zonder kring, een naamloos bord). */
function labelVan(nodeId: NodeId): string {
  const doc = store.document;
  const analyse = store.analyse;
  const node = doc?.nodes[nodeId];
  if (!doc || !analyse || !node) return "";
  return nodeLabel(doc, analyse, nodeId) || t(`editor.types.${node.type}`);
}

const hint = computed(() => {
  if (meetSchaal.value) return t("editor.situatie.hint.meten");
  if (teplaatsen.value !== null) return t("editor.situatie.hint.plaatsen", { label: labelVan(teplaatsen.value) });
  return null;
});

function geplaatst(nodeId: NodeId, vanPagina: string | null): void {
  stopPlaatsenEnMeten();
  const naar = situatie.actievePagina?.titel;
  if (vanPagina === null || naar === undefined) return;
  toast.add({ title: t("editor.situatie.verplaatst", { label: labelVan(nodeId), van: vanPagina, naar }) });
}

function schaalInstellen(paginaId: string): void {
  teplaatsen.value = null;
  meetPaginaId.value = paginaId;
}

function schaalGemeten(afstandPx: number): void {
  schaalAfstandPx.value = afstandPx;
  schaalOpen.value = true;
}

function planToevoegen(): void {
  vervangPaginaId.value = undefined;
  planDialoogOpen.value = true;
}

function vervangPlan(paginaId: string): void {
  vervangPaginaId.value = paginaId;
  planDialoogOpen.value = true;
}

function planKlaar(paginaId: string): void {
  situatie.actievePaginaId = paginaId;
}

/** Een bestand dat naast een dropzone valt, laat de browser niet weg navigeren van de editor. */
function bestandBuitenDropzone(event: DragEvent): void {
  if (event.defaultPrevented || !event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  if (event.type === "dragover") event.dataTransfer.dropEffect = "none";
}

onMounted(() => {
  window.addEventListener("beforeunload", bijVerlaten);
  window.addEventListener("dragover", bestandBuitenDropzone);
  window.addEventListener("drop", bestandBuitenDropzone);
  void laad();
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", bijVerlaten);
  window.removeEventListener("dragover", bestandBuitenDropzone);
  window.removeEventListener("drop", bestandBuitenDropzone);
});
</script>

<template>
  <div class="flex h-dvh flex-col">
    <template v-if="laadstatus === 'klaar' && store.document">
      <EditorBovenbalk
        :status="autosave.status.value"
        @opnieuw-proberen="opnieuwProberen"
        @toon-conflict="conflictOpen = true"
        @toon-bevindingen="toonBevindingen"
      />
      <div class="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <template v-if="store.tabblad === 'eendraadschema'">
          <OnderdelenPaneel class="overflow-y-auto border-r border-default" />
          <SchemaCanvas />
        </template>
        <template v-else>
          <TePlaatsenPaneel v-model:gekozen="teplaatsen" class="overflow-y-auto border-r border-default" />
          <div v-if="heeftPaginas" class="flex min-h-0 flex-col">
            <PaginaTabs @toevoegen="planToevoegen" @schaal-instellen="schaalInstellen" />
            <div
              v-if="hint"
              class="flex items-center gap-2 border-b border-default bg-primary/5 px-3 py-1 text-sm"
              role="status"
              data-testid="plan-hint"
            >
              <UIcon :name="meetSchaal ? 'i-lucide-ruler' : 'i-lucide-map-pin'" class="size-4 text-primary" />
              <span>{{ hint }}</span>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                class="ml-auto"
                :label="$t('editor.situatie.hint.annuleren')"
                @click="stopPlaatsenEnMeten"
              />
            </div>
            <PlanCanvas
              class="min-h-0 flex-1"
              :teplaatsen="teplaatsen"
              :meet-schaal="meetSchaal"
              @geplaatst="geplaatst"
              @annuleer="stopPlaatsenEnMeten"
              @schaal-gemeten="schaalGemeten"
              @vervang-plan="vervangPlan"
            />
          </div>
          <div v-else class="flex items-center justify-center p-6" data-testid="plan-leeg">
            <div class="flex max-w-sm flex-col items-center gap-3 text-center">
              <UIcon name="i-lucide-map" class="size-10 text-muted" />
              <p class="font-medium">{{ $t("editor.situatie.leeg.titel") }}</p>
              <p class="text-sm text-muted">{{ $t("editor.situatie.leeg.beschrijving") }}</p>
              <UButton
                icon="i-lucide-image-up"
                data-testid="plan-toevoegen-leeg"
                :label="$t('editor.situatie.leeg.planToevoegen')"
                @click="planToevoegen"
              />
            </div>
          </div>
        </template>
        <div class="overflow-y-auto border-l border-default">
          <EigenschappenPaneel />
          <USeparator />
          <BevindingenPaneel id="bevindingen" />
        </div>
      </div>
    </template>

    <UContainer v-else-if="laadstatus === 'nietGevonden'" class="py-8">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-file-question"
        :title="$t('editor.pagina.nietGevonden.titel')"
        :description="$t('editor.pagina.nietGevonden.beschrijving')"
        :actions="[{ label: $t('editor.pagina.nietGevonden.terug'), to: '/', color: 'neutral', variant: 'outline' }]"
      />
    </UContainer>

    <UContainer v-else-if="laadstatus === 'fout'" class="py-8">
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="$t('editor.pagina.ladenMislukt.titel')"
        :description="$t('editor.pagina.ladenMislukt.beschrijving')"
        :actions="[{ label: $t('editor.pagina.ladenMislukt.opnieuw'), color: 'error', onClick: () => laad() }]"
      />
    </UContainer>

    <div v-else class="flex flex-1 items-center justify-center text-muted">
      <UIcon name="i-lucide-loader-circle" class="mr-2 size-5 animate-spin" />
      {{ $t("editor.pagina.laden") }}
    </div>

    <PlanToevoegenDialoog v-model:open="planDialoogOpen" :vervang-pagina-id="vervangPaginaId" @klaar="planKlaar" />
    <SchaalDialoog v-model:open="schaalOpen" :pagina-id="meetPaginaId" :afstand-px="schaalAfstandPx" />

    <ConceptDialoog
      v-if="concept"
      v-model:open="conceptOpen"
      :tijd="concept.concept.tijd"
      @laden="laadConcept"
      @verwerpen="verwerpConcept"
    />
    <ConflictDialoog
      v-model:open="conflictOpen"
      :bezig="conflictBezig"
      @serverversie="losConflictOp(autosave.laadServerversie)"
      @kopie="losConflictOp(autosave.bewaarAlsKopie)"
    />
  </div>
</template>
