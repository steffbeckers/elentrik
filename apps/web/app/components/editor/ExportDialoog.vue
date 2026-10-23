<script setup lang="ts">
import type { AutosaveStatus } from "~/composables/useAutosave";
import { useExportsApi } from "~/composables/useExportsApi";
import { ConflictFout } from "~/composables/useProjectenApi";
import { magExporteren, onopgelosteFouten, volgendVersieLabel } from "~/editor/export";
import { bekendeFoutcode, vertaalFout } from "~/fouten";
import { useEditorStore } from "~/stores/editor";
import type { ExportInfo, ExportOnderdelen, Papierformaat } from "../../../shared/exports";

const open = defineModel<boolean>("open", { default: false });
const props = defineProps<{
  /** De status van de autosave; exporteren kan alleen bij `opgeslagen`. */
  status: AutosaveStatus;
  /** Bewaart de wijzigingen nu, zonder de vertraging van de autosave. */
  nuOpslaan: () => Promise<void>;
}>();
const emit = defineEmits<{
  /** De server heeft een andere versie dan de editor toont (409): de pagina toont het conflictscherm. */
  conflict: [huidigeVersie: number];
}>();

const store = useEditorStore();
const api = useExportsApi();
const toast = useToast();
const { t, locale } = useI18n();

/**
 * - `opslaan`: bij het openen wordt eerst bewaard en de lijst geladen.
 * - `formulier`: de keuzes; ook als exporteren (nog) niet mag, met de reden.
 * - `bevestigen`: er zijn onopgeloste fouten en de gebruiker moet bevestigen.
 * - `bezig`: de server maakt de PDF.
 */
type Fase = "opslaan" | "formulier" | "bevestigen" | "bezig";
const fase = ref<Fase>("opslaan");

const ONDERDELEN = [
  "eendraadschema",
  "situatieschema",
  "kringenlijst",
  "bijlage",
] as const satisfies readonly (keyof ExportOnderdelen)[];
const PAPIER = ["A4", "A3"] as const satisfies readonly Papierformaat[];

const onderdelen = reactive<ExportOnderdelen>({
  eendraadschema: true,
  situatieschema: true,
  kringenlijst: true,
  bijlage: true,
});
const papier = ref<Papierformaat>("A4");
const versie = ref("");

const eerdere = ref<ExportInfo[]>([]);
const lijstFout = ref(false);

const fouten = computed(() => onopgelosteFouten(store.bevindingen));
/** Bij onopgeloste fouten komt de bijlage verplicht mee; de server dwingt dat ook af. */
const bijlageVerplicht = computed(() => fouten.value > 0);
const geblokkeerd = computed(() => !magExporteren(props.status));

const geenOnderdeel = computed(
  () => !bijlageVerplicht.value && !ONDERDELEN.some((onderdeel) => onderdelen[onderdeel]),
);
const versieOngeldig = computed(() => {
  const lengte = versie.value.trim().length;
  return lengte < 1 || lengte > 40;
});
const kanStarten = computed(
  () => fase.value === "formulier" && !geblokkeerd.value && !geenOnderdeel.value && !versieOngeldig.value,
);

/** Elke opening krijgt een nummer: een antwoord van een vorige opening wordt genegeerd. */
let opening = 0;

async function laadLijst(projectId: string): Promise<void> {
  try {
    eerdere.value = await api.lijst(projectId);
    lijstFout.value = false;
  } catch {
    lijstFout.value = true;
  }
}

async function bijOpenen(): Promise<void> {
  const deze = ++opening;
  fase.value = "opslaan";
  onderdelen.eendraadschema = true;
  onderdelen.situatieschema = true;
  onderdelen.kringenlijst = true;
  onderdelen.bijlage = true;
  papier.value = "A4";
  eerdere.value = [];
  lijstFout.value = false;

  const projectId = store.projectId;
  // Een mislukt bewaren zet de status zelf (`lokaal`, `fout`, ...): de dialoog toont dan de reden.
  await Promise.all([props.nuOpslaan().catch(() => {}), projectId === null ? undefined : laadLijst(projectId)]);
  if (deze !== opening) return;
  versie.value = volgendVersieLabel(lijstFout.value ? null : eerdere.value.length);
  fase.value = "formulier";
}

