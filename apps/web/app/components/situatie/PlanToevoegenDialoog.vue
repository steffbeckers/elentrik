<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import { useAlleenLezen } from "~/composables/useAlleenLezen";
import { useBestandenApi } from "~/composables/useBestandenApi";
import { laadPdf, verkleinAfbeelding, type PdfDocument } from "~/situatie/pdf";
import { isAfgebroken, laadPlannenOp, uploadFoutMelding, type UploadFoutSleutel } from "~/situatie/plan-opladen";
import PlanUitsnede, { type UitsnedeConcept } from "~/components/situatie/PlanUitsnede.vue";
import { snijdRaster } from "~/situatie/uitsnede";
import { paginaTitel } from "~/situatie/raster";
import { useEditorStore } from "~/stores/editor";
import { useSituatieStore } from "~/stores/situatie";
import { controleerPlanbestand, type BestandSoort } from "../../../shared/bestandsinhoud";

const props = defineProps<{
  /** Zet het plan van deze pagina om in plaats van een pagina toe te voegen. */
  vervangPaginaId?: string;
}>();

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{
  klaar: [paginaId: string];
  tekenen: [];
  /** Het project bleek elders verwijderd (404 bij het uploaden): de editor toont zijn verwijderd-melding. */
  verwijderd: [];
}>();

/** Lange zijde (px) van een voorbeeld in het paginaraster. */
const VOORBEELD_PX = 160;

const { t } = useI18n();
const toast = useToast();
const editor = useEditorStore();
const situatie = useSituatieStore();
const bestanden = useBestandenApi();
const alleenLezen = useAlleenLezen();

type Voorbeeld = { nr: number; url: string | null; fout: boolean };

const bestand = ref<File | null>(null);
const soort = ref<BestandSoort | null>(null);
const pdf = ref<PdfDocument | null>(null);
const voorbeelden = ref<Voorbeeld[]>([]);
const gekozenPagina = ref<number | null>(null);
const uitsneden = ref<UitsnedeConcept[]>([]);
const afbeeldingUrl = ref<string | null>(null);
const uitsnedeVoorbeelden = ref<Record<number, string>>({});
const bezigMet = ref<"pdf" | "renderen" | "opladen" | null>(null);
const sleept = ref(false);
const invoer = useTemplateRef<HTMLInputElement>("invoer");

let controller: AbortController | null = null;
/** Verhoogt bij elke reset, zodat een late PDF of een laat voorbeeld van een vorig bestand wegvalt. */
let sessie = 0;

const kanBevestigen = computed(
  () =>
    !editor.alleenLezen &&
    bezigMet.value === null &&
    bestand.value !== null &&
    uitsneden.value.length > 0 && uitsneden.value.every(u => u.titel.trim() && [u.x, u.y, u.breedte, u.hoogte].every(Number.isFinite) && u.x >= 0 && u.y >= 0 && u.breedte >= 1 && u.hoogte >= 1 && u.x + u.breedte <= 100 && u.y + u.hoogte <= 100),
);

function geefVoorbeeldenVrij() {
  for (const voorbeeld of voorbeelden.value) {
    if (voorbeeld.url) URL.revokeObjectURL(voorbeeld.url);
  }
  voorbeelden.value = [];
}

/** Breekt een lopende upload af en geeft de PDF en de voorbeelden vrij. */
function reset() {
  sessie++;
  controller?.abort();
  controller = null;
  const oudePdf = pdf.value;
  pdf.value = null;
  // Een fout bij het sluiten van een document dat we niet meer nodig hebben is niet interessant.
  void oudePdf?.sluit().catch(() => undefined);
  geefVoorbeeldenVrij();
  for (const url of Object.values(uitsnedeVoorbeelden.value)) URL.revokeObjectURL(url);
  uitsnedeVoorbeelden.value = {};
  bestand.value = null;
  soort.value = null;
  gekozenPagina.value = null;
  uitsneden.value = [];
  if (afbeeldingUrl.value) URL.revokeObjectURL(afbeeldingUrl.value);
  afbeeldingUrl.value = null;
  bezigMet.value = null;
  sleept.value = false;
  if (invoer.value) invoer.value.value = "";
}

watch(open, () => reset());
onBeforeUnmount(reset);

function meld(sleutel: UploadFoutSleutel | "onleesbaar") {
  const titel = sleutel === "opslagVol" ? t("fouten.OPSLAG_VOL") : t(`editor.situatie.toevoegen.fout.${sleutel}`);
  toast.add({ title: titel, color: "error" });
}

