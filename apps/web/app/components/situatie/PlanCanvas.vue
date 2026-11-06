<script setup lang="ts">
import CanvasBediening from "~/components/editor/CanvasBediening.vue";
import type { NodeId } from "@elentrik/model";
import { situatieItems, situatieLaagSvg, situatieAfdekkingenSvg } from "@elentrik/render";
import { doelSoort, moetNegeren, WIDGET_SELECTOR } from "~/composables/sneltoetsen";
import { useBestandenApi } from "~/composables/useBestandenApi";
import { SLEEP_DREMPEL_PX, useCanvasWeergave } from "~/composables/useCanvasWeergave";
import { useDocumentFoutMelding } from "~/composables/useDocumentFoutMelding";
import { useNodeTekst } from "~/composables/useNodeTekst";
import MarkeringSymbool from "~/components/editor/MarkeringSymbool.vue";
import { markeringen as leidMarkeringenAf } from "~/editor/markeringen";
import { schemaKeuzes } from "~/editor/schema-navigatie";
import { maxPlanZoom, schermNaarInhoud } from "~/editor/weergave";
import { planCursorToets } from "~/situatie/bediening";
import { overlapMet, schuif, symboolGrootte } from "~/situatie/geometrie";
import { NODE_SLEEP_TYPE } from "~/situatie/slepen";
import { situatieSneltoets } from "~/situatie/sneltoetsen";
import { useEditorStore } from "~/stores/editor";
import { useSituatieStore } from "~/stores/situatie";

const { t } = useI18n();
const toast = useToast();
const props = defineProps<{
  /** Het punt dat met een klik op het plan geplaatst wordt (gekozen in "Te plaatsen"), of null. */
  teplaatsen: NodeId | null;
  /** Schaalmodus: twee klikken meten een afstand in rasterpixels. */
  meetSchaal: boolean;
}>();

const emit = defineEmits<{
  /** Een node is geplaatst of verschoven; `vanPagina` is de titel van zijn vorige pagina bij een verhuis. */
  geplaatst: [nodeId: NodeId, vanPagina: string | null];
  /** Escape tijdens plaatsen of schaal meten. */
  annuleer: [];
  schaalGemeten: [afstand_px: number];
  vervangPlan: [paginaId: string];
}>();

/** Ruimte rond het plan bij "Passend maken", als fractie van de lange zijde van het raster. */
const MARGE_FRACTIE = 0.02;
/** Selectiekader en markering, als fractie van de symboolgrootte. */
const KADER_HALF = 0.75;
const MARKERING_STRAAL = 0.15;
const MEETPUNT_STRAAL = 0.12;

const editor = useEditorStore();
const situatie = useSituatieStore();
const alleenLezen = computed(() => editor.alleenLezen || !!situatie.actievePagina?.referentie);
const bestanden = useBestandenApi();
const voerUit = useDocumentFoutMelding();
const { terugval } = useNodeTekst();

const venster = useTemplateRef<HTMLElement>("venster");
const hulpId = useId();
const puntKeuzeId = useId();

const opschonen = ref(false);
const afdekStart = ref<{ x: number; y: number } | null>(null);
const gekozenAfdekking = ref("");
const afdekFormulier = reactive({ x: 0, y: 0, breedte: 20, hoogte: 20 });
/** Centimeter per rasterpixel als het plan gekalibreerd is; anders blijven de afdekvelden in beeldpunten. */
const cmPerPx = computed(() => {
  const mm = achtergrond.value?.schaal?.mmPerPx;
  return mm !== undefined && mm > 0 ? mm / 10 : undefined;
});
const afrond = (waarde: number): number => Math.round(waarde * 10000) / 10000;
type AfdekVeld = "x" | "y" | "breedte" | "hoogte";
function afdekWaarde(veld: AfdekVeld): number {
  return cmPerPx.value ? afrond(afdekFormulier[veld] * cmPerPx.value) : afdekFormulier[veld];
}
function zetAfdekWaarde(veld: AfdekVeld, event: Event): void {
  const waarde = (event.target as HTMLInputElement).valueAsNumber;
  afdekFormulier[veld] = cmPerPx.value ? waarde / cmPerPx.value : waarde;
}
function afdekGrens(veld: AfdekVeld): number | undefined {
  const px = veld === "x" || veld === "breedte" ? achtergrond.value?.breedte_px : achtergrond.value?.hoogte_px;
  return px !== undefined && cmPerPx.value ? afrond(px * cmPerPx.value) : px;
}
const modus = computed<"normaal" | "plaats" | "meet" | "afdek">(() =>
  props.meetSchaal ? "meet" : props.teplaatsen !== null ? "plaats" : opschonen.value ? "afdek" : "normaal",
);
const bedieningsHulp = computed(() => t(`editor.situatie.canvas.${
  modus.value === "meet" ? "meetToetsenbord" : modus.value === "plaats" ? "plaatsToetsenbord" : modus.value === "afdek" ? "afdekHulp" : "toetsenbord"
}`));

