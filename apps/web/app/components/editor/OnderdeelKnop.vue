<script setup lang="ts">
import type { Onderdeel } from "@elentrik/model";
import SymboolVoorbeeld from "~/components/editor/SymboolVoorbeeld.vue";
import { ONDERDEEL_PER_TOETS } from "~/composables/sneltoetsen";
import { useSymboolNamen } from "~/composables/useSymboolNamen";
import { KAARTEN, voorbeeldNode, wijktAf } from "~/editor/symbolen";
import { BEGIN_VOORINSTELLINGEN, useEditorStore } from "~/stores/editor";

// Eén onderdeel in het paneel Onderdelen: het symbool van de huidige voorinstelling, de naam en de
// sneltoets. Wijkt de voorinstelling af van de beginwaarde, dan staan een korte tekst en de knop
// Standaard eronder.
const props = defineProps<{ onderdeel: Onderdeel }>();

const store = useEditorStore();
const { variantTekst } = useSymboolNamen();

const toets = Object.entries(ONDERDEEL_PER_TOETS)
  .find(([, onderdeel]) => onderdeel === props.onderdeel)?.[0]
  ?.toUpperCase();

const variant = computed(() => {
  const kaart = KAARTEN.find((k) => k.onderdeel === props.onderdeel)!;
  const voorinstelling = store.voorinstellingen[props.onderdeel] ?? {};
  return {
    node: voorbeeldNode(kaart, voorinstelling),
    afwijkend: wijktAf(kaart, voorinstelling, BEGIN_VOORINSTELLINGEN[props.onderdeel] ?? {}),
    tekst: variantTekst(kaart, voorinstelling),
  };
});
</script>

<template>
  <UButton
    block
    :color="store.onderdeel === onderdeel ? 'primary' : 'neutral'"
    :variant="store.onderdeel === onderdeel ? 'soft' : 'ghost'"
    :aria-pressed="store.onderdeel === onderdeel"
    :disabled="store.alleenLezen"
    :data-testid="`onderdeel-${onderdeel}`"
    class="gap-2"
    @click="store.onderdeel = onderdeel"
  >
    <span class="flex size-8 shrink-0 items-center justify-center">
      <SymboolVoorbeeld :node="variant.node" :schaal="2" class="max-h-full max-w-full" />
    </span>
    <span class="flex-1 text-left">{{ $t(`editor.onderdelen.${onderdeel}`) }}</span>
    <UKbd v-if="toets" :value="toets" />
    <span v-else class="text-muted">{{ $t("editor.onderdelenPaneel.geenSneltoets") }}</span>
  </UButton>
  <!-- De toestelsoort staat al in de keuzelijst eronder; alleen de knop Standaard. -->
  <div
    v-if="variant.afwijkend"
    class="mt-0.5 mb-1 flex items-center gap-1 pr-1 pl-12 text-xs text-muted"
    :data-testid="`variant-${onderdeel}`"
  >
    <span v-if="onderdeel !== 'toestel'" class="min-w-0 flex-1 truncate" :title="variant.tekst">
      {{ variant.tekst }}
    </span>
    <UButton
      color="neutral"
      variant="link"
      size="xs"
      class="ml-auto shrink-0"
      :label="$t('editor.symbolen.standaard')"
      :disabled="store.alleenLezen"
      :data-testid="`standaard-${onderdeel}`"
      @click="store.zetStandaard(onderdeel)"
    />
  </div>
</template>