async function laadVoorbeelden(document: PdfDocument, dezeSessie: number) {
  for (let nr = 1; nr <= document.aantalPaginas; nr++) {
    let url: string | null = null;
    try {
      url = URL.createObjectURL(await document.voorbeeld(nr, VOORBEELD_PX));
    } catch {
      // Zonder voorbeeld blijft de pagina kiesbaar; de tegel toont dan een pictogram.
    }
    if (dezeSessie !== sessie) {
      if (url) URL.revokeObjectURL(url);
      return;
    }
    const voorbeeld = voorbeelden.value[nr - 1];
    if (!voorbeeld) continue;
    voorbeeld.url = url;
    voorbeeld.fout = url === null;
  }
}

async function kies(gekozen: File) {
  reset();
  const dezeSessie = sessie;

  // De eerste 16 bytes volstaan voor het type; zo gaat er niets over het netwerk bij een afkeuring.
  const kop = new Uint8Array(await gekozen.slice(0, 16).arrayBuffer());
  if (dezeSessie !== sessie) return;
  const controle = controleerPlanbestand(gekozen.size, kop);
  if (!controle.ok) {
    meld(controle.reden === "te-groot" ? "teGroot" : "onbekendType");
    return;
  }

  bestand.value = gekozen;
  soort.value = controle.soort;
  if (controle.soort !== "pdf") {
    afbeeldingUrl.value = URL.createObjectURL(gekozen);
    voegUitsnedeToe();
    return;
  }

  bezigMet.value = "pdf";
  let document: PdfDocument;
  try {
    document = await laadPdf(await gekozen.arrayBuffer());
  } catch {
    if (dezeSessie !== sessie) return;
    reset();
    meld("onleesbaar");
    return;
  }
  if (dezeSessie !== sessie) {
    void document.sluit().catch(() => undefined);
    return;
  }
  pdf.value = document;
  bezigMet.value = null;
  voorbeelden.value = Array.from({ length: document.aantalPaginas }, (_, i) => ({
    nr: i + 1,
    url: null,
    fout: false,
  }));
  // Een PDF van één pagina hoeft niets te kiezen.
  if (document.aantalPaginas === 1) { gekozenPagina.value = 1; voegUitsnedeToe(1); }
  await laadVoorbeelden(document, dezeSessie);
}

async function voegUitsnedeToe(nr?: number) {
  if (nr) gekozenPagina.value = nr;
  const pdfPagina = nr ?? (soort.value === "pdf" ? gekozenPagina.value ?? undefined : undefined);
  if (soort.value === "pdf" && !pdfPagina) return;
  uitsneden.value.push({ titel: paginaTitel(bestand.value?.name ?? "", pdfPagina, t("editor.situatie.toevoegen.standaardTitel", { nummer: uitsneden.value.length + 1 })), ...(pdfPagina ? { pdfPagina } : {}), x: 0, y: 0, breedte: 100, hoogte: 100, rotatie: 0, referentie: false });
  if (pdfPagina && pdf.value && !uitsnedeVoorbeelden.value[pdfPagina]) {
    const dezeSessie = sessie;
    try {
      const url = URL.createObjectURL(await pdf.value.voorbeeld(pdfPagina, 1000));
      if (dezeSessie !== sessie) URL.revokeObjectURL(url);
      else {
        const oud = uitsnedeVoorbeelden.value[pdfPagina];
        if (oud) URL.revokeObjectURL(oud);
        uitsnedeVoorbeelden.value[pdfPagina] = url;
      }
    } catch { /* The source page remains selectable when a preview cannot render. */ }
  }
}

function opBestandGekozen(gebeurtenis: Event) {
  const gekozen = (gebeurtenis.target as HTMLInputElement).files?.[0];
  if (gekozen) void kies(gekozen);
}

function opGedropt(gebeurtenis: DragEvent) {
  sleept.value = false;
  const gekozen = gebeurtenis.dataTransfer?.files[0];
  if (gekozen && bezigMet.value === null) void kies(gekozen);
}