// --- Plan ------------------------------------------------------------------

const pagina = computed(() => situatie.actievePagina);
const achtergrond = computed(() => pagina.value?.achtergrond);
const inhoud = computed(() => {
  const a = achtergrond.value;
  return a ? { breedte: a.breedte_px, hoogte: a.hoogte_px } : null;
});
const symbool = computed(() => (achtergrond.value ? symboolGrootte(achtergrond.value, pagina.value?.symboolSchaal ?? 1) : 0));
const planUrl = computed(() => (achtergrond.value ? bestanden.url(achtergrond.value.rasterBestandId) : null));

/** Het rasterbestand kon niet geladen worden (weg of onbekend id). */
const planFout = ref(false);
watch(
  () => achtergrond.value?.rasterBestandId,
  () => {
    planFout.value = false;
  },
);

/** Een pagina zonder plan, of met een plan dat niet laadt. */
const planOntbreekt = computed(() => pagina.value !== undefined && (!achtergrond.value || planFout.value));

const keuzeLabels = computed(() => editor.document && editor.analyse
  ? new Map(schemaKeuzes(editor.document, editor.analyse, type => t(`editor.types.${type}`)).map(k => [k.id, k.label])) : new Map<string, string>());
const items = computed(() => {
  const doc = editor.document;
  const analyse = editor.analyse;
  const p = pagina.value;
  return doc && analyse && p ? situatieItems(doc, analyse, p.id, terugval) : [];
});

/** De enige v-html-bron: `render` escapet alle documenttekst. */
const laagSvg = computed(() => situatieLaagSvg(items.value, symbool.value));
const afdekkingenSvg = computed(() => situatieAfdekkingenSvg(pagina.value?.afdekkingen));
const afdekkingen = computed(() => pagina.value?.afdekkingen ?? []);

watch([() => props.teplaatsen, () => props.meetSchaal, () => pagina.value?.id,
  () => achtergrond.value?.rasterBestandId, alleenLezen], () => {
  opschonen.value = false;
  afdekStart.value = null;
  gekozenAfdekking.value = "";
});

function wisselOpschonen(): void {
  opschonen.value = !opschonen.value;
  afdekStart.value = null;
  gekozenAfdekking.value = "";
}

function bewaarAfdekking(rechthoek: { x: number; y: number; breedte: number; hoogte: number }): void {
  if (alleenLezen.value || modus.value !== "afdek") return;
  if (voerUit(() => { gekozenAfdekking.value = situatie.voegAfdekkingToe(rechthoek) ?? ""; })) {
    afdekStart.value = null;
  }
}

function afdekKlik(punt: { x: number; y: number }): void {
  if (alleenLezen.value) return;
  const p = binnenRaster(punt);
  const eerste = afdekStart.value;
  if (!eerste) {
    afdekStart.value = p;
    gekozenAfdekking.value = "";
    return;
  }
  if (eerste.x === p.x || eerste.y === p.y) return;
  bewaarAfdekking({ x: Math.min(eerste.x, p.x), y: Math.min(eerste.y, p.y),
    breedte: Math.abs(eerste.x - p.x), hoogte: Math.abs(eerste.y - p.y) });
}

function verwijderGekozenAfdekking(): void {
  if (alleenLezen.value || modus.value !== "afdek" || !gekozenAfdekking.value) return;
  if (voerUit(() => situatie.verwijderAfdekking(gekozenAfdekking.value))) gekozenAfdekking.value = "";
}

/** Een punt binnen het raster gehouden. */
function binnenRaster(punt: { x: number; y: number }): { x: number; y: number } {
  const a = achtergrond.value;
  return a ? schuif(punt, 0, 0, a) : punt;
}

/** Het punt op het plan (rasterpixels) onder de muis. */
function planPunt(event: MouseEvent): { x: number; y: number } {
  const rect = venster.value!.getBoundingClientRect();
  return schermNaarInhoud(event.clientX, event.clientY, rect, weergave.value);
}

// --- Zoom, pan en pinch (gedeeld met het eendraadschema) --------------------

