<script setup lang="ts">
import { editorContextKey, type EditorContext } from "~/editor/context";
import SupportBanner from "~/components/admin/SupportBanner.vue";
import type { NodeId } from "@elentrik/model";
import type { Bevinding } from "@elentrik/arei";
import ActieveBevinding from "~/components/editor/ActieveBevinding.vue";
import ProjectgegevensDialoog from "~/components/editor/ProjectgegevensDialoog.vue";
import AbonnementBanner from "~/components/AbonnementBanner.vue";
import BevindingenPaneel from "~/components/editor/BevindingenPaneel.vue";
import ConceptDialoog from "~/components/editor/ConceptDialoog.vue";
import ConflictDialoog from "~/components/editor/ConflictDialoog.vue";
import EditorBovenbalk from "~/components/editor/EditorBovenbalk.vue";
import EditorWerkruimte from "~/components/editor/EditorWerkruimte.vue";
import EigenschappenPaneel from "~/components/editor/EigenschappenPaneel.vue";
import ExportDialoog from "~/components/editor/ExportDialoog.vue";
import OnderdelenPaneel from "~/components/editor/OnderdelenPaneel.vue";
import SchemaCanvas from "~/components/editor/SchemaCanvas.vue";
import SymbolenVenster from "~/components/editor/SymbolenVenster.vue";
import SneltoetsenDialoog from "~/components/editor/SneltoetsenDialoog.vue";
import KringenlijstTabel from "~/components/kringenlijst/KringenlijstTabel.vue";
import MateriaallijstTabel from "~/components/materiaallijst/MateriaallijstTabel.vue";
import PaginaTabs from "~/components/situatie/PaginaTabs.vue";
import PlanTekenenDialoog from "~/components/situatie/PlanTekenenDialoog.vue";
import PlanCanvas from "~/components/situatie/PlanCanvas.vue";
import PlanOpmaak from "~/components/situatie/PlanOpmaak.vue";
import PlanToevoegenDialoog from "~/components/situatie/PlanToevoegenDialoog.vue";
import SchaalDialoog from "~/components/situatie/SchaalDialoog.vue";
import { volgendPunt } from "~/situatie/plaatskeuzes";
import { GROEP_INSTALLATIE, GROEP_VERDEELBORDEN, GROEP_ZONDER_KRING, type TePlaatsenGroep } from "~/situatie/items";
import TePlaatsenPaneel from "~/components/situatie/TePlaatsenPaneel.vue";
import SjabloonInvoegenDialoog from "./SjabloonInvoegenDialoog.vue";
import LichtschakelingDialoog from "./LichtschakelingDialoog.vue";
import KringReferentiesDialoog from "./KringReferentiesDialoog.vue";
import { nieuwsteConcept, wisAangebodenConcept, type AangebodenConcept } from "~/composables/concepten";
import { useAlleenLezen } from "~/composables/useAlleenLezen";
import { useAutosave, waarschuwBijVerlaten } from "~/composables/useAutosave";
import { httpStatus } from "~/composables/useProjectenApi";
import { useNodeTekst } from "~/composables/useNodeTekst";
import { useSessieHerstel } from "~/composables/useSessieHerstel";
import {
  opnieuwProberen as probeerOpnieuw,
  slaVertrekvraagOver,
  toonAfgemeld,
  vertrekBevestiging,
  type SessieControle,
} from "~/editor/aanmelding";
import { herstelDocument } from "~/editor/concept-herstel";
import { vertaalFout } from "~/fouten";
import { useEditorStore } from "~/stores/editor";
import { useSessieStore } from "~/stores/sessie";
import { useSituatieStore } from "~/stores/situatie";
import { useVersieStore } from "~/stores/versie";

// Zonder ingelogde gebruiker start de editor niet (concepten en bewaren horen bij een gebruiker).
const props = defineProps<{ context: EditorContext }>();
const context = props.context;
provide(editorContextKey, context);
const support = context.support;
const admin = context.modus === "admin";

const route = useRoute();
// Een ander id geeft een nieuwe pagina-instantie (NuxtPage sleutelt op het pad).
const id = context.projectId;
const store = useEditorStore();
const situatie = useSituatieStore();
const sessie = useSessieStore();
const versieStore = useVersieStore();
const herstelSessie = useSessieHerstel();
const behandelSchrijfweigering = useAlleenLezen();

