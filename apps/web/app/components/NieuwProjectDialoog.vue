<script setup lang="ts">
import type { Stroomtype } from "@elentrik/model";

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ aangemaakt: [id: string] }>();

const { t } = useI18n();
const api = useProjectenApi();
const toast = useToast();

const STROOMTYPES: Stroomtype[] = ["2x230V", "3x230V", "3N400V"];
const stroomtypes = computed(() =>
  STROOMTYPES.map((value) => ({ value, label: t(`projecten.stroomtypes.${value}`) })),
);

const formulier = reactive<{ naam: string; klantnaam: string; stroomtype: Stroomtype }>({
  naam: "",
  klantnaam: "",
  stroomtype: "2x230V",
});
const bezig = ref(false);

watch(open, (nuOpen) => {
  if (!nuOpen) return;
  formulier.naam = "";
  formulier.klantnaam = "";
  formulier.stroomtype = "2x230V";
});

function valideer(waarden: typeof formulier) {
  return waarden.naam.trim() === ""
    ? [{ name: "naam", message: t("projecten.nieuwDialoog.naamVerplicht") }]
    : [];
}

async function maak() {
  bezig.value = true;
  try {
    const { id } = await api.maak({
      naam: formulier.naam.trim(),
      klantnaam: formulier.klantnaam,
      stroomtype: formulier.stroomtype,
    });
    open.value = false;
    emit("aangemaakt", id);
  } catch {
    toast.add({ title: t("algemeen.fout"), color: "error" });
  } finally {
    bezig.value = false;
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('projecten.nieuwDialoog.titel')">
    <template #body>
      <UForm id="nieuw-project-formulier" :state="formulier" :validate="valideer" class="space-y-4" @submit="maak">
        <UFormField name="naam" :label="$t('projecten.nieuwDialoog.naam')" required>
          <UInput v-model="formulier.naam" class="w-full" autofocus />
        </UFormField>
        <UFormField name="klantnaam" :label="$t('projecten.nieuwDialoog.klant')">
          <UInput v-model="formulier.klantnaam" class="w-full" />
        </UFormField>
        <UFormField name="stroomtype" :label="$t('projecten.nieuwDialoog.stroomtype')">
          <USelect v-model="formulier.stroomtype" :items="stroomtypes" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="open = false" />
        <UButton
          type="submit"
          form="nieuw-project-formulier"
          :loading="bezig"
          :label="$t('projecten.nieuwDialoog.aanmaken')"
        />
      </div>
    </template>
  </UModal>
</template>