const canvas = useCanvasWeergave({
  venster,
  inhoud: () => inhoud.value,
  marge: () => (inhoud.value ? Math.max(inhoud.value.breedte, inhoud.value.hoogte) * MARGE_FRACTIE : 0),
  maxZoom: maxPlanZoom,
  behoudSchaalBijResize: true,
  onderbreek: breekVerschuivingAf,
});
const { weergave, viewBox, ruimteIngedrukt, sleept, maakPassend, zoomOpWiel } = canvas;

// Een andere pagina of een ander plan: opnieuw passend maken.
watch(
  () => {
    const i = inhoud.value;
    return `${pagina.value?.id ?? ""}|${achtergrond.value?.rasterBestandId ?? ""}|${i?.breedte}x${i?.hoogte}`;
  },
  () => canvas.passendOpnieuw(),
);

// --- Een symbool verschuiven -----------------------------------------------

type Positie = { x: number; y: number };
type Verschuiving = {
  startX: number;
  startY: number;
  pointerId: number;
  actief: boolean;
  nodeId: NodeId;
  element: SVGGElement;
  verschil: Positie;
};

let verschuiving: Verschuiving | null = null;
const verschuift = ref(false);

/** De lokale positie van het symbool dat verschoven wordt; geen documentoperatie tijdens het slepen. */
const voorbeeld = ref<(Positie & { nodeId: NodeId }) | null>(null);

const posities = computed(() => new Map(items.value.map((i) => [i.nodeId, { x: i.x, y: i.y }])));

function positieVan(nodeId: NodeId): Positie | undefined {
  const v = voorbeeld.value;
  return v && v.nodeId === nodeId ? v : posities.value.get(nodeId);
}

/** Stopt het verschuiven en haalt de preview altijd weg; geeft de gestopte verschuiving terug. */
function stopVerschuiving(): Verschuiving | null {
  const v = verschuiving;
  if (!v) return null;
  verschuiving = null;
  verschuift.value = false;
  voorbeeld.value = null;
  v.element.style.removeProperty("transform");
  const el = venster.value;
  if (el?.hasPointerCapture(v.pointerId)) el.releasePointerCapture(v.pointerId);
  return v;
}

/** Breekt het verschuiven af zonder te plaatsen; de klik bij het latere loslaten telt niet. */
function breekVerschuivingAf(): void {
  const v = stopVerschuiving();
  if (v) canvas.negeerTotLoslaten(v.pointerId);
}

function pointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !venster.value) return;
  // Een verschuiving waarvan de pointerup gemist werd of die een tweede vinger onderbreekt, stopt
  // hier zonder te plaatsen; de klik bij het loslaten van die eerste pointer telt niet.
  breekVerschuivingAf();
  const element = (event.target as Element).closest<SVGGElement>("[data-node-id]");
  const nodeId = element?.getAttribute("data-node-id") ?? null;
  // Zonder schrijfrecht verschuift een symbool niet: slepen erop pant het plan.
  const opSymbool = !ruimteIngedrukt.value && modus.value === "normaal" && event.isPrimary && !alleenLezen.value;
  // Pannen: op lege ruimte, met de spatie ingedrukt, of tijdens plaatsen en meten. Twee vingers pinchen.
  canvas.pointerDown(event, !(opSymbool && element !== null));
  if (!opSymbool || !element || nodeId === null || canvas.pincht()) return;
  const positie = posities.value.get(nodeId);
  if (!positie) return;
  const onderMuis = planPunt(event);
  verschuiving = {
    startX: event.clientX,
    startY: event.clientY,
    pointerId: event.pointerId,
    actief: false,
    nodeId,
    element,
    verschil: { x: positie.x - onderMuis.x, y: positie.y - onderMuis.y },
  };
}

function pointerMove(event: PointerEvent): void {
  canvas.pointerMove(event);
  const v = verschuiving;
  const vensterEl = venster.value;
  if (!v || !vensterEl || event.pointerId !== v.pointerId) return;
  // Geen knop meer ingedrukt: de pointerup is ons ontgaan.
  if (event.buttons === 0) {
    stopVerschuiving();
    return;
  }
  if (!v.actief) {
    if (Math.hypot(event.clientX - v.startX, event.clientY - v.startY) < SLEEP_DREMPEL_PX) return;
    v.actief = true;
    verschuift.value = true;
    vensterEl.setPointerCapture(event.pointerId);
  }
  const onderMuis = planPunt(event);
  const p = binnenRaster({ x: onderMuis.x + v.verschil.x, y: onderMuis.y + v.verschil.y });
  voorbeeld.value = { nodeId: v.nodeId, ...p };
  // Een CSS-transform overschrijft het transform-attribuut zolang het slepen duurt.
  v.element.style.transform = `translate(${p.x}px, ${p.y}px)`;
}