// Dit venster hoort bij wie het opende: zijn concepten, en elke bewaring zegt voor wie ze is,
// zodat de server ze weigert als intussen een ander ingelogd is (401 ANDERE_GEBRUIKER). Zonder
// gebruiker (de middleware laat dat niet toe) gooit `useAutosave`: nooit een concept zonder eigenaar.
const gebruikerId = context.gebruikerId;
const oorspronkelijkeNaam = sessie.gebruiker?.naam ?? "";
const api = context.projecten;
store.nieuwVenster();
const { nodeTekst } = useNodeTekst();
const { t } = useI18n();
const toast = useToast();
const sjabloonOpen = ref(false);
const sjabloonId = ref("");
const lichtschakelingOpen = ref(false);
const referentiesOpen = ref(false);
function openSjabloon(id: string): void { sjabloonId.value = id; sjabloonOpen.value = true; }

useHead({ title: () => (store.projectId === id && store.naam ? `${store.naam} · ${t("app.naam")}` : t("app.naam")) });

type Laadstatus = "laden" | "klaar" | "nietGevonden" | "fout";
const laadstatus = ref<Laadstatus>("laden");

const autosave = useAutosave({
  store,
  bewaar: api.bewaar,
  haal: api.haal,
  dupliceer: context.klant?.dupliceer,
  maakNieuw: context.klant?.maakUitDocument,
  naarProject: async (kopieId) => {
    // Het werk staat nu in de kopie of het nieuwe project: dat verlaten vraagt niets.
    vertrekBevestigd = true;
    await navigateTo(`/projecten/${kopieId}`);
  },
  gebruikerId,
  modus: context.modus,
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
const alleenLezen = computed(() => admin ? !context.mogelijkheden.schrijven : !organisatieSchrijft.value || autosave.alleenLezen.value);
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
  if (!admin) await werkInOrganisatieVan(project.organisatieId);
  projectOrganisatieId.value = project.organisatieId;
  // Meteen goed vóór het document er is: de watcher draait ook, maar dit laat geen gat.
  store.zetAlleenLezen(alleenLezen.value);
  store.laad({ id: project.id, naam: project.naam, versie: project.versie, document: project.document });
  // Een kapot conceptarchief mag het openen niet tegenhouden. Pas na de conceptcontrole is de pagina klaar.
  // Elk concept van het project telt, los van de klok: het bestaat alleen zolang er onbewaard werk is.
  // Alleen de eigen concepten van de gebruiker, en één keer de oude zonder gebruiker.
  // Alleen-lezen: het concept blijft in het archief staan en wordt aangeboden zodra er weer geschreven mag worden.
  concept.value = store.alleenLezen ? null : await nieuwsteConcept(project.id, gebruikerId, context.modus).catch(() => null);
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
  // Een concept van voor een update kan een oudere schemaversie hebben: eerst migreren. Lukt dat niet,
  // dan laden we niets en wissen we niets: het concept blijft bewaard.
  const document = herstelDocument(c.document);
  if (document === null) {
    toast.add({ title: t("editor.concept.herstelMislukt"), color: "error" });
    return;
  }
  store.laad({ id, naam: c.naam, versie: c.versie, document });
  // Het concept staat nog niet op de server: als wijziging tellen, zodat de autosave het bewaart.
  // Is de server intussen verder dan `c.versie`, dan volgt een conflict.
  store.markeerGewijzigd();
  // Eerst staat het werk in het concept van dit venster, pas dan gaat het aangeboden concept weg.
  // Lukte die eigen schrijfactie niet (bv. een vol archief), dan blijft het aangeboden concept staan.
  if (await autosave.wachtOpConcept()) await wisAangebodenConcept(aangeboden).catch(() => {});
}

/** Alleen-lezen: het concept blijft in het archief staan voor later; de dialoog gaat weg zonder iets te wissen. */
function laterConcept(): void {
  concept.value = null;
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

// De server weigerde het document met een bekende foutcode (bv. PLANBESTAND_ONBEKEND): de vertaalde reden.
watch(autosave.fout, (fout) => {
  if (fout?.code) toast.add({ title: t(`fouten.${fout.code}`), color: "error" });
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

// --- Project elders verwijderd -----------------------------------------------------

const nieuwProjectBezig = ref(false);

/**
 * "Terug naar de projecten" in de melding is een uitdrukkelijke keuze om het werk los te laten: alleen
 * die knop slaat de vertrekvraag over. Het tabblad sluiten, de pijl in de balk, van bedrijf wisselen en
 * uitloggen vragen nog wel, want het concept van een verwijderd project is nooit meer te openen. Ook
 * bij `onbewaard` (het werk staat alleen in het geheugen) en bij een klik die elders opent (ctrl, cmd,
 * shift, middelste knop) blijft de vraag (zie `slaVertrekvraagOver`).
 */
function terugNaarProjecten(klik: MouseEvent): void {
  if (slaVertrekvraagOver(autosave.status.value, klik)) vertrekBevestigd = true;
}

/** Bij een mislukte conceptschrijfactie (status onbewaard) staat het werk alleen nog in het geheugen. */
const verwijderdUitleg = computed(() =>
  autosave.status.value === "onbewaard" ? t("editor.verwijderd.uitlegNietLokaal") : t("editor.verwijderd.uitleg"),
);

/**
 * Het project werd elders verwijderd: het lokale document wordt een nieuw project (met de plannen van
 * het bedrijf). Een 402 geeft de alleen-lezenmelding, een andere fout een toast; de editor blijft dan
 * staan zoals hij was, met het concept lokaal.
 */
async function bewaarAlsNieuwProject(): Promise<void> {
  if (!context.mogelijkheden.nieuwProject || nieuwProjectBezig.value) return;
  nieuwProjectBezig.value = true;
  try {
    await autosave.bewaarAlsNieuwProject();
  } catch (fout) {
    if (!(await behandelSchrijfweigering(fout))) toast.add({ title: vertaalFout(fout, t), color: "error" });
  } finally {
    nieuwProjectBezig.value = false;
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
  if (admin && !support?.schrijven.value) return;
  await probeerOpnieuw({ sessie: sessieControle, verwacht: gebruikerId, nuOpslaan: autosave.nuOpslaan }).catch(
    (fout: unknown) => {
      toast.add({ title: vertaalFout(fout, t), color: "error" });
    },
  );
}

const werkruimte = ref<InstanceType<typeof EditorWerkruimte> | null>(null);
const actieveBevinding = ref<Bevinding | null>(null);
watch(() => store.selectie.join(","), () => { actieveBevinding.value = null; }, { flush: "sync" });
const dossierGegevensOpen = ref(false);
function herstelBevinding(b: Bevinding): void { actieveBevinding.value = b; void werkruimte.value?.toonEigenschappen(); }
async function navigeerDossier(doel: "gegevens" | "schema" | "situatie"): Promise<void> {
  if (doel === "gegevens") { dossierGegevensOpen.value = true; return; }
  store.tabblad = doel === "schema" ? "eendraadschema" : "situatieschema";
  await nextTick();
  werkruimte.value?.toonOnderdelen();
}
function toonBevindingen(): void { werkruimte.value?.toonBevindingen(); }

function bijVerlaten(event: BeforeUnloadEvent): void {
  // Een bedoelde herlading met het werk in het concept (een nieuwe versie): niets vragen.
  if (versieStore.zonderWaarschuwing) return;
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
  if (admin) { void sessie.laad().then(() => support?.controleer(sessie.gebruiker?.id ?? null)).catch(() => {}); return; }
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
const plaatsZoek = ref("");
const plaatsKring = ref("");
const doorplaatsen = ref(false);
/** De zichtbare groepen van "Te plaatsen", in hun volgorde; "Doorgaan" blijft binnen één groep (kring). */
const plaatsVolgorde = ref<TePlaatsenGroep[]>([]);
let plaatsReeks: TePlaatsenGroep[] = [];
watch(teplaatsen, (id) => {
  if (id === null) return;
  plaatsReeks = plaatsVolgorde.value.map((g) => ({ ...g, nodeIds: [...g.nodeIds] }));
  // Small screens keep the established route back to the full plan.
  if (window.matchMedia("(max-width: 767px)").matches) werkruimte.value?.toonWerk();
});
/** De pagina waarop twee klikken een afstand meten (schaalmodus), of null. */
const meetPaginaId = ref<string | null>(null);
const meetSchaal = computed(() => meetPaginaId.value !== null && meetPaginaId.value === situatie.actievePaginaId);
const schaalOpen = ref(false);
const schaalAfstandPx = ref(0);
const planDialoogOpen = ref(false);
const tekenDialoogOpen = ref(false);
const tekenPaginaId = ref<string | undefined>();
function tekenPlan(paginaId?: string) {
  stopPlaatsenEnMeten();
  tekenPaginaId.value = paginaId;
  tekenDialoogOpen.value = true;
}
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
    teplaatsen.value = null;
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

watch(() => store.alleenLezen || situatie.actievePagina?.referentie, alleenLezen => { if (alleenLezen) stopPlaatsenEnMeten(); });
watch([plaatsZoek, plaatsKring], () => { teplaatsen.value = null; });

/** De naam van een groep van "Te plaatsen" in de melding dat ze af is. */
function groepKlaarMelding(kringLabel: string): string {
  const groep = { [GROEP_VERDEELBORDEN]: "verdeelborden", [GROEP_INSTALLATIE]: "installatie", [GROEP_ZONDER_KRING]: "zonderKring" }[kringLabel];
  return groep
    ? t("editor.situatie.tePlaatsen.groepKlaar", { groep: t(`editor.situatie.tePlaatsen.${groep}`) })
    : t("editor.situatie.tePlaatsen.kringKlaar", { label: kringLabel });
}

/** "Doorgaan met volgend punt" loopt; de modus-chip met Stop staat dan in de hint. */
const doorplaatsenActief = computed(() => doorplaatsen.value && teplaatsen.value !== null);

function geplaatst(nodeId: NodeId, vanPagina: string | null): void {
  if (doorplaatsen.value && teplaatsen.value === nodeId) {
    const volgende = volgendPunt(plaatsReeks, nodeId);
    teplaatsen.value = volgende.soort === "volgend" ? volgende.nodeId : null;
    if (volgende.soort === "kringKlaar") {
      toast.add({ title: groepKlaarMelding(volgende.kringLabel), color: "success", icon: "i-lucide-circle-check" });
    }
  } else {
    teplaatsen.value = null;
  }
  meetPaginaId.value = null;
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
let supportTimer: ReturnType<typeof setInterval> | undefined;
const accountGeldig = computed(() => sessie.gebruiker?.id === gebruikerId && !!sessie.gebruiker?.superuser);
watch(() => sessie.gebruiker?.id, id => support?.controleer(id ?? null));
watch(() => sessie.gebruiker?.superuser, flag => { if (admin && !flag) support?.controleer(null); });
async function supportGestart() {
  concept.value = await nieuwsteConcept(id, gebruikerId, context.modus).catch(() => null);
  conceptOpen.value = concept.value !== null;
}
async function wachtOpOpslaan() {
  await autosave.nuOpslaan();
  return autosave.status.value === 'opgeslagen';
}
const lokaalDocumentBeschikbaar = computed(() => laadstatus.value === 'klaar' && store.projectId === id && !!store.document);
function downloadLokaal() {
  if (!lokaalDocumentBeschikbaar.value) return;
  const blob = new Blob([JSON.stringify({ naam: store.naam, versie: store.versie, document: store.document }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `project-${id}-lokaal.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

onMounted(() => {
  if (support) supportTimer = setInterval(() => support.controleer(sessie.gebruiker?.id ?? null), 1000);
  afmeldenVoorVertrek = sessie.registreerVoorVertrek(voorVertrek, vertrekAfgebroken);
  // Een herlading voor een nieuwe versie wacht tot het werk van dit venster in het concept staat.
  versieStore.zetVoorHerladen(() => autosave.wachtOpConcept());
  window.addEventListener("beforeunload", bijVerlaten);
  window.addEventListener("focus", bijFocus);
  window.addEventListener("dragover", bestandBuitenDropzone);
  window.addEventListener("drop", bestandBuitenDropzone);
  void laad();
});
onBeforeUnmount(() => {
  clearInterval(supportTimer);
  afmeldenVoorVertrek?.();
  versieStore.zetVoorHerladen(null);
  window.removeEventListener("beforeunload", bijVerlaten);
  window.removeEventListener("focus", bijFocus);
  window.removeEventListener("dragover", bestandBuitenDropzone);
  window.removeEventListener("drop", bestandBuitenDropzone);
});
</script>

<template>
  <div class="flex h-dvh flex-col">
    <SupportBanner v-if="support" :support="support" :bedrijf="context.bedrijfNaam ?? ''" :terug="context.terug" :account-geldig="accountGeldig && laadstatus === 'klaar'" :download-beschikbaar="lokaalDocumentBeschikbaar" :wacht-op-opslaan="wachtOpOpslaan" @gestart="supportGestart" @download="downloadLokaal" />
    <template v-if="laadstatus === 'klaar' && store.document">
      <EditorBovenbalk
        :status="autosave.status.value"
        :afgemeld="afgemeldMelding"
        :andere-gebruiker="andereGebruiker"
        @opnieuw-proberen="opnieuwProberen"
        @opnieuw-inloggen="opnieuwInloggen"
        @toon-conflict="conflictOpen = true"
        @toon-bevindingen="toonBevindingen"
        @exporteren="context.mogelijkheden.exporteren && (exportOpen = true)"
      />
      <UAlert
        v-if="autosave.verwijderd.value"
        color="error"
        variant="subtle"
        icon="i-lucide-trash-2"
        orientation="horizontal"
        class="rounded-none border-b border-default py-2"
        :title="$t('editor.verwijderd.melding')"
        :description="verwijderdUitleg"
        data-testid="verwijderd-melding"
      >
        <template #actions>
          <UButton
            size="xs"
            color="error"
            icon="i-lucide-copy-plus"
            :label="$t('editor.verwijderd.nieuwProject')"
            :loading="nieuwProjectBezig"
            v-if="context.mogelijkheden.nieuwProject"
            data-testid="verwijderd-nieuw-project"
            @click="bewaarAlsNieuwProject"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-arrow-left"
            :to="context.terug"
            :label="$t('editor.verwijderd.terug')"
            data-testid="verwijderd-terug"
            @click="terugNaarProjecten"
          />
        </template>
      </UAlert>
      <AbonnementBanner v-if="!admin" />
      <EditorWerkruimte ref="werkruimte" :tabblad="store.tabblad" :selectie="store.selectie" :heeft-plan="!!situatie.actievePagina?.achtergrond">
        <template #gereedschap>
          <OnderdelenPaneel v-if="store.tabblad === 'eendraadschema'" @sjabloon="openSjabloon" @lichtschakeling="lichtschakelingOpen = true" @referenties="referentiesOpen = true" @eigenschappen="werkruimte?.toonEigenschappen()" />
          <TePlaatsenPaneel v-else :inert="situatie.actievePagina?.referentie || undefined" v-model:gekozen="teplaatsen" v-model:zoek="plaatsZoek" v-model:kring="plaatsKring" v-model:doorgaan="doorplaatsen" @volgorde="plaatsVolgorde = $event" />
        </template>
        <SchemaCanvas v-if="store.tabblad === 'eendraadschema'" class="min-h-0 flex-1" />
        <KringenlijstTabel v-else-if="store.tabblad === 'kringenlijst'" class="min-h-0 flex-1" />
        <MateriaallijstTabel v-else-if="store.tabblad === 'materiaallijst'" class="min-h-0 flex-1" />
        <template v-else>
          <div v-if="heeftPaginas" class="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <p v-if="situatie.actievePagina?.referentie" role="status" class="border-b border-default px-3 py-2 text-sm" data-testid="referentieblad-melding">{{ $t('editor.situatie.referentieUitleg') }}</p>

            <div
              v-if="hint"
              class="absolute inset-x-3 top-12 z-10 flex min-h-9 flex-wrap items-center gap-x-2 gap-y-1 rounded border border-default bg-default px-3 py-1 text-sm"
              role="status"
              data-testid="plan-hint"
            >
              <UIcon :name="meetSchaal ? 'i-lucide-ruler' : 'i-lucide-map-pin'" class="size-4 shrink-0" />
              <UBadge
                v-if="doorplaatsenActief && !meetSchaal"
                color="primary"
                variant="subtle"
                icon="i-lucide-repeat"
                :label="$t('editor.situatie.tePlaatsen.doorgaan')"
                class="shrink-0"
                data-testid="plan-modus-doorgaan"
              />
              <!-- Op een smal scherm breekt de uitleg naast de doorgaan-chip naar een eigen regel. -->
              <span class="max-h-full min-w-0 flex-1 basis-48 overflow-auto" data-testid="plan-hint-tekst">{{ hint }}</span>
              <UButton
                v-if="hint"
                :color="doorplaatsenActief && !meetSchaal ? 'primary' : 'neutral'"
                :variant="doorplaatsenActief && !meetSchaal ? 'soft' : 'link'"
                :icon="doorplaatsenActief && !meetSchaal ? 'i-lucide-square' : undefined"
                size="sm"
                class="ml-auto"
                :label="$t(doorplaatsenActief && !meetSchaal ? 'editor.situatie.hint.stop' : 'editor.situatie.hint.annuleren')"
                :aria-keyshortcuts="'Escape'"
                data-testid="plan-hint-stop"
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
            <PaginaTabs @toevoegen="planToevoegen" @tekenen="tekenPlan" @schaal-instellen="schaalInstellen" />
          </div>
          <div v-else class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-6" data-testid="plan-leeg">
            <div class="flex max-w-sm flex-col items-center gap-3 text-center">
              <UIcon name="i-lucide-map" class="size-10 text-muted" />
              <p class="font-medium">{{ $t("editor.situatie.leeg.titel") }}</p>
              <p class="text-sm text-muted">{{ $t("editor.situatie.leeg.beschrijving") }}</p>
              <UButton icon="i-lucide-pencil-ruler" :disabled="store.alleenLezen" data-testid="plan-tekenen-leeg" :label="$t('editor.situatie.tekenen.new')" @click="tekenPlan()" />
              <UButton
                icon="i-lucide-image-up"
                :disabled="store.alleenLezen"
                variant="outline"
                data-testid="plan-toevoegen-leeg"
                :label="$t('editor.situatie.leeg.planToevoegen')"
                @click="planToevoegen"
              />
            </div>
          </div>
        </template>
        <template #eigenschappen>
          <ActieveBevinding v-if="actieveBevinding" :bevinding="actieveBevinding" @terug="toonBevindingen" @volgende="herstelBevinding" @sluiten="actieveBevinding = null" />
          <EigenschappenPaneel />
        </template>
        <template #bevindingen><BevindingenPaneel id="bevindingen" @selecteer="herstelBevinding" @navigeer="navigeerDossier" /></template>
        <template #opmaak><PlanOpmaak /></template>
      </EditorWerkruimte>
      <SjabloonInvoegenDialoog v-model:open="sjabloonOpen" :sjabloon-id="sjabloonId" />
      <LichtschakelingDialoog v-model:open="lichtschakelingOpen" />
      <KringReferentiesDialoog v-model:open="referentiesOpen" />
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

    <PlanTekenenDialoog v-model:open="tekenDialoogOpen" :pagina-id="tekenPaginaId" @klaar="planKlaar" @verwijderd="autosave.meldVerwijderd" />
    <PlanToevoegenDialoog
      v-model:open="planDialoogOpen"
      @tekenen="tekenPlan()"
      :vervang-pagina-id="vervangPaginaId"
      @klaar="planKlaar"
      @verwijderd="autosave.meldVerwijderd"
    />
    <SchaalDialoog v-model:open="schaalOpen" :pagina-id="meetPaginaId" :afstand-px="schaalAfstandPx" />
    <SymbolenVenster />
    <SneltoetsenDialoog />

    <ConceptDialoog
      v-if="concept"
      v-model:open="conceptOpen"
      :tijd="concept.concept.tijd"
      @laden="laadConcept"
      @later="laterConcept"
      @verwerpen="verwerpConcept"
    />
    <ExportDialoog
      v-if="context.mogelijkheden.exporteren"
      v-model:open="exportOpen"
      :status="autosave.status.value"
      :nu-opslaan="autosave.nuOpslaan"
      @conflict="autosave.meldConflict"
      @navigeer="navigeerDossier"
    />
    <ProjectgegevensDialoog v-model:open="dossierGegevensOpen" />
    <ConflictDialoog
      v-model:open="conflictOpen"
      :bezig="conflictBezig"
      :kopie-toegestaan="context.mogelijkheden.dupliceren"
      @download="downloadLokaal"
      :lokale-wijzigingen="autosave.conflict.value?.lokaleWijzigingen ?? true"
      @serverversie="losConflictOp(autosave.laadServerversie)"
      @kopie="context.mogelijkheden.dupliceren && losConflictOp(autosave.bewaarAlsKopie)"
    />
  </div>
</template>
