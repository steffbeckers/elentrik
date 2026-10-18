<script setup lang="ts">
import type { Ernst } from "@elentrik/arei";
import { DocumentFout, magToevoegen, type NodeId } from "@elentrik/model";
import { sneltoets } from "~/composables/sneltoetsen";
import { useEditorStore } from "~/stores/editor";

type Weergave = { x: number; y: number; b: number; h: number };

/** Ruimte (mm) rond de strook bij "Passend maken". */
const MARGE_MM = 5;
/** Zoom is begrensd tot 25 % – 400 % van de passende weergave. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
/** Aantal pixels dat de muis moet bewegen voordat een klik een sleepbeweging wordt. */
const SLEEP_DREMPEL_PX = 3;
const SELECTIE_MARGE_MM = 1;
const MARKERING_STRAAL_MM = 1.5;
const PLUS_STRAAL_MM = 2.5;

const store = useEditorStore();
const { t } = useI18n();
const toast = useToast();

const venster = useTemplateRef<HTMLElement>("venster");
const basis = useTemplateRef<HTMLElement>("basis");

const grootte = reactive({ breedte: 0, hoogte: 0 });
const weergave = ref<Weergave>({ x: 0, y: 0, b: 1, h: 1 });
const viewBox = computed(() => {
  const { x, y, b, h } = weergave.value;
  return `${x} ${y} ${b} ${h}`;
});
let heeftPassendeWeergave = false;

const ruimteIngedrukt = ref(false);
const sleept = ref(false);

// --- Zoom en pan -----------------------------------------------------------

/** De weergave waarop de hele strook (plus marge) in het venster past, gecentreerd. */
function passendeWeergave(): Weergave | null {
  const strook = store.opmaak?.strook;
  if (!strook || grootte.breedte === 0 || grootte.hoogte === 0) return null;
  const breedte = strook.breedte + 2 * MARGE_MM;
  const hoogte = strook.hoogte + 2 * MARGE_MM;
  const schaal = Math.min(grootte.breedte / breedte, grootte.hoogte / hoogte);
  const b = grootte.breedte / schaal;
  const h = grootte.hoogte / schaal;
  return { x: (strook.breedte - b) / 2, y: (strook.hoogte - h) / 2, b, h };
}

function maakPassend(): void {
  const passend = passendeWeergave();
  if (!passend) return;
  weergave.value = passend;
  heeftPassendeWeergave = true;
}

/** Houdt het midden van de weergave binnen de strook, zodat die niet uit beeld kan raken. */
function begrens(w: Weergave): Weergave {
  const strook = store.opmaak?.strook;
  if (!strook) return w;
  const midX = Math.min(Math.max(w.x + w.b / 2, 0), strook.breedte);
  const midY = Math.min(Math.max(w.y + w.h / 2, 0), strook.hoogte);
  return { ...w, x: midX - w.b / 2, y: midY - w.h / 2 };
}

function zoomOpWiel(event: WheelEvent): void {
  const passend = passendeWeergave();
  const vensterEl = venster.value;
  if (!passend || !vensterEl) return;
  const rect = vensterEl.getBoundingClientRect();
  const fx = (event.clientX - rect.left) / rect.width;
  const fy = (event.clientY - rect.top) / rect.height;
  const huidig = weergave.value;
  // Wiel naar boven (negatieve deltaY) zoomt in.
  const factor = Math.exp(-event.deltaY * 0.0015);
  const zoom = Math.min(Math.max((passend.b / huidig.b) * factor, MIN_ZOOM), MAX_ZOOM);
  const b = passend.b / zoom;
  const h = b * (grootte.hoogte / grootte.breedte);
  // Het punt onder de cursor blijft op dezelfde plaats.
  const ankerX = huidig.x + fx * huidig.b;
  const ankerY = huidig.y + fy * huidig.h;
  weergave.value = begrens({ x: ankerX - fx * b, y: ankerY - fy * h, b, h });
}

type Sleep = { startX: number; startY: number; begin: Weergave; pointerId: number; actief: boolean };
let sleep: Sleep | null = null;
let onderdrukKlik = false;

function pointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const doel = event.target as Element;
  // Pannen: op lege ruimte, of overal met de spatie ingedrukt.
  if (!ruimteIngedrukt.value && doel.closest("[data-node-id], [data-plus]")) return;
  sleep = {
    startX: event.clientX,
    startY: event.clientY,
    begin: weergave.value,
    pointerId: event.pointerId,
    actief: false,
  };
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
  const rect = vensterEl.getBoundingClientRect();
  weergave.value = begrens({
    ...s.begin,
    x: s.begin.x - (dx / rect.width) * s.begin.b,
    y: s.begin.y - (dy / rect.height) * s.begin.h,
  });
}

function pointerUp(event: PointerEvent): void {
  const s = sleep;
  if (!s || event.pointerId !== s.pointerId) return;
  sleep = null;
  sleept.value = false;
  if (s.actief) {
    venster.value?.releasePointerCapture(event.pointerId);
  }
  if (s.actief || ruimteIngedrukt.value) {
    // De klik die op deze pointerup volgt, is geen selectie.
    onderdrukKlik = true;
    setTimeout(() => (onderdrukKlik = false), 0);
  }
}

// --- Selectie --------------------------------------------------------------

function klikOpBasis(event: MouseEvent): void {
  if (onderdrukKlik) return;
  const symbool = (event.target as Element).closest("[data-node-id]");
  const id = symbool?.getAttribute("data-node-id") ?? null;
  if (id === null) {
    if (!event.shiftKey) store.selectie = [];
    return;
  }
  if (event.shiftKey) {
    store.selectie = store.selectie.includes(id)
      ? store.selectie.filter((k) => k !== id)
      : [...store.selectie, id];
  } else {
    store.selectie = [id];
  }
}

// --- Sneltoetsen -----------------------------------------------------------

/** Invoervelden en knoppen houden hun eigen toetsen (Enter, spatie, letters). */
function isInvoer(doel: EventTarget | null): boolean {
  if (!(doel instanceof HTMLElement)) return false;
  return doel.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(doel.tagName);
}

