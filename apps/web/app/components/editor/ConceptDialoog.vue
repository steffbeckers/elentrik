<script setup lang="ts">
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import { useEditorStore } from "~/stores/editor";

const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ /** Tijdstip van het concept, in ms sinds epoch. */ tijd: number }>();
const emit = defineEmits<{ laden: []; later: []; verwerpen: [] }>();
const { localeProperties } = useI18n();
const editor = useEditorStore();

const tijdTekst = computed(() =>
  new Date(props.tijd).toLocaleString(localeProperties.value.language, { dateStyle: "medium", timeStyle: "short" }),
);

function kies(keuze: "laden" | "later" | "verwerpen"): void {
  // Alleen-lezen geworden terwijl de dialoog open stond: het concept kan niet meer geladen worden, dus niet stil sluiten.
  if (keuze === "laden" && editor.alleenLezen) return;
  if (keuze === "laden") emit("laden");
  else if (keuze === "later") emit("later");
  else emit("verwerpen");
  open.value = false;
}
</script>

<template>
  <!-- Niet weg te klikken: de gebruiker kiest bewust tussen het concept en de serverversie. -->
  <UModal v-model:open="open" :title="$t('editor.concept.titel')" :dismissible="false" :close="false">
    <template #body>
      <AlleenLezenMelding class="mb-4" />
      <p>{{ $t("editor.concept.beschrijving", { tijd: tijdTekst }) }}</p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('editor.concept.verwerpen')" @click="kies('verwerpen')" />
        <!-- Alleen-lezen: laden kan niet, en "Verwerpen" wist het concept. "Later" is de uitweg die niets wist. -->
        <UButton
          v-if="editor.alleenLezen"
          :label="$t('editor.concept.later')"
          data-testid="concept-later"
          @click="kies('later')"
        />
        <UButton v-else :label="$t('editor.concept.laden')" @click="kies('laden')" />
      </div>
    </template>
  </UModal>
</template>
