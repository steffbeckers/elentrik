<script setup lang="ts">
import AfdrukVoorbeeld from "~/components/editor/AfdrukVoorbeeld.vue";
import AfdrukInstellingen from "./AfdrukInstellingen.vue";
import PlanOpmaakVelden from "./PlanOpmaakVelden.vue";
import { schemaKeuzes } from "~/editor/schema-navigatie";
import { useEditorStore } from "~/stores/editor";
import { useSituatieStore } from "~/stores/situatie";

const editor = useEditorStore();
const situatie = useSituatieStore();
const { t } = useI18n();
const voorbeeldOpen = ref(false);
const instellingenOpen = ref(false);
const versie = ref("Concept");
const pagina = computed(() => situatie.actievePagina);
const paginas = computed(() => (editor.document?.situatie.paginas ?? []).filter(p => p.achtergrond && !p.referentie));
const puntId = useId();
const paginaId = useId();
const keuzes = computed(() => {
  if (!editor.document || !editor.analyse) return [];
  const ids = new Set(pagina.value?.plaatsingen.map(p => p.nodeId));
  return schemaKeuzes(editor.document, editor.analyse, type => t(`editor.types.${type}`)).filter(k => ids.has(k.id));
});
const geselecteerd = computed({
  get: () => editor.selectie.length === 1 && keuzes.value.some(k => k.id === editor.selectie[0]) ? editor.selectie[0]! : "",
  set: (id: string) => { editor.selectie = id ? [id] : []; },
});
const onderdelen = { eendraadschema: false, situatieschema: true, kringenlijst: false, bijlage: false };
</script>

<template>
  <div>
    <div class="space-y-2 p-3 pb-0">
      <UButton color="neutral" variant="outline" icon="i-lucide-printer" class="w-full justify-center" :disabled="!pagina?.achtergrond || pagina.referentie" data-testid="plan-afdruk-opmaken" :label="t('editor.situatie.opmaak.afdrukBewerken')" @click="voorbeeldOpen = true" />
      <p class="text-xs text-muted">{{ t('editor.situatie.opmaak.afdrukHint') }}</p>
    </div>
    <PlanOpmaakVelden />
    <AfdrukVoorbeeld v-model:open="voorbeeldOpen" :papier="pagina?.afdruk?.papier ?? 'A4'" :onderdelen="onderdelen" :versie="versie" :pagina-id="pagina?.id">
      <template #opmaak>
        <div class="space-y-4 p-3">
          <div class="space-y-1">
            <label :for="paginaId" class="text-sm font-medium">{{ t('editor.situatie.opmaak.afdrukPagina') }}</label>
            <select :id="paginaId" v-model="situatie.actievePaginaId" class="min-h-10 w-full min-w-0 rounded border border-default bg-default px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" data-testid="afdruk-pagina">
              <option v-for="p in paginas" :key="p.id" :value="p.id">{{ p.titel }}</option>
            </select>
          </div>
          <UButton color="neutral" variant="outline" data-testid="afdruk-instellingen-open" :label="t('editor.situatie.afdruk.titel')" @click="instellingenOpen = true" />
          <UFormField :label="t('editor.export.versie')"><UInput v-model="versie" maxlength="40" class="w-full" /></UFormField>
          <div class="space-y-1">
            <label :for="puntId" class="text-sm font-medium">{{ t('editor.situatie.opmaak.afdrukPunt') }}</label>
            <select :id="puntId" v-model="geselecteerd" class="min-h-10 w-full min-w-0 rounded border border-default bg-default px-2 text-sm focus-visible:outline-2 focus-visible:outline-primary" data-testid="afdruk-punt">
              <option value="">{{ t('editor.situatie.opmaak.kiesLabel') }}</option>
              <option v-for="k in keuzes" :key="k.id" :value="k.id">{{ k.label }}</option>
            </select>
          </div>
          <p class="text-xs text-muted">{{ t('editor.situatie.opmaak.afdrukBewaren') }}</p>
        </div>
        <PlanOpmaakVelden />
      </template>
    </AfdrukVoorbeeld>
    <AfdrukInstellingen v-model:open="instellingenOpen" :pagina="pagina" />
  </div>
</template>
