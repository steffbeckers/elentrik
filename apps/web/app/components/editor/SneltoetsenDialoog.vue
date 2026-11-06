<script setup lang="ts">
import { SNELTOETSEN, type SneltoetsContext } from "~/editor/sneltoetsenlijst";
import { useEditorStore } from "~/stores/editor";

/** Het overzicht van alle sneltoetsen (`?` of de knop Toetsenbordhulp), uit de gedeelde lijst `SNELTOETSEN`. */
const store = useEditorStore();
const { t } = useI18n();

/** Namen van toetsen die UKbd zelf vertaalt; "meta" toont Ctrl, of ⌘ op een Mac. */
const KBD: Readonly<Record<string, string>> = {
  Ctrl: "meta",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
  Escape: "escape",
};

function delen(toets: string): string[] {
  // "?" en "+" zijn zelf toetsen; alleen een "+" tussen twee namen scheidt.
  return toets.length === 1 ? [toets] : toets.split("+").map((deel) => (deel === "Space" ? t("editor.sneltoetsen.spatie") : KBD[deel] ?? deel));
}

/** Pijltjes met dezelfde modifiers staan samen: "Shift ↑ ↓ ← →" in plaats van vier keer "Shift ↑". */
function voegPijlenSamen(toetsen: string[][]): string[][] {
  const uit: string[][] = [];
  for (const toets of toetsen) {
    const vorige = uit.at(-1);
    const laatste = toets.at(-1) ?? "";
    const zelfdeModifiers = vorige !== undefined && vorige.slice(0, toets.length - 1).join("+") === toets.slice(0, -1).join("+");
    if (laatste.startsWith("arrow") && vorige?.at(-1)?.startsWith("arrow") && zelfdeModifiers) vorige.push(laatste);
    else uit.push([...toets]);
  }
  return uit;
}

/** Per context de regels, met de toetsen per omschrijving samen; de context van het open tabblad eerst. */
const groepen = computed(() => {
  const volgorde: SneltoetsContext[] = store.tabblad === "situatieschema" ? ["situatie", "schema"] : ["schema", "situatie"];
  return volgorde.map((context) => {
    const regels = new Map<string, string[][]>();
    for (const s of SNELTOETSEN) {
      if (s.context !== context) continue;
      regels.set(s.omschrijvingSleutel, [...(regels.get(s.omschrijvingSleutel) ?? []), delen(s.toets)]);
    }
    return { context, regels: [...regels].map(([sleutel, toetsen]) => ({ sleutel, toetsen: voegPijlenSamen(toetsen) })) };
  });
});
</script>

<template>
  <UModal v-model:open="store.sneltoetsenOpen" :title="$t('editor.sneltoetsen.titel')" :description="$t('editor.sneltoetsen.beschrijving')" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <div class="space-y-6" data-testid="sneltoetsen-dialoog">
        <section v-for="groep in groepen" :key="groep.context" :aria-labelledby="`sneltoetsen-${groep.context}`">
          <h3 :id="`sneltoetsen-${groep.context}`" class="mb-2 text-lg font-semibold">{{ $t(`editor.sneltoetsen.${groep.context}`) }}</h3>
          <p v-if="groep.context === 'schema'" class="mb-2 text-sm text-muted">{{ $t('werkbaarheid.tekenen.hulp') }}</p>
          <dl class="divide-y divide-default">
            <div v-for="regel in groep.regels" :key="regel.sleutel" class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <dt class="min-w-0 flex-1 basis-56">{{ $t(regel.sleutel) }}</dt>
              <dd class="flex flex-wrap items-center gap-1">
                <template v-for="(toets, index) in regel.toetsen" :key="index">
                  <span v-if="index > 0" class="text-xs text-muted">{{ $t('editor.sneltoetsen.of') }}</span>
                  <span class="inline-flex items-center gap-0.5">
                    <UKbd v-for="(deel, i) in toets" :key="i" :value="deel" />
                  </span>
                </template>
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </template>
  </UModal>
</template>
