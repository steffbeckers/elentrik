<script setup lang="ts">
import CanvasBediening from "~/components/editor/CanvasBediening.vue";
import type { NodeId } from "@elentrik/model";
import { situatieItems, situatieLaagSvg } from "@elentrik/render";
import { doelSoort, moetNegeren, WIDGET_SELECTOR } from "~/composables/sneltoetsen";
import { useBestandenApi } from "~/composables/useBestandenApi";
import { SLEEP_DREMPEL_PX, useCanvasWeergave } from "~/composables/useCanvasWeergave";
import { useDocumentFoutMelding } from "~/composables/useDocumentFoutMelding";
import { useNodeTekst } from "~/composables/useNodeTekst";
import { markeringen as leidMarkeringenAf, MARKERING_KLASSE } from "~/editor/markeringen";
import { schemaKeuzes } from "~/editor/schema-navigatie";
import { maxPlanZoom, schermNaarInhoud } from "~/editor/weergave";
import { planCursorToets } from "~/situatie/bediening";
import { schuif, symboolGrootte } from "~/situatie/geometrie";
import { NODE_SLEEP_TYPE } from "~/situatie/slepen";
import { situatieSneltoets } from "~/situatie/sneltoetsen";
import { useEditorStore } from "~/stores/editor";
import { useSituatieStore } from "~/stores/situatie";

const { t } = useI18n();
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
const bestanden = useBestandenApi();
const voerUit = useDocumentFoutMelding();
const { terugval } = useNodeTekst();

const venster = useTemplateRef<HTMLElement>("venster");
const hulpId = useId();
const puntKeuzeId = useId();

const modus = computed<"normaal" | "plaats" | "meet">(() =>
  props.meetSchaal ? "meet" : props.teplaatsen !== null ? "plaats" : "normaal",
);

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
  const opSymbool = !ruimteIngedrukt.value && modus.value === "normaal" && event.isPrimary && !editor.alleenLezen;
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
  if (editor.alleenLezen || !achtergrond.value || !doc || !Object.hasOwn(doc.nodes, nodeId)) return;
  const { x, y } = binnenRaster(punt);
  const uitkomst: { van: string | null } = { van: null };
  if (!voerUit(() => (uitkomst.van = situatie.plaatsNode(nodeId, x, y)))) return;
  editor.selectie = [nodeId];
  emit("geplaatst", nodeId, uitkomst.van);
}

// Een focusbare planruimte en puntkeuze bieden dezelfde bediening zonder aanwijzer.
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
  if (editor.alleenLezen || planOntbreekt.value) return;
  if (modus.value === "meet") meetKlik(cursor.value);
  else if (props.teplaatsen) plaatsOp(props.teplaatsen, cursor.value);
}

function cursorToets(event: KeyboardEvent): void {
  if (modus.value === "normaal" || planOntbreekt.value || event.isComposing || event.altKey) return;
  const actie = planCursorToets({ key: event.key, shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey, metaKey: event.metaKey, alleenLezen: editor.alleenLezen });
  if (!actie) return;
  event.preventDefault();
  if (actie.soort === "schuif") cursor.value = binnenRaster({ x: cursor.value.x + actie.dx, y: cursor.value.y + actie.dy });
  else if (actie.soort === "bevestig") bevestigCursor();
  else annuleer();
}

function slepenBoven(event: DragEvent): void {
  if (editor.alleenLezen || !achtergrond.value || !event.dataTransfer?.types.includes(NODE_SLEEP_TYPE)) return;
  event.preventDefault();
}

function neerzetten(event: DragEvent): void {
  if (editor.alleenLezen) return;
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
    alleenLezen: editor.alleenLezen,
  });
  if (!actie) return;
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
      v-if="achtergrond && !planOntbreekt && !editor.alleenLezen"
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
          :aria-label="$t('editor.situatie.canvas.draaiLinks')"
          @click="voerUit(() => situatie.draaiSelectie(-1))"
        />
      </UTooltip>
      <UTooltip :text="$t('editor.situatie.canvas.draaiRechts')">
        <UButton
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="!heeftSelectie || modus !== 'normaal'"
          icon="i-lucide-rotate-cw"
          :aria-label="$t('editor.situatie.canvas.draaiRechts')"
          @click="voerUit(() => situatie.draaiSelectie(1))"
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

      <p :id="hulpId" data-testid="plan-keyboard-help" class="sr-only">{{ $t(modus === 'normaal' ? 'editor.situatie.canvas.toetsenbord' : 'editor.situatie.canvas.plaatsToetsenbord') }}</p>
      <div v-if="modus !== 'normaal'" class="absolute bottom-14 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded border border-default bg-default px-2 py-1">
        <output aria-live="polite" class="text-xs tabular-nums">{{ $t('editor.situatie.canvas.cursorPositie', { x: Math.round(cursor.x), y: Math.round(cursor.y) }) }}</output>
        <UButton :disabled="editor.alleenLezen" :label="$t(modus === 'meet' ? 'editor.situatie.canvas.bevestigMeetpunt' : 'editor.situatie.canvas.bevestigPlaats')" @click="bevestigCursor" />
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
        sleept || verschuift ? 'cursor-grabbing' : ruimteIngedrukt ? 'cursor-grab' : modus !== 'normaal' ? 'cursor-crosshair' : ''
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
        <!-- v-html is hier veilig: `situatieLaagSvg` escapet alle documenttekst. -->
        <g class="laag" :class="{ verschuifbaar: modus === 'normaal' && !editor.alleenLezen }" v-html="laagSvg" />
        <g class="pointer-events-none">
          <g v-if="modus !== 'normaal'" data-testid="plan-toetscursor" :transform="`translate(${cursor.x},${cursor.y})`" fill="none" style="stroke: var(--ui-primary)" stroke-width="2">
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
          <circle
            v-for="m in markeringen"
            :key="`markering-${m.id}`"
            :data-testid="`plan-markering-${m.id}`"
            :data-ernst="m.soort"
            :cx="m.x"
            :cy="m.y"
            :r="symbool * MARKERING_STRAAL"
            :class="MARKERING_KLASSE[m.soort]"
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
      <CanvasBediening :percentage="canvas.zoomPercentage.value" :kan-focus="selectieKaders.length > 0" :hulp="$t(modus === 'normaal' ? 'editor.situatie.canvas.toetsenbord' : 'editor.situatie.canvas.plaatsToetsenbord')" @zoom="canvas.zoom" @passend="maakPassend" @focus="focusSelectie" />
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
          :disabled="editor.alleenLezen"
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
