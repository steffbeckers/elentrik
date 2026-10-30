<script setup lang="ts">
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import { useEditorStore } from "~/stores/editor";

/** Minimale lengte van de motivatie, na het wegknippen van witruimte (zoals `AfwijkingSchema`). */
const MIN_TEKENS = 10;

const open = defineModel<boolean>("open", { default: false });
defineProps<{ bericht: string }>();
const emit = defineEmits<{ bevestig: [motivatie: string] }>();

const editor = useEditorStore();
const motivatie = ref("");
const geldig = computed(() => !editor.alleenLezen && motivatie.value.trim().length >= MIN_TEKENS);

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
      <AlleenLezenMelding class="mb-4" />
      <UFormField :label="$t('editor.afwijking.motivatie')" :help="$t('editor.afwijking.hulp')" required>
        <UTextarea
          v-model="motivatie"
          :rows="4"
          autoresize
          class="w-full"
          autofocus
          :disabled="editor.alleenLezen"
          data-testid="motivatie"
        />
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
