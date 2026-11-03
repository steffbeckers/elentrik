<script setup lang="ts">
import { vertaalFout } from '~/fouten';
const props = defineProps<{ titel: string; bewaar: (reden: string) => Promise<unknown>; zonderReden?: boolean }>();
const emit = defineEmits<{ opgeslagen: [resultaat: unknown]; annuleer: [] }>();
const { t } = useI18n(); const toast = useToast(); const reden = ref(''); const bezig = ref(false); const fout = shallowRef<unknown>(null);
async function opslaan() {
  if (bezig.value || (!props.zonderReden && !reden.value.trim())) return;
  bezig.value = true; fout.value = null;
  try { const resultaat = await props.bewaar(reden.value.trim()); toast.add({ title: t('admin.opgeslagen'), color: 'success' }); emit('opgeslagen', resultaat); }
  catch (error) { fout.value = error; } finally { bezig.value = false; }
}
</script>
<template>
  <form class="comfortabele-formulieren max-w-2xl space-y-5 rounded-lg border border-default p-5" @submit.prevent="opslaan">
    <h3 class="text-lg font-semibold">{{ titel }}</h3>
    <fieldset :disabled="bezig" class="space-y-5"><slot />
      <UFormField v-if="!zonderReden" :label="t('admin.reden')" required><UTextarea v-model="reden" class="w-full" :rows="2" required maxlength="1000" /></UFormField>
    </fieldset>
    <UAlert v-if="fout" color="error" variant="subtle" :title="vertaalFout(fout, t)" />
    <div class="flex gap-3"><UButton type="submit" :loading="bezig">{{ t('admin.bewaren') }}</UButton><UButton color="neutral" variant="ghost" :disabled="bezig" @click="emit('annuleer')">{{ t('admin.annuleren') }}</UButton></div>
  </form>
</template>
