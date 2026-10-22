<script setup lang="ts">
import type { NodeId } from "@elentrik/model";
import BevindingenPaneel from "~/components/editor/BevindingenPaneel.vue";
import ConceptDialoog from "~/components/editor/ConceptDialoog.vue";
import ConflictDialoog from "~/components/editor/ConflictDialoog.vue";
import EditorBovenbalk from "~/components/editor/EditorBovenbalk.vue";
import EigenschappenPaneel from "~/components/editor/EigenschappenPaneel.vue";
import ExportDialoog from "~/components/editor/ExportDialoog.vue";
import OnderdelenPaneel from "~/components/editor/OnderdelenPaneel.vue";
import SchemaCanvas from "~/components/editor/SchemaCanvas.vue";
import KringenlijstTabel from "~/components/kringenlijst/KringenlijstTabel.vue";
import PaginaTabs from "~/components/situatie/PaginaTabs.vue";
import PlanCanvas from "~/components/situatie/PlanCanvas.vue";
import PlanToevoegenDialoog from "~/components/situatie/PlanToevoegenDialoog.vue";
import SchaalDialoog from "~/components/situatie/SchaalDialoog.vue";
import TePlaatsenPaneel from "~/components/situatie/TePlaatsenPaneel.vue";
import { nieuwsteConcept, wisAangebodenConcept, type AangebodenConcept } from "~/composables/concepten";
import { useAutosave, waarschuwBijVerlaten } from "~/composables/useAutosave";
import { httpStatus } from "~/composables/useProjectenApi";
import { useNodeTekst } from "~/composables/useNodeTekst";
import { useSessieHerstel } from "~/composables/useSessieHerstel";
import { veiligTerug } from "~/sessie/bestemming";
import { useEditorStore } from "~/stores/editor";
import { useSessieStore } from "~/stores/sessie";
import { useSituatieStore } from "~/stores/situatie";

const route = useRoute();
// Een ander id geeft een nieuwe pagina-instantie (NuxtPage sleutelt op het pad).
const id = String(route.params.id);
const api = useProjectenApi();
const store = useEditorStore();
const situatie = useSituatieStore();
const sessie = useSessieStore();
const herstelSessie = useSessieHerstel();
const { nodeTekst } = useNodeTekst();
const { t } = useI18n();
const toast = useToast();

useHead({ title: () => (store.projectId === id && store.naam ? `${store.naam} · ${t("app.naam")}` : t("app.naam")) });

type Laadstatus = "laden" | "klaar" | "nietGevonden" | "fout";
const laadstatus = ref<Laadstatus>("laden");

// De concepten van dit venster horen bij wie het opende. De middleware laat de editor alleen
// met een sessie toe, dus de gebruiker is er altijd.
const gebruikerId = sessie.gebruiker?.id ?? "";

const autosave = useAutosave({
  store,
  bewaar: api.bewaar,
  haal: api.haal,
  dupliceer: api.dupliceer,
  naarProject: async (kopieId) => {
    await navigateTo(`/projecten/${kopieId}`);
  },
  gebruikerId,
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
    const status = httpStatus(fout);
    laadstatus.value = status === 404 ? "nietGevonden" : "fout";
    // Geen sessie meer: naar /inloggen, met deze pagina als terugkeer-URL.
    if (status === 401) await herstelSessie(fout);
    return;
  }
  await werkInOrganisatieVan(project.organisatieId);
  store.laad({ id: project.id, naam: project.naam, versie: project.versie, document: project.document });
  // Een kapot conceptarchief mag het openen niet tegenhouden. Pas na de conceptcontrole is de pagina klaar.
  // Elk concept van het project telt, los van de klok: het bestaat alleen zolang er onbewaard werk is.
  // Alleen de eigen concepten van de gebruiker, en één keer de oude zonder gebruiker.
  // Zonder gebruiker (kan niet, zie boven) wordt niets aangeboden: geen oud concept gaat naar "niemand".
  concept.value = gebruikerId ? await nieuwsteConcept(project.id, gebruikerId).catch(() => null) : null;
  conceptOpen.value = concept.value !== null;
  laadstatus.value = "klaar";
}

/** Tijdens het openen: er wordt niets verlaten, dus `voorVertrek` vraagt niets. */
let bijOpenen = false;

/**
 * Een project van een andere organisatie waarvan de gebruiker lid is (een bladwijzer, een tweede
 * tabblad): die organisatie wordt actief, met een korte melding (spec 5b.1). Lukt het wisselen
 * niet, dan werkt de editor toch: de server geeft toegang op lidmaatschap.
 */
