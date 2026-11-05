<script setup lang="ts">
import { DocumentFout, type Node, type NodeType } from "@elentrik/model";
import { GEMEENSCHAPPELIJK, VELDEN, type Veld } from "~/editor/velden";
import { Werkconcepten, veldWaarde } from "~/editor/werkconcept";
import { useEditorStore } from "~/stores/editor";

/** De waarde van een veld bij een meervoudige selectie waarin de nodes verschillen. */
const VERSCHILLEND = Symbol("verschillend");
/** De keuze "Geen" bij een optionele keuzelijst; een keuzelijst kent geen lege waarde. */
const GEEN = "__geen__";

const store = useEditorStore();
const { t } = useI18n();
const voerUit = useDocumentFoutMelding();

const nodes = computed<Node[]>(() => {
  const doc = store.document;
  if (!doc) return [];
  return store.selectie.flatMap((id) => (Object.hasOwn(doc.nodes, id) ? [doc.nodes[id]!] : []));
});
const ids = computed(() => nodes.value.map((n) => n.id));

/** Het gedeelde type van de selectie, of `null` bij een lege of gemengde selectie. */
const type = computed<NodeType | null>(() => {
  const eerste = nodes.value[0];
  if (!eerste) return null;
  return nodes.value.every((n) => n.type === eerste.type) ? eerste.type : null;
});

const velden = computed<Veld[]>(() => (type.value ? [...GEMEENSCHAPPELIJK, ...VELDEN[type.value]] : []));

/** Het puntlabel (bv. "A4"), het kringlabel van een beveiliging, of het eigen label. */
const titel = computed(() => {
  const node = nodes.value[0];
  if (!node || !type.value) return "";
  const typeNaam = t(`editor.types.${type.value}`);
  if (nodes.value.length > 1) return t("editor.eigenschappen.zelfdeType", { aantal: nodes.value.length, type: typeNaam });
  const analyse = store.analyse;
  const puntLabel = analyse && Object.hasOwn(analyse.puntLabels, node.id) ? analyse.puntLabels[node.id] : undefined;
  const kringLabel = analyse?.kringen.find((k) => k.beveiligingId === node.id)?.label;
  const label = puntLabel ?? kringLabel ?? node.label;
  return label ? `${label} · ${typeNaam}` : typeNaam;
});

function waardeVan(veld: Veld): unknown {
  const waarden = nodes.value.map((n) => veldWaarde(n, veld.sleutel));
  const eerste = waarden[0];
  return waarden.every((w) => w === eerste) ? eerste : VERSCHILLEND;
}

// Local invalid drafts survive blur and are parked under their original selection.
const concepten = reactive(new Werkconcepten());
const concept = computed(() => concepten.tekst);
const ongeldig = computed(() => concepten.ongeldig);
let eigenWijziging = false;
watch(() => ids.value.join(","), () => concepten.selecteer(ids.value), { immediate: true, flush: "sync" });
watch(() => store.document, () => {
  if (!eigenWijziging) for (const sleutel of Object.keys(concepten.tekst)) concepten.verlaat(sleutel);
}, { flush: "sync" });
function veldNaam(sleutel: string): string {
  const veld = [...GEMEENSCHAPPELIJK, ...Object.values(VELDEN).flat()].find(v => v.sleutel === sleutel);
  return veld ? t(veld.labelSleutel) : sleutel;
}
function keerTerug(selectie: readonly string[]): void {
  const bestaand = selectie.filter(id => store.document && Object.hasOwn(store.document.nodes, id));
  if (bestaand.length === selectie.length) store.selectie = bestaand;
}
function kanTerug(selectie: readonly string[]): boolean {
  return selectie.every(id => store.document && Object.hasOwn(store.document.nodes, id));
}

/** Wijzigt het veld op alle geselecteerde nodes. Een ongeldige waarde geeft `false`, zonder toast. */
function wijzig(veld: Veld, waarde: unknown): boolean {
  eigenWijziging = true;
  try {
    store.wijzigVeld(ids.value, veld.sleutel, waarde);
    return true;
  } catch (fout) {
    if (fout instanceof DocumentFout && fout.code === "ONGELDIG_SCHEMA") return false;
    // Elke andere fout: een toast (DocumentFout) of gewoon door (al de rest).
    return voerUit(() => {
      throw fout;
    });
  } finally {
    eigenWijziging = false;
  }
}

/** Tekst en getal: elke toetsaanslag gaat meteen door; de undo-groep sluit pas bij `verlaat`. */
function invoer(veld: Veld, ruw: string | number | null | undefined): void {
  const tekst = ruw === null || ruw === undefined ? "" : String(ruw);
  concepten.invoer(veld.sleutel, tekst, false);
  let waarde: unknown;
  if (veld.soort === "getal") {
    if (tekst.trim() === "") {
      if (!veld.optioneel) {
        concepten.ongeldig[veld.sleutel] = true;
        return;
      }
      waarde = undefined;
    } else {
      const getal = Number(tekst.replace(",", "."));
      if (!Number.isFinite(getal)) {
        concepten.ongeldig[veld.sleutel] = true;
        return;
      }
      waarde = getal;
    }
  } else {
    waarde = tekst === "" && veld.optioneel ? undefined : tekst;
  }
  concepten.invoer(veld.sleutel, tekst, wijzig(veld, waarde));
}

function verlaat(veld: Veld): void {
  concepten.verlaat(veld.sleutel);
  store.sluitGroep();
}

