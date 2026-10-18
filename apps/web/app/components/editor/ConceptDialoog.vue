<script setup lang="ts">
const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ /** Tijdstip van het concept, in ms sinds epoch. */ tijd: number }>();
const emit = defineEmits<{ laden: []; verwerpen: [] }>();

const tijdTekst = computed(() =>
  new Date(props.tijd).toLocaleString("nl-BE", { dateStyle: "medium", timeStyle: "short" }),
);

function kies(keuze: "laden" | "verwerpen"): void {
  if (keuze === "laden") emit("laden");
  else emit("verwerpen");
  open.value = false;
}
</script>

<template>
  <!-- Niet weg te klikken: de gebruiker kiest bewust tussen het concept en de serverversie. -->
  <UModal v-model:open="open" :title="$t('editor.concept.titel')" :dismissible="false" :close="false">
    <template #body>
      <p>{{ $t("editor.concept.beschrijving", { tijd: tijdTekst }) }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('editor.concept.verwerpen')" @click="kies('verwerpen')" />
        <UButton :label="$t('editor.concept.laden')" @click="kies('laden')" />
      </div>
    </template>
  </UModal>
</template>
