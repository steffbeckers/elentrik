<script setup lang="ts">
import type { NodeId } from "@elentrik/model";
import { situatieLaagSvg } from "@elentrik/render";
import { doelSoort, moetNegeren, spatieSchuift, WIDGET_SELECTOR } from "~/composables/sneltoetsen";
import { useBestandenApi } from "~/composables/useBestandenApi";
import { useDocumentFoutMelding } from "~/composables/useDocumentFoutMelding";
import { markeringen as leidMarkeringenAf, type MarkeringSoort } from "~/editor/markeringen";
import {
  begrens as begrensWeergave,
  MAX_ZOOM,
  MIN_ZOOM,
  pan,
  passendeWeergave as berekenPassend,
  schermNaarInhoud,
  wielFactor,
  zoomRond,
  type Weergave,
} from "~/editor/weergave";
import { schuif, symboolGrootte } from "~/situatie/geometrie";
import { situatieItems } from "~/situatie/items";
import { situatieSneltoets } from "~/situatie/sneltoetsen";
import { useEditorStore } from "~/stores/editor";
import { useSituatieStore } from "~/stores/situatie";

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

/** Het dataTransfer-type van een punt dat uit "Te plaatsen" gesleept wordt; de waarde is de nodeId. */
const NODE_TYPE = "application/x-elentrik-node";
/** Ruimte rond het plan bij "Passend maken", als fractie van de lange zijde van het raster. */
const MARGE_FRACTIE = 0.02;
const ZOOM_GRENZEN = { min: MIN_ZOOM, max: MAX_ZOOM };
/** Aantal pixels dat de muis moet bewegen voordat een klik een sleepbeweging wordt. */
const SLEEP_DREMPEL_PX = 3;
/** Selectiekader en markering, als fractie van de symboolgrootte. */
const KADER_HALF = 0.75;
const MARKERING_STRAAL = 0.15;
const MEETPUNT_STRAAL = 0.12;
/** Ruimte (px) die de selectiewerkbalk binnen het venster houdt. */
const WERKBALK_HOOGTE_PX = 40;
const WERKBALK_HALVE_BREEDTE_PX = 60;

const editor = useEditorStore();
const situatie = useSituatieStore();
const bestanden = useBestandenApi();
const voerUit = useDocumentFoutMelding();

const venster = useTemplateRef<HTMLElement>("venster");

const grootte = reactive({ breedte: 0, hoogte: 0 });
const weergave = ref<Weergave>({ x: 0, y: 0, b: 1, h: 1 });
const viewBox = computed(() => {
  const { x, y, b, h } = weergave.value;
  return `${x} ${y} ${b} ${h}`;
});
let heeftPassendeWeergave = false;

const ruimteIngedrukt = ref(false);
const sleept = ref(false);

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
const symbool = computed(() => (achtergrond.value ? symboolGrootte(achtergrond.value) : 0));
const planUrl = computed(() => (achtergrond.value ? bestanden.url(achtergrond.value.rasterBestandId) : null));

/** Het rasterbestand kon niet geladen worden (weg of onbekend id). */
const planFout = ref(false);
watch(
  () => achtergrond.value?.rasterBestandId,
  () => {
    planFout.value = false;
  },
);

