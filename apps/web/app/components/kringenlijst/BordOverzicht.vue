<script setup lang="ts">
import {
  MAX_KRINGEN_PER_DIFFERENTIEEL, MODULES_PER_RIJ, bordOverzicht, differentieelNaam,
  type BordDifferentieel, type BordOverzicht as Bord,
} from "@elentrik/render";
import { computed } from "vue";
import { useEditorStore } from "~/stores/editor";

// Het bordoverzicht boven de kringenlijst: per verdeelbord het aantal kringen, de modules, een
// voorstel voor de kast en de bezetting van elk differentieel. Indicatief, en dat staat erbij: een
// hulp bij het kiezen van de kast, geen controle. Te veel kringen achter een differentieel van
// hoogstens 30 mA krijgt een kleur, een icoon én een tekst; de bevinding zelf komt van de AREI-controle.
// Een lijst en geen tabel: de kolomkoppen van dit tabblad blijven die van de kringenlijst in de PDF.
const store = useEditorStore();
const { t } = useI18n();

/** Zonder kringen valt er niets samen te vatten: het blok verschijnt met de eerste kring. */
const borden = computed<Bord[]>(() => {
  if (!store.document || !store.analyse || store.analyse.kringen.length === 0) return [];
  return bordOverzicht(store.document, store.analyse).filter((bord) => bord.kringen > 0 || bord.modules > 0);
});

/** De eigen naam van het bord, anders "Verdeelbord 2" zoals in de keuzelijsten van het schema. */
function bordNaam(bord: Bord): string {
  return bord.naam || `${t("editor.types.verdeelbord")} ${bord.volgnummer}`;
}

function samenvatting(bord: Bord): string {
  return [
    t("editor.bord.kringen", { aantal: bord.kringen }, bord.kringen),
    t("editor.bord.modules", { aantal: bord.modules }, bord.modules),
    ...(bord.rijen > 0 ? [t("editor.bord.kast", { aantal: bord.rijen, perRij: MODULES_PER_RIJ }, bord.rijen)] : []),
  ].join(" · ");
}

/** "Differentieel B · 30 mA", met "(algemeen)" en de eigen omschrijving erbij. */
function differentieelTekst(differentieel: BordDifferentieel): string {
  const node = store.document?.nodes[differentieel.nodeId];
  if (node?.type !== "differentieel") return "";
  const naam = differentieelNaam(node, differentieel.plaats, (type) => t(`editor.types.${type}`));
  const algemeen = differentieel.algemeen ? ` (${t("editor.bord.algemeen")})` : "";
  return [`${naam}${algemeen}`, node.label?.trim()].filter(Boolean).join(" · ");
}

function bezetting(differentieel: BordDifferentieel): string {
  return [
    t("editor.bord.kringen", { aantal: differentieel.kringen }, differentieel.kringen),
    t("editor.bord.contactdozen", { aantal: differentieel.contactdozen }, differentieel.contactdozen),
  ].join(" · ");
}
</script>

<template>
  <section
    v-if="borden.length"
    class="sticky left-0 border-b border-default px-3 py-3"
    aria-labelledby="bordoverzicht-titel"
    data-testid="bordoverzicht"
  >
    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2 id="bordoverzicht-titel" class="text-sm font-semibold">{{ $t("editor.bord.titel") }}</h2>
      <p class="text-xs text-muted" data-testid="bordoverzicht-indicatief">{{ $t("editor.bord.indicatief") }}</p>
    </div>
    <ul class="mt-2 flex flex-col gap-2 text-sm">
      <li v-for="bord in borden" :key="bord.bordId" :data-testid="`bordoverzicht-bord-${bord.volgnummer}`">
        <p class="flex flex-wrap items-baseline gap-x-2">
          <span class="font-medium">{{ bordNaam(bord) }}</span>
          <span class="tabular-nums text-muted">{{ samenvatting(bord) }}</span>
        </p>
        <ul v-if="bord.differentielen.length" class="mt-1 flex flex-col gap-0.5 border-l border-default pl-2">
          <li
            v-for="differentieel in bord.differentielen"
            :key="differentieel.nodeId"
            class="flex flex-wrap items-center gap-x-2 rounded px-1"
            :class="differentieel.teVeelKringen ? 'bg-warning/10' : ''"
            :data-te-veel="differentieel.teVeelKringen || undefined"
            data-testid="bordoverzicht-differentieel"
          >
            <UIcon
              v-if="differentieel.teVeelKringen"
              name="i-lucide-triangle-alert"
              class="size-4 shrink-0 text-warning"
              aria-hidden="true"
            />
            <span>{{ differentieelTekst(differentieel) }}</span>
            <span class="tabular-nums" :class="differentieel.teVeelKringen ? '' : 'text-muted'">{{ bezetting(differentieel) }}</span>
            <span v-if="differentieel.teVeelKringen" class="font-medium">
              {{ $t("editor.bord.teVeel", { max: MAX_KRINGEN_PER_DIFFERENTIEEL }) }}
            </span>
          </li>
        </ul>
      </li>
    </ul>
  </section>
</template>
