<script setup lang="ts">
import { useEditorStore } from "~/stores/editor";

defineProps<{ percentage: number; kanFocus: boolean }>();
const emit = defineEmits<{ zoom: [factor: number]; passend: []; focus: [] }>();
const store = useEditorStore();
</script>
<template>
  <div class="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-md border border-neutral-300 bg-white p-1 text-neutral-900" role="group" :aria-label="$t('werkbaarheid.tekenen.zoom')" @pointerdown.stop @click.stop @keydown.stop @wheel.stop>
    <button type="button" class="canvas-knop" :title="$t('werkbaarheid.tekenen.uitzoomen')" :aria-label="$t('werkbaarheid.tekenen.uitzoomen')" @click="emit('zoom', 0.8)"><UIcon name="i-lucide-minus" class="size-4" /></button>
    <span class="min-w-10 text-center text-xs tabular-nums" data-testid="canvas-zoom">{{ percentage }}%</span>
    <button type="button" class="canvas-knop" :title="$t('werkbaarheid.tekenen.inzoomen')" :aria-label="$t('werkbaarheid.tekenen.inzoomen')" @click="emit('zoom', 1.25)"><UIcon name="i-lucide-plus" class="size-4" /></button>
    <button type="button" class="canvas-knop" :title="$t('editor.canvas.passendMaken')" :aria-label="$t('editor.canvas.passendMaken')" @click="emit('passend')"><UIcon name="i-lucide-scan" class="size-4" /></button>
    <button type="button" class="canvas-knop disabled:opacity-40" :disabled="!kanFocus" :title="$t('werkbaarheid.tekenen.focus')" :aria-label="$t('werkbaarheid.tekenen.focus')" @click="emit('focus')"><UIcon name="i-lucide-focus" class="size-4" /></button>
    <!-- Opent het sneltoetsenoverzicht, net als de toets ?. -->
    <button type="button" class="canvas-knop" :title="$t('editor.sneltoetsen.openen')" :aria-label="$t('editor.werkruimte.toetsenbordhulp')" aria-haspopup="dialog" data-testid="sneltoetsen-openen" @click="store.sneltoetsenOpen = true"><UIcon name="i-lucide-keyboard" class="size-4" /></button>
  </div>
</template>
<style scoped>
.canvas-knop { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; border-radius: 4px; cursor: pointer; }
.canvas-knop:hover { background: #f1f5f9; }
.canvas-knop:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 1px; }
@media (pointer: coarse) { .canvas-knop { min-width: 40px; min-height: 44px; } }
</style>
