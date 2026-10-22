<script setup lang="ts">
import { NL, kringenlijst, type KringenlijstRij } from "@elentrik/render";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { volgendeRij } from "~/editor/rijnavigatie";
import { useEditorStore } from "~/stores/editor";

// Alleen-lezen: dezelfde rijen en kolomkoppen als de kringenlijst in de PDF.
// De kolomkoppen, "Geen kringen" en de celteksten komen bewust uit `NL` van @elentrik/render en niet
// uit nl.json: het tabblad moet woord voor woord de formulering van de PDF tonen (ruling plan 5).
const store = useEditorStore();

type Kolom = keyof KringenlijstRij & keyof typeof NL.kolommen;
const KOLOMMEN = ["kring", "punt", "type", "ruimte", "beveiliging", "differentieel", "leiding"] as const satisfies readonly Kolom[];

const rijen = computed<KringenlijstRij[]>(() =>
  store.document && store.analyse ? kringenlijst(store.document, store.analyse, NL) : [],
);

const container = ref<HTMLElement | null>(null);

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

function bijToets(event: KeyboardEvent, rij: KringenlijstRij, index: number): void {
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
    class="min-h-0 scroll-pt-10 overflow-auto"
    :aria-label="$t('editor.kringenlijst.titel')"
    data-testid="kringenlijst"
  >
    <p v-if="rijen.length === 0" class="p-6 text-center text-sm text-muted" data-testid="kringenlijst-leeg">
      {{ NL.geenKringen }}
    </p>
    <table v-else role="grid" class="w-full border-separate border-spacing-0 text-left text-sm">
      <thead>
        <tr>
          <th
            v-for="kolom in KOLOMMEN"
            :key="kolom"
            scope="col"
            class="sticky top-0 z-10 border-b border-default bg-elevated px-3 py-2 font-semibold"
          >
            {{ NL.kolommen[kolom] }}
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
          class="cursor-pointer outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-primary"
          :class="geselecteerd(rij) ? 'bg-primary/10' : ''"
          @click="kies(rij)"
          @focus="bijFocus(index)"
          @keydown="bijToets($event, rij, index)"
        >
          <td v-for="kolom in KOLOMMEN" :key="kolom" role="gridcell" class="border-b border-default px-3 py-1.5">
            {{ rij[kolom] }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