const items = computed(() => {
  const doc = editor.document;
  const analyse = editor.analyse;
  const p = pagina.value;
  return doc && analyse && p ? situatieItems(doc, analyse, p.id) : [];
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

// --- Zoom en pan -----------------------------------------------------------

/** De weergave waarop het hele plan (plus marge) in het venster past, gecentreerd. */
function passendeWeergave(): Weergave | null {
  const i = inhoud.value;
  if (!i) return null;
  return berekenPassend(i, grootte, Math.max(i.breedte, i.hoogte) * MARGE_FRACTIE);
}

function maakPassend(): void {
  const passend = passendeWeergave();
  if (!passend) return;
  weergave.value = passend;
  heeftPassendeWeergave = true;
}

/** Houdt het midden van de weergave binnen het plan, zodat dat niet uit beeld kan raken. */
function begrens(w: Weergave): Weergave {
  const i = inhoud.value;
  return i ? begrensWeergave(w, i) : w;
}

function zoomOpWiel(event: WheelEvent): void {
  const passend = passendeWeergave();
  const vensterEl = venster.value;
  if (!passend || !vensterEl) return;
  const rect = vensterEl.getBoundingClientRect();
  const anker = {
    fx: (event.clientX - rect.left) / rect.width,
    fy: (event.clientY - rect.top) / rect.height,
  };
  const factor = wielFactor(event.deltaY, event.deltaMode, window.innerHeight);
  weergave.value = begrens(zoomRond(weergave.value, passend, anker, factor, grootte, ZOOM_GRENZEN));
}

// --- Slepen: pannen of een symbool verschuiven -----------------------------

type Positie = { x: number; y: number };
type Begin = { startX: number; startY: number; pointerId: number; actief: boolean };
type Sleep =
  | (Begin & { soort: "pan"; begin: Weergave })
  | (Begin & { soort: "symbool"; nodeId: NodeId; element: SVGGElement; verschil: Positie });

let sleep: Sleep | null = null;
let onderdrukKlik = false;

/** De lokale positie van het symbool dat verschoven wordt; geen documentoperatie tijdens het slepen. */
const voorbeeld = ref<(Positie & { nodeId: NodeId }) | null>(null);

const posities = computed(() => new Map(items.value.map((i) => [i.nodeId, { x: i.x, y: i.y }])));

function positieVan(nodeId: NodeId): Positie | undefined {
  const v = voorbeeld.value;
  return v && v.nodeId === nodeId ? v : posities.value.get(nodeId);
}

function pointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !venster.value) return;
  const element = (event.target as Element).closest<SVGGElement>("[data-node-id]");
  const nodeId = element?.getAttribute("data-node-id") ?? null;
  const begin = { startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, actief: false };
  if (element && nodeId !== null && !ruimteIngedrukt.value && modus.value === "normaal") {
    const positie = posities.value.get(nodeId);
    if (!positie) return;
    const onderMuis = planPunt(event);
    sleep = {
      ...begin,
      soort: "symbool",
      nodeId,
      element,
      verschil: { x: positie.x - onderMuis.x, y: positie.y - onderMuis.y },
    };
    return;
  }
  // Pannen: op lege ruimte, met de spatie ingedrukt, of tijdens plaatsen en meten.
  sleep = { ...begin, soort: "pan", begin: weergave.value };
}

function pointerMove(event: PointerEvent): void {
  const s = sleep;
  const vensterEl = venster.value;
  if (!s || !vensterEl || event.pointerId !== s.pointerId) return;
  const dx = event.clientX - s.startX;
  const dy = event.clientY - s.startY;
  if (!s.actief) {
    if (Math.hypot(dx, dy) < SLEEP_DREMPEL_PX) return;
    s.actief = true;
    sleept.value = true;
    // Pas bij het slepen vastleggen: anders zou een gewone klik op het venster zelf landen.
    vensterEl.setPointerCapture(event.pointerId);
  }
  if (s.soort === "pan") {
    const rect = vensterEl.getBoundingClientRect();
    weergave.value = begrens(pan(s.begin, dx, dy, { breedte: rect.width, hoogte: rect.height }));
    return;
  }
  const onderMuis = planPunt(event);
  const p = binnenRaster({ x: onderMuis.x + s.verschil.x, y: onderMuis.y + s.verschil.y });
  voorbeeld.value = { nodeId: s.nodeId, ...p };
  // Een CSS-transform overschrijft het transform-attribuut zolang het slepen duurt.
  s.element.style.transform = `translate(${p.x}px, ${p.y}px)`;
}

/** Stopt het slepen; geeft de beëindigde sleep terug. */
function stopSlepen(pointerId: number): Sleep | null {
  const s = sleep;
  if (!s || pointerId !== s.pointerId) return null;
  sleep = null;
  sleept.value = false;
  if (venster.value?.hasPointerCapture(pointerId)) venster.value.releasePointerCapture(pointerId);
  if (s.soort === "symbool") s.element.style.removeProperty("transform");
  return s;
}

function pointerUp(event: PointerEvent): void {
  const s = stopSlepen(event.pointerId);
  if (!s) return;
  const v = voorbeeld.value;
  voorbeeld.value = null;
  // Eén `plaats` bij het loslaten: één undo-stap.
  if (s.soort === "symbool" && s.actief && v) plaatsOp(s.nodeId, v);
  if (s.actief || ruimteIngedrukt.value) {
    // De klik die op deze pointerup volgt, is geen selectie.
    onderdrukKlik = true;
    setTimeout(() => (onderdrukKlik = false), 0);
  }
}

