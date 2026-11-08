<script setup lang="ts">
import { useEditorStore } from "~/stores/editor";

// De teller van de gratis limiet (spec 4.7): "3 van 5 kringen" en "1 van 1 situatieschema", altijd in
// beeld zolang het project een limiet heeft (`toegang.limiet`). Het beheerscherm zet geen limieten.
const store = useEditorStore();
const { t } = useI18n();

const regels = computed(() => {
  const limieten = store.limieten;
  const telling = store.telling;
  if (!store.toegang?.limiet || !limieten || !telling) return [];
  return (["kringen", "situatieschemas"] as const).map((soort) => ({
    soort,
    // De meervoudsvorm volgt het maximum: "1 van 1 situatieschema", "3 van 5 kringen". Het aantal heet
    // `aantal`, niet `n`: vue-i18n vervangt een `n` van 0 door het meervoudsgetal (het maximum).
    tekst: t(`editor.limiet.teller.${soort}`, { aantal: telling[soort], max: limieten[soort] }, limieten[soort]),
    vol: telling[soort] >= limieten[soort],
  }));
});
</script>

<template>
  <div
    v-if="regels.length"
    class="flex shrink-0 flex-wrap items-center gap-1"
    role="group"
    :aria-label="t('editor.limiet.teller.label')"
    data-testid="limietteller"
  >
    <UBadge
      v-for="regel in regels"
      :key="regel.soort"
      :color="regel.vol ? 'warning' : 'neutral'"
      variant="subtle"
      class="whitespace-nowrap tabular-nums"
      :label="regel.tekst"
      :data-testid="`limietteller-${regel.soort}`"
    />
  </div>
</template>
