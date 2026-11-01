<script setup lang="ts">
import { useEditorStore, type Tabblad } from "~/stores/editor";
const props = defineProps<{ tabblad: Tabblad; selectie: readonly string[]; heeftPlan: boolean }>();
const store = useEditorStore();
type Paneel = "onderdelen" | "eigenschappen" | "bevindingen" | "opmaak";
const paneel = ref<Paneel | null>(props.tabblad === "eendraadschema" ? "onderdelen" : null);
onMounted(() => { if (window.matchMedia("(max-width: 767px)").matches) paneel.value = null; });
const inspecteurElement = ref<HTMLElement | null>(null);
const bediening = ref<HTMLElement | null>(null);
const keuzes = computed(() => [
  ...(props.tabblad !== "kringenlijst" ? [{ id: "onderdelen" as const, icoon: "i-lucide-list-plus" }] : []),
  { id: "eigenschappen" as const, icoon: "i-lucide-sliders-horizontal" },
  { id: "bevindingen" as const, icoon: "i-lucide-list-checks" },
  ...(props.tabblad === "situatieschema" && props.heeftPlan ? [{ id: "opmaak" as const, icoon: "i-lucide-scaling" }] : []),
]);
function kies(keuze: Paneel): void { paneel.value = paneel.value === keuze ? null : keuze; }
async function sluit(): Promise<void> {
  const vorig = paneel.value;
  paneel.value = null;
  await nextTick();
  bediening.value?.querySelector<HTMLElement>(`[data-testid="werkruimte-${vorig}"]`)?.focus();
}
watch(() => props.tabblad, () => {
  if (paneel.value === "opmaak" || (paneel.value === "onderdelen" && props.tabblad === "kringenlijst")) paneel.value = null;
});
watch(() => props.heeftPlan, heeftPlan => { if (!heeftPlan && paneel.value === "opmaak") paneel.value = null; });
// Selectie opent geen paneel onverwacht en houdt opmaak beschikbaar voor het volgende label.
defineExpose({
  toonOnderdelen: () => { paneel.value = "onderdelen"; },
  toonBevindingen: () => { paneel.value = "bevindingen"; },
  toonWerk: () => { paneel.value = null; },
  toonEigenschappen: async () => {
    await nextTick();
    paneel.value = "eigenschappen";
    await nextTick();
    inspecteurElement.value?.focus({ preventScroll: true });
  },
});
const TABBLADEN = ["eendraadschema", "situatieschema", "kringenlijst"] as const satisfies readonly Tabblad[];

function navigeerTab(event: KeyboardEvent, index: number): void {
  const doel = event.key === "ArrowRight" ? (index + 1) % TABBLADEN.length
    : event.key === "ArrowLeft" ? (index + TABBLADEN.length - 1) % TABBLADEN.length
      : event.key === "Home" ? 0 : event.key === "End" ? TABBLADEN.length - 1 : null;
  if (doel === null) return;
  event.preventDefault();
  store.tabblad = TABBLADEN[doel]!;
  (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]')[doel]?.focus();
}


</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col" data-testid="editor-werkruimte">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-default px-2 py-1">
          <nav class="flex min-w-0 items-center gap-1 overflow-x-auto" role="tablist" :aria-label="$t('editor.werkruimte.weergaven')">
      <UButton
        v-for="(tabblad, index) in TABBLADEN"
        :key="tabblad"
        role="tab"
        :aria-selected="store.tabblad === tabblad"
        :tabindex="store.tabblad === tabblad ? 0 : -1"
        :data-testid="`tab-${tabblad}`"
        :color="store.tabblad === tabblad ? 'primary' : 'neutral'"
        :variant="store.tabblad === tabblad ? 'soft' : 'ghost'"
        size="sm"
        class="min-h-9 shrink-0"
        :label="$t(`editor.bovenbalk.tabbladen.${tabblad}`)"
        @click="store.tabblad = tabblad"
        @keydown="navigeerTab($event, index)"
      />
    </nav>
      <nav ref="bediening" class="flex min-w-0 items-center gap-1 overflow-x-auto" :aria-label="$t('editor.werkruimte.panelen')">
        <button v-for="keuze in keuzes" :key="keuze.id" type="button"
          class="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded px-2 text-xs focus-visible:outline-2 focus-visible:outline-primary"
          :class="paneel === keuze.id ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-elevated hover:text-default'"
          :aria-expanded="paneel === keuze.id" aria-controls="editor-zijpaneel"
          :data-testid="`werkruimte-${keuze.id}`" @click="kies(keuze.id)">
          <UIcon :name="keuze.icoon" class="hidden size-4 shrink-0 sm:block" />
          {{ $t(`editor.werkruimte.${keuze.id}`) }}
        </button>
      </nav>
    </div>
    <div class="grid min-h-0 min-w-0 flex-1 grid-cols-1" :class="paneel ? 'grid-rows-[minmax(0,1fr)_minmax(0,42%)] md:grid-cols-[minmax(0,1fr)_20rem] md:grid-rows-1' : ''">
      <div class="flex min-h-0 min-w-0 flex-col overflow-hidden" data-testid="werkruimte-tekening"><slot /></div>
      <aside v-show="paneel" id="editor-zijpaneel" ref="inspecteurElement" tabindex="-1"
        class="relative flex min-h-0 min-w-0 flex-col border-t border-default md:border-t-0 md:border-l"
        :aria-label="$t(`editor.werkruimte.${paneel ?? 'eigenschappen'}`)" data-testid="werkruimte-inspecteur" @keydown.esc.stop="sluit">
        <div class="flex shrink-0 items-center justify-between border-b border-default px-3 py-1">
          <span class="text-sm font-medium">{{ $t(`editor.werkruimte.${paneel ?? 'eigenschappen'}`) }}</span>
          <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="$t('editor.werkruimte.sluiten')" data-testid="werkruimte-sluiten" @click="sluit" />
        </div>
        <div class="zijpaneel-inhoud min-h-0 flex-1 overflow-y-auto">
          <div v-show="paneel === 'onderdelen'" data-testid="werkruimte-gereedschap"><slot name="gereedschap" /></div>
          <div v-show="paneel === 'eigenschappen'"><slot name="eigenschappen" /></div>
          <div v-show="paneel === 'bevindingen'"><slot name="bevindingen" /></div>
          <div v-show="paneel === 'opmaak'"><slot name="opmaak" /></div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* Eén titel in de gezamenlijke paneelkop. */
.zijpaneel-inhoud :deep(> div > section > h2:first-child),
.zijpaneel-inhoud :deep(> div > aside > h2:first-child),
.zijpaneel-inhoud :deep(> div > aside > section:first-child > h2:first-child) { display: none; }
</style>