/** Een afgebroken pointer verschuift niets. */
function pointerCancel(event: PointerEvent): void {
  if (stopSlepen(event.pointerId)) voorbeeld.value = null;
}

// --- Plaatsen --------------------------------------------------------------

function plaatsOp(nodeId: NodeId, punt: Positie): void {
  const doc = editor.document;
  if (!achtergrond.value || !doc || !Object.hasOwn(doc.nodes, nodeId)) return;
  const { x, y } = binnenRaster(punt);
  const uitkomst: { van: string | null } = { van: null };
  if (!voerUit(() => (uitkomst.van = situatie.plaatsNode(nodeId, x, y)))) return;
  editor.selectie = [nodeId];
  emit("geplaatst", nodeId, uitkomst.van);
}

function slepenBoven(event: DragEvent): void {
  if (!achtergrond.value || !event.dataTransfer?.types.includes(NODE_TYPE)) return;
  event.preventDefault();
}

function neerzetten(event: DragEvent): void {
  const nodeId = event.dataTransfer?.getData(NODE_TYPE);
  if (!nodeId) return;
  event.preventDefault();
  plaatsOp(nodeId, planPunt(event));
}

// --- Schaal meten ----------------------------------------------------------

const meetpunten = ref<Positie[]>([]);

watch(
  () => [props.meetSchaal, pagina.value?.id],
  () => {
    meetpunten.value = [];
  },
);

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
  if (onderdrukKlik || !achtergrond.value) return;
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

/** Escape: eerst een lopende sleep, dan plaatsen of meten, anders de selectie. */
function annuleer(): void {
  const s = sleep;
  if (s?.soort === "symbool") {
    stopSlepen(s.pointerId);
    voorbeeld.value = null;
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
  if (spatieSchuift(event.key, soort)) {
    ruimteIngedrukt.value = true;
    event.preventDefault();
    return;
  }
  const actie = situatieSneltoets({
    key: event.key,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    doelIsInvoer: soort === "invoer",
    doelIsKnop: soort === "knop",
  });
  if (!actie) return;
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

function toetsLosgelaten(event: KeyboardEvent): void {
  if (event.key === " ") ruimteIngedrukt.value = false;
}

/** Een keyup buiten het venster komt niet aan: laat de spatie los als het venster de focus verliest. */
function spatieLoslaten(): void {
  ruimteIngedrukt.value = false;
}

// --- Overlay ---------------------------------------------------------------

const selectieKaders = computed(() => {
  const half = symbool.value * KADER_HALF;
  return editor.selectie.flatMap((id) => {
    const p = positieVan(id);
    return p ? [{ id, x: p.x - half, y: p.y - half, zijde: 2 * half }] : [];
  });
});

/** Eén markering per geplaatste node, rechtsboven het symbool; de ernst-aggregatie zit in `editor/markeringen.ts`. */
const markeringen = computed(() => {
  const half = symbool.value / 2;
  return [...leidMarkeringenAf(editor.bevindingen)].flatMap(([id, soort]) => {
    const p = positieVan(id);
    return p ? [{ id, soort, x: p.x + half, y: p.y - half }] : [];
  });
});

const MARKERING_KLASSE: Record<MarkeringSoort, string> = {
  fout: "fill-red-600",
  waarschuwing: "fill-amber-500",
  info: "fill-blue-600",
  afgeweken: "fill-neutral-400",
};

/** De werkbalk boven het eerste geselecteerde symbool op deze pagina, binnen het venster gehouden. */
const werkbalk = computed(() => {
  const w = weergave.value;
  const p = editor.selectie.map(positieVan).find((q) => q !== undefined);
  if (!p || grootte.breedte === 0) return null;
  const links = ((p.x - w.x) / w.b) * grootte.breedte;
  const boven = ((p.y - symbool.value * KADER_HALF - w.y) / w.h) * grootte.hoogte;
  const begrensd = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));
  return {
    left: `${begrensd(links, WERKBALK_HALVE_BREEDTE_PX, grootte.breedte - WERKBALK_HALVE_BREEDTE_PX)}px`,
    top: `${begrensd(boven, WERKBALK_HOOGTE_PX, grootte.hoogte)}px`,
  };
});