watch(open, (isOpen) => {
  if (isOpen) void bijOpenen();
  else opening++;
});

function start(): void {
  if (!kanStarten.value) return;
  if (fouten.value > 0) fase.value = "bevestigen";
  else void exporteer();
}

/** Start de download van het bestand via een tijdelijke link. */
function download(url: string): void {
  const link = window.document.createElement("a");
  link.href = url;
  link.download = "";
  link.style.display = "none";
  window.document.body.append(link);
  link.click();
  link.remove();
}

/** Loopt er al een export, dan start een tweede klik er geen nieuwe. */
let exportLoopt = false;

async function exporteer(): Promise<void> {
  if (exportLoopt) return;
  const projectId = store.projectId;
  if (projectId === null || geblokkeerd.value) {
    fase.value = "formulier";
    return;
  }
  exportLoopt = true;
  const deze = opening;
  fase.value = "bezig";
  try {
    // De versie die de editor toont: heeft de server een andere, dan volgt een ConflictFout.
    const info = await api.maak(projectId, store.versie, {
      onderdelen: { ...onderdelen, bijlage: bijlageVerplicht.value || onderdelen.bijlage },
      papier: papier.value,
      versieLabel: versie.value.trim(),
    });
    download(api.downloadUrl(info.bestandId));
    toast.add({ title: t("editor.export.klaar", { versie: info.versieLabel }), color: "success" });
    if (deze !== opening) return;
    await laadLijst(projectId);
    if (deze !== opening) return;
    versie.value = volgendVersieLabel(lijstFout.value ? null : eerdere.value.length);
  } catch (fout) {
    if (fout instanceof ConflictFout) {
      // Niet de PDF van een andere versie dan op het scherm: het conflictscherm neemt het over.
      open.value = false;
      emit("conflict", fout.huidigeVersie);
      return;
    }
    // Met een code (bv. de PDF-dienst onbereikbaar) de vertaling ervan; anders de algemene exportfout.
    toast.add({ title: bekendeFoutcode(fout) ? vertaalFout(fout, t) : t("editor.export.mislukt"), color: "error" });
  } finally {
    exportLoopt = false;
    if (deze === opening) fase.value = "formulier";
  }
}

const datumFormaat = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }),
);
</script>