async function bevestig() {
  const gekozen = bestand.value;
  const projectId = editor.projectId;
  if (!gekozen || !projectId || !kanBevestigen.value) return;

  const afbreker = new AbortController();
  controller = afbreker;
  const dezeSessie = sessie;
  try {
    bezigMet.value = "renderen";
    const concepten = uitsneden.value.map(u => ({ ...u }));
    const bronnen = new Map<number, Awaited<ReturnType<typeof verkleinAfbeelding>>>();
    const invoeren = [];
    for (const u of concepten) {
      const nr = u.pdfPagina ?? 0;
      let bron = bronnen.get(nr);
      if (!bron) {
        bron = pdf.value && u.pdfPagina ? await pdf.value.raster(u.pdfPagina) : await verkleinAfbeelding(gekozen);
        bronnen.set(nr, bron);
      }
      const x = Math.floor(u.x * bron.breedte / 100);
      const y = Math.floor(u.y * bron.hoogte / 100);
      const bronUitsnede = { x, y, breedte: Math.min(bron.breedte - x, Math.round(u.breedte * bron.breedte / 100)), hoogte: Math.min(bron.hoogte - y, Math.round(u.hoogte * bron.hoogte / 100)), rotatie: u.rotatie };
      const volledig = u.x === 0 && u.y === 0 && u.breedte === 100 && u.hoogte === 100 && u.rotatie === 0;
      const raster = volledig ? bron.blob : await snijdRaster(bron.blob, bronUitsnede);
      invoeren.push({ origineel: gekozen, raster, naam: gekozen.name, ...(u.pdfPagina ? { pdfPagina: u.pdfPagina } : {}), bronUitsnede });
      if (afbreker.signal.aborted || dezeSessie !== sessie) return;
    }
    bezigMet.value = "opladen";
    const achtergronden = await laadPlannenOp(bestanden, projectId, invoeren, afbreker.signal);
    if (afbreker.signal.aborted || dezeSessie !== sessie || editor.alleenLezen) return;
    // Recropping a page with existing points always creates a new page.
    const bestaandePagina = editor.document?.situatie.paginas.find(p => p.id === props.vervangPaginaId);
    let paginaId: string;
    if (bestaandePagina && !bestaandePagina.referentie && bestaandePagina.plaatsingen.length === 0 && concepten.length === 1 && !concepten[0]!.referentie) {
      paginaId = bestaandePagina.id;
      situatie.vervangAchtergrond(paginaId, achtergronden[0]!);
    } else {
      const ids = situatie.voegPlanPaginasToe(concepten.map((u, i) => ({ titel: u.titel.trim(), achtergrond: achtergronden[i]!, referentie: u.referentie })));
      // Over de gratis limiet: niets toegevoegd. De dialoog sluit, zodat het limietvenster te zien is.
      if (ids.length === 0) {
        open.value = false;
        return;
      }
      paginaId = ids[0]!;
    }
    open.value = false;
    emit("klaar", paginaId);
  } catch (fout) {
    if (afbreker.signal.aborted || isAfgebroken(fout) || dezeSessie !== sessie) return;
    const sleutel = await uploadFoutMelding(fout, alleenLezen, () => {
      // De dialoog sluit, zodat de melding van de editor te zien is.
      emit("verwijderd");
      open.value = false;
    });
    if (sleutel && dezeSessie === sessie) meld(sleutel);
  } finally {
    if (dezeSessie === sessie) {
      controller = null;
      bezigMet.value = null;
    }
  }
}

