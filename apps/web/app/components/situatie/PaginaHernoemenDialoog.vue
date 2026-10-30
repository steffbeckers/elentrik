<script setup lang="ts">
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import { useSituatieStore } from "~/stores/situatie";
import { useEditorStore } from "~/stores/editor";

const props = defineProps<{ paginaId: string | null }>();
const open = defineModel<boolean>("open", { default: false });

const editor = useEditorStore();
const situatie = useSituatieStore();
const { t } = useI18n();
const voerUit = useDocumentFoutMelding();

const formulier = reactive({ titel: "" });

watch(open, (nuOpen) => {
  if (!nuOpen) return;
  formulier.titel = editor.document?.situatie.paginas.find((p) => p.id === props.paginaId)?.titel ?? "";
});

function valideer(waarden: typeof formulier) {
  return waarden.titel.trim() === "" ? [{ name: "titel", message: t("editor.situatie.hernoemen.verplicht") }] : [];
}

function bewaar(): void {
  const paginaId = props.paginaId;
  if (paginaId === null || editor.alleenLezen) return;
  if (voerUit(() => situatie.hernoem(paginaId, formulier.titel.trim()))) open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.situatie.hernoemen.titel')">
    <template #body>
      <AlleenLezenMelding class="mb-4" />
      <UForm
        id="pagina-hernoemen-formulier"
        :state="formulier"
        :validate="valideer"
        :disabled="editor.alleenLezen"
        @submit="bewaar"
      >
        <UFormField name="titel" :label="$t('editor.situatie.hernoemen.veld')" required>
          <UInput v-model="formulier.titel" class="w-full" autofocus data-testid="pagina-titel" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="open = false" />
        <UButton
          type="submit"
          form="pagina-hernoemen-formulier"
          :disabled="editor.alleenLezen"
          data-testid="pagina-hernoemen-bevestig"
          :label="$t('editor.situatie.hernoemen.bewaren')"
        />
      </div>
    </template>
  </UModal>
</template>
