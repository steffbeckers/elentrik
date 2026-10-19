<script setup lang="ts">
import type { NodeId } from "@elentrik/model";
import { tekenSymbool } from "@elentrik/symbols";
import { GROEP_VERDEELBORDEN, GROEP_ZONDER_KRING, nodeLabel, tePlaatsen } from "~/situatie/items";
import { NODE_SLEEP_TYPE } from "~/situatie/slepen";
import { useEditorStore } from "~/stores/editor";

/** Het punt dat met een klik op het plan geplaatst wordt, of null. */
const gekozen = defineModel<NodeId | null>("gekozen", { default: null });

const editor = useEditorStore();
const { t } = useI18n();

function groepTitel(kringLabel: string): string {
  if (kringLabel === GROEP_VERDEELBORDEN) return t("editor.situatie.tePlaatsen.verdeelborden");
  if (kringLabel === GROEP_ZONDER_KRING) return t("editor.situatie.tePlaatsen.zonderKring");
  return t("editor.situatie.tePlaatsen.kring", { label: kringLabel });
}

const groepen = computed(() => {
  const doc = editor.document;
  const analyse = editor.analyse;
  if (!doc || !analyse) return [];
  return tePlaatsen(doc, analyse).map((groep) => ({
    sleutel: groep.kringLabel,
    titel: groepTitel(groep.kringLabel),
    items: groep.nodeIds.flatMap((nodeId) => {
      const node = doc.nodes[nodeId];
      if (!node) return [];
      const label = nodeLabel(doc, analyse, nodeId);
      return [
        {
          nodeId,
          label,
          // Een punt zonder kring of een naamloos bord heeft geen label: dan het type.
          tekst: label || t(`editor.types.${node.type}`),
          symbool: tekenSymbool(node),
        },
      ];
    }),
  }));
});

// Een gekozen punt dat intussen geplaatst of verwijderd is (bv. via ongedaan maken), is niet meer te plaatsen.
watch(groepen, (nieuw) => {
  if (gekozen.value !== null && !nieuw.some((g) => g.items.some((i) => i.nodeId === gekozen.value))) {
    gekozen.value = null;
  }
});

function kies(nodeId: NodeId): void {
  gekozen.value = gekozen.value === nodeId ? null : nodeId;
}

function sleepStart(event: DragEvent, nodeId: NodeId): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(NODE_SLEEP_TYPE, nodeId);
  event.dataTransfer.effectAllowed = "move";
}
</script>

<template>
  <aside class="flex flex-col gap-4 p-3" :aria-label="$t('editor.situatie.tePlaatsen.titel')">
    <div class="px-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-muted">
        {{ $t("editor.situatie.tePlaatsen.titel") }}
      </h2>
      <p v-if="groepen.length > 0" class="mt-1 text-xs text-muted">{{ $t("editor.situatie.tePlaatsen.uitleg") }}</p>
    </div>

    <p v-if="groepen.length === 0" class="px-2 text-sm text-muted" data-testid="te-plaatsen-leeg">
      {{ $t("editor.situatie.tePlaatsen.allesGeplaatst") }}
    </p>

    <section v-for="groep in groepen" :key="groep.sleutel">
      <h3 class="mb-1 px-2 text-sm font-medium">{{ groep.titel }}</h3>
      <ul class="flex flex-col gap-0.5">
        <li v-for="item in groep.items" :key="item.nodeId">
          <button
            type="button"
            draggable="true"
            :data-testid="`te-plaatsen-${item.label || item.nodeId}`"
            :aria-pressed="gekozen === item.nodeId"
            class="flex w-full cursor-grab items-center gap-2 rounded-md px-2 py-1 text-left text-sm active:cursor-grabbing"
            :class="gekozen === item.nodeId ? 'bg-primary/10 text-primary ring-1 ring-primary' : 'hover:bg-elevated'"
            @click="kies(item.nodeId)"
            @dragstart="sleepStart($event, item.nodeId)"
          >
            <!-- v-html is hier veilig: `symbols` escapet alle tekst in een symbool. -->
            <svg
              class="size-6 shrink-0"
              :viewBox="`0 0 ${item.symbool.maat.breedte} ${item.symbool.maat.hoogte}`"
              aria-hidden="true"
              v-html="item.symbool.svg"
            />
            <span class="truncate">{{ item.tekst }}</span>
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>
