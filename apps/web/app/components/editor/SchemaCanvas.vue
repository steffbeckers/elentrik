<script setup lang="ts">
import { DocumentFout, magToevoegen } from "@elentrik/model";
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import CanvasBediening from "~/components/editor/CanvasBediening.vue";
import { doelSoort, moetNegeren, sneltoets, WIDGET_SELECTOR } from "~/composables/sneltoetsen";
import { useCanvasWeergave } from "~/composables/useCanvasWeergave";
import { markeringen as leidMarkeringenAf, MARKERING_KLASSE } from "~/editor/markeringen";
import { schemaKeuzes, schemaInvoegKeuzes, invoegpuntBijSelectie } from "~/editor/schema-navigatie";
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
      if (toevoegenOpen.value) voegViaToetsenbordToe();
      else store.voegToeBijSelectie();
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
    case "symbolen":
      store.symbolenOpen = true;
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

// Doorzoekbare keuzelijsten maken ook leidingen, beveiligingen en borden bereikbaar zonder muis.
const structuur = computed(() => store.document && store.analyse
  ? schemaKeuzes(store.document, store.analyse, type => t(`editor.types.${type}`)) : []);
const gekozenNode = computed(() => store.selectie.at(-1) ?? "");
const zoekOnderdeelInvoer = computed(() => ({
  placeholder: t("werkbaarheid.tekenen.zoekOnderdeel"),
  "aria-label": t("werkbaarheid.tekenen.zoekOnderdeel"),
}));
const zoekBestemmingInvoer = computed(() => ({
  placeholder: t("werkbaarheid.tekenen.zoekBestemming"),
  "aria-label": t("werkbaarheid.tekenen.zoekBestemming"),
}));
const toevoegenOpen = ref(false);
watch(() => store.onderdeel, () => { if (!store.alleenLezen) toevoegenOpen.value = true; });
const invoegKeuze = ref("");
const invoegSoort = ref<"kring-einde" | "rail-einde">("kring-einde");
const alleInvoegpunten = computed(() => store.document && store.analyse
  ? schemaInvoegKeuzes(store.document, store.analyse, plusknoppen.value,
    type => t(`editor.types.${type}`),
    (sleutel, waarden) => t(`editor.canvas.toetsenbord.${sleutel}`, waarden)) : []);
watch(alleInvoegpunten, punten => {
  if (!punten.some(p => p.soort === invoegSoort.value) && punten[0]) invoegSoort.value = punten[0].soort;
}, { immediate: true });
const invoegpunten = computed(() => alleInvoegpunten.value.filter(p => p.soort === invoegSoort.value));
const invoegGroepen = computed(() => {
  const groepen = new Map<string, { id: string; label: string; punten: typeof invoegpunten.value }>();
  for (const punt of invoegpunten.value) {
    if (!groepen.has(punt.bordId)) groepen.set(punt.bordId, { id: punt.bordId, label: punt.bord, punten: [] });
    groepen.get(punt.bordId)!.punten.push(punt);
  }
  return [...groepen.values()].map(groep => [
    { type: "label" as const, label: groep.label, sleutel: "" },
    ...groep.punten,
  ]);
});
const geldigInvoegpunt = computed(() => invoegpunten.value.find(a => a.sleutel === invoegKeuze.value));
watch(invoegpunten, punten => {
  if (!punten.some(a => a.sleutel === invoegKeuze.value)) {
    const doel = gekozenNode.value && store.analyse ? invoegpuntBijSelectie(store.analyse, punten, gekozenNode.value) : punten[0];
    invoegKeuze.value = doel?.sleutel ?? "";
  }
}, { immediate: true });
watch(gekozenNode, id => {
  if (!id || !store.analyse) { invoegKeuze.value = ""; return; }
  const doel = invoegpuntBijSelectie(store.analyse, alleInvoegpunten.value, id);
  if (doel) invoegSoort.value = doel.soort;
  invoegKeuze.value = doel?.sleutel ?? "";
}, { flush: "sync" });
function veranderInvoegSoort(): void {
  invoegKeuze.value = invoegpunten.value[0]?.sleutel ?? "";
}
const doelMarkering = computed(() => toevoegenOpen.value && geldigInvoegpunt.value
  ? store.opmaak?.strook.aanknopingen.find(a => a.soort === geldigInvoegpunt.value?.soort && a.nodeId === geldigInvoegpunt.value.nodeId) : null);
