<script setup lang="ts">
import type { Limieten } from "@elentrik/model";
import type { LimietKnoppen } from "~/editor/limiet";

// Het limietvenster (spec 4.7): een operatie ging over de gratis limiet en is niet uitgevoerd. Een
// eigenaar kan het project vrijgeven (met een projectprijs) of een abonnement nemen; een lid krijgt
// de uitleg zonder betaalknoppen.
const open = defineModel<boolean>("open", { default: false });
defineProps<{
  knoppen: LimietKnoppen;
  /** De projectprijs, opgemaakt; null zonder projectprijs (of zolang ze niet geladen is). */
  prijs: { excl: string; incl: string } | null;
  limieten: Limieten | null;
  bezig: boolean;
}>();
const emit = defineEmits<{ vrijgeven: [] }>();
const { t } = useI18n();
</script>

<template>
  <UModal v-model:open="open" :title="t('editor.limiet.titel')" data-testid="limietvenster">
    <template #body>
      <div class="space-y-3">
        <p v-if="limieten">
          {{
            t("editor.limiet.uitleg", {
              kringen: t("abonnement.gratis.kringen", { n: limieten.kringen }, limieten.kringen),
              situatieschemas: t("abonnement.gratis.situatieschemas", { n: limieten.situatieschemas }, limieten.situatieschemas),
            })
          }}
        </p>
        <p v-if="knoppen.lid" data-testid="limietvenster-lid">{{ t("editor.limiet.lid") }}</p>
        <p v-else-if="knoppen.vrijgeven && prijs" data-testid="limietvenster-prijs">
          {{ t("editor.limiet.prijs", { prijs: prijs.excl, incl: prijs.incl }) }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="t('editor.limiet.sluiten')" @click="open = false" />
        <UButton
          v-if="knoppen.abonnement"
          color="neutral"
          variant="outline"
          icon="i-lucide-sparkles"
          to="/abonnement"
          :label="t('editor.limiet.abonnement')"
          data-testid="limietvenster-abonnement"
        />
        <UButton
          v-if="knoppen.vrijgeven"
          icon="i-lucide-lock-open"
          :loading="bezig"
          :label="t('editor.limiet.vrijgeven')"
          data-testid="limietvenster-vrijgeven"
          @click="emit('vrijgeven')"
        />
      </div>
    </template>
  </UModal>
</template>
