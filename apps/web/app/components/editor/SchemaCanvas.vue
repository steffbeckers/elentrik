<script setup lang="ts">
import { DocumentFout, magToevoegen } from "@elentrik/model";
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import { doelSoort, moetNegeren, sneltoets, WIDGET_SELECTOR } from "~/composables/sneltoetsen";
import { useCanvasWeergave } from "~/composables/useCanvasWeergave";
import { markeringen as leidMarkeringenAf, MARKERING_KLASSE } from "~/editor/markeringen";
import { useEditorStore } from "~/stores/editor";

/** Ruimte (mm) rond de strook bij "Passend maken". */
const MARGE_MM = 5;
const SELECTIE_MARGE_MM = 1;
const MARKERING_STRAAL_MM = 1.5;
const PLUS_STRAAL_MM = 2.5;

const store = useEditorStore();
const { t, te } = useI18n();
const toast = useToast();

const venster = useTemplateRef<HTMLElement>("venster");
const basis = useTemplateRef<HTMLElement>("basis");

// --- Zoom, pan en pinch (gedeeld met het plan) ------------------------------

const canvas = useCanvasWeergave({
  venster,
  inhoud: () => store.opmaak?.strook ?? null,
  marge: () => MARGE_MM,
});
const { viewBox, ruimteIngedrukt, sleept, maakPassend, zoomOpWiel } = canvas;

function pointerDown(event: PointerEvent): void {
  const doel = event.target as Element;
  // Pannen: op lege ruimte, of overal met de spatie ingedrukt.
  canvas.pointerDown(event, ruimteIngedrukt.value || !doel.closest("[data-node-id], [data-plus]"));
}

// --- Selectie --------------------------------------------------------------

