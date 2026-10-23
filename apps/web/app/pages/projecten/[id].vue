<script setup lang="ts">
import type { NodeId } from "@elentrik/model";
import AbonnementBanner from "~/components/AbonnementBanner.vue";
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
import { useAlleenLezen } from "~/composables/useAlleenLezen";
import { useAutosave, waarschuwBijVerlaten } from "~/composables/useAutosave";
import { httpStatus } from "~/composables/useProjectenApi";
import { useNodeTekst } from "~/composables/useNodeTekst";
import { useSessieHerstel } from "~/composables/useSessieHerstel";
import {
  opnieuwProberen as probeerOpnieuw,
  toonAfgemeld,
  vertrekBevestiging,
  type SessieControle,
} from "~/editor/aanmelding";
import { vertaalFout } from "~/fouten";
import { useEditorStore } from "~/stores/editor";
import { useSessieStore } from "~/stores/sessie";
import { useSituatieStore } from "~/stores/situatie";

// Zonder ingelogde gebruiker start de editor niet (concepten en bewaren horen bij een gebruiker).
definePageMeta({ middleware: ["editor-gebruiker"] });

const route = useRoute();
// Een ander id geeft een nieuwe pagina-instantie (NuxtPage sleutelt op het pad).
const id = String(route.params.id);
const store = useEditorStore();
const situatie = useSituatieStore();
const sessie = useSessieStore();
const herstelSessie = useSessieHerstel();
const behandelSchrijfweigering = useAlleenLezen();

// Dit venster hoort bij wie het opende: zijn concepten, en elke bewaring zegt voor wie ze is,
// zodat de server ze weigert als intussen een ander ingelogd is (401 ANDERE_GEBRUIKER). Zonder
// gebruiker (de middleware laat dat niet toe) gooit `useAutosave`: nooit een concept zonder eigenaar.
const gebruikerId = sessie.gebruiker?.id ?? "";
const oorspronkelijkeNaam = sessie.gebruiker?.naam ?? "";
const api = useProjectenApi({ gebruikerId });
store.nieuwVenster();
const { nodeTekst } = useNodeTekst();
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
  gebruikerId,
});

// --- Alleen-lezen ---------------------------------------------------------------

/** De organisatie van het project; de pagina kan bij een andere dan de actieve organisatie horen. */
const projectOrganisatieId = ref<string | null>(null);

/** Mag de organisatie van dit project schrijven? Onbekend (nog niet geladen of niet in de sessie) is ja: de server beslist. */
const organisatieSchrijft = computed(() => {
  const organisatie = sessie.organisaties.find((o) => o.id === projectOrganisatieId.value);
  return organisatie ? organisatie.toegang.schrijven : true;
});

/**
 * De editor is alleen-lezen als de organisatie niet (meer) mag schrijven volgens de sessie, of als
 * het bewaren een 402 gaf (de sessie kan dan nog achterlopen).
 */
const alleenLezen = computed(() => !organisatieSchrijft.value || autosave.alleenLezen.value);
watch(alleenLezen, (waarde) => store.zetAlleenLezen(waarde), { immediate: true, flush: "sync" });
// Plaatsen en meten wijzigen straks het document: bij alleen-lezen stoppen ze.
watch(alleenLezen, (waarde) => {
  if (waarde) stopPlaatsenEnMeten();
});

// Een 402 bij het bewaren: de sessie opnieuw lezen (de banner en de schrijfrechten volgen) en uitleggen
// dat het werk lokaal bewaard blijft.
watch(autosave.alleenLezen, async (geweigerd) => {
  if (!geweigerd) return;
  void sessie.laad().catch(() => {});
  // Alleen beloven dat het werk lokaal bewaard blijft als het concept er echt staat.
  const bewaard = await autosave.wachtOpConcept().catch(() => false);
  toast.add({
    title: t(bewaard ? "editor.alleenLezen.bewaardLokaal" : "editor.alleenLezen.nietBewaard"),
    color: bewaard ? "warning" : "error",
  });
});

/**
 * Terug in dit tabblad na een 402: heeft de organisatie intussen weer schrijfrecht (bv. na betalen in
 * een ander tabblad), dan wordt het lokaal bewaarde werk alsnog opgeslagen. Anders blijft het lokaal.
 */