<template>
  <UModal
    v-model:open="open"
    :title="$t('editor.export.titel')"
    :description="$t('editor.export.beschrijving')"
    :dismissible="fase !== 'bezig'"
    :close="fase !== 'bezig'"
  >
    <template #body>
      <div v-if="fase === 'opslaan'" class="flex items-center gap-2 text-muted" data-testid="export-opslaan">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        {{ $t("editor.export.opslaan") }}
      </div>

      <div v-else class="space-y-6">
        <UAlert
          v-if="geblokkeerd"
          color="error"
          variant="subtle"
          icon="i-lucide-cloud-alert"
          :title="$t('editor.export.geblokkeerd.titel')"
          :description="$t(`editor.export.geblokkeerd.${status}`)"
          data-testid="export-geblokkeerd"
        />

        <div v-if="fase === 'bevestigen'" class="space-y-3" data-testid="export-bevestiging">
          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="$t('editor.export.bevestiging', { n: fouten }, fouten)"
          />
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="outline"
              :label="$t('algemeen.annuleren')"
              data-testid="export-annuleren"
              @click="fase = 'formulier'"
            />
            <UButton
              color="warning"
              :label="$t('editor.export.tochExporteren')"
              :disabled="geblokkeerd"
              data-testid="export-bevestig"
              @click="exporteer"
            />
          </div>
        </div>

        <div v-else-if="fase === 'bezig'" class="space-y-1" data-testid="export-voortgang">
          <UProgress animation="carousel" />
          <p class="text-sm text-muted">{{ $t("editor.export.bezig") }}</p>
        </div>

        <div v-else class="space-y-4">
          <fieldset class="space-y-2">
            <legend class="mb-2 text-sm font-medium">{{ $t("editor.export.onderdelen.titel") }}</legend>
            <template v-for="onderdeel in ONDERDELEN" :key="onderdeel">
              <UCheckbox
                v-if="onderdeel === 'bijlage'"
                :model-value="bijlageVerplicht || onderdelen.bijlage"
                :disabled="bijlageVerplicht"
                :label="$t('editor.export.onderdelen.bijlage')"
                :description="
                  bijlageVerplicht ? $t('editor.export.bijlageVerplicht', { n: fouten }, fouten) : undefined
                "
                data-testid="export-bijlage"
                @update:model-value="onderdelen.bijlage = $event === true"
              />
              <UCheckbox
                v-else
                v-model="onderdelen[onderdeel]"
                :label="$t(`editor.export.onderdelen.${onderdeel}`)"
                :data-testid="`export-${onderdeel}`"
              />
            </template>
            <p v-if="geenOnderdeel" class="text-sm text-error">{{ $t("editor.export.onderdelen.geen") }}</p>
            <p class="text-sm text-muted" data-testid="export-hint-zonder-plan">
              {{ $t("editor.export.onderdelen.zonderPlan") }}
            </p>
          </fieldset>

          <UFormField :label="$t('editor.export.papier')">
            <URadioGroup
              v-model="papier"
              orientation="horizontal"
              :items="PAPIER.map((p) => ({ label: p, value: p }))"
              data-testid="export-papier"
            />
          </UFormField>

          <UFormField
            :label="$t('editor.export.versie')"
            :error="versieOngeldig ? $t('editor.export.versieOngeldig') : undefined"
          >
            <UInput v-model="versie" class="w-full" maxlength="40" data-testid="export-versie" @keydown.enter="start" />
          </UFormField>
        </div>

        <section class="space-y-2" data-testid="export-lijst">
          <h3 class="text-sm font-medium">{{ $t("editor.export.eerdere.titel") }}</h3>
          <p v-if="lijstFout" class="text-sm text-error">{{ $t("editor.export.eerdere.ladenMislukt") }}</p>
          <p v-else-if="eerdere.length === 0" class="text-sm text-muted">{{ $t("editor.export.eerdere.geen") }}</p>
          <table v-else class="w-full text-sm">
            <thead class="text-left text-muted">
              <tr>
                <th class="py-1 font-normal">{{ $t("editor.export.eerdere.versie") }}</th>
                <th class="py-1 font-normal">{{ $t("editor.export.eerdere.datum") }}</th>
                <th class="py-1 font-normal">{{ $t("editor.export.eerdere.fouten") }}</th>
                <th class="py-1"><span class="sr-only">{{ $t("editor.export.eerdere.downloaden") }}</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in eerdere"
                :key="item.id"
                class="border-t border-default"
                :data-testid="`export-rij-${item.versieLabel}`"
              >
                <td class="py-1 font-medium">{{ item.versieLabel }}</td>
                <td class="py-1">{{ datumFormaat.format(new Date(item.aangemaakt)) }}</td>
                <td class="py-1" :class="item.aantalFouten > 0 ? 'text-error' : 'text-muted'">
                  {{ $t("editor.export.eerdere.aantalFouten", { n: item.aantalFouten }, item.aantalFouten) }}
                </td>
                <td class="py-1 text-right">
                  <UButton
                    :to="api.downloadUrl(item.bestandId)"
                    :external="true"
                    download
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-download"
                    :label="$t('editor.export.eerdere.downloaden')"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :label="$t('editor.export.sluiten')"
          :disabled="fase === 'bezig'"
          @click="open = false"
        />
        <UButton
          icon="i-lucide-file-down"
          :label="$t('editor.export.start')"
          :loading="fase === 'bezig'"
          :disabled="!kanStarten"
          data-testid="export-start"
          @click="start"
        />
      </div>
    </template>
  </UModal>
</template>
