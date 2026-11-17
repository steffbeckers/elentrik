<script setup lang="ts">
import { formatteerBericht } from "@elentrik/arei";
import type { MarkeringTipDoel } from "~/composables/useMarkeringTip";
import type { MarkeringSoort } from "~/editor/markeringen";
import { markeringRegels } from "~/editor/markeringtekst";
import { useEditorStore } from "~/stores/editor";

/**
 * De tooltip bij een markering: wat er over dit onderdeel gemeld is, ergste eerst, in de taal van
 * de interface. Elke regel heeft een eigen icoon naast de kleur. Hij staat boven de markering, of
 * eronder als er boven geen plaats is, en blijft binnen het venster.
 */
const props = defineProps<{ tip: MarkeringTipDoel | null }>();

const store = useEditorStore();
const { taal } = useTaal();

const ICOON: Record<MarkeringSoort, string> = {
  fout: "i-lucide-circle-x",
  waarschuwing: "i-lucide-triangle-alert",
  info: "i-lucide-info",
  afgeweken: "i-lucide-square-check",
};
const KLEUR: Record<MarkeringSoort, string> = {
  fout: "text-error",
  waarschuwing: "text-warning",
  info: "text-info",
  afgeweken: "text-muted",
};

/** Breedte van de tooltip (`w-72`) en de ruimte tot de rand en tot de markering, in px. */
const BREEDTE_PX = 288;
const RAND_PX = 8;
const AFSTAND_PX = 6;
/** Zoveel ruimte boven de markering is nodig om de tooltip erboven te zetten. */
const RUIMTE_BOVEN_PX = 140;

const inhoud = computed(() =>
  props.tip ? markeringRegels(store.bevindingen, props.tip.nodeId, (b) => formatteerBericht(b, taal.value)) : null,
);

const stijl = computed(() => {
  if (!props.tip) return {};
  const { left, right, top, bottom } = props.tip.rect;
  const half = Math.min(BREEDTE_PX, window.innerWidth - 2 * RAND_PX) / 2;
  const midden = Math.min(Math.max((left + right) / 2, half + RAND_PX), window.innerWidth - half - RAND_PX);
  const boven = top > RUIMTE_BOVEN_PX;
  return {
    left: `${Math.round(midden)}px`,
    top: `${Math.round(boven ? top - AFSTAND_PX : bottom + AFSTAND_PX)}px`,
    transform: boven ? "translate(-50%, -100%)" : "translate(-50%, 0)",
  };
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="tip && inhoud && inhoud.regels.length"
      role="tooltip"
      data-testid="markering-tip"
      class="pointer-events-none fixed z-50 w-72 max-w-[calc(100vw-1rem)] rounded-md bg-default px-3 py-2 text-xs text-default shadow-lg ring ring-default"
      :style="stijl"
    >
      <ul class="flex flex-col gap-1.5">
        <li v-for="(regel, index) in inhoud.regels" :key="index" class="flex items-start gap-1.5" :data-ernst="regel.soort">
          <UIcon :name="ICOON[regel.soort]" class="mt-0.5 size-3.5 shrink-0" :class="KLEUR[regel.soort]" />
          <span class="min-w-0 break-words">{{ regel.tekst }}</span>
        </li>
      </ul>
      <p v-if="inhoud.meer" class="mt-1.5 text-muted">{{ $t("editor.bevindingen.nogMeer", { n: inhoud.meer }, inhoud.meer) }}</p>
    </div>
  </Teleport>
</template>
