<script setup lang="ts">
import { TEKSTEN, kringenlijst, type KringenlijstRij, type Teksten } from "@elentrik/render";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { volgendeRij } from "~/editor/rijnavigatie";
import { useEditorStore } from "~/stores/editor";

// Alleen de omschrijving van de kring is bewerkbaar (Escape annuleert, Enter of verlaten bewaart, via
// dezelfde store-operatie als het Eigenschappenpaneel: één undo-stap). Dezelfde rijen en kolomkoppen als de kringenlijst in de PDF.
// De kolomkoppen, "Geen kringen" en de celteksten komen bewust uit `TEKSTEN` van @elentrik/render en
// niet uit de vertaalbestanden: het tabblad moet woord voor woord de formulering van de PDF tonen
// (ruling plan 5). De taal is die van de interface (plan 8), zoals de bevindingen: geen scherm met
// twee talen. De PDF zelf volgt de dossiertaal.
const store = useEditorStore();
const { taal } = useTaal();
const teksten = computed<Teksten>(() => TEKSTEN[taal.value]);

type Kolom = keyof KringenlijstRij & keyof Teksten["kolommen"];
const KOLOMMEN = ["kring", "kringOmschrijving", "punt", "puntOmschrijving", "type", "ruimte", "beveiliging", "differentieel", "leiding"] as const satisfies readonly Kolom[];
const BREEDTES: Record<Kolom, string> = {
  kring: "3rem", kringOmschrijving: "10rem", punt: "3rem", puntOmschrijving: "10rem",
  type: "10rem", ruimte: "8rem", beveiliging: "9rem", differentieel: "11rem", leiding: "8rem",
};
const TECHNISCH = new Set<Kolom>(["kring", "punt", "beveiliging", "differentieel", "leiding"]);

const rijen = computed<KringenlijstRij[]>(() =>
  store.document && store.analyse ? kringenlijst(store.document, store.analyse, teksten.value) : [],
);

const container = ref<HTMLElement | null>(null);

function eersteInKring(index: number): boolean {
  return index === 0 || rijen.value[index - 1]?.kring !== rijen.value[index]?.kring;
}
function herhaaldeOmschrijving(index: number, kolom: Kolom): boolean {
  return kolom === "kringOmschrijving" && !eersteInKring(index)
    && rijen.value[index - 1]?.kringOmschrijving === rijen.value[index]?.kringOmschrijving;
}

function geselecteerd(rij: KringenlijstRij): boolean {
  return store.selectie.includes(rij.nodeId);
}

function kies(rij: KringenlijstRij): void {
  store.selectie = [rij.nodeId];
}

/**
 * Roving tabindex: alleen de actieve rij staat in de tabvolgorde (`tabindex="0"`), de andere hebben -1.
 * Pijl omhoog/omlaag, Home en End verplaatsen de focus; Enter of spatie selecteert.
 */
const actief = ref(0);
const actieveIndex = computed(() => Math.min(actief.value, Math.max(rijen.value.length - 1, 0)));

function rijElementen(): HTMLElement[] {
  return Array.from(container.value?.querySelectorAll<HTMLElement>("[data-rij-node]") ?? []);
}

/** Het bord of de beveiliging waarvan de omschrijving in deze rij staat; alleen op de eerste rij van een kring. */
function beveiligingVan(rij: KringenlijstRij, index: number): string | null {
  if (!eersteInKring(index)) return null;
  return store.analyse?.kringen.find((k) => k.label === rij.kring)?.beveiligingId ?? null;
}
function bewerkbaar(rij: KringenlijstRij, index: number, kolom: Kolom): boolean {
  return kolom === "kringOmschrijving" && !store.alleenLezen && beveiligingVan(rij, index) !== null;
}

const bewerkt = ref<{ nodeId: string; waarde: string } | null>(null);
const invoerVeld = ref<HTMLInputElement[] | HTMLInputElement | null>(null);

async function startBewerken(rij: KringenlijstRij, index: number): Promise<void> {
  if (!bewerkbaar(rij, index, "kringOmschrijving")) return;
  kies(rij);
  bewerkt.value = { nodeId: rij.nodeId, waarde: rij.kringOmschrijving };
  await nextTick();
  const veld = [invoerVeld.value].flat()[0];
  veld?.focus();
  veld?.select();
}
function bewaarBewerking(rij: KringenlijstRij, index: number): void {
  const huidig = bewerkt.value;
  const id = beveiligingVan(rij, index);
  bewerkt.value = null;
  if (!huidig || huidig.nodeId !== rij.nodeId || !id) return;
  const waarde = huidig.waarde.trim();
  if (waarde === rij.kringOmschrijving) return;
  store.wijzigVeld([id], "label", waarde === "" ? undefined : waarde);
  store.sluitGroep();
}
function annuleerBewerking(rij: KringenlijstRij): void {
  bewerkt.value = null;
  // De focus terug naar de rij, zodat de pijltoetsen weer werken.
  rijElementen().find((r) => r.dataset.rijNode === rij.nodeId)?.focus();
}
function bijInvoerToets(event: KeyboardEvent, rij: KringenlijstRij, index: number): void {
  // Niets uit het invoerveld bereikt de rijnavigatie.
  event.stopPropagation();
  if (event.key === "Enter") {
    event.preventDefault();
    bewaarBewerking(rij, index);
    rijElementen().find((r) => r.dataset.rijNode === rij.nodeId)?.focus();
  } else if (event.key === "Escape") {
    event.preventDefault();
    annuleerBewerking(rij);
  }
}

