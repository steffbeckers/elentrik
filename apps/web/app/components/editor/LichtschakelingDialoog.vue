<script setup lang="ts">
import {
  DocumentFout,
  voegLichtschakelingToe,
  type LichtschakelingDoel,
  type LichtschakelingOpties,
  type DifferentieelInstellingen,
} from "@elentrik/model";
import { useEditorStore } from "~/stores/editor";
import {
  invoegBestemmingen,
  lichtDoelBijSelectie,
  nieuwePuntcode,
} from "~/editor/invoegen";
import AlleenLezenMelding from "./AlleenLezenMelding.vue";
import InvoegBestemmingVelden from "./InvoegBestemmingVelden.vue";

const open = defineModel<boolean>("open", { default: false });
const store = useEditorStore();
const { t } = useI18n();
const voerUit = useDocumentFoutMelding();
const doel = ref<LichtschakelingDoel>();
const opties = reactive<LichtschakelingOpties>({
  schakeling: "enkel",
  aantal: 1,
  lichtsoort: "standaard",
});
const instellingen = ref<DifferentieelInstellingen>({
  gevoeligheid_mA: 30,
  nominaal_A: 40,
  polen: 2,
  klasse: "A",
});
const doelen = computed<LichtschakelingDoel[]>(() => [
  ...(store.analyse?.kringen.map((k) => ({
    soort: "bestaande-kring" as const,
    nodeId: k.id,
  })) ?? []),
  ...(store.document ? invoegBestemmingen(store.document) : []),
]);
watch(open, (value) => {
  if (!value) return;
  doel.value = store.document
    ? lichtDoelBijSelectie(store.document, store.selectie)
    : undefined;
  Object.assign(opties, {
    schakeling: "enkel",
    aantal: 1,
    lichtsoort: "standaard",
  });
  instellingen.value = {
    gevoeligheid_mA: 30,
    nominaal_A: 40,
    polen:
      store.document?.voeding.stroomtype === "3N400V"
        ? 4
        : store.document?.voeding.stroomtype === "3x230V"
          ? 3
          : 2,
    klasse: "A",
  };
});
const voorbeeld = computed(() => {
  if (!store.document || !doel.value) return undefined;
  try {
    const r = voegLichtschakelingToe(
      store.document,
      doel.value,
      opties,
      instellingen.value,
    );
    return {
      punt: nieuwePuntcode(store.document, r.doc),
      schakelaars:
        opties.schakeling === "enkel"
          ? 1
          : opties.schakeling === "wissel"
            ? 2
            : 3,
    };
  } catch (e) {
    if (e instanceof DocumentFout) return undefined;
    throw e;
  }
});
function voegIn() {
  if (store.alleenLezen || !doel.value || !voorbeeld.value) return;
  if (
    voerUit(() =>
      store.voegLichtschakelingToe(
        doel.value!,
        { ...opties },
        instellingen.value,
      ),
    )
  )
    open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.invoegen.lichtTitel')">
    <template #body>
      <div class="space-y-5">
        <AlleenLezenMelding />
        <InvoegBestemmingVelden
          v-model:doel="doel"
          v-model:instellingen="instellingen"
          :doelen="doelen"
        />
        <UFormField :label="$t('editor.invoegen.schakeling')">
          <USelect
            v-model="opties.schakeling"
            :items="
              ['enkel', 'wissel', 'kruis'].map((value) => ({
                value,
                label: t(`editor.invoegen.schakelingen.${value}`),
              }))
            "
            class="w-full"
            :disabled="store.alleenLezen"
            data-testid="licht-schakeling"
          />
        </UFormField>
        <div class="grid grid-cols-2 gap-3">
          <UFormField :label="$t('editor.invoegen.aantalLichtpunten')"
            ><UInput
              v-model.number="opties.aantal"
              type="number"
              :min="1"
              :max="1000"
              :step="1"
              class="w-full"
              :disabled="store.alleenLezen"
              data-testid="licht-aantal"
          /></UFormField>
          <UFormField :label="$t('velden.soort.label')"
            ><USelect
              v-model="opties.lichtsoort"
              :items="
                ['standaard', 'led', 'tl', 'spot', 'noodverlichting'].map(
                  (value) => ({
                    value,
                    label: t(`velden.soort.opties.${value}`),
                  }),
                )
              "
              class="w-full"
              :disabled="store.alleenLezen"
          /></UFormField>
        </div>
        <p class="text-sm text-muted">
          {{ $t("editor.invoegen.voorinstellingen") }}
        </p>
        <p v-if="voorbeeld" aria-live="polite" data-testid="licht-voorbeeld">
          {{
            $t("editor.invoegen.lichtVoorbeeld", {
              punt: voorbeeld.punt,
              schakelaars: voorbeeld.schakelaars,
              lampen: opties.aantal,
            })
          }}
        </p>
        <p v-else role="status" class="text-sm text-muted">
          {{
            $t(
              doel
                ? "editor.invoegen.ongeldigeWaarden"
                : "editor.invoegen.kiesBestemming",
            )
          }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="open = false">{{
          $t("editor.invoegen.annuleren")
        }}</UButton>
        <UButton
          :disabled="store.alleenLezen || !voorbeeld"
          data-testid="bevestig-lichtschakeling"
          @click="voegIn"
          >{{ $t("editor.invoegen.toevoegen") }}</UButton
        >
      </div>
    </template>
  </UModal>
</template>