function toetsIngedrukt(event: KeyboardEvent): void {
  if (!store.document) return;
  const doelIsInvoer = isInvoer(event.target);
  if (event.key === " " && !doelIsInvoer) {
    ruimteIngedrukt.value = true;
    event.preventDefault();
    return;
  }
  const actie = sneltoets({
    key: event.key,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    doelIsInvoer,
  });
  if (!actie) return;
  event.preventDefault();

  switch (actie.soort) {
    case "kies":
      store.onderdeel = actie.onderdeel;
      break;
    case "toevoegen":
      store.voegToeBijSelectie();
      break;
    case "verwijder":
      try {
        store.verwijderSelectie(actie.heleTak);
      } catch (fout) {
        if (!(fout instanceof DocumentFout)) throw fout;
        toast.add({ title: t("editor.canvas.verwijderenMislukt"), color: "error" });
      }
      break;
    case "ongedaan":
      store.ongedaanMaken();
      break;
    case "opnieuw":
      store.opnieuw();
      break;
    case "navigeer":
      store.navigeer(actie.richting);
      break;
    case "wisSelectie":
      store.selectie = [];
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

const vakken = computed(() => store.opmaak?.strook.vakken ?? {});

const selectieKaders = computed(() =>
  store.selectie.flatMap((id) => {
    const vak = vakken.value[id];
    return vak ? [{ id, vak }] : [];
  }),
);

const ERNST_VOLGORDE: Record<Ernst, number> = { fout: 3, waarschuwing: 2, info: 1 };
type MarkeringSoort = Ernst | "afgeweken";

/** Per node de ergste actieve ernst; grijs ("afgeweken") als alle bevindingen voor de node afgeweken zijn. */
const markeringen = computed(() => {
  const perNode = new Map<NodeId, MarkeringSoort>();
  for (const bevinding of store.bevindingen) {
    for (const id of bevinding.nodeIds) {
      const huidig = perNode.get(id);
      if (bevinding.afgeweken) {
        if (huidig === undefined) perNode.set(id, "afgeweken");
        continue;
      }
      if (huidig === undefined || huidig === "afgeweken" || ERNST_VOLGORDE[bevinding.ernst] > ERNST_VOLGORDE[huidig]) {
        perNode.set(id, bevinding.ernst);
      }
    }
  }
  return [...perNode].flatMap(([id, soort]) => {
    const vak = vakken.value[id];
    return vak ? [{ id, soort, x: vak.x + vak.breedte, y: vak.y }] : [];
  });
});

const MARKERING_KLASSE: Record<MarkeringSoort, string> = {
  fout: "fill-red-600",
  waarschuwing: "fill-amber-500",
  info: "fill-blue-600",
  afgeweken: "fill-neutral-400",
};

const plusknoppen = computed(() => {
  const doc = store.document;
  const opmaak = store.opmaak;
  if (!doc || !opmaak) return [];
  return opmaak.strook.aanknopingen.filter((a) =>
    magToevoegen(doc, { soort: a.soort, nodeId: a.nodeId }, store.onderdeel, store.toestelsoort),
  );
});

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

// De strook kan pas na het mounten bestaan (document nog niet geladen): dan alsnog passend maken.
watch(
  () => store.opmaak?.strook,
  () => {
    if (!heeftPassendeWeergave) maakPassend();
  },
);

// `v-html` vervangt de SVG bij elke wijziging; de viewBox van de basislaag volgt die van de overlay.
watchPostEffect(() => {
  void store.svg;
  basis.value?.querySelector("svg")?.setAttribute("viewBox", viewBox.value);
});
</script>

<template>
  <div class="relative size-full min-h-0">
    <div
      ref="venster"
      data-testid="schema-canvas"
      class="relative size-full touch-none select-none overflow-hidden bg-white text-neutral-900"
      :class="sleept ? 'cursor-grabbing' : ruimteIngedrukt ? 'cursor-grab' : ''"
      @wheel.prevent="zoomOpWiel"
      @pointerdown="pointerDown"
      @pointermove="pointerMove"
      @pointerup="pointerUp"
      @pointercancel="pointerUp"
    >
      <!-- Basislaag. v-html is hier veilig: `render` escapet alle documenttekst. Dit is de enige v-html in de app. -->
      <div ref="basis" class="basis absolute inset-0" @click="klikOpBasis" v-html="store.svg" />

      <svg class="pointer-events-none absolute inset-0 size-full" :viewBox="viewBox">
        <rect
          v-for="{ id, vak } in selectieKaders"
          :key="`selectie-${id}`"
          :data-testid="`selectie-${id}`"
          :x="vak.x - SELECTIE_MARGE_MM"
          :y="vak.y - SELECTIE_MARGE_MM"
          :width="vak.breedte + 2 * SELECTIE_MARGE_MM"
          :height="vak.hoogte + 2 * SELECTIE_MARGE_MM"
          rx="1"
          fill="none"
          stroke-width="0.5"
          style="stroke: var(--ui-primary)"
        />
        <circle
          v-for="m in markeringen"
          :key="`markering-${m.id}`"
          :data-testid="`markering-${m.id}`"
          :data-ernst="m.soort"
          :cx="m.x"
          :cy="m.y"
          :r="MARKERING_STRAAL_MM"
          :class="MARKERING_KLASSE[m.soort]"
        />
        <g
          v-for="a in plusknoppen"
          :key="`plus-${a.soort}-${a.nodeId}`"
          data-plus
          :data-testid="`plus-${a.soort}-${a.nodeId}`"
          role="button"
          :aria-label="$t('editor.canvas.voegToe', { onderdeel: $t(`editor.onderdelen.${store.onderdeel}`) })"
          class="pointer-events-auto cursor-pointer"
          :transform="`translate(${a.x} ${a.y})`"
          @click.stop="store.voegToe(a)"
        >
          <circle :r="PLUS_STRAAL_MM" fill="white" stroke-width="0.4" style="stroke: var(--ui-primary)" />
          <path d="M-1.2 0H1.2M0 -1.2V1.2" fill="none" stroke-width="0.5" stroke-linecap="round" style="stroke: var(--ui-primary)" />
        </g>
      </svg>
    </div>

    <div class="absolute right-3 top-3">
      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-scan"
        :label="$t('editor.canvas.passendMaken')"
        class="bg-white"
        @click="maakPassend"
      />
    </div>
  </div>
</template>

<style scoped>
/* De SVG uit `render` heeft vaste afmetingen in mm; hier vult hij het venster. */
.basis :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
/* Ook de holle binnenkant van een symbool (fill: none) is klikbaar. */
.basis :deep([data-node-id] *) {
  pointer-events: all;
}
</style>
