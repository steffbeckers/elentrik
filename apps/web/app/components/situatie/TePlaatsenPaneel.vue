<script setup lang="ts">
import type { NodeId } from "@elentrik/model";
import { nodeLabel } from "@elentrik/render";
import { tekenSymbool } from "@elentrik/symbols";
import { GROEP_VERDEELBORDEN, GROEP_ZONDER_KRING, GROEP_INSTALLATIE, tePlaatsen, type TePlaatsenGroep } from "~/situatie/items";
import { NODE_SLEEP_TYPE } from "~/situatie/slepen";
import { schemaKeuzes } from "~/editor/schema-navigatie";
import { filterPlaatskeuzes } from "~/situatie/plaatskeuzes";
import { useEditorStore } from "~/stores/editor";

/** Het punt dat met een klik op het plan geplaatst wordt, of null. */
const zoek = defineModel<string>("zoek", { default: "" });
const kring = defineModel<string>("kring", { default: "" });
const doorgaan = defineModel<boolean>("doorgaan", { default: false });
/** De zichtbare groepen in hun volgorde: "Doorgaan met volgend punt" blijft binnen één groep. */
const emit = defineEmits<{ volgorde: [groepen: TePlaatsenGroep[]] }>();
const gekozen = defineModel<NodeId | null>("gekozen", { default: null });

const editor = useEditorStore();
const { t } = useI18n();
const labels = computed(() => editor.document && editor.analyse
  ? new Map(schemaKeuzes(editor.document, editor.analyse, type => t(`editor.types.${type}`)).map(k => [k.id, k.label])) : new Map<string, string>());
const alleGroepen = computed(() => editor.document && editor.analyse ? tePlaatsen(editor.document, editor.analyse) : []);
const kringOpties = computed(() => [
  { value: "__alle__", label: t("editor.situatie.tePlaatsen.alleKringen") },
  ...[...new Set([...alleGroepen.value.map(g => g.kringLabel), ...(kring.value ? [kring.value] : [])])].map(label => ({ value: label, label: groepTitel(label) })),
]);

function groepTitel(kringLabel: string): string {
  if (kringLabel === GROEP_VERDEELBORDEN) return t("editor.situatie.tePlaatsen.verdeelborden");
  if (kringLabel === GROEP_INSTALLATIE) return t("editor.situatie.tePlaatsen.installatie");
  if (kringLabel === GROEP_ZONDER_KRING) return t("editor.situatie.tePlaatsen.zonderKring");
  return t("editor.situatie.tePlaatsen.kring", { label: kringLabel });
}

const groepen = computed(() => {
  const doc = editor.document;
  const analyse = editor.analyse;
  if (!doc || !analyse) return [];
  return filterPlaatskeuzes(alleGroepen.value, labels.value, zoek.value, kring.value).map((groep) => ({
    sleutel: groep.kringLabel,
    titel: groepTitel(groep.kringLabel),
    items: groep.nodeIds.flatMap((nodeId) => {
      const node = doc.nodes[nodeId];
      if (!node) return [];
      // Puntlabels zijn uniek ("A1"); bordnamen niet, en een bord of een punt zonder kring kan zonder label zijn.
      const puntLabel = node.type === "verdeelbord" ? "" : nodeLabel(doc, analyse, nodeId);
      return [
        {
          nodeId,
          testId: `te-plaatsen-${puntLabel || nodeId}`,
          tekst: labels.value.get(nodeId) ?? nodeId,
          symbool: tekenSymbool(node, { einde: true }),
        },
      ];
    }),
  }));
});

watch(groepen, nieuw => emit("volgorde", nieuw.map(g => ({ kringLabel: g.sleutel, nodeIds: g.items.map(i => i.nodeId) }))), { immediate: true });
watch([zoek, kring], () => { gekozen.value = null; });

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
  <aside class="flex flex-col gap-4 p-3" :aria-label="$t('editor.situatie.tePlaatsen.titel')" @keydown.esc="gekozen = null">
    <div class="px-2">
      <h2 class="text-lg font-semibold">
        {{ $t("editor.situatie.tePlaatsen.titel") }}
      </h2>
      <p v-if="groepen.length > 0" class="mt-1 text-xs text-muted">{{ $t("editor.situatie.tePlaatsen.uitleg") }}</p>
    </div>

    <div class="flex flex-col gap-3 px-2">
      <UFormField :label="$t('editor.situatie.tePlaatsen.zoeken')" size="sm">
        <UInput v-model="zoek" data-testid="te-plaatsen-zoeken" icon="i-lucide-search" class="w-full" />
      </UFormField>
      <UFormField :label="$t('editor.situatie.tePlaatsen.kringFilter')" size="sm">
        <USelect :model-value="kring || '__alle__'" :items="kringOpties" data-testid="te-plaatsen-kring" class="w-full" @update:model-value="kring = $event === '__alle__' ? '' : String($event)" />
      </UFormField>
      <USwitch v-model="doorgaan" :disabled="editor.alleenLezen" :label="$t('editor.situatie.tePlaatsen.doorgaan')" data-testid="te-plaatsen-doorgaan" size="sm" />
    </div>
    <p v-if="groepen.length === 0" class="px-2 text-sm text-muted" data-testid="te-plaatsen-leeg">
      {{ $t(alleGroepen.length ? "editor.situatie.tePlaatsen.geenResultaten" : "editor.situatie.tePlaatsen.allesGeplaatst") }}
    </p>

    <section v-for="groep in groepen" :key="groep.sleutel">
      <h3 class="mb-1 px-2 text-sm font-medium">{{ groep.titel }}</h3>
      <ul class="flex flex-col gap-0.5">
        <li v-for="item in groep.items" :key="item.nodeId">
          <button
            type="button"
            :draggable="!editor.alleenLezen"
            :disabled="editor.alleenLezen"
            :data-testid="item.testId"
            :aria-pressed="gekozen === item.nodeId"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm disabled:cursor-not-allowed disabled:opacity-60"
            :class="[
              editor.alleenLezen ? '' : 'cursor-grab active:cursor-grabbing',
              gekozen === item.nodeId ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary' : 'hover:bg-elevated',
            ]"
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
            <span class="min-w-0 break-words">{{ item.tekst }}</span>
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>
