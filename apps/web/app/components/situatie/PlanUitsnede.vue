<script setup lang="ts">
export type UitsnedeConcept = { titel: string; pdfPagina?: number; x: number; y: number; breedte: number; hoogte: number; rotatie: 0 | 90 | 180 | 270; referentie: boolean };
const concept = defineModel<UitsnedeConcept>({ required: true });
defineProps<{ url?: string | null; disabled?: boolean }>();
const emit = defineEmits<{ verwijder: [] }>();
const { t } = useI18n();
const velden = ['x', 'y', 'breedte', 'hoogte'] as const;
</script>
<template>
  <fieldset :disabled="disabled" class="space-y-3 border-t border-default pt-4" data-testid="plan-uitsnede">
    <div class="flex items-end gap-2">
      <UFormField :label="t('editor.situatie.uitsnede.naam')" class="min-w-0 flex-1"><UInput v-model="concept.titel" class="w-full" /></UFormField>
      <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" :aria-label="t('editor.situatie.uitsnede.verwijder')" @click="emit('verwijder')" />
    </div>
    <div v-if="url" class="relative mx-auto max-w-xl overflow-hidden bg-elevated">
      <img :src="url" :alt="concept.titel" class="block w-full" />
      <svg class="absolute inset-0 h-full w-full text-primary" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path :d="`M0 0H100V100H0Z M${concept.x} ${concept.y}v${concept.hoogte}h${concept.breedte}v-${concept.hoogte}Z`" fill="black" fill-opacity=".45" fill-rule="evenodd" />
        <rect :x="concept.x" :y="concept.y" :width="concept.breedte" :height="concept.hoogte" fill="none" stroke="currentColor" stroke-width=".8" />
      </svg>
    </div>
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <UFormField v-for="veld in velden" :key="veld" :label="t(`editor.situatie.uitsnede.${veld}`)">
        <UInput v-model.number="concept[veld]" type="number" :min="veld === 'x' || veld === 'y' ? 0 : 1" max="100" step="1" class="w-full" />
      </UFormField>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <UButton icon="i-lucide-rotate-cw" color="neutral" variant="outline" :label="`${t('editor.situatie.uitsnede.draai')} (${concept.rotatie}°)`" @click="concept.rotatie = ((concept.rotatie + 90) % 360) as 0 | 90 | 180 | 270" />
      <UCheckbox v-model="concept.referentie" :label="t('editor.situatie.uitsnede.referentie')" />
    </div>
  </fieldset>
</template>
