<script setup lang="ts">
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import { berekenMmPerPx } from "~/situatie/schaal";
import { useEditorStore } from "~/stores/editor";
import { useSituatieStore } from "~/stores/situatie";

const props = defineProps<{
  paginaId: string | null;
  /** De gemeten afstand op het plan, in rasterpixels. */
  afstandPx: number;
}>();
const open = defineModel<boolean>("open", { default: false });

const situatie = useSituatieStore();
const editor = useEditorStore();
const { t } = useI18n();
const voerUit = useDocumentFoutMelding();

const formulier = reactive<{ mm: number | undefined }>({ mm: undefined });

watch(open, (nuOpen) => {
  if (nuOpen) formulier.mm = undefined;
});

function valideer(waarden: typeof formulier) {
  return berekenMmPerPx(waarden.mm ?? Number.NaN, props.afstandPx) === undefined
    ? [{ name: "mm", message: t("editor.situatie.schaal.ongeldig") }]
    : [];
}

function bewaar(): void {
  if (editor.alleenLezen) return;
  const paginaId = props.paginaId;
  const mmPerPx = berekenMmPerPx(formulier.mm ?? Number.NaN, props.afstandPx);
  if (paginaId === null || mmPerPx === undefined) return;
  if (voerUit(() => situatie.zetSchaal(paginaId, mmPerPx))) open.value = false;
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="$t('editor.situatie.schaal.titel')"
    :description="$t('editor.situatie.schaal.beschrijving', { px: Math.round(afstandPx) })"
  >
    <template #body>
      <AlleenLezenMelding class="mb-4" />
      <UForm id="schaal-formulier" :state="formulier" :validate="valideer" :disabled="editor.alleenLezen" @submit="bewaar">
        <UFormField name="mm" :label="$t('editor.situatie.schaal.veld')" required>
          <UInput
            v-model.number="formulier.mm"
            type="number"
            min="0"
            step="any"
            inputmode="decimal"
            class="w-full"
            autofocus
            data-testid="schaal-mm"
          />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="open = false" />
        <UButton
          type="submit"
          form="schaal-formulier"
          :disabled="editor.alleenLezen"
          data-testid="schaal-bevestig"
          :label="$t('editor.situatie.schaal.bevestigen')"
        />
      </div>
    </template>
  </UModal>
</template>
