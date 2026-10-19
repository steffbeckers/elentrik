<script setup lang="ts">
/** Minimale lengte van de motivatie, na het wegknippen van witruimte (zoals `AfwijkingSchema`). */
const MIN_TEKENS = 10;

const open = defineModel<boolean>("open", { default: false });
defineProps<{ bericht: string }>();
const emit = defineEmits<{ bevestig: [motivatie: string] }>();

const motivatie = ref("");
const geldig = computed(() => motivatie.value.trim().length >= MIN_TEKENS);

watch(open, (nuOpen) => {
  if (nuOpen) motivatie.value = "";
});

function bevestig(): void {
  if (!geldig.value) return;
  emit("bevestig", motivatie.value.trim());
  open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.afwijking.titel')" :description="bericht">
    <template #body>
      <UFormField :label="$t('editor.afwijking.motivatie')" :help="$t('editor.afwijking.hulp')" required>
        <UTextarea v-model="motivatie" :rows="4" autoresize class="w-full" autofocus data-testid="motivatie" />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="open = false" />
        <UButton :label="$t('editor.afwijking.bewaren')" :disabled="!geldig" @click="bevestig" />
      </div>
    </template>
  </UModal>
</template>
