<script setup lang="ts">
import type { SituatiePagina } from "@elentrik/model";
import { useSituatieStore } from "~/stores/situatie";
import { useEditorStore } from "~/stores/editor";
const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ pagina?: SituatiePagina }>();
const situatie = useSituatieStore();
const editor = useEditorStore();
const { t } = useI18n();
const concept = ref<NonNullable<SituatiePagina['afdruk']>>({ papier: 'A4', orientatie: 'liggend', schaalmodus: 'passend', schaalNoemer: 100 });
watch(open, waarde => { if (waarde) concept.value = { papier: 'A4', orientatie: 'liggend', schaalmodus: 'passend', schaalNoemer: 100, ...props.pagina?.afdruk }; });
const kalibratie = computed(() => (props.pagina?.achtergrond?.schaal?.mmPerPx ?? 0) > 0);
const geldig = computed(() => concept.value.schaalmodus === 'passend' || (kalibratie.value && Number.isFinite(concept.value.schaalNoemer) && (concept.value.schaalNoemer ?? 0) > 0));
function bewaar() { if (props.pagina && geldig.value && !editor.alleenLezen) { situatie.zetAfdruk(props.pagina.id, concept.value); open.value = false; } }
</script>
<template>
  <UModal v-model:open="open" :title="t('editor.situatie.afdruk.titel')" :description="pagina?.titel">
    <template #body>
      <div class="space-y-4">
        <UFormField :label="t('editor.situatie.afdruk.papier')"><URadioGroup v-model="concept.papier" orientation="horizontal" :items="['A4', 'A3']" /></UFormField>
        <UFormField :label="t('editor.situatie.afdruk.orientatie')"><URadioGroup v-model="concept.orientatie" orientation="horizontal" :items="(['staand', 'liggend'] as const).map(value => ({ value, label: t(`editor.situatie.afdruk.${value}`) }))" /></UFormField>
        <UFormField :label="t('editor.situatie.afdruk.schaal')"><URadioGroup v-model="concept.schaalmodus" :items="(['passend', 'gekalibreerd'] as const).map(value => ({ value, label: t(`editor.situatie.afdruk.${value}`), disabled: value === 'gekalibreerd' && !kalibratie }))" /></UFormField>
        <UFormField v-if="concept.schaalmodus === 'gekalibreerd'" :label="t('editor.situatie.afdruk.noemer')"><UInput v-model.number="concept.schaalNoemer" type="number" min="1" /></UFormField>
        <p class="text-sm text-muted">{{ t(`editor.situatie.afdruk.${concept.schaalmodus === 'passend' ? 'passendMelding' : 'kalibratieMelding'}`) }}</p>
        <p v-if="!kalibratie" class="text-sm text-warning">{{ t('editor.situatie.afdruk.ontbreekt') }}</p>
      </div>
    </template>
    <template #footer><div class="flex w-full justify-end gap-2"><UButton color="neutral" variant="outline" :label="t('algemeen.annuleren')" @click="open = false" /><UButton :label="t('editor.situatie.afdruk.bewaren')" :disabled="!geldig || editor.alleenLezen" @click="bewaar" /></div></template>
  </UModal>
</template>