async function hervatNaAbonnement(): Promise<void> {
  try {
    await sessie.laad();
  } catch {
    return;
  }
  if (organisatieSchrijft.value) await autosave.nuOpslaan().catch(() => {});
}

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
  projectOrganisatieId.value = project.organisatieId;
  // Meteen goed vóór het document er is: de watcher draait ook, maar dit laat geen gat.
  store.zetAlleenLezen(alleenLezen.value);
  store.laad({ id: project.id, naam: project.naam, versie: project.versie, document: project.document });
  // Een kapot conceptarchief mag het openen niet tegenhouden. Pas na de conceptcontrole is de pagina klaar.
  // Elk concept van het project telt, los van de klok: het bestaat alleen zolang er onbewaard werk is.
  // Alleen de eigen concepten van de gebruiker, en één keer de oude zonder gebruiker.
  // Alleen-lezen: het concept blijft in het archief staan en wordt aangeboden zodra er weer geschreven mag worden.
  concept.value = store.alleenLezen ? null : await nieuwsteConcept(project.id, gebruikerId).catch(() => null);
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
  // Intussen alleen-lezen geworden: het concept blijft staan voor later.
  if (!aangeboden || store.projectId !== id || store.alleenLezen) return;
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
  } catch (fout) {
    // Een kopie maken kan 402 geven: dan alleen-lezen, geen generieke fout.
    if (!(await behandelSchrijfweigering(fout))) toast.add({ title: vertaalFout(fout, t), color: "error" });
  } finally {
    conflictBezig.value = false;
  }
}

const sessieControle: SessieControle = {
  laad: () => sessie.laad(),
  gebruikerId: () => sessie.gebruiker?.id ?? null,
};

/**
 * Eerst de sessie opnieuw lezen: is nu een ander ingelogd, dan gaat er niets naar de server en
 * zegt de melding bij wie het werk hoort (`andereGebruiker`).
 */
async function opnieuwProberen(): Promise<void> {
  await probeerOpnieuw({ sessie: sessieControle, verwacht: gebruikerId, nuOpslaan: autosave.nuOpslaan }).catch(
    (fout: unknown) => {
      toast.add({ title: vertaalFout(fout, t), color: "error" });
    },
  );
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
  const vraag = vertrekBevestiging(autosave.status.value);
  if (vraag === null) return true;
  vertrekBevestigd = window.confirm(t(vraag));
  return vertrekBevestigd;
}
/** Het wisselen of uitloggen mislukte na de bevestiging: het verlaten vraagt het dan opnieuw. */
function vertrekAfgebroken(): void {
  vertrekBevestigd = false;
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

/**
 * Inloggen in een nieuw tabblad: het werk in dit tabblad blijft staan. Na het inloggen komt dat
 * tabblad op /weer-aangemeld, niet in de editor: geen tweede venster op hetzelfde project (R8).
 */
function opnieuwInloggen(): void {
  window.open(`/inloggen?terug=${encodeURIComponent("/weer-aangemeld")}`, "_blank", "noopener");
}

/**
 * Terug in dit tabblad: de sessie opnieuw lezen (bv. na inloggen of uitloggen in een ander
 * tabblad). Na een 401 en weer dezelfde gebruiker: één keer bewaren, zonder timer.
 */
function bijFocus(): void {
  if (autosave.afgemeld.value) void opnieuwProberen();
  else if (autosave.alleenLezen.value) void hervatNaAbonnement();
  else void sessie.laad().catch(() => {});
}

// Een 401 bij het bewaren: de sessie opnieuw lezen, zodat de melding zegt of er nu iemand anders
// ingelogd is (401 ANDERE_GEBRUIKER) of niemand.
watch(autosave.afgemeld, (afgemeld) => {
  if (afgemeld) void sessie.laad().catch(() => {});
});

/**
 * De melding "afgemeld" met "Opnieuw inloggen": na een 401, en ook zodra de sessie geen gebruiker
 * meer heeft (bv. "Opnieuw proberen" bij status fout vond geen sessie meer).
 */
const afgemeldMelding = computed(() =>
  toonAfgemeld({ afgemeld: autosave.afgemeld.value, gebruikerId: sessie.gebruiker?.id ?? null }),
);

/** Nu is een andere gebruiker ingelogd dan die van dit venster: zijn naam, anders null. */
const andereGebruiker = computed(() => {
  const huidig = sessie.gebruiker;
  if (!huidig || huidig.id === gebruikerId) return null;
  return { naam: huidig.naam, oorspronkelijk: oorspronkelijkeNaam };
});

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
  afmeldenVoorVertrek = sessie.registreerVoorVertrek(voorVertrek, vertrekAfgebroken);
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
        :afgemeld="afgemeldMelding"
        :andere-gebruiker="andereGebruiker"
        @opnieuw-proberen="opnieuwProberen"
        @opnieuw-inloggen="opnieuwInloggen"
        @toon-conflict="conflictOpen = true"
        @toon-bevindingen="toonBevindingen"
        @exporteren="exportOpen = true"
      />
      <AbonnementBanner />
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
                :disabled="store.alleenLezen"
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
