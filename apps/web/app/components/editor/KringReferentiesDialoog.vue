<script setup lang="ts">
import { dupliceerKring, DocumentFout } from '@elentrik/model';
import { useEditorStore } from '~/stores/editor';

const open = defineModel<boolean>('open', { default: false });
const store = useEditorStore();
const voerUit = useDocumentFoutMelding();
const code = ref('');
const vastgelegd = ref(false);
watch(open, () => { code.value = ''; vastgelegd.value = false; });
const kring = computed(() => store.selectie.length === 1 ? store.analyse?.kringen.find(k => k.id === store.analyse?.kringVanNode[store.selectie[0]!]) : undefined);
const duplicaat = computed(() => {
  if (!store.document || !kring.value || !code.value) return undefined;
  try { return dupliceerKring(store.document, kring.value.id, code.value); }
  catch (fout) { if (fout instanceof DocumentFout) return undefined; throw fout; }
});
function behoud() {
  if (store.alleenLezen) return;
  if (voerUit(() => store.legKringCodesVast())) vastgelegd.value = true;
}
function hernummer() {
  if (store.alleenLezen) return;
  if (voerUit(() => store.hernummerKringen())) open.value = false;
}
function dupliceer() {
  if (store.alleenLezen || !duplicaat.value) return;
  const resultaat = duplicaat.value;
  if (voerUit(() => store.pasToe(resultaat))) { store.selectie = [resultaat.id]; open.value = false; }
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.referenties.titel')">
    <template #body>
      <div class="space-y-6">
        <section class="space-y-3">
          <p class="text-sm text-muted">{{ $t('editor.referenties.behoudUitleg') }}</p>
          <UButton color="neutral" variant="outline" :disabled="store.alleenLezen || !store.hernummerVoorbeeld.length" data-testid="referenties-vastleggen" @click="behoud">{{ $t('editor.referenties.behouden') }}</UButton>
          <p v-if="vastgelegd" role="status" class="text-sm">{{ $t('editor.referenties.vastgelegd') }}</p>
        </section>
        <section class="space-y-3">
          <h3 class="font-semibold">{{ $t('editor.referenties.hernummeren') }}</h3>
          <p class="text-sm text-muted">{{ $t('editor.referenties.hernummerUitleg') }}</p>
          <div class="max-h-52 overflow-auto">
            <table class="w-full text-left text-sm" data-testid="hernummer-voorbeeld">
              <thead><tr><th scope="col">{{ $t('editor.referenties.huidig') }}</th><th scope="col">{{ $t('editor.referenties.nieuw') }}</th></tr></thead>
              <tbody><tr v-for="rij in store.hernummerVoorbeeld" :key="rij.nodeId"><td class="py-1">{{ rij.oud }}</td><td>{{ rij.nieuw }}</td></tr></tbody>
            </table>
          </div>
          <UButton color="neutral" variant="outline" :disabled="store.alleenLezen || !store.hernummerVoorbeeld.length" data-testid="referenties-hernummeren" @click="hernummer">{{ $t('editor.referenties.bevestigen') }}</UButton>
        </section>
        <section v-if="kring" class="space-y-3">
          <h3 class="font-semibold">{{ $t('editor.referenties.dupliceren', { code: kring.label }) }}</h3>
          <UFormField :label="$t('editor.referenties.vrijeCode')" :error="code && !duplicaat ? $t('editor.referenties.codeOngeldig') : undefined">
            <UInput v-model="code" :disabled="store.alleenLezen" class="w-full" data-testid="duplicaat-kringcode" />
          </UFormField>
          <UButton :disabled="store.alleenLezen || !duplicaat" data-testid="kring-dupliceren" @click="dupliceer">{{ $t('editor.referenties.maakKopie') }}</UButton>
        </section>
      </div>
    </template>
    <template #footer><UButton class="ml-auto" color="neutral" variant="outline" @click="open = false">{{ $t('editor.invoegen.annuleren') }}</UButton></template>
  </UModal>
</template>