function focusSelectie(): void {
  const id = gekozenNode.value;
  const kringId = store.analyse?.kringVanNode[id];
  const vakken = Object.entries(store.opmaak?.strook.vakken ?? {})
    .filter(([nodeId]) => nodeId === id || (kringId && store.analyse?.kringVanNode[nodeId] === kringId))
    .map(([, vak]) => vak);
  if (!vakken.length) return;
  const x = Math.min(...vakken.map(v => v.x));
  const y = Math.min(...vakken.map(v => v.y));
  canvas.focus({ x, y, breedte: Math.max(...vakken.map(v => v.x + v.breedte)) - x, hoogte: Math.max(...vakken.map(v => v.y + v.hoogte)) - y });
}
function kiesStructuur(id: string): void {
  if (id) store.selectie = [id];
}
function voegViaToetsenbordToe(): void {
  const a = geldigInvoegpunt.value;
  if (a && !store.alleenLezen) store.voegToe(a);
}
function activeerPlus(event: KeyboardEvent, a: (typeof plusknoppen.value)[number]): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat && !store.alleenLezen) store.voegToe(a);
}

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
  <div class="relative flex size-full min-h-0 min-w-0 flex-col">
    <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default bg-default px-3 py-1" data-testid="schema-structuur">
      <USelectMenu :model-value="gekozenNode || undefined" :items="structuur" value-key="id"
        :aria-label="$t('editor.canvas.toetsenbord.onderdeel')"
        :placeholder="$t('editor.canvas.toetsenbord.kiesOnderdeel')"
        :search-input="zoekOnderdeelInvoer"
        :content="{ align: 'start' }" :ui="{ item: 'min-h-9', itemLabel: 'whitespace-normal break-words' }"
        data-testid="schema-nodekeuze" class="min-h-9 min-w-0 flex-1 sm:w-80 sm:flex-none"
        @update:model-value="kiesStructuur" />
      <UButton v-if="!store.alleenLezen" icon="i-lucide-plus" :color="toevoegenOpen ? 'primary' : 'neutral'" variant="soft" :label="$t('werkbaarheid.tekenen.toevoegen')" :aria-expanded="toevoegenOpen" aria-controls="schema-invoegen" data-testid="schema-toevoegmodus" class="min-h-9" @click="toevoegenOpen = !toevoegenOpen" />
    </div>
    <div v-if="toevoegenOpen && !store.alleenLezen" id="schema-invoegen" class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default bg-elevated px-3 py-2">
      <div class="flex min-w-0 flex-1 basis-64 flex-wrap items-center gap-2">
        <span class="text-xs text-muted">{{ $t('editor.canvas.toetsenbord.invoegpunt') }}</span>
        <USelect v-model="invoegSoort" data-testid="schema-invoegsoort" :aria-label="$t('editor.canvas.toetsenbord.actie')"
          :items="[
            { value: 'kring-einde', label: $t('editor.canvas.toetsenbord.bestaandeKring'), disabled: !alleInvoegpunten.some(p => p.soort === 'kring-einde') },
            { value: 'rail-einde', label: $t('editor.canvas.toetsenbord.nieuweKring'), disabled: !alleInvoegpunten.some(p => p.soort === 'rail-einde') },
          ]"
          class="min-h-9 min-w-0" @update:model-value="veranderInvoegSoort" />
        <USelectMenu :model-value="invoegKeuze || undefined" :items="invoegGroepen" value-key="sleutel"
          :search-input="zoekBestemmingInvoer"
          :disabled="!invoegpunten.length" data-testid="schema-invoegpunt" :aria-label="$t('editor.canvas.toetsenbord.invoegpunt')"
          :placeholder="$t(invoegpunten.length ? 'werkbaarheid.tekenen.kiesBestemming' : 'editor.canvas.toetsenbord.geenInvoegpunt')"
          :content="{ align: 'start' }" :ui="{ item: 'min-h-9', itemLabel: 'whitespace-normal break-words' }"
          class="min-h-9 min-w-0 flex-1 basis-40 sm:max-w-96" @update:model-value="invoegKeuze = $event" />
      </div>
      <UButton v-if="!store.alleenLezen" icon="i-lucide-plus" :disabled="!geldigInvoegpunt" :label="$t('editor.canvas.voegToe', { onderdeel: $t(`editor.onderdelen.${store.onderdeel}`) })" data-testid="schema-toevoegen" class="min-h-9" @click="voegViaToetsenbordToe" />
      <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="$t('werkbaarheid.tekenen.sluitToevoegen')" class="min-h-9" @click="toevoegenOpen = false" />
    </div>
    <div
      ref="venster"
      data-testid="schema-canvas"
      tabindex="0"
      role="group"
      :aria-label="$t('editor.bovenbalk.tabbladen.eendraadschema')"
      class="relative min-h-0 min-w-0 flex-1 touch-none select-none overflow-hidden bg-white text-neutral-900"
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
        <circle v-if="doelMarkering" :cx="doelMarkering.x" :cy="doelMarkering.y" r="4" fill="none" stroke-width="0.8" style="stroke: var(--ui-primary)" data-testid="schema-invoegmarkering" />
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
          tabindex="0"
          :aria-label="`${$t('editor.canvas.voegToe', { onderdeel: $t(`editor.onderdelen.${store.onderdeel}`) })} · ${structuur.find(n => n.id === a.nodeId)?.label ?? ''}`"
          class="schema-plus pointer-events-auto cursor-pointer"
          :transform="`translate(${a.x} ${a.y})`"
          @click.stop="store.voegToe(a)"
          @keydown="activeerPlus($event, a)"
        >
          <circle :r="PLUS_STRAAL_MM" fill="white" stroke-width="0.4" style="stroke: var(--ui-primary)" />
          <path d="M-1.2 0H1.2M0 -1.2V1.2" fill="none" stroke-width="0.5" stroke-linecap="round" style="stroke: var(--ui-primary)" />
        </g>
      </svg>
      <CanvasBediening :percentage="canvas.zoomPercentage.value" :kan-focus="!!gekozenNode" :hulp="$t('werkbaarheid.tekenen.hulp')" @zoom="canvas.zoom" @passend="maakPassend" @focus="focusSelectie" />
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
.schema-plus:focus-visible { outline: none; }
.schema-plus:focus-visible circle { stroke-width: 1; fill: var(--ui-bg-accented); }
</style>