function pointerUp(event: PointerEvent): void {
  if (verschuiving?.pointerId === event.pointerId) {
    const eind = voorbeeld.value;
    const v = stopVerschuiving()!;
    // Eén `plaats` bij het loslaten: één undo-stap. Een klik zonder beweging selecteert alleen.
    if (v.actief && eind) {
      plaatsOp(v.nodeId, eind);
      canvas.onderdrukKlik();
    }
  }
  canvas.pointerUp(event);
}

/** `pointercancel`, of `lostpointercapture` van het venster zelf (`.self`): niets verschuift. */
function pointerAfgebroken(event: PointerEvent): void {
  if (verschuiving?.pointerId === event.pointerId) stopVerschuiving();
  canvas.pointerAfgebroken(event);
}

// --- Plaatsen --------------------------------------------------------------

function plaatsOp(nodeId: NodeId, punt: Positie): void {
  const doc = editor.document;
  if (alleenLezen.value || !achtergrond.value || !doc || !Object.hasOwn(doc.nodes, nodeId)) return;
  const { x, y } = binnenRaster(punt);
  // Vóór het plaatsen: daarna staat het punt zelf ook in `items`.
  const overlap = overlapMet(items.value, nodeId, { x, y }, symbool.value);
  const uitkomst: { van: string | null } = { van: null };
  if (!voerUit(() => (uitkomst.van = situatie.plaatsNode(nodeId, x, y)))) return;
  editor.selectie = [nodeId];
  emit("geplaatst", nodeId, uitkomst.van);
  // Alleen een waarschuwing, geen snap: de plaatsing blijft staan tot de gebruiker ze ongedaan maakt.
  if (overlap) {
    toast.add({
      title: t("editor.situatie.overlap", { label: overlap.label || keuzeLabels.value.get(overlap.nodeId) || overlap.nodeId }),
      color: "warning",
      icon: "i-lucide-layers",
      actions: [{ label: t("editor.situatie.ongedaanMaken"), color: "neutral", variant: "outline", onClick: () => editor.ongedaanMaken() }],
    });
  }
}

// De meetcursor dient alleen voor schaalmeting; onderdelen worden op de klikpositie geplaatst.
const cursor = ref<Positie>({ x: 0, y: 0 });
const heeftSelectie = computed(() => items.value.some(item => editor.selectie.includes(item.nodeId)));
const geselecteerdPunt = computed(() => items.value.find(item => editor.selectie.includes(item.nodeId))?.nodeId ?? "");

watch([() => props.teplaatsen, () => props.meetSchaal, () => pagina.value?.id], async () => {
  const a = achtergrond.value;
  if (!a || modus.value === "normaal") return;
  cursor.value = { x: a.breedte_px / 2, y: a.hoogte_px / 2 };
  await nextTick();
  venster.value?.focus({ preventScroll: true });
}, { immediate: true });

async function kiesPlanPunt(event: Event): Promise<void> {
  const nodeId = (event.target as HTMLSelectElement).value;
  if (!items.value.some(item => item.nodeId === nodeId)) return;
  editor.selectie = [nodeId];
  await nextTick();
  venster.value?.focus({ preventScroll: true });
}

function bevestigCursor(): void {
  if (alleenLezen.value || planOntbreekt.value || modus.value !== "meet") return;
  meetKlik(cursor.value);
}

function cursorToets(event: KeyboardEvent): void {
  if (modus.value !== "meet" || planOntbreekt.value || event.isComposing || event.altKey) return;
  const actie = planCursorToets({ key: event.key, shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey, metaKey: event.metaKey, alleenLezen: alleenLezen.value });
  if (!actie) return;
  event.preventDefault();
  if (actie.soort === "schuif") cursor.value = binnenRaster({ x: cursor.value.x + actie.dx, y: cursor.value.y + actie.dy });
  else if (actie.soort === "bevestig") bevestigCursor();
  else annuleer();
}

function slepenBoven(event: DragEvent): void {
  if (alleenLezen.value || !achtergrond.value || !event.dataTransfer?.types.includes(NODE_SLEEP_TYPE)) return;
  event.preventDefault();
}

