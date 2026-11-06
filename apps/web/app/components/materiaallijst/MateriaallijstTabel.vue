<script setup lang="ts">
import { LOCALES } from "@elentrik/arei";
import { materiaallijst, type MateriaalRij } from "@elentrik/model";
import { computed } from "vue";
import { bestandsnaamMateriaalCsv, materiaalCsv } from "~/editor/materiaalcsv";
import { VELDEN } from "~/editor/velden";
import { useEditorStore } from "~/stores/editor";

const store = useEditorStore();
const { t } = useI18n();
const { taal } = useTaal();
const { nodeTekst } = useNodeTekst();
const getal = computed(() => new Intl.NumberFormat(LOCALES[taal.value], { maximumFractionDigits: 3 }));
const rijen = computed(() => store.document ? materiaallijst(store.document) : []);
const ontbrekend = computed(() => rijen.value.reduce((som, rij) => som + rij.ontbrekendeLengtes, 0));

function uitvoering(rij: MateriaalRij): string {
  return VELDEN[rij.type].flatMap((veld) => {
    const waarde = rij.eigenschappen[veld.sleutel];
    if (waarde === undefined) return [];
    const optie = veld.opties?.find((o) => o.waarde === waarde);
    const tekst = optie?.labelSleutel ? t(optie.labelSleutel)
      : typeof waarde === "boolean" ? t(`editor.materiaallijst.${waarde ? "ja" : "nee"}`)
      : waarde === "" || (veld.sleutel === "doorsnede_mm2" && waarde === 0) ? t("editor.materiaallijst.onbekend")
      : typeof waarde === "number" ? getal.value.format(waarde) : waarde;
    return [`${t(veld.labelSleutel)}: ${tekst}${veld.eenheid ? ` ${veld.eenheid}` : ""}`];
  }).join(" · ");
}

/** De CSV volgt de lijst: dezelfde volgorde, uitvoering en taal; gedownload via een Blob, zonder server. */
function downloadCsv(): void {
  const csv = materiaalCsv(rijen.value, taal.value, {
    uitvoering,
    materiaal: (rij) => t(`editor.types.${rij.type}`),
    teksten: {
      kop: {
        materiaal: t("editor.materiaallijst.csvKop.materiaal"), uitvoering: t("editor.materiaallijst.csvKop.uitvoering"),
        hoeveelheid: t("editor.materiaallijst.hoeveelheid"), eenheid: t("editor.materiaallijst.csvKop.eenheid"),
      },
      stuk: t("editor.materiaallijst.stuks", 1), stuks: t("editor.materiaallijst.stuks", 2), meter: t("editor.materiaallijst.m"),
      lengteOntbreekt: t("editor.materiaallijst.onvolledig"),
    },
  });
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = bestandsnaamMateriaalCsv(store.naam);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bronTekst(id: string): string {
  const node = store.document?.nodes[id];
  if (node?.type !== "leiding") return nodeTekst(id);
  const lengte = node.lengte_m === undefined ? t("editor.materiaallijst.onbekend")
    : `${getal.value.format(node.lengte_m)} ${t("editor.materiaallijst.m")}`;
  const kring = store.analyse?.kringen.find((k) => k.id === store.analyse?.kringVanNode[id]);
  const naam = node.label || nodeTekst(id);
  return `${kring ? `${kring.label} · ` : ""}${naam} · ${lengte}`;
}
</script>

<template>
  <section class="min-h-0 min-w-0 overflow-auto" :aria-label="$t('editor.materiaallijst.titel')" data-testid="materiaallijst">
    <div class="space-y-2 border-b border-default p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">{{ $t('editor.materiaallijst.titel') }}</h2>
        <UButton v-if="rijen.length" color="neutral" variant="outline" size="sm" icon="i-lucide-download"
          :label="$t('editor.materiaallijst.csvDownloaden')" data-testid="materiaallijst-csv" @click="downloadCsv" />
      </div>
      <p class="max-w-prose text-sm text-muted">{{ $t('editor.materiaallijst.uitleg') }}</p>
      <p class="max-w-prose text-sm text-muted">{{ $t('editor.materiaallijst.lengteUitleg') }}</p>
      <p v-if="ontbrekend" role="status" class="text-sm text-warning" data-testid="materiaallijst-ontbrekend">
        {{ $t('editor.materiaallijst.ontbrekend', { aantal: ontbrekend }) }}
      </p>
    </div>
    <p v-if="!rijen.length" class="p-6 text-sm text-muted">{{ $t('editor.materiaallijst.leeg') }}</p>
    <table v-else class="w-full border-separate border-spacing-0 text-left text-sm">
      <thead>
        <tr>
          <th scope="col" class="sticky top-0 border-b border-default bg-elevated px-4 py-2 font-semibold">{{ $t('editor.materiaallijst.materiaal') }}</th>
          <th scope="col" class="sticky top-0 border-b border-default bg-elevated px-4 py-2 text-right font-semibold">{{ $t('editor.materiaallijst.hoeveelheid') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="rij in rijen" :key="rij.sleutel" :data-materiaal-type="rij.type">
          <td class="border-b border-default px-4 py-3 align-top">
            <div class="font-medium">{{ $t(`editor.types.${rij.type}`) }}</div>
            <p class="mt-1 max-w-prose text-muted">{{ uitvoering(rij) }}</p>
            <details class="mt-2">
              <summary class="w-fit cursor-pointer rounded text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary">
                {{ $t('editor.materiaallijst.bronnen', { aantal: rij.nodeIds.length }) }}
              </summary>
              <ul class="mt-2 space-y-1">
                <li v-for="id in rij.nodeIds" :key="id">
                  <UButton color="neutral" variant="ghost" size="sm" :label="bronTekst(id)"
                    :aria-pressed="store.selectie.includes(id)" :data-testid="`materiaal-bron-${id}`"
                    @click="store.selectie = [id]" />
                </li>
              </ul>
            </details>
          </td>
          <td class="border-b border-default px-4 py-3 text-right align-top tabular-nums">
            <span class="whitespace-nowrap font-medium" data-testid="materiaal-hoeveelheid">
              {{ rij.ontbrekendeLengtes === rij.nodeIds.length ? '—' : getal.format(rij.hoeveelheid) }} {{ $t(`editor.materiaallijst.${rij.eenheid}`, rij.hoeveelheid) }}
            </span>
            <p v-if="rij.ontbrekendeLengtes" class="mt-1 text-warning">{{ $t('editor.materiaallijst.onvolledig') }}</p>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>
