<script setup lang="ts">
import {
  DocumentFout,
  voegSjabloonToe,
  type SjabloonDoel,
  type DifferentieelInstellingen,
} from "@elentrik/model";
import { useEditorStore } from "~/stores/editor";
import {
  invoegBestemmingen,
  doelBijSelectie,
  invoegSpecificatie,
} from "~/editor/invoegen";
import AlleenLezenMelding from "./AlleenLezenMelding.vue";
import InvoegBestemmingVelden from "./InvoegBestemmingVelden.vue";

const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{ sjabloonId: string }>();
const store = useEditorStore();
const voerUit = useDocumentFoutMelding();
const doel = ref<SjabloonDoel>();
const instellingen = ref<DifferentieelInstellingen>({
  gevoeligheid_mA: 30,
  nominaal_A: 40,
  polen: 2,
  klasse: "A",
});
const doelen = computed(() =>
  store.document ? invoegBestemmingen(store.document) : [],
);
watch(open, (value) => {
  if (!value) return;
  doel.value = doelBijSelectie(doelen.value, store.selectie);
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
  if (!store.document || !doel.value || !props.sjabloonId) return undefined;
  try {
    const r = voegSjabloonToe(
      store.document,
      doel.value,
      props.sjabloonId,
      instellingen.value,
    );
    return Object.values(r.doc.nodes).filter(
      (n) => !store.document!.nodes[n.id],
    );
  } catch (e) {
    if (e instanceof DocumentFout) return undefined;
    throw e;
  }
});
function voegIn() {
  if (store.alleenLezen || !doel.value || !voorbeeld.value) return;
  if (
    voerUit(() =>
      store.voegSjabloonToe(props.sjabloonId, doel.value!, instellingen.value),
    )
  )
    open.value = false;
}
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.invoegen.sjabloonTitel')">
    <template #body>
      <div class="space-y-5">
        <AlleenLezenMelding />
        <p class="font-medium">{{ $t(`editor.sjablonen.${sjabloonId}`) }}</p>
        <InvoegBestemmingVelden
          v-model:doel="doel"
          v-model:instellingen="instellingen"
          :doelen="doelen"
        />
        <p class="text-sm text-muted">
          {{ $t("editor.invoegen.voorinstellingen") }}
        </p>
        <section v-if="voorbeeld" aria-live="polite" class="space-y-2">
          <h3 class="font-medium">{{ $t("editor.invoegen.onderdelen") }}</h3>
          <ul class="space-y-1 text-sm" data-testid="invoeg-voorbeelddelen">
            <li v-for="n in voorbeeld" :key="n.id">
              {{ $t(`editor.types.${n.type}`) }}
              <span class="text-muted">{{ invoegSpecificatie(n) }}</span>
            </li>
          </ul>
        </section>
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
          data-testid="bevestig-sjabloon"
          @click="voegIn"
          >{{ $t("editor.invoegen.toevoegen") }}</UButton
        >
      </div>
    </template>
  </UModal>
</template>
