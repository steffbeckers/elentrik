<script setup lang="ts">
import { useDocumentFoutMelding } from "~/composables/useDocumentFoutMelding";
import { leesPlanGetal } from "~/situatie/bediening";
import { useEditorStore } from "~/stores/editor";
import { useSituatieStore } from "~/stores/situatie";

const editor = useEditorStore();
const situatie = useSituatieStore();
const voerUit = useDocumentFoutMelding();
const pagina = computed(() => situatie.actievePagina);
const plaatsing = computed(() => editor.selectie.length === 1
  ? pagina.value?.plaatsingen.find((p) => p.nodeId === editor.selectie[0])
  : undefined);
const velden = ["symboolSchaal", "labelSchaal", "x", "y"] as const;
type Veld = typeof velden[number];
const invoer = reactive<Record<Veld, string>>({ symboolSchaal: "100", labelSchaal: "100", x: "0", y: "0" });
const fouten = reactive<Record<Veld, boolean>>({ symboolSchaal: false, labelSchaal: false, x: false, y: false });
const heeftFout = computed(() => velden.some(veld => fouten[veld]));
const prefix = useId();
const grootteVelden = [
  { veld: "symboolSchaal", label: "symbolen", testid: "plan-symboolgrootte" },
  { veld: "labelSchaal", label: "labels", testid: "plan-labelgrootte" },
] as const;

function herstelInvoer(): void {
  invoer.symboolSchaal = String(Math.round((pagina.value?.symboolSchaal ?? 1) * 10000) / 100);
  invoer.labelSchaal = String(Math.round((pagina.value?.labelSchaal ?? 1) * 10000) / 100);
  invoer.x = String(plaatsing.value?.labelOffset?.x ?? 0);
  invoer.y = String(plaatsing.value?.labelOffset?.y ?? 0);
  for (const veld of velden) fouten[veld] = false;
}

watch(() => [pagina.value?.id, pagina.value?.symboolSchaal, pagina.value?.labelSchaal,
  plaatsing.value?.nodeId, plaatsing.value?.labelOffset?.x, plaatsing.value?.labelOffset?.y], herstelInvoer, { immediate: true });

function lees(veld: Veld): number | null {
  const waarde = leesPlanGetal(invoer[veld], veld === "x" || veld === "y" ? "offset" : "percentage");
  fouten[veld] = waarde === null;
  return waarde;
}

function werkInvoerBij(veld: Veld, event: Event): void {
  invoer[veld] = (event.target as HTMLInputElement).value;
  if (fouten[veld]) lees(veld);
}

function bewaar(veld: Veld): void {
  if (editor.alleenLezen || !pagina.value) return;
  const waarde = lees(veld);
  if (waarde === null) return;
  const p = pagina.value;
  if (veld === "symboolSchaal" || veld === "labelSchaal") {
    voerUit(() => situatie.zetPaginaOpmaak(p.id, { [veld]: waarde / 100 }));
  } else if (plaatsing.value) {
    const geselecteerd = plaatsing.value;
    const offset = geselecteerd.labelOffset ?? { x: 0, y: 0 };
    voerUit(() => situatie.zetLabelOffset(p.id, geselecteerd.nodeId, { ...offset, [veld]: waarde }));
  }
}

function herstelLabel(): void {
  const p = pagina.value;
  const geselecteerd = plaatsing.value;
  if (p && geselecteerd && !editor.alleenLezen) {
    voerUit(() => situatie.zetLabelOffset(p.id, geselecteerd.nodeId, { x: 0, y: 0 }));
    herstelInvoer();
  }
}
</script>

<template>
  <section data-testid="plan-opmaak" class="min-w-0 p-3 text-sm" :aria-label="$t('editor.situatie.opmaak.titel')">
    <h2 class="font-semibold">{{ $t("editor.situatie.opmaak.titel") }}</h2>
    <fieldset :disabled="editor.alleenLezen || !pagina?.achtergrond" class="mt-4 min-w-0 space-y-4 disabled:opacity-60">
      <div v-for="item in grootteVelden" :key="item.veld">
        <label :for="`${prefix}-${item.veld}`" class="flex items-center justify-between gap-3">
          <span>{{ $t(`editor.situatie.opmaak.${item.label}`) }}</span>
          <span class="flex shrink-0 items-center gap-1">
            <input
              :id="`${prefix}-${item.veld}`"
              :value="invoer[item.veld]"
              type="number" min="25" max="400" step="any"
              :data-testid="item.testid"
              :aria-invalid="fouten[item.veld]"
              :aria-describedby="fouten[item.veld] ? `${prefix}-${item.veld}-fout` : `${prefix}-bereik`"
              class="min-h-10 w-20 rounded border border-default bg-default px-2 py-1 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              @input="werkInvoerBij(item.veld, $event)"
              @change="bewaar(item.veld)"
              @blur="bewaar(item.veld)"
              @keydown.enter.prevent="bewaar(item.veld)"
            >
            %
          </span>
        </label>
        <p v-if="fouten[item.veld]" :id="`${prefix}-${item.veld}-fout`" role="alert" class="mt-1 text-sm text-error">{{ $t('editor.situatie.opmaak.ongeldigPercentage') }}</p>
      </div>
      <p :id="`${prefix}-bereik`" class="text-xs text-muted">{{ $t("editor.situatie.opmaak.paginaHint") }} {{ $t('editor.situatie.opmaak.bereik') }}</p>
      <div class="space-y-3 border-t border-default pt-4">
        <h3 class="font-medium">{{ $t("editor.situatie.opmaak.labelPositie") }}</h3>
        <template v-if="plaatsing">
          <div v-for="as in (['x', 'y'] as const)" :key="as">
            <label :for="`${prefix}-${as}`" class="flex items-center justify-between gap-3">
              <span>{{ $t(`editor.situatie.opmaak.offset${as.toUpperCase()}`) }}</span>
              <span class="flex shrink-0 items-center gap-1">
                <input
                  :id="`${prefix}-${as}`"
                  :value="invoer[as]"
                  type="number" step="any"
                  :data-testid="`plan-label-offset-${as}`"
                  :aria-invalid="fouten[as]"
                  :aria-describedby="fouten[as] ? `${prefix}-${as}-fout` : `${prefix}-offset-hint`"
                  class="min-h-10 w-20 rounded border border-default bg-default px-2 py-1 tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  @input="werkInvoerBij(as, $event)"
                  @change="bewaar(as)"
                  @blur="bewaar(as)"
                  @keydown.enter.prevent="bewaar(as)"
                >
                px
              </span>
            </label>
            <p v-if="fouten[as]" :id="`${prefix}-${as}-fout`" role="alert" class="mt-1 text-sm text-error">{{ $t('editor.situatie.opmaak.ongeldigeOffset') }}</p>
          </div>
          <p :id="`${prefix}-offset-hint`" class="text-xs text-muted">{{ $t("editor.situatie.opmaak.offsetHint") }}</p>
          <UButton color="neutral" variant="outline" :disabled="editor.alleenLezen" :label="$t('editor.situatie.opmaak.herstelLabel')" @click="herstelLabel" />
        </template>
        <p v-else class="text-sm text-muted">{{ $t("editor.situatie.opmaak.kiesLabel") }}</p>
      </div>
      <UButton v-if="heeftFout" color="neutral" variant="outline" :label="$t('editor.situatie.opmaak.herstelInvoer')" @click="herstelInvoer" />
    </fieldset>
  </section>
</template>