/** Een pagina zonder plan, of met een plan dat niet laadt. */
const planOntbreekt = computed(() => pagina.value !== undefined && (!achtergrond.value || planFout.value));

// --- Levenscyclus ----------------------------------------------------------

let observer: ResizeObserver | undefined;

function metingBijgewerkt(breedte: number, hoogte: number): void {
  if (breedte === 0 || hoogte === 0) return;
  const vorige = { ...grootte };
  grootte.breedte = breedte;
  grootte.hoogte = hoogte;
  if (!heeftPassendeWeergave) {
    maakPassend();
  } else if (vorige.breedte > 0) {
    // Zelfde schaal, ander venster: de breedte blijft, de hoogte volgt de beeldverhouding.
    const w = weergave.value;
    weergave.value = { ...w, h: w.b * (hoogte / breedte) };
  }
}

onMounted(() => {
  const el = venster.value;
  if (el) {
    metingBijgewerkt(el.clientWidth, el.clientHeight);
    observer = new ResizeObserver(() => metingBijgewerkt(el.clientWidth, el.clientHeight));
    observer.observe(el);
  }
  window.addEventListener("keydown", toetsIngedrukt);
  window.addEventListener("keyup", toetsLosgelaten);
  window.addEventListener("blur", spatieLoslaten);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener("keydown", toetsIngedrukt);
  window.removeEventListener("keyup", toetsLosgelaten);
  window.removeEventListener("blur", spatieLoslaten);
});

// Een andere pagina of een ander plan: opnieuw passend maken.
watch(
  () => {
    const i = inhoud.value;
    return `${pagina.value?.id ?? ""}|${achtergrond.value?.rasterBestandId ?? ""}|${i?.breedte}x${i?.hoogte}`;
  },
  () => {
    heeftPassendeWeergave = false;
    maakPassend();
  },
);
</script>

<template>
  <div class="relative size-full min-h-0">
    <div
      ref="venster"
      data-testid="plan-canvas"
      class="relative size-full touch-none select-none overflow-hidden bg-neutral-100 text-neutral-900"
      :class="
        sleept ? 'cursor-grabbing' : ruimteIngedrukt ? 'cursor-grab' : modus !== 'normaal' ? 'cursor-crosshair' : ''
      "
      @wheel.prevent="zoomOpWiel"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="pointerCancel"
      @click="klik"
      @dragover="slepenBoven"
      @drop="neerzetten"
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
        <g class="laag" :class="{ verschuifbaar: modus === 'normaal' }" v-html="laagSvg" />
        <g class="pointer-events-none">
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
    </div>

    <div v-if="achtergrond" class="absolute right-3 top-3">
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-scan"
        :label="$t('editor.canvas.passendMaken')"
        class="bg-white text-neutral-900 hover:bg-neutral-100"
        @click="maakPassend"
      />
    </div>

    <div
      v-if="werkbalk && !planOntbreekt"
      role="toolbar"
      data-testid="plan-werkbalk"
      :aria-label="$t('editor.situatie.canvas.werkbalk')"
      class="absolute flex -translate-x-1/2 -translate-y-full gap-1 rounded-md border border-default bg-white p-1 text-neutral-900 shadow-sm"
      :style="werkbalk"
    >
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="text-neutral-900 hover:bg-neutral-100"
        icon="i-lucide-rotate-ccw"
        :aria-label="$t('editor.situatie.canvas.draaiLinks')"
        @click="voerUit(() => situatie.draaiSelectie(-1))"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="text-neutral-900 hover:bg-neutral-100"
        icon="i-lucide-rotate-cw"
        :aria-label="$t('editor.situatie.canvas.draaiRechts')"
        @click="voerUit(() => situatie.draaiSelectie(1))"
      />
      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        class="text-neutral-900 hover:bg-neutral-100"
        icon="i-lucide-map-pin-off"
        data-testid="van-plan-halen"
        :label="$t('editor.situatie.canvas.vanPlanHalen')"
        @click="voerUit(() => situatie.haalSelectieVanPlan())"
      />
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
