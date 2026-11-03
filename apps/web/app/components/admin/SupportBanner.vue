<script setup lang="ts">
import type { AdminProjectApi } from '~/composables/useAdminProjectApi';
import { vertaalFout } from '~/fouten';
const props = defineProps<{ support: AdminProjectApi; bedrijf: string; terug: string; accountGeldig: boolean; downloadBeschikbaar: boolean; wachtOpOpslaan: () => Promise<boolean> }>();
const emit = defineEmits<{ gestart: []; download: [] }>();
const { t } = useI18n(); const { datum } = useAdminDatums();
const reden = ref(''); const fout = shallowRef<unknown>(null);
async function start() {
  if (!props.accountGeldig) return;
  fout.value = null;
  try { await props.support.start(reden.value); emit('gestart'); } catch (e) { fout.value = e; }
}
async function afronden() {
  fout.value = null;
  try { await props.support.afronden(props.wachtOpOpslaan); } catch (e) { fout.value = e; }
}
</script>
<template>
  <section class="shrink-0 border-b border-default bg-elevated px-4 py-3" :aria-label="t('admin.support.titel')" data-testid="support-banner">
    <div class="flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="mr-auto"><p class="font-semibold">{{ t('admin.support.titel') }} · {{ bedrijf }}</p><p class="text-sm text-muted">{{ t(support.schrijven.value ? 'admin.support.actief' : 'admin.support.alleenLezen') }}</p></div>
      <UButton :to="terug" color="neutral" variant="ghost">{{ t('admin.support.terug') }}</UButton>
      <UButton color="neutral" variant="outline" :disabled="!downloadBeschikbaar" @click="downloadBeschikbaar && emit('download')">{{ t('admin.support.download') }}</UButton>
      <UButton v-if="support.correctie.value" :loading="support.afsluiten.value" :disabled="!accountGeldig" @click="afronden">{{ t('admin.support.afronden') }}</UButton>
    </div>
    <p v-if="support.correctie.value" class="mt-2 break-words text-sm">{{ support.correctie.value.reden }} · {{ t('admin.support.verloopt', { datum: datum(support.correctie.value.verloopt) }) }}</p>
    <p v-if="support.geblokkeerd.value" class="mt-2 text-sm text-warning">{{ t('admin.support.gestopt') }}</p>
    <form v-if="!support.schrijven.value && !support.afsluiten.value && accountGeldig" class="mt-3 flex flex-wrap items-end gap-3" @submit.prevent="start">
      <UFormField :label="t('admin.reden')" required class="min-w-48 flex-1"><UTextarea v-model="reden" required maxlength="1000" :rows="1" class="w-full" /></UFormField>
      <UButton type="submit" :loading="support.starten.value">{{ t('admin.support.start') }}</UButton>
    </form>
    <p class="mt-2 text-xs text-muted">{{ t('admin.jsonGeenArchief') }}</p>
    <UAlert v-if="fout" class="mt-3" color="error" variant="subtle" :title="vertaalFout(fout, t)" :description="t('admin.support.fout')" />
  </section>
</template>