function neerzetten(event: DragEvent): void {
  if (alleenLezen.value) return;
  const nodeId = event.dataTransfer?.getData(NODE_SLEEP_TYPE);
  if (!nodeId) return;
  event.preventDefault();
  plaatsOp(nodeId, planPunt(event));
}

// --- Schaal meten ----------------------------------------------------------

const meetpunten = ref<Positie[]>([]);

watch([() => props.meetSchaal, () => pagina.value?.id], () => {
  meetpunten.value = [];
});

function meetKlik(punt: Positie): void {
  const p = binnenRaster(punt);
  const eerste = meetpunten.value.length === 1 ? meetpunten.value[0] : undefined;
  if (!eerste) {
    meetpunten.value = [p];
    return;
  }
  const afstand = Math.hypot(p.x - eerste.x, p.y - eerste.y);
  if (afstand === 0) return;
  meetpunten.value = [eerste, p];
  emit("schaalGemeten", afstand);
}

// --- Klikken: selecteren, plaatsen of meten --------------------------------

function klik(event: MouseEvent): void {
  if (canvas.klikOnderdrukt() || !achtergrond.value) return;
  if (modus.value === "afdek") {
    const id = (event.target as Element).closest("[data-afdekking-id]")?.getAttribute("data-afdekking-id");
    if (id && !afdekStart.value) gekozenAfdekking.value = id;
    else afdekKlik(planPunt(event));
    return;
  }
  if (modus.value === "meet") {
    meetKlik(planPunt(event));
    return;
  }
  if (props.teplaatsen !== null) {
    plaatsOp(props.teplaatsen, planPunt(event));
    return;
  }
  const symboolEl = (event.target as Element).closest("[data-node-id]");
  const id = symboolEl?.getAttribute("data-node-id") ?? null;
  if (id === null) {
    if (!event.shiftKey) editor.selectie = [];
    return;
  }
  if (event.shiftKey) {
    editor.selectie = editor.selectie.includes(id)
      ? editor.selectie.filter((k) => k !== id)
      : [...editor.selectie, id];
  } else {
    editor.selectie = [id];
  }
}

// --- Sneltoetsen -----------------------------------------------------------

/** Tekstvelden houden al hun toetsen, knoppen alleen Enter en spatie (zie `doelSoort`). */
function soortVan(doel: EventTarget | null): ReturnType<typeof doelSoort> {
  return doel instanceof HTMLElement ? doelSoort(doel) : "overig";
}

/** Escape: eerst een lopende verschuiving, dan plaatsen of meten, anders de selectie. */
function annuleer(): void {
  if (verschuiving) {
    breekVerschuivingAf();
    return;
  }
  if (modus.value === "afdek") {
    if (afdekStart.value) afdekStart.value = null;
    else wisselOpschonen();
    return;
  }
  if (modus.value !== "normaal") {
    meetpunten.value = [];
    emit("annuleer");
    return;
  }
  editor.selectie = [];
}

function toetsIngedrukt(event: KeyboardEvent): void {
  if (!editor.document || editor.tabblad !== "situatieschema") return;
  const doel = event.target instanceof Element ? event.target : null;
  if (
    moetNegeren({
      defaultPrevented: event.defaultPrevented,
      isComposing: event.isComposing,
      altKey: event.altKey,
      doelInWidget: doel?.closest(WIDGET_SELECTOR) != null,
      overlayOpen: window.document.querySelector("[role=dialog][data-state=open]") !== null,
    })
  ) {
    return;
  }
  const soort = soortVan(event.target);
  if (canvas.spatieOmlaag(event, soort)) return;
  const actie = situatieSneltoets({
    key: event.key,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    doelIsInvoer: soort === "invoer",
    doelIsKnop: soort === "knop",
    alleenLezen: alleenLezen.value,
  });
  if (!actie) return;
  // Tijdens het kiezen van een nieuwe plaats blijven eerder geselecteerde punten staan.
  if ((modus.value === "plaats" || modus.value === "afdek") && (actie.soort === "draai" || actie.soort === "schuif" || actie.soort === "haalVanPlan")) {
    event.preventDefault();
    if (modus.value === "afdek" && actie.soort === "haalVanPlan") verwijderGekozenAfdekking();
    return;
  }
  // Zonder zichtbaar plan wijzigt niets de plaatsingen; ongedaan maken en opnieuw blijven werken.
  if (planOntbreekt.value && (actie.soort === "draai" || actie.soort === "schuif" || actie.soort === "haalVanPlan")) {
    return;
  }
  event.preventDefault();

  switch (actie.soort) {
    case "draai":
      voerUit(() => situatie.draaiSelectie(actie.richting));
      break;
    case "haalVanPlan":
      // Alleen van het plan: het punt blijft in het eendraadschema (anti-doel).
      voerUit(() => situatie.haalSelectieVanPlan());
      break;
    case "schuif":
      voerUit(() => situatie.schuifSelectie(actie.dx, actie.dy));
      break;
    case "annuleer":
      annuleer();
      break;
    case "ongedaan":
      editor.ongedaanMaken();
      break;
    case "opnieuw":
      editor.opnieuw();
      break;
    case "sneltoetsen":
      editor.sneltoetsenOpen = true;
      break;
  }
}

