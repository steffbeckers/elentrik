<script setup lang="ts">
import type { Taal } from "@elentrik/render";
import { dossierStatus, kiesOngeplaatst, ongeplaatsteOnderdelen } from "~/editor/dossierstatus";
import { useEditorStore } from "~/stores/editor";
const emit = defineEmits<{ navigeer: [doel: "gegevens" | "schema" | "situatie"] }>();
const store = useEditorStore();
const status = computed(() => dossierStatus(store.document, store.analyse));
const { locale } = useI18n();
const ongeplaatst = computed(() => store.document && store.analyse
  ? ongeplaatsteOnderdelen(store.document, store.analyse, status.value.ongeplaatsteIds, locale.value as Taal) : []);
function kies(id: string): void {
  kiesOngeplaatst(store, id);
  emit("navigeer", "schema");
}
</script>

<template>
  <section data-testid="dossier-checklist" class="text-sm">
    <h3 class="font-semibold">{{ $t('werkbaarheid.dossier.titel') }}</h3>
    <p class="mt-1 text-xs text-muted">{{ $t('werkbaarheid.dossier.uitleg') }}</p>
    <p v-if="status.volledig" class="mt-3 flex items-center gap-2"><UIcon name="i-lucide-check" class="size-4 text-success" />{{ $t('werkbaarheid.dossier.volledig') }}</p>
    <ul v-else class="mt-2 divide-y divide-default">
      <li v-for="veld in status.ontbreekt" :key="veld">
        <button type="button" class="flex min-h-10 w-full items-center justify-between gap-3 py-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-primary" @click="emit('navigeer', veld === 'schema' ? 'schema' : 'gegevens')">
          <span>{{ $t(`werkbaarheid.dossier.${veld}`) }}</span><UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
        </button>
      </li>
      <li v-if="!status.plannen || status.zonderPlan">
        <button type="button" class="flex min-h-10 w-full items-center justify-between gap-3 py-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-primary" @click="emit('navigeer', 'situatie')">
          <span>{{ $t('werkbaarheid.dossier.plan', { aantal: status.zonderPlan || 1 }, status.zonderPlan || 1) }}</span><UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
        </button>
      </li>
      <li v-if="status.ongeplaatst">
        <button type="button" class="flex min-h-10 w-full items-center justify-between gap-3 py-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-primary" @click="emit('navigeer', 'situatie')">
          <span>{{ $t('werkbaarheid.dossier.plaatsen', { aantal: status.ongeplaatst }, status.ongeplaatst) }}</span><UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
        </button>
        <ul class="flex flex-wrap gap-1 pb-2" data-testid="dossier-ongeplaatst">
          <li v-for="onderdeel in ongeplaatst" :key="onderdeel.id">
            <button type="button" :aria-label="$t('werkbaarheid.dossier.kiesOnderdeel', { naam: onderdeel.naam })" class="rounded-md bg-elevated px-2 py-1 text-xs hover:text-primary focus-visible:outline-2 focus-visible:outline-primary" @click="kies(onderdeel.id)">{{ onderdeel.naam }}</button>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
