<script setup lang="ts">
import { StroomtypeSchema } from "@elentrik/model";
import AdresVelden from "~/components/editor/AdresVelden.vue";
import { leegAdresFormulier } from "~/editor/adres";
import {
  formulierUitProject,
  gegevensUitFormulier,
  valideerProjectFormulier,
  type ProjectFormulier,
} from "~/editor/projectformulier";
import { TAALNAMEN } from "~/sessie/taal";
import { useEditorStore } from "~/stores/editor";
import { TALEN } from "../../../shared/taal";

const open = defineModel<boolean>("open", { default: false });

const store = useEditorStore();
const { t } = useI18n();
const voerUit = useDocumentFoutMelding();

const stroomtypes = computed(() =>
  StroomtypeSchema.options.map((value) => ({ value, label: t(`projecten.stroomtypes.${value}`) })),
);

/** De talen van het dossier, elk in haar eigen taal ("Français"), zoals de taalkiezer en het exportvenster. */
const dossierTalen = TALEN.map((value) => ({ value, label: TAALNAMEN[value] }));

const formulier = reactive<ProjectFormulier>({
  naam: "",
  klantNaam: "",
  stroomtype: "2x230V",
  klant: leegAdresFormulier(),
  werf: leegAdresFormulier(),
  ean: "",
  datum: "",
  dossierTaal: "nl",
});

watch(open, (nuOpen) => {
  if (!nuOpen || !store.document) return;
  Object.assign(formulier, formulierUitProject(store.naam, store.document));
});

function valideer(waarden: ProjectFormulier) {
  return valideerProjectFormulier(waarden).map(({ name, fout }) => ({
    name,
    message: t(`editor.projectgegevens.fouten.${fout}`),
  }));
}

function bewaar(): void {
  const gelukt = voerUit(() => store.wijzigProjectgegevens(gegevensUitFormulier(formulier)));
  if (gelukt) open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.projectgegevens.titel')">
    <template #body>
      <UForm id="projectgegevens-formulier" :state="formulier" :validate="valideer" class="space-y-6" @submit="bewaar">
        <div class="space-y-4">
          <UFormField name="naam" :label="$t('editor.projectgegevens.naam')" required>
            <UInput v-model="formulier.naam" class="w-full" autofocus />
          </UFormField>
          <UFormField name="stroomtype" :label="$t('editor.projectgegevens.stroomtype')">
            <USelect v-model="formulier.stroomtype" :items="stroomtypes" class="w-full" />
          </UFormField>
          <UFormField
            name="dossierTaal"
            :label="$t('editor.projectgegevens.dossierTaal.label')"
            :help="$t('editor.projectgegevens.dossierTaal.hulp')"
          >
            <USelect v-model="formulier.dossierTaal" :items="dossierTalen" class="w-full" data-testid="dossiertaal" />
          </UFormField>
        </div>

        <section class="space-y-4">
          <h3 class="font-semibold">{{ $t("editor.projectgegevens.klant.titel") }}</h3>
          <UFormField name="klantNaam" :label="$t('editor.projectgegevens.klant.naam')">
            <UInput v-model="formulier.klantNaam" class="w-full" />
          </UFormField>
          <p class="text-sm text-muted">{{ $t("editor.projectgegevens.klant.adresHulp") }}</p>
          <AdresVelden v-model="formulier.klant" naam="klant" />
        </section>

        <section class="space-y-4">
          <h3 class="font-semibold">{{ $t("editor.projectgegevens.werf.titel") }}</h3>
          <AdresVelden v-model="formulier.werf" naam="werf" />
          <UFormField name="ean" :label="$t('editor.projectgegevens.werf.ean')">
            <UInput v-model="formulier.ean" class="w-full" inputmode="numeric" data-testid="werf-ean" />
          </UFormField>
        </section>

        <section class="space-y-4">
          <h3 class="font-semibold">{{ $t("editor.projectgegevens.datum.titel") }}</h3>
          <UFormField name="datum" :label="$t('editor.projectgegevens.datum.label')" required>
            <UInput v-model="formulier.datum" type="date" class="w-full" data-testid="projectdatum" />
          </UFormField>
        </section>
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
