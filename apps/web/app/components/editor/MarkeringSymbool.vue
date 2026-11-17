<script setup lang="ts">
import { MARKERING_KLASSE, markeringVorm, type MarkeringSoort } from "~/editor/markeringen";

/**
 * Eén statusmarkering als SVG-groep: kleur én vorm per ernst (zie `markeringVorm`). Met `raakbaar`
 * krijgt ze een onzichtbaar raakvlak dat ruimer is dan het teken, voor de tooltip in het canvas.
 */
const props = defineProps<{ soort: MarkeringSoort; x: number; y: number; r: number; raakbaar?: boolean }>();
const vorm = computed(() => markeringVorm(props.soort, props.x, props.y, props.r));
</script>

<template>
  <g :class="MARKERING_KLASSE[soort]">
    <circle v-if="raakbaar" :cx="x" :cy="y" :r="r * 2" fill="none" pointer-events="all" />
    <path :d="vorm.vorm" />
    <path :d="vorm.teken" fill="none" class="stroke-white" :stroke-width="r * 0.3" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</template>