function annuleer() {
  // Sluiten voert `reset` uit en breekt daarmee een lopende upload af.
  open.value = false;
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="$t(vervangPaginaId ? 'editor.situatie.toevoegen.titelVervangen' : 'editor.situatie.toevoegen.titel')"
    :description="$t('editor.situatie.toevoegen.beschrijving')"
  >
    <template #body>
      <div class="space-y-4">
        <AlleenLezenMelding />
        <div v-if="!vervangPaginaId && !bestand" class="flex items-center justify-between gap-3 border-b border-default pb-4">
          <p class="text-sm text-muted">{{ $t('editor.situatie.tekenen.noPlan') }}</p>
          <UButton icon="i-lucide-pencil-ruler" color="neutral" variant="outline" :disabled="editor.alleenLezen" :label="$t('editor.situatie.tekenen.new')" @click="open = false; emit('tekenen')" />
        </div>
        <input
          ref="invoer"
          type="file"
          class="hidden"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          data-testid="plan-bestand"
          @change="opBestandGekozen"
        />

        <div
          class="flex flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-center"
          :class="sleept ? 'border-primary bg-primary/5' : 'border-default'"
          @dragover.prevent="sleept = true"
          @dragleave="sleept = false"
          @drop.prevent="opGedropt"
        >
          <template v-if="bestand">
            <p class="flex items-center gap-2 font-medium">
              <UIcon name="i-lucide-file" class="size-5" />
              <span class="break-all">{{ bestand.name }}</span>
            </p>
            <UButton
              color="neutral"
              variant="link"
              :disabled="bezigMet === 'renderen' || bezigMet === 'opladen'"
              :label="$t('editor.situatie.toevoegen.ander')"
              @click="invoer?.click()"
            />
          </template>
          <template v-else>
            <UButton
              icon="i-lucide-upload"
              color="neutral"
              variant="outline"
              :label="$t('editor.situatie.toevoegen.kiezen')"
              @click="invoer?.click()"
            />
            <p class="text-sm text-muted">{{ $t("editor.situatie.toevoegen.slepen") }}</p>
          </template>
        </div>

        <p v-if="bezigMet === 'pdf'" class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
          {{ $t("editor.situatie.toevoegen.pdfLaadt") }}
        </p>

        <div v-if="soort === 'pdf' && voorbeelden.length > 0" class="space-y-2">
          <p class="text-sm font-medium">{{ $t("editor.situatie.toevoegen.paginaKiezen") }}</p>
          <div class="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            <button
              v-for="voorbeeld in voorbeelden"
              :key="voorbeeld.nr"
              type="button"
              :data-testid="`pdf-pagina-${voorbeeld.nr}`"
              :aria-pressed="uitsneden.some(u => u.pdfPagina === voorbeeld.nr)"
              :disabled="bezigMet !== null"
              class="flex flex-col items-center gap-1 rounded-md border p-2 text-xs"
              :class="uitsneden.some(u => u.pdfPagina === voorbeeld.nr) ? 'border-primary ring-2 ring-primary' : 'border-default'"
              @click="voegUitsnedeToe(voorbeeld.nr)"
            >
              <span class="flex aspect-[3/4] w-full items-center justify-center bg-elevated">
                <img
                  v-if="voorbeeld.url"
                  :src="voorbeeld.url"
                  :alt="$t('editor.situatie.toevoegen.pagina', { nr: voorbeeld.nr })"
                  class="max-h-full max-w-full object-contain"
                />
                <UIcon v-else-if="voorbeeld.fout" name="i-lucide-image-off" class="size-5 text-muted" />
                <UIcon
                  v-else
                  name="i-lucide-loader-circle"
                  class="size-5 animate-spin text-muted"
                  :title="$t('editor.situatie.toevoegen.voorbeeldLaadt')"
                />
              </span>
              {{ $t("editor.situatie.toevoegen.pagina", { nr: voorbeeld.nr }) }}
            </button>
          </div>
        </div>

        <p v-if="bestand" class="text-sm text-muted">{{ t('editor.situatie.uitsnede.uitleg') }}</p>
        <p v-if="vervangPaginaId && editor.document?.situatie.paginas.find(p => p.id === vervangPaginaId)?.plaatsingen.length" class="text-sm text-warning">{{ t('editor.situatie.uitsnede.bestaandePunten') }}</p>
        <PlanUitsnede v-for="(uitsnede, index) in uitsneden" :key="index" v-model="uitsneden[index]!" :url="uitsnede.pdfPagina ? uitsnedeVoorbeelden[uitsnede.pdfPagina] ?? voorbeelden[uitsnede.pdfPagina - 1]?.url : afbeeldingUrl" :disabled="bezigMet !== null" @verwijder="uitsneden.splice(index, 1)" />
        <UButton v-if="bestand" icon="i-lucide-crop" color="neutral" variant="outline" :disabled="bezigMet !== null || (soort === 'pdf' && !gekozenPagina)" :label="t('editor.situatie.uitsnede.extra')" @click="voegUitsnedeToe()" />
        <p v-if="bestand" class="text-sm text-warning">{{ t('editor.situatie.uitsnede.kalibratie') }}</p>

        <div v-if="bezigMet === 'renderen' || bezigMet === 'opladen'" class="space-y-1" data-testid="plan-voortgang">
          <UProgress animation="carousel" />
          <p class="text-sm text-muted">
            {{
              $t(
                bezigMet === "renderen"
                  ? "editor.situatie.toevoegen.bezigRenderen"
                  : "editor.situatie.toevoegen.bezigOpladen",
              )
            }}
          </p>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="annuleer" />
        <UButton
          :disabled="!kanBevestigen"
          :loading="bezigMet === 'renderen' || bezigMet === 'opladen'"
          data-testid="plan-toevoegen-bevestig"
          :label="$t(vervangPaginaId ? 'editor.situatie.toevoegen.vervangen' : 'editor.situatie.toevoegen.toevoegen')"
          @click="bevestig"
        />
      </div>
    </template>
  </UModal>
</template>