function klikOpBasis(event: MouseEvent): void {
  if (canvas.klikOnderdrukt()) return;
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

/** Tekstvelden houden al hun toetsen, knoppen alleen Enter en spatie (zie `doelSoort`). */
function soortVan(doel: EventTarget | null): ReturnType<typeof doelSoort> {
  return doel instanceof HTMLElement ? doelSoort(doel) : "overig";
}

/** De melding bij een mislukte verwijdering, per foutcode. */
function verwijderFoutTitel(fout: DocumentFout): string {
  const sleutel = `editor.canvas.verwijderenMislukt.${fout.code}`;
  return te(sleutel) ? t(sleutel) : t("editor.canvas.verwijderenMislukt.andere");
}

/** Shift+Delete op zoveel nodes of meer vraagt eerst een bevestiging. */
const BEVESTIG_VANAF = 5;
/** Het aantal nodes dat Shift+Delete zou verwijderen; gezet zolang de bevestiging openstaat. */
const teVerwijderenAantal = ref<number | null>(null);
const bevestigOpen = computed({
  get: () => teVerwijderenAantal.value !== null,
  set: (open) => {
    if (!open) teVerwijderenAantal.value = null;
  },
});

/** Of de selectie een aansluiting of teller bevat: die zijn nooit te verwijderen (de store weigert dat). */
function bevatVasteNode(ids: readonly string[]): boolean {
  const doc = store.document;
  if (!doc) return false;
  return ids.some((id) => {
    const type = Object.hasOwn(doc.nodes, id) ? doc.nodes[id]?.type : undefined;
    return type === "aansluiting" || type === "teller";
  });
}

/** Het aantal verschillende nodes in de takken van `ids` (de nodes zelf meegeteld). */
function aantalInTakken(ids: readonly string[]): number {
  const doc = store.document;
  if (!doc) return 0;
  const gezien = new Set<string>();
  const stapel = [...ids];
  while (stapel.length > 0) {
    const id = stapel.pop()!;
    const node = Object.hasOwn(doc.nodes, id) ? doc.nodes[id] : undefined;
    if (!node || gezien.has(id)) continue;
    gezien.add(id);
    stapel.push(...node.kinderen);
  }
  return gezien.size;
}

function verwijder(heleTak: boolean): void {
  try {
    store.verwijderSelectie(heleTak);
  } catch (fout) {
    if (!(fout instanceof DocumentFout)) throw fout;
    toast.add({ title: verwijderFoutTitel(fout), color: "error" });
  }
}

function bevestigTakVerwijderen(): void {
  if (store.alleenLezen) return;
  teVerwijderenAantal.value = null;
  verwijder(true);
}

function toetsIngedrukt(event: KeyboardEvent): void {
  if (!store.document || store.tabblad !== "eendraadschema") return;
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
  const actie = sneltoets({
    key: event.key,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    doelIsInvoer: soort === "invoer",
    doelIsKnop: soort === "knop",
    herhaald: event.repeat,
    alleenLezen: store.alleenLezen,
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
      // Eerst de weigering (aansluiting of teller), dan pas de bevestiging: die is dan zinloos.
      if (actie.heleTak && !bevatVasteNode(store.selectie)) {
        // Vanaf 5 nodes eerst een bevestiging (spec §4.4).
        const aantal = aantalInTakken(store.selectie);
        if (aantal >= BEVESTIG_VANAF) {
          teVerwijderenAantal.value = aantal;
          break;
        }
      }
      verwijder(actie.heleTak);
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

// --- Overlay ---------------------------------------------------------------

const vakken = computed(() => store.opmaak?.strook.vakken ?? {});

const selectieKaders = computed(() =>
  store.selectie.flatMap((id) => {
    const vak = vakken.value[id];
    return vak ? [{ id, vak }] : [];
  }),
);

/** Eén markering per node, rechtsboven het vak; de ernst-aggregatie zit in `editor/markeringen.ts`. */
const markeringen = computed(() => {
  return [...leidMarkeringenAf(store.bevindingen)].flatMap(([id, soort]) => {
    const vak = vakken.value[id];
    return vak ? [{ id, soort, x: vak.x + vak.breedte, y: vak.y }] : [];
  });
});

const plusknoppen = computed(() => {
  // Zonder schrijfrecht kan er niets toegevoegd worden: geen plusknoppen.
  if (store.alleenLezen) return [];
  const doc = store.document;
  const opmaak = store.opmaak;
  if (!doc || !opmaak) return [];
  return opmaak.strook.aanknopingen.filter((a) =>
    magToevoegen(
      doc,
      { soort: a.soort, nodeId: a.nodeId },
      store.onderdeel,
      store.voorinstelling,
    ),
  );
});

// --- Levenscyclus ----------------------------------------------------------

onMounted(() => window.addEventListener("keydown", toetsIngedrukt));
onBeforeUnmount(() => window.removeEventListener("keydown", toetsIngedrukt));

// De strook kan pas na het mounten bestaan (document nog niet geladen): dan alsnog passend maken.
watch(
  () => store.opmaak?.strook,
  () => canvas.passendAlsNodig(),
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
      @pointermove="canvas.pointerMove"
      @pointerup="canvas.pointerUp"
      @pointercancel="canvas.pointerAfgebroken"
      @lostpointercapture.self="canvas.pointerAfgebroken"
    >
      <!-- Basislaag. v-html is hier veilig: `render` escapet alle documenttekst. -->
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
        class="bg-white text-neutral-900 hover:bg-neutral-100"
        @click="maakPassend"
      />
    </div>

    <UModal v-model:open="bevestigOpen" :title="$t('editor.canvas.takVerwijderen.titel')">
      <template #body>
        <AlleenLezenMelding class="mb-4" />
        <p>{{ $t("editor.canvas.takVerwijderen.beschrijving", { aantal: teVerwijderenAantal ?? 0 }) }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="bevestigOpen = false" />
          <UButton
            color="error"
            :disabled="store.alleenLezen"
            :label="$t('editor.canvas.takVerwijderen.bevestigen')"
            data-testid="tak-verwijderen-bevestigen"
            @click="bevestigTakVerwijderen"
          />
        </div>
      </template>
    </UModal>
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