/** Keuzelijst en schakelaar: één wijziging is één undo-stap. */
function kies(veld: Veld, waarde: unknown): void {
  wijzig(veld, waarde === GEEN ? undefined : waarde);
  store.sluitGroep();
}

function tekstWaarde(veld: Veld): string {
  if (Object.hasOwn(concept.value, veld.sleutel)) return concept.value[veld.sleutel]!;
  const w = waardeVan(veld);
  return w === VERSCHILLEND || w === undefined ? "" : String(w);
}

function keuzeWaarde(veld: Veld): string | number | undefined {
  const w = waardeVan(veld);
  if (w === VERSCHILLEND) return undefined;
  if (w === undefined) return veld.optioneel ? GEEN : undefined;
  return w as string | number;
}

/** Een optie met een vertaalsleutel wordt vertaald; een getal of symbool (polen, curve B) toont zichzelf. */
function optieLabel(optie: NonNullable<Veld["opties"]>[number]): string {
  return optie.labelSleutel ? t(optie.labelSleutel) : String(optie.waarde);
}

function keuzeItems(veld: Veld): { value: string | number; label: string }[] {
  const items = (veld.opties ?? []).map((o) => ({ value: o.waarde, label: optieLabel(o) }));
  return veld.optioneel ? [{ value: GEEN, label: t("editor.eigenschappen.geen") }, ...items] : items;
}

function plaatshouder(veld: Veld): string | undefined {
  return waardeVan(veld) === VERSCHILLEND ? t("editor.eigenschappen.verschillend") : undefined;
}
</script>

<template>
  <section class="p-3" :aria-label="$t('editor.eigenschappen.titel')">
    <h2 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
      {{ $t("editor.eigenschappen.titel") }}
    </h2>

    <div v-for="(achtergelaten, index) in concepten.verlaten" :key="index" role="alert" class="mb-3 rounded border border-warning p-2 text-sm" data-testid="verlaten-concept">
      <p>{{ $t('editor.eigenschappen.conceptVerlaten') }}</p>
      <ul class="my-2 list-inside list-disc">
        <li v-for="(waarde, sleutel) in achtergelaten.waarden" :key="sleutel">{{ veldNaam(String(sleutel)) }}: {{ waarde }}</li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <UButton size="xs" :disabled="!kanTerug(achtergelaten.ids)" :label="$t('editor.eigenschappen.terugNaarConcept')" @click="keerTerug(achtergelaten.ids)" />
        <UButton size="xs" variant="outline" color="neutral" :label="$t('editor.eigenschappen.conceptHerstellen')" @click="concepten.verwerp(achtergelaten.ids)" />
      </div>
    </div>
    <p v-if="nodes.length === 0" class="text-sm text-muted">{{ $t("editor.eigenschappen.leeg") }}</p>
    <p v-else-if="!type" class="text-sm" data-testid="eigenschappen-gemengd">
      {{ $t("editor.eigenschappen.gemengd", { aantal: nodes.length }) }}
    </p>

    <template v-else>
      <p class="mb-3 font-semibold" data-testid="eigenschappen-titel">{{ titel }}</p>
      <div class="flex flex-col gap-3">
        <template v-for="veld in velden" :key="veld.sleutel">
          <UFormField
            v-if="veld.soort === 'tekst' || veld.soort === 'getal'"
            :label="$t(veld.labelSleutel)"
            :error="ongeldig[veld.sleutel] ? $t('editor.eigenschappen.ongeldig') : undefined"
            size="sm"
          >
            <UInput
              :model-value="tekstWaarde(veld)"
              :type="veld.soort === 'getal' ? 'number' : 'text'"
              :min="veld.min"
              :step="veld.soort === 'getal' ? (veld.stap ?? 'any') : undefined"
              :placeholder="plaatshouder(veld)"
              :disabled="store.alleenLezen"
              :data-testid="`veld-${veld.sleutel}`"
              class="w-full"
              :ui="veld.eenheid ? { trailing: 'pointer-events-none' } : undefined"
              @update:model-value="(w: string | number) => invoer(veld, w)"
              @blur="verlaat(veld)"
              @keydown.esc.stop.prevent="concepten.herstel(veld.sleutel); store.sluitGroep()"
            >
              <template v-if="veld.eenheid" #trailing>
                <span class="text-xs text-muted">{{ veld.eenheid }}</span>
              </template>
            </UInput>
          </UFormField>

          <UFormField v-else-if="veld.soort === 'keuze'" :label="$t(veld.labelSleutel)" size="sm">
            <USelect
              :model-value="keuzeWaarde(veld)"
              :items="keuzeItems(veld)"
              :placeholder="plaatshouder(veld)"
              :disabled="store.alleenLezen"
              :data-testid="`veld-${veld.sleutel}`"
              class="w-full"
              @update:model-value="(w: unknown) => kies(veld, w)"
              @blur="store.sluitGroep()"
            />
          </UFormField>

          <div v-else class="flex items-center justify-between gap-2">
            <USwitch
              :model-value="waardeVan(veld) === true"
              :label="$t(veld.labelSleutel)"
              :disabled="store.alleenLezen"
              :data-testid="`veld-${veld.sleutel}`"
              size="sm"
              @update:model-value="(w: boolean) => kies(veld, w)"
              @blur="store.sluitGroep()"
            />
            <span v-if="waardeVan(veld) === VERSCHILLEND" class="text-sm text-muted">
              {{ $t("editor.eigenschappen.verschillend") }}
            </span>
          </div>
        </template>
      </div>
    </template>
  </section>
</template>