function bijToets(event: KeyboardEvent, rij: KringenlijstRij, index: number): void {
  if (event.target !== event.currentTarget) return;
  if (event.key === "F2") {
    event.preventDefault();
    void startBewerken(rij, index);
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    kies(rij);
    return;
  }
  const volgende = volgendeRij(event.key, index, rijen.value.length);
  if (volgende === null) return;
  event.preventDefault();
  actief.value = volgende;
  rijElementen()[volgende]?.focus();
}

function bijFocus(index: number): void {
  actief.value = index;
}

// Een selectie zonder rij (bord, kring) markeert niets: alleen punten staan in de lijst.
/** Schuift de rij van de laatst geselecteerde node in beeld; `scroll-pt-10` op de container houdt haar onder de vaste kop vandaan. */
async function scrollNaarSelectie(): Promise<void> {
  const id = store.selectie.at(-1);
  if (id === undefined) return;
  // De geselecteerde rij wordt de actieve: wie de tabel in tabt, komt erop terecht.
  const index = rijen.value.findIndex((r) => r.nodeId === id);
  if (index >= 0) actief.value = index;
  await nextTick();
  const rij = rijElementen().find((r) => r.dataset.rijNode === id);
  rij?.scrollIntoView({ block: "nearest" });
}

onMounted(scrollNaarSelectie);
watch(() => store.selectie.at(-1), scrollNaarSelectie);
</script>

<template>
  <section
    ref="container"
    class="min-h-0 min-w-0 max-w-full scroll-pt-12 overflow-auto overscroll-contain"
    :aria-label="$t('editor.kringenlijst.titel')"
    data-testid="kringenlijst"
  >
    <p v-if="rijen.length === 0" class="p-6 text-center text-sm text-muted" data-testid="kringenlijst-leeg">
      {{ teksten.geenKringen }}
    </p>
    <table v-else role="grid" class="w-full min-w-[72rem] table-fixed border-separate border-spacing-0 text-left text-sm">
      <caption class="sr-only">{{ $t('editor.kringenlijst.toetsenbord') }} {{ $t('editor.kringenlijst.omschrijvingHint') }}</caption>
      <colgroup>
        <col v-for="kolom in KOLOMMEN" :key="kolom" :style="{ width: BREEDTES[kolom] }">
      </colgroup>
      <thead>
        <tr>
          <th
            v-for="kolom in KOLOMMEN"
            :key="kolom"
            scope="col"
            class="sticky top-0 z-10 border-b border-default bg-elevated px-3 py-2 font-semibold"
          >
            {{ teksten.kolommen[kolom] }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="(rij, index) in rijen"
          :key="rij.nodeId"
          role="row"
          :tabindex="index === actieveIndex ? 0 : -1"
          :aria-selected="geselecteerd(rij)"
          :data-rij-node="rij.nodeId"
          :data-testid="`kringenlijst-rij-${rij.punt}`"
          class="cursor-pointer outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
          :class="geselecteerd(rij) ? 'bg-primary/10' : ''"
          @click="kies(rij)"
          @focus="bijFocus(index)"
          @keydown="bijToets($event, rij, index)"
        >
          <td v-for="kolom in KOLOMMEN" :key="kolom" role="gridcell" class="border-b border-default px-3 py-2 align-top"
            :class="[
              TECHNISCH.has(kolom) ? 'whitespace-nowrap tabular-nums' : '[overflow-wrap:anywhere]',
              eersteInKring(index) && index > 0 ? 'border-t-2 pt-4' : '',
              kolom === 'kring' || kolom === 'punt' ? 'font-medium' : '',
            ]"
          >
            <input
              v-if="bewerkt?.nodeId === rij.nodeId && kolom === 'kringOmschrijving'"
              ref="invoerVeld"
              v-model="bewerkt.waarde"
              type="text"
              class="w-full rounded border border-default bg-default px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :aria-label="$t('editor.kringenlijst.omschrijvingVeld', { kring: rij.kring })"
              data-testid="kringenlijst-omschrijving-invoer"
              @click.stop
              @keydown="bijInvoerToets($event, rij, index)"
              @blur="bewerkt && bewaarBewerking(rij, index)"
            >
            <button
              v-else-if="bewerkbaar(rij, index, kolom)"
              type="button"
              tabindex="-1"
              class="block min-h-6 w-full cursor-text rounded text-left hover:bg-accented"
              :title="$t('editor.kringenlijst.omschrijvingBewerken', { kring: rij.kring })"
              :data-testid="`kringenlijst-omschrijving-${rij.kring}`"
              @click.stop="startBewerken(rij, index)"
            >{{ rij[kolom] }}</button>
            <span v-else :class="herhaaldeOmschrijving(index, kolom) ? 'sr-only' : ''">{{ rij[kolom] }}</span>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
