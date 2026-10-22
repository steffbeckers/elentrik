<script setup lang="ts">
import { NL, kringenlijst, type KringenlijstRij } from "@elentrik/render";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useEditorStore } from "~/stores/editor";

// Alleen-lezen: dezelfde rijen en kolomkoppen als de kringenlijst in de PDF.
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

function bijToets(event: KeyboardEvent, rij: KringenlijstRij): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  kies(rij);
}

/** Schuift de rij van de laatst geselecteerde node in beeld, onder de vaste kop. */
async function scrollNaarSelectie(): Promise<void> {
  const id = store.selectie.at(-1);
  if (id === undefined) return;
  await nextTick();
  const rij = Array.from(container.value?.querySelectorAll<HTMLElement>("[data-rij-node]") ?? []).find(
    (r) => r.dataset.rijNode === id,
  );
  rij?.scrollIntoView({ block: "nearest" });
}

onMounted(scrollNaarSelectie);
watch(() => store.selectie.at(-1), scrollNaarSelectie);
</script>

<template>
  <section
    ref="container"
    class="min-h-0 overflow-auto"
    :aria-label="$t('editor.kringenlijst.titel')"
    data-testid="kringenlijst"
  >
    <p v-if="rijen.length === 0" class="p-6 text-center text-sm text-muted" data-testid="kringenlijst-leeg">
      {{ NL.geenKringen }}
    </p>
    <table v-else class="w-full border-separate border-spacing-0 text-left text-sm">
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
          v-for="rij in rijen"
          :key="rij.nodeId"
          role="button"
          tabindex="0"
          :aria-pressed="geselecteerd(rij)"
          :data-rij-node="rij.nodeId"
          :data-testid="`kringenlijst-rij-${rij.punt}`"
          class="cursor-pointer outline-none hover:bg-elevated focus-visible:ring-2 focus-visible:ring-primary"
          :class="geselecteerd(rij) ? 'bg-primary/10' : ''"
          @click="kies(rij)"
          @keydown="bijToets($event, rij)"
        >
          <td v-for="kolom in KOLOMMEN" :key="kolom" class="border-b border-default px-3 py-1.5">
            {{ rij[kolom] }}
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
