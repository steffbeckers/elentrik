<script setup lang="ts">
import { StroomtypeSchema } from "@elentrik/model";
import AdresVelden from "~/components/editor/AdresVelden.vue";
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import GenummerdeSectie from "~/components/editor/GenummerdeSectie.vue";
import MetingenVelden from "~/components/editor/MetingenVelden.vue";
import { leegAdresFormulier } from "~/editor/adres";
import {
  formulierUitProject,
  gegevensUitFormulier,
  leegMetingenFormulier,
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

/**
 * De keuzelijsten van dit formulier schermen de rest van de dialoog niet af: anders sloot de eerste
 * klik op Bewaren (of een ander veld) alleen de open keuzelijst, en ging de klik verloren.
 */
const KEUZELIJST = { disableOutsidePointerEvents: false } as const;

/** De talen van het dossier, elk in haar eigen taal ("Français"), zoals de taalkiezer en het exportvenster. */
const dossierTalen = TALEN.map((value) => ({ value, label: TAALNAMEN[value] }));

const formulier = reactive<ProjectFormulier>({
  naam: "",
  klantNaam: "",
  stroomtype: "2x230V",
  klant: leegAdresFormulier(),
  werf: leegAdresFormulier(),
  werfZelfdeAlsKlant: true,
  ean: "",
  datum: "",
  dossierTaal: "nl",
  installatieContext: "onbekend",
  metingen: leegMetingenFormulier(),
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
  // Alleen-lezen (ook als de dialoog al open stond): niets bewaren en niet stil sluiten.
  if (store.alleenLezen) return;
  const gelukt = voerUit(() => store.wijzigProjectgegevens(gegevensUitFormulier(formulier)));
  if (gelukt) open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.projectgegevens.titel')">
    <template #body>
      <AlleenLezenMelding class="mb-4" />
      <UForm
        id="projectgegevens-formulier"
        :state="formulier"
        :validate="valideer"
        :disabled="store.alleenLezen"
        class="space-y-8"
        @submit="bewaar"
      >
        <GenummerdeSectie :nummer="1" :titel="$t('editor.projectgegevens.klant.titel')" :uitleg="$t('editor.projectgegevens.klant.adresHulp')">
          <UFormField name="klantNaam" :label="$t('editor.projectgegevens.klant.naam')">
            <UInput v-model="formulier.klantNaam" class="w-full" autofocus data-testid="klant-naam" />
          </UFormField>
          <AdresVelden v-model="formulier.klant" naam="klant" />
        </GenummerdeSectie>

        <GenummerdeSectie :nummer="2" :titel="$t('editor.projectgegevens.werf.titel')">
          <UCheckbox
            v-model="formulier.werfZelfdeAlsKlant"
            :label="$t('editor.projectgegevens.werf.zelfdeAlsKlant')"
            data-testid="werf-zelfde-als-klant"
          />
          <AdresVelden v-if="!formulier.werfZelfdeAlsKlant" v-model="formulier.werf" naam="werf" />
          <UFormField name="ean" :label="$t('editor.projectgegevens.werf.ean')">
            <UInput v-model="formulier.ean" class="w-full" inputmode="numeric" data-testid="werf-ean" />
          </UFormField>
        </GenummerdeSectie>

        <GenummerdeSectie :nummer="3" :titel="$t('editor.projectgegevens.installatie.titel')">
          <UFormField name="stroomtype" :label="$t('editor.projectgegevens.stroomtype')">
            <USelect v-model="formulier.stroomtype" :items="stroomtypes" :content="KEUZELIJST" class="w-full" />
          </UFormField>
          <UFormField name="frequentie_Hz" :label="$t('editor.projectgegevens.frequentie')">
            <UInput v-model="formulier.frequentie_Hz" type="number" min="0.01" step="any" class="w-full" />
          </UFormField>
          <UFormField name="installatieContext" :label="$t('editor.projectgegevens.context.label')" :help="$t('editor.projectgegevens.context.hulp')">
            <USelect v-model="formulier.installatieContext" class="w-full" data-testid="installatiecontext" :content="KEUZELIJST"
              :items="['onbekend', 'nieuw', 'bestaand'].map(value => ({ value, label: $t(`editor.projectgegevens.context.${value}`) }))" />
          </UFormField>
        </GenummerdeSectie>

        <MetingenVelden v-model="formulier.metingen" :nummer="4" />

        <GenummerdeSectie :nummer="5" :titel="$t('editor.projectgegevens.dossier.titel')">
          <UFormField name="naam" :label="$t('editor.projectgegevens.naam')" required>
            <UInput v-model="formulier.naam" class="w-full" data-testid="project-naam" />
          </UFormField>
          <UFormField name="datum" :label="$t('editor.projectgegevens.datum.label')" required>
            <UInput v-model="formulier.datum" type="date" class="w-full" data-testid="projectdatum" />
          </UFormField>
          <UFormField
            name="dossierTaal"
            :label="$t('editor.projectgegevens.dossierTaal.label')"
            :help="$t('editor.projectgegevens.dossierTaal.hulp')"
          >
            <USelect v-model="formulier.dossierTaal" :items="dossierTalen" :content="KEUZELIJST" class="w-full" data-testid="dossiertaal" />
          </UFormField>
        </GenummerdeSectie>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="open = false" />
        <UButton
          v-if="!store.alleenLezen"
          type="submit"
          form="projectgegevens-formulier"
          :label="$t('editor.projectgegevens.bewaren')"
        />
      </div>
    </template>
  </UModal>
</template>
