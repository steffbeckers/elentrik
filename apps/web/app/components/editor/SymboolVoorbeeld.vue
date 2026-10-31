<script setup lang="ts">
import type { Node } from "@elentrik/model";
import { LIJNDIKTE_MM, tekenSymbool } from "@elentrik/symbols";

// Een symbool zoals op het schema, op schaal: `schaal` is het aantal px per mm. Puur decoratief
// (`aria-hidden`): de knop of kaart eromheen draagt de tekst.
const props = withDefaults(defineProps<{ node: Node; schaal?: number }>(), { schaal: 4 });

const symbool = computed(() => tekenSymbool(props.node));
</script>

<template>
  <!-- v-html is hier veilig: `symbols` escapet alle tekst in een symbool, net als in het schema. -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class="shrink-0"
    :viewBox="`0 0 ${symbool.maat.breedte} ${symbool.maat.hoogte}`"
    :width="symbool.maat.breedte * schaal"
    :height="symbool.maat.hoogte * schaal"
    fill="none"
    stroke="currentColor"
    :stroke-width="LIJNDIKTE_MM"
    aria-hidden="true"
    v-html="symbool.svg"
  />
</template>
