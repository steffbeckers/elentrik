<script setup lang="ts">
import { printHtml } from "@elentrik/render";
import type { Partij } from "@elentrik/model";
import { useBedrijfApi } from "~/composables/useBedrijfApi";
import { useEditorStore } from "~/stores/editor";
import type { ExportOnderdelen, Papierformaat } from "../../../shared/exports";
const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ papier: Papierformaat; onderdelen: ExportOnderdelen; versie: string; paginaId?: string }>();
const slots = useSlots();
const editor = useEditorStore();
const api = useBedrijfApi();
const { t } = useI18n();
const bedrijf = ref<Partij>();
const fout = ref(false);
const zoom = ref(100);
const frame = useTemplateRef<HTMLIFrameElement>('frame');
const colorMode = useColorMode();
let scroll = { x: 0, y: 0 };
let geladenPagina: string | undefined;
async function laadBedrijf() {
 bedrijf.value = undefined; fout.value = false;
 try { bedrijf.value = await api.haal(); } catch { fout.value = true; }
}
watch(open, waarde => {
 if (!waarde) return;
 zoom.value = slots.opmaak ? 50 : 100;
 scroll = { x: 0, y: 0 }; geladenPagina = undefined;
 void laadBedrijf();
});
/**
 * De tafel achter de bladen en hun rand volgen de semantische Nuxt UI-kleuren van de app (ook in dark mode).
 * Het voorbeeld is een los document in een iframe: daar bestaan die variabelen niet, dus geef hun waarde mee.
 * Het blad zelf blijft wit, zoals op papier.
 */
function tafelVariabelen(): string {
 void colorMode.value;
 const stijl = import.meta.client ? getComputedStyle(document.documentElement) : undefined;
 const kleur = (naam: string) => stijl?.getPropertyValue(naam).trim().replace(/[<>;{}]/g, '') || 'color-mix(in srgb, CanvasText 15%, Canvas)';
 return `--afdruk-tafel:${kleur('--ui-bg-accented')};--afdruk-bladrand:${kleur('--ui-border-accented')}`;
}
const html = computed(() => {
 const doc = editor.document;
 if (!open.value || !doc || !editor.analyse || !bedrijf.value) return '';
 const afbeeldingen = Object.fromEntries(doc.situatie.paginas.flatMap(p => p.achtergrond ? [[p.achtergrond.rasterBestandId, `/api/bestanden/${p.achtergrond.rasterBestandId}`]] : []));
 try {
  const r = printHtml(doc, editor.analyse, editor.bevindingen, {
   papier: props.papier, onderdelen: props.onderdelen, versieLabel: props.versie, datum: doc.meta.datum || new Date().toISOString().slice(0, 10), taal: doc.meta.dossierTaal ?? 'nl', installateur: bedrijf.value, afbeeldingen,
   ...(bedrijf.value.logoBestandId ? { logo: `/api/bestanden/${bedrijf.value.logoBestandId}` } : {}),
  });
  return r.html.replace('</style>', `@media screen{:root{${tafelVariabelen()}}body{zoom:${zoom.value / 100};background:var(--afdruk-tafel)}.pagina{background:white;margin:12px;outline:1px solid var(--afdruk-bladrand)}}</style>`);
 } catch { return ''; }
});
// A srcdoc refresh follows every saved layout edit. Keep the view on the same part of the plan.
watch([html, () => props.paginaId], ([nieuwHtml], [oudHtml]) => {
 if (nieuwHtml !== oudHtml) {
  const w = frame.value?.contentWindow;
  if (w) scroll = { x: w.scrollX, y: w.scrollY };
  // The new page may also change paper size. Navigate only after this srcdoc has loaded.
 } else herstelWeergave();
}, { flush: 'pre' });
function herstelWeergave() {
 const w = frame.value?.contentWindow;
 if (!w) return;
 if (props.paginaId && props.paginaId !== geladenPagina) {
  const blad = Array.from(w.document.querySelectorAll<HTMLElement>('[data-situatie-pagina-id]'))
   .find(el => el.dataset.situatiePaginaId === props.paginaId);
  if (blad) {
   blad.closest('section')?.scrollIntoView({ block: 'start' });
   geladenPagina = props.paginaId;
  }
 } else w.scrollTo(scroll.x, scroll.y);
}
</script>
<template>
 <UModal v-model:open="open" fullscreen :title="t('editor.situatie.afdruk.voorbeeld')" :description="t('editor.situatie.afdruk.uitleg')">
  <template #body>
   <div class="h-full min-h-0" :class="slots.opmaak ? 'grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]' : 'flex flex-col'">
    <aside v-if="slots.opmaak" class="max-h-[42vh] min-w-0 overflow-y-auto border-b border-default pb-3 lg:max-h-none lg:border-b-0 lg:border-r lg:pr-4" :aria-label="t('editor.situatie.opmaak.titel')"><slot name="opmaak" /></aside>
    <div class="flex min-h-[40vh] min-w-0 flex-1 flex-col gap-3 lg:min-h-0">
    <UFormField :label="t('editor.situatie.afdruk.zoom')"><URadioGroup v-model="zoom" orientation="horizontal" :items="[50, 75, 100].map(value => ({ value, label: `${value}%` }))" /></UFormField>
    <div v-if="fout || (bedrijf && !html)" role="alert" class="space-y-3"><p class="text-error">{{ t('editor.export.mislukt') }}</p><UButton v-if="fout" color="neutral" variant="outline" :label="t('editor.situatie.opmaak.opnieuwLaden')" @click="laadBedrijf" /></div>
    <iframe v-else-if="html" ref="frame" :srcdoc="html" sandbox="allow-same-origin" :title="t('editor.situatie.afdruk.voorbeeld')" class="min-h-[30vh] w-full flex-1 border border-default" data-testid="afdrukvoorbeeld" @load="herstelWeergave" />
    <UProgress v-else animation="carousel" />
    </div>
   </div>
  </template>
 </UModal>
</template>