onMounted(() => window.addEventListener("keydown", toetsIngedrukt));
onBeforeUnmount(() => window.removeEventListener("keydown", toetsIngedrukt));

// --- Overlay ---------------------------------------------------------------

const selectieKaders = computed(() => {
  const half = symbool.value * KADER_HALF;
  return editor.selectie.flatMap((id) => {
    const p = positieVan(id);
    return p ? [{ id, x: p.x - half, y: p.y - half, zijde: 2 * half }] : [];
  });
});

function focusSelectie(): void {
  const kaders = selectieKaders.value;
  if (!kaders.length) return;
  const x = Math.min(...kaders.map(k => k.x));
  const y = Math.min(...kaders.map(k => k.y));
  canvas.focus({ x, y, breedte: Math.max(...kaders.map(k => k.x + k.zijde)) - x, hoogte: Math.max(...kaders.map(k => k.y + k.zijde)) - y });
}

/** Eén markering per geplaatste node, rechtsboven het symbool; de ernst-aggregatie zit in `editor/markeringen.ts`. */
const markeringen = computed(() => {
  const half = symbool.value / 2;
  return [...leidMarkeringenAf(editor.bevindingen)].flatMap(([id, soort]) => {
    const p = positieVan(id);
    return p ? [{ id, soort, x: p.x + half, y: p.y - half }] : [];
  });
});

</script>

