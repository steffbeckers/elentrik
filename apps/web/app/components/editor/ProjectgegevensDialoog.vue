<script setup lang="ts">
import { StroomtypeSchema, type Stroomtype } from "@elentrik/model";
import { useEditorStore } from "~/stores/editor";

const open = defineModel<boolean>("open", { default: false });

const store = useEditorStore();
const { t } = useI18n();
const voerUit = useDocumentFoutMelding();

const stroomtypes = computed(() =>
  StroomtypeSchema.options.map((value) => ({ value, label: t(`projecten.stroomtypes.${value}`) })),
);

const formulier = reactive<{ naam: string; klantNaam: string; stroomtype: Stroomtype }>({
  naam: "",
  klantNaam: "",
  stroomtype: "2x230V",
});

watch(open, (nuOpen) => {
  if (!nuOpen) return;
  formulier.naam = store.naam;
  formulier.klantNaam = store.document?.meta.klant.naam ?? "";
  formulier.stroomtype = store.document?.voeding.stroomtype ?? "2x230V";
});

function valideer(waarden: typeof formulier) {
  return waarden.naam.trim() === ""
    ? [{ name: "naam", message: t("editor.projectgegevens.naamVerplicht") }]
    : [];
}

function bewaar(): void {
  const gelukt = voerUit(() =>
    store.wijzigProjectgegevens({
      naam: formulier.naam.trim(),
      klantNaam: formulier.klantNaam,
      stroomtype: formulier.stroomtype,
    }),
  );
  if (gelukt) open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.projectgegevens.titel')">
    <template #body>
      <UForm id="projectgegevens-formulier" :state="formulier" :validate="valideer" class="space-y-4" @submit="bewaar">
        <UFormField name="naam" :label="$t('editor.projectgegevens.naam')" required>
          <UInput v-model="formulier.naam" class="w-full" autofocus />
        </UFormField>
        <UFormField name="klantNaam" :label="$t('editor.projectgegevens.klant')">
          <UInput v-model="formulier.klantNaam" class="w-full" />
        </UFormField>
        <UFormField name="stroomtype" :label="$t('editor.projectgegevens.stroomtype')">
          <USelect v-model="formulier.stroomtype" :items="stroomtypes" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="open = false" />
        <UButton type="submit" form="projectgegevens-formulier" :label="$t('editor.projectgegevens.bewaren')" />
      </div>
    </template>
  </UModal>
</template>
