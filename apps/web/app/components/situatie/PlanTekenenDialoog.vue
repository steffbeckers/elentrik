<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { InstallatieDocument } from '@elentrik/model';
import AlleenLezenMelding from '~/components/editor/AlleenLezenMelding.vue';
import { useEditorStore } from '~/stores/editor';
import { useSituatieStore } from '~/stores/situatie';
import { useBestandenApi } from '~/composables/useBestandenApi';
import { useAlleenLezen } from '~/composables/useAlleenLezen';
import { laadPlanOp, uploadFoutMelding, isAfgebroken } from '~/situatie/plan-opladen';
import { leesPlanResultaat } from '~/situatie/plan-tekenen';

const props = defineProps<{ paginaId?: string }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ klaar: [id: string]; verwijderd: [] }>();
const editor = useEditorStore();
const situatie = useSituatieStore();
const bestanden = useBestandenApi();
const alleenLezen = useAlleenLezen();
const { t, locale } = useI18n();
const frame = ref<HTMLIFrameElement | null>(null);
const sessie = ref('');
const titel = ref('');
const bezig = ref(false);
const geladen = ref(false);
const fout = ref('');
const snapshot = shallowRef<InstallatieDocument | null>(null);
let projectId: string | null = null;
let controller: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const pagina = computed(() => snapshot.value?.situatie.paginas.find(p => p.id === props.paginaId));
const labels = computed(() => Object.fromEntries(['tools','select','wall','door','window','text','measure','undo','redo','delete','length','thickness','width','hint','exportError','loadError'].map(k => [k, t(`editor.situatie.tekenen.${k}`)])));

function reset() {
  controller?.abort(); controller = null; clearTimeout(timer);
  bezig.value = false; geladen.value = false; fout.value = '';
}
function start() {
  reset(); sessie.value = crypto.randomUUID(); snapshot.value = editor.document; projectId = editor.projectId;
  titel.value = pagina.value?.titel ?? t('editor.situatie.toevoegen.standaardTitel', { nummer: (editor.document?.situatie.paginas.length ?? 0) + 1 });
  timer = setTimeout(() => { if (!geladen.value) fout.value = t('editor.situatie.tekenen.loadError'); }, 20000);
}
watch(open, (value) => {
  if (value) { start(); window.addEventListener('message', receive); }
  else { reset(); window.removeEventListener('message', receive); }
});
onBeforeUnmount(() => { reset(); window.removeEventListener('message', receive); });

function init() {
  const p = pagina.value;
  frame.value?.contentWindow?.postMessage({ type: 'elentrik:init', session: sessie.value, title: titel.value, labels: labels.value,
    language: locale.value, project: p?.tekening?.project,
    previous: p?.tekening && p.achtergrond ? { kader: p.tekening.kader, breedte_px: p.achtergrond.breedte_px, hoogte_px: p.achtergrond.hoogte_px } : undefined }, window.location.origin);
}
function save() {
  if (!geladen.value || bezig.value || editor.alleenLezen || !titel.value.trim()) return;
  bezig.value = true; fout.value = '';
  frame.value?.contentWindow?.postMessage({ type: 'elentrik:save', session: sessie.value }, window.location.origin);
  clearTimeout(timer);
  timer = setTimeout(() => { bezig.value = false; fout.value = t('editor.situatie.tekenen.exportError'); }, 30000);
}
async function receive(event: MessageEvent) {
  if (!open.value || event.origin !== window.location.origin || event.source !== frame.value?.contentWindow) return;
  if (event.data?.type === 'elentrik:ready') { init(); return; }
  if (event.data?.session !== sessie.value) return;
  if (event.data?.type === 'elentrik:changed') { geladen.value = true; clearTimeout(timer); return; }
  if (event.data?.type === 'elentrik:error') { clearTimeout(timer); bezig.value = false; fout.value = t('editor.situatie.tekenen.exportError'); return; }
  if (event.data?.type === 'elentrik:save-request') { save(); return; }
  if (event.data?.type !== 'elentrik:result' || !bezig.value || controller) return;
  clearTimeout(timer);
  const data = leesPlanResultaat(event.data, sessie.value);
  if (!data) { bezig.value = false; fout.value = t('editor.situatie.tekenen.exportError'); return; }
  if (editor.alleenLezen || !projectId || editor.projectId !== projectId) { bezig.value = false; return; }
  const afbreker = new AbortController(); controller = afbreker;
  const token = sessie.value;
  try {
    const raster = new Blob([data.png], { type: 'image/png' });
    const achtergrond = await laadPlanOp(bestanden, projectId, { origineel: raster, raster, naam: `${titel.value.trim()}.png` }, afbreker.signal);
    if (afbreker.signal.aborted || token !== sessie.value || editor.alleenLezen) return;
    if (editor.document !== snapshot.value || editor.projectId !== projectId) {
      fout.value = t('editor.situatie.tekenen.changed'); return;
    }
    const id = situatie.bewaarTekening(titel.value.trim(), achtergrond, data.tekening, props.paginaId);
    if (id) { open.value = false; emit('klaar', id); }
    // Over de gratis limiet: de dialoog sluit, zodat het limietvenster te zien is.
    else if (editor.limietGeweigerd) open.value = false;
  } catch (error) {
    if (afbreker.signal.aborted || isAfgebroken(error) || token !== sessie.value) return;
    const key = await uploadFoutMelding(error, alleenLezen, () => { emit('verwijderd'); open.value = false; });
    if (key) fout.value = key === 'opslagVol' ? t('fouten.OPSLAG_VOL') : t(`editor.situatie.toevoegen.fout.${key}`);
  } finally { if (token === sessie.value) { controller = null; bezig.value = false; } }
}
</script>

<template>
  <UModal v-model:open="open" fullscreen :dismissible="false" :close="false" :title="$t(paginaId ? 'editor.situatie.tekenen.edit' : 'editor.situatie.tekenen.new')" :description="$t('editor.situatie.tekenen.description')" :ui="{ body: 'p-0 sm:p-0 flex-1 min-h-0 flex flex-col', content: 'flex flex-col', footer: 'shrink-0' }">
    <template #body>
      <AlleenLezenMelding class="mx-4 mt-2" />
      <div v-if="fout" role="alert" class="px-4 py-2 text-error">{{ fout }}</div>
      <div v-if="!geladen && !fout" role="status" class="px-4 py-2 text-muted">{{ $t('editor.situatie.tekenen.loading') }}</div>
      <iframe v-if="open" :key="sessie" ref="frame" src="/plan-editor/index.html" :title="$t('editor.situatie.tekenen.new')" class="min-h-0 w-full flex-1 border-0" :inert="bezig || editor.alleenLezen" sandbox="allow-scripts allow-same-origin" @load="init" />
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center gap-3">
        <UFormField :label="$t('editor.situatie.tekenen.name')" class="min-w-48 flex-1">
          <UInput v-model="titel" :disabled="!!paginaId || bezig || editor.alleenLezen" class="w-full" maxlength="120" />
        </UFormField>
        <p class="max-w-md text-xs text-muted">{{ $t('editor.situatie.tekenen.cancelHint') }}</p>
        <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="open = false" />
        <UButton data-testid="plan-tekenen-bewaren" :label="$t('editor.situatie.tekenen.use')" :loading="bezig" :disabled="!geladen || editor.alleenLezen || !titel.trim()" @click="save" />
      </div>
    </template>
  </UModal>
</template>
