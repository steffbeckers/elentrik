<script setup lang="ts">
import { formatteerBericht, type Bevinding } from "@elentrik/arei";
import { groepeerBevindingen, herstelDoel } from "~/editor/bevindingengroepen";
import { useEditorStore } from "~/stores/editor";
const props = defineProps<{ bevinding: Bevinding }>();
const emit = defineEmits<{ terug: []; volgende: [bevinding: Bevinding]; sluiten: [] }>();
const store = useEditorStore();
const { taal } = useTaal();
const huidige = computed(() => store.bevindingen.find(b => b.regelId === props.bevinding.regelId && b.berichtSleutel === props.bevinding.berichtSleutel && b.nodeIds.some(id => props.bevinding.nodeIds.includes(id)) && !b.afgeweken));
const actief = computed(() => !!huidige.value);
const volgende = computed(() => {
  const groepen = groepeerBevindingen(store.bevindingen.filter(b => !b.afgeweken && b.regelId !== "arei.situatie.niet-geplaatst"), store.analyse);
  const index = groepen.findIndex(g => g.bevindingen.some(b => b.regelId === props.bevinding.regelId && b.nodeIds.some(id => props.bevinding.nodeIds.includes(id))));
  if (groepen.length === 1 && index === 0) return null;
  return groepen[(index + 1) % groepen.length]?.voorbeeld ?? null;
});
function gaVerder(): void {
  const b = volgende.value;
  if (!b) return;
  const doel = herstelDoel(b, store.analyse, store.document);
  const id = doel?.nodeId ?? b.nodeIds[0];
  if (id) store.selectie = [id];
  emit('volgende', b);
}
</script>
<template>
  <section class="border-b border-default bg-elevated p-3 text-sm" data-testid="actieve-bevinding">
    <div class="mb-2 flex items-center justify-between gap-2">
      <UButton color="neutral" variant="link" size="sm" icon="i-lucide-arrow-left" :label="$t('werkbaarheid.bevindingen.terug')" @click="emit('terug')" />
      <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" :aria-label="$t('werkbaarheid.bevindingen.sluiten')" @click="emit('sluiten')" />
    </div>
    <p v-if="huidige">{{ formatteerBericht(huidige, taal) }}</p>
    <p v-else role="status" class="text-success">{{ $t('werkbaarheid.bevindingen.opgelost') }}</p>
    <p v-if="actief && (bevinding.regelId === 'arei.differentieel.aanvullend' || bevinding.regelId === 'arei.differentieel.natte-ruimte')" class="mt-2 text-xs text-muted">{{ $t('werkbaarheid.bevindingen.differentieel') }}</p>
    <UButton v-if="volgende" class="mt-3" color="neutral" variant="outline" size="sm" icon="i-lucide-arrow-right" :label="$t('werkbaarheid.bevindingen.volgende')" @click="gaVerder" />
  </section>
</template>
