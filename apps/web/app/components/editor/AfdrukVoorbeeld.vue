<script setup lang="ts">
import { printHtml } from "@elentrik/render";
import type { Partij } from "@elentrik/model";
import { useBedrijfApi } from "~/composables/useBedrijfApi";
import { useEditorStore } from "~/stores/editor";
import type { ExportOnderdelen, Papierformaat } from "../../../shared/exports";
const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ papier: Papierformaat; onderdelen: ExportOnderdelen; versie: string }>();
const editor = useEditorStore();
const api = useBedrijfApi();
const { t } = useI18n();
const bedrijf = ref<Partij>();
const fout = ref(false);
const zoom = ref(100);
watch(open, async waarde => {
 if (!waarde) return;
 bedrijf.value = undefined; fout.value = false; zoom.value = 100;
 try { bedrijf.value = await api.haal(); } catch { fout.value = true; }
});
const html = computed(() => {
 const doc = editor.document;
 if (!doc || !editor.analyse || !bedrijf.value) return '';
 const afbeeldingen = Object.fromEntries(doc.situatie.paginas.flatMap(p => p.achtergrond ? [[p.achtergrond.rasterBestandId, `/api/bestanden/${p.achtergrond.rasterBestandId}`]] : []));
 try {
  const r = printHtml(doc, editor.analyse, editor.bevindingen, {
   papier: props.papier, onderdelen: props.onderdelen, versieLabel: props.versie, datum: doc.meta.datum || new Date().toISOString().slice(0, 10), taal: doc.meta.dossierTaal ?? 'nl', installateur: bedrijf.value, afbeeldingen,
   ...(bedrijf.value.logoBestandId ? { logo: `/api/bestanden/${bedrijf.value.logoBestandId}` } : {}),
  });
  return r.html.replace('</style>', `@media screen{body{zoom:${zoom.value / 100};background:#e2e8f0}.pagina{background:white;margin:12px;outline:1px solid #64748b}}</style>`);
 } catch { return ''; }
});
</script>
<template>
 <UModal v-model:open="open" fullscreen :title="t('editor.situatie.afdruk.voorbeeld')" :description="t('editor.situatie.afdruk.uitleg')">
  <template #body>
   <div class="flex h-full min-h-0 flex-col gap-3">
    <UFormField :label="t('editor.situatie.afdruk.zoom')"><URadioGroup v-model="zoom" orientation="horizontal" :items="[50, 75, 100].map(value => ({ value, label: `${value}%` }))" /></UFormField>
    <p v-if="fout || (bedrijf && !html)" class="text-error">{{ t('editor.export.mislukt') }}</p>
    <iframe v-else-if="html" :srcdoc="html" sandbox="allow-same-origin" :title="t('editor.situatie.afdruk.voorbeeld')" class="min-h-[65vh] w-full flex-1 border border-default" data-testid="afdrukvoorbeeld" />
    <UProgress v-else animation="carousel" />
   </div>
  </template>
 </UModal>
</template>