<template>
  <div class="relative flex size-full min-h-0 min-w-0 flex-col">
    <div v-if="achtergrond && !planOntbreekt" class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default bg-default px-3 py-1">
      <label :for="puntKeuzeId" class="sr-only">{{ $t('editor.situatie.canvas.kiesPunt') }}</label>
      <select
        :id="puntKeuzeId"
        :value="geselecteerdPunt"
        data-testid="plan-puntkeuze"
        class="h-8 w-32 min-w-0 rounded border border-default bg-default px-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :disabled="modus !== 'normaal' || items.length === 0"
        @change="kiesPlanPunt"
      >
        <option value="">{{ $t('editor.situatie.canvas.kiesPuntLeeg') }}</option>
        <option v-for="item in items" :key="item.nodeId" :value="item.nodeId">{{ keuzeLabels.get(item.nodeId) ?? item.label }}</option>
      </select>
    <div
      v-if="achtergrond && !planOntbreekt && !alleenLezen"
      role="toolbar"
      data-testid="plan-werkbalk"
      :aria-label="$t('editor.situatie.canvas.werkbalk')"
      class="flex shrink-0 items-center gap-1"
    >
      <UTooltip :text="$t('editor.situatie.canvas.draaiLinks')">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!heeftSelectie || modus !== 'normaal'"
          icon="i-lucide-rotate-ccw"
          label="90°"
          :aria-label="$t('editor.situatie.canvas.draaiLinks')"
          @click="voerUit(() => situatie.draaiSelectie(-1, 90))"
        />
      </UTooltip>
      <UTooltip :text="$t('editor.situatie.canvas.draaiRechts')">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!heeftSelectie || modus !== 'normaal'"
          icon="i-lucide-rotate-cw"
          label="90°"
          :aria-label="$t('editor.situatie.canvas.draaiRechts')"
          @click="voerUit(() => situatie.draaiSelectie(1, 90))"
        />
      </UTooltip>
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        :disabled="!heeftSelectie || modus !== 'normaal'"
        icon="i-lucide-map-pin-off"
        data-testid="van-plan-halen"
        :aria-label="$t('editor.situatie.canvas.vanPlanHalen')"
        :title="$t('editor.situatie.canvas.vanPlanHalen')"
        @click="voerUit(() => situatie.haalSelectieVanPlan())"
      />
    </div>

      <UButton
        v-if="!alleenLezen && !pagina?.tekening"
        data-testid="plan-opschonen"
        color="neutral"
        :variant="opschonen ? 'soft' : 'ghost'"
        size="sm"
        icon="i-lucide-eraser"
        :label="$t('editor.situatie.canvas.opschonen')"
        :aria-pressed="opschonen"
        :disabled="props.teplaatsen !== null || props.meetSchaal"
        @click="wisselOpschonen"
      />
      <div v-if="modus === 'afdek'" data-testid="plan-afdekbediening" class="w-full space-y-2 pb-1 text-sm">
        <p role="status">{{ $t(afdekStart ? 'editor.situatie.canvas.afdekTweedeHoek' : 'editor.situatie.canvas.afdekHulp') }}</p>
        <div class="flex flex-wrap items-center gap-2">
          <label v-if="afdekkingen.length" class="flex min-w-0 items-center gap-2">
            {{ $t('editor.situatie.canvas.afdekking') }}
            <select v-model="gekozenAfdekking" data-testid="plan-afdekkeuze" class="h-8 max-w-40 rounded border border-default bg-default px-2" @change="afdekStart = null">
              <option value="">{{ $t('editor.situatie.canvas.afdekNieuw') }}</option>
              <option v-for="(vlak, index) in afdekkingen" :key="vlak.id" :value="vlak.id">{{ $t('editor.situatie.canvas.afdekNummer', { nummer: index + 1 }) }}</option>
            </select>
          </label>
          <UButton v-if="afdekkingen.length" data-testid="plan-afdekverwijder" color="neutral" variant="outline" size="sm" icon="i-lucide-trash-2" :disabled="!afdekkingen.some(a => a.id === gekozenAfdekking)" :label="$t('editor.situatie.canvas.afdekVerwijder')" @click="verwijderGekozenAfdekking" />
          <UButton v-if="afdekStart" color="neutral" variant="ghost" size="sm" :label="$t('editor.situatie.canvas.afdekAnnuleer')" @click="afdekStart = null" />
          <UButton color="neutral" variant="outline" size="sm" :label="$t('editor.situatie.canvas.afdekKlaar')" @click="wisselOpschonen" />
        </div>
        <details>
          <summary class="cursor-pointer text-muted">{{ $t('editor.situatie.canvas.afdekInvoeren') }}</summary>
          <form class="mt-2 flex flex-wrap items-end gap-2" @submit.prevent="bewaarAfdekking(afdekFormulier)">
            <label v-for="veld in (['x', 'y', 'breedte', 'hoogte'] as const)" :key="veld" class="flex flex-col gap-1">
              {{ $t(`editor.situatie.canvas.${cmPerPx ? 'afdekVeldCm' : 'afdekVeld'}.${veld}`) }}
              <input :value="afdekWaarde(veld)" type="number" required step="any" :min="veld === 'x' || veld === 'y' ? 0 : (cmPerPx ? afrond(cmPerPx) : 1)" :max="afdekGrens(veld)" class="h-9 w-24 rounded border border-default bg-default px-2" @input="zetAfdekWaarde(veld, $event)" />
            </label>
            <UButton type="submit" size="sm" :label="$t('editor.situatie.canvas.afdekToevoegen')" />
          </form>
        </details>
      </div>
      <p :id="hulpId" data-testid="plan-keyboard-help" class="sr-only">{{ bedieningsHulp }}</p>
      <div v-if="modus === 'meet'" class="absolute bottom-14 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded border border-default bg-default px-2 py-1">
        <output aria-live="polite" class="text-xs tabular-nums">{{ $t('editor.situatie.canvas.cursorPositie', { x: Math.round(cursor.x), y: Math.round(cursor.y) }) }}</output>
        <UButton :disabled="alleenLezen" :label="$t('editor.situatie.canvas.bevestigMeetpunt')" @click="bevestigCursor" />
      </div>
    </div>
    <div
      ref="venster"
      data-testid="plan-canvas"
      tabindex="0"
      role="group"
      :aria-label="$t('editor.situatie.canvas.tekenvlak')"
      :aria-describedby="hulpId"
      class="relative min-h-0 min-w-0 flex-1 touch-none select-none overflow-hidden bg-neutral-100 text-neutral-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
      :class="
        sleept || verschuift ? 'cursor-grabbing' : ruimteIngedrukt ? 'cursor-grab' : modus === 'meet' ? 'cursor-crosshair' : ''
      "
      @wheel.prevent="zoomOpWiel"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="pointerAfgebroken"
      @lostpointercapture.self="pointerAfgebroken"
      @click="klik"
      @dragover="slepenBoven"
      @drop="neerzetten"
      @keydown="cursorToets"
    >
      <svg v-if="achtergrond" class="absolute inset-0 size-full" :viewBox="viewBox">
        <image
          v-if="planUrl"
          data-testid="plan-afbeelding"
          :href="planUrl"
          x="0"
          y="0"
          :width="achtergrond.breedte_px"
          :height="achtergrond.hoogte_px"
          preserveAspectRatio="none"
          @error="planFout = true"
        />
        <!-- Witte vlakken bedekken alleen het bronraster, nooit de modelpunten. -->
        <g class="pointer-events-none" data-testid="plan-afdekkingen" v-html="afdekkingenSvg" />
        <!-- v-html is hier veilig: `situatieLaagSvg` escapet alle documenttekst. -->
        <g class="laag" :class="{ verschuifbaar: modus === 'normaal' && !alleenLezen }" v-html="laagSvg" />
        <g v-if="modus === 'afdek'">
          <rect v-for="vlak in afdekkingen" :key="vlak.id" :data-afdekking-id="vlak.id"
            :x="vlak.x" :y="vlak.y" :width="vlak.breedte" :height="vlak.hoogte"
            fill="transparent" vector-effect="non-scaling-stroke" :stroke-width="gekozenAfdekking === vlak.id ? 3 : 1"
            stroke-dasharray="4 3" style="stroke: var(--ui-primary)" />
          <circle v-if="afdekStart" :cx="afdekStart.x" :cy="afdekStart.y" :r="symbool / 10" class="pointer-events-none" style="fill: var(--ui-primary)" />
        </g>
        <g class="pointer-events-none">
          <g v-if="modus === 'meet'" data-testid="plan-toetscursor" :transform="`translate(${cursor.x},${cursor.y})`" fill="none" style="stroke: var(--ui-primary)" stroke-width="2">
            <circle :r="symbool / 2" vector-effect="non-scaling-stroke" />
            <path :d="`M${-symbool},0 H${symbool} M0,${-symbool} V${symbool}`" vector-effect="non-scaling-stroke" />
          </g>
          <rect
            v-for="k in selectieKaders"
            :key="`selectie-${k.id}`"
            :data-testid="`plan-selectie-${k.id}`"
            :x="k.x"
            :y="k.y"
            :width="k.zijde"
            :height="k.zijde"
            fill="none"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
            style="stroke: var(--ui-primary)"
          />
          <MarkeringSymbool
            v-for="m in markeringen"
            :key="`markering-${m.id}`"
            :data-testid="`plan-markering-${m.id}`"
            :data-ernst="m.soort"
            :soort="m.soort"
            :x="m.x"
            :y="m.y"
            :r="symbool * MARKERING_STRAAL"
          />
          <line
            v-if="meetpunten.length === 2"
            data-testid="plan-meetlijn"
            :x1="meetpunten[0]!.x"
            :y1="meetpunten[0]!.y"
            :x2="meetpunten[1]!.x"
            :y2="meetpunten[1]!.y"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
            style="stroke: var(--ui-primary)"
          />
          <circle
            v-for="(p, i) in meetpunten"
            :key="`meetpunt-${i}`"
            :cx="p.x"
            :cy="p.y"
            :r="symbool * MEETPUNT_STRAAL"
            style="fill: var(--ui-primary)"
          />
        </g>
      </svg>
      <CanvasBediening :percentage="canvas.zoomPercentage.value" :kan-focus="selectieKaders.length > 0" @zoom="canvas.zoom" @passend="maakPassend" @focus="focusSelectie" />
    </div>


    <div
      v-if="planOntbreekt"
      data-testid="plan-niet-gevonden"
      class="absolute inset-0 flex items-center justify-center bg-default/70"
    >
      <div class="flex flex-col items-center gap-3 rounded-lg border border-default bg-default p-6 shadow-sm">
        <p class="font-medium">{{ $t("editor.situatie.canvas.planNietGevonden") }}</p>
        <UButton
          icon="i-lucide-image-up"
          :label="$t('editor.situatie.canvas.planOpnieuwKiezen')"
          :disabled="alleenLezen"
          @click="pagina && emit('vervangPlan', pagina.id)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ook de holle binnenkant van een symbool (fill: none) is klikbaar. */
.laag :deep([data-node-id] *) {
  pointer-events: all;
}
.laag.verschuifbaar :deep([data-node-id]) {
  cursor: move;
}
</style>