async function werkInOrganisatieVan(organisatieId: string): Promise<void> {
  if (organisatieId === sessie.actieveOrganisatieId) return;
  bijOpenen = true;
  try {
    if (!(await sessie.wissel(organisatieId))) return;
    const organisatie = sessie.actieveOrganisatie?.naam;
    if (organisatie) toast.add({ title: t("editor.organisatieGewisseld", { organisatie }) });
  } catch {
    toast.add({ title: t("menu.wisselenMislukt"), color: "error" });
  } finally {
    bijOpenen = false;
  }
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

/**
 * Wisselen van organisatie en uitloggen in de app: eerst nog opslaan. Lukt dat niet, dan vraagt
 * de editor of de gebruiker toch verder wil; het werk blijft in het concept van deze gebruiker.
 */
let vertrekBevestigd = false;
async function voorVertrek(): Promise<boolean> {
  if (bijOpenen) return true;
  await autosave.nuOpslaan().catch(() => {});
  if (!waarschuwBijVerlaten(autosave.status.value)) return true;
  vertrekBevestigd = window.confirm(t("editor.vertrek.bevestiging"));
  return vertrekBevestigd;
}
// Een nieuwe wijziging na die bevestiging verdient opnieuw de vraag bij het verlaten.
watch(
  () => store.gewijzigdSindsOpslaan,
  () => {
    vertrekBevestigd = false;
  },
);

// Navigeren in de app: dezelfde vraag als bij `beforeunload`. Annuleren houdt de gebruiker hier.
// Bij een conflict of fout bewaart `stop()` niets, maar het concept blijft staan. Na wisselen of
// uitloggen werd het al gevraagd (`voorVertrek`): dan niet nog eens.
onBeforeRouteLeave(() => {
  if (vertrekBevestigd) {
    vertrekBevestigd = false;
    return true;
  }
  if (!waarschuwBijVerlaten(autosave.status.value)) return true;
  return window.confirm(t("editor.verlaten.bevestiging"));
});

// --- Verlopen sessie -----------------------------------------------------------

/** Inloggen in een nieuw tabblad: het werk in dit tabblad blijft staan. */
function opnieuwInloggen(): void {
  const terug = veiligTerug(route.fullPath) ?? "/";
  window.open(`/inloggen?terug=${encodeURIComponent(terug)}`, "_blank", "noopener");
}

/** Terug in dit tabblad na een 401: de sessie opnieuw lezen (bv. na inloggen in een ander tabblad). */
function bijFocus(): void {
  if (autosave.afgemeld.value) void sessie.laad().catch(() => {});
}

// --- Exporteren ---------------------------------------------------------------

const exportOpen = ref(false);

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

const hint = computed(() => {
  if (meetSchaal.value) return t("editor.situatie.hint.meten");
  if (teplaatsen.value !== null) return t("editor.situatie.hint.plaatsen", { label: nodeTekst(teplaatsen.value) });
  return null;
});

function geplaatst(nodeId: NodeId, vanPagina: string | null): void {
  stopPlaatsenEnMeten();
  const naar = situatie.actievePagina?.titel;
  if (vanPagina === null || naar === undefined) return;
  toast.add({ title: t("editor.situatie.verplaatst", { label: nodeTekst(nodeId), van: vanPagina, naar }) });
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

let afmeldenVoorVertrek: (() => void) | undefined;

onMounted(() => {
  afmeldenVoorVertrek = sessie.registreerVoorVertrek(voorVertrek);
  window.addEventListener("beforeunload", bijVerlaten);
  window.addEventListener("focus", bijFocus);
  window.addEventListener("dragover", bestandBuitenDropzone);
  window.addEventListener("drop", bestandBuitenDropzone);
  void laad();
});
onBeforeUnmount(() => {
  afmeldenVoorVertrek?.();
  window.removeEventListener("beforeunload", bijVerlaten);
  window.removeEventListener("focus", bijFocus);
  window.removeEventListener("dragover", bestandBuitenDropzone);
  window.removeEventListener("drop", bestandBuitenDropzone);
});
</script>

<template>
  <div class="flex h-dvh flex-col">
    <template v-if="laadstatus === 'klaar' && store.document">
      <EditorBovenbalk
        :status="autosave.status.value"
        :afgemeld="autosave.afgemeld.value"
        @opnieuw-proberen="opnieuwProberen"
        @opnieuw-inloggen="opnieuwInloggen"
        @toon-conflict="conflictOpen = true"
        @toon-bevindingen="toonBevindingen"
        @exporteren="exportOpen = true"
      />
      <div class="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <template v-if="store.tabblad === 'eendraadschema'">
          <OnderdelenPaneel class="overflow-y-auto border-r border-default" />
          <SchemaCanvas />
        </template>
        <KringenlijstTabel v-else-if="store.tabblad === 'kringenlijst'" class="col-span-2 border-r border-default" />
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
    <ExportDialoog
      v-model:open="exportOpen"
      :status="autosave.status.value"
      :nu-opslaan="autosave.nuOpslaan"
      @conflict="autosave.meldConflict"
    />
    <ConflictDialoog
      v-model:open="conflictOpen"
      :bezig="conflictBezig"
      @serverversie="losConflictOp(autosave.laadServerversie)"
      @kopie="losConflictOp(autosave.bewaarAlsKopie)"
    />
  </div>
</template>
