<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { ProjectInLijst } from "~/composables/useProjectenApi";
import { useAlleenLezen } from "~/composables/useAlleenLezen";
import { useSessieHerstel } from "~/composables/useSessieHerstel";
import { vertaalFout } from "~/fouten";
import { useSessieStore } from "~/stores/sessie";
import { filterProjecten } from "~/utils/projectenZoeken";
import { LOCALES } from "../../shared/taal";

const { t } = useI18n();
const api = useProjectenApi();
const toast = useToast();
const sessie = useSessieStore();
const alleenLezen = useAlleenLezen();
const { taal } = useTaal();

// Zonder schrijfrecht (spec 4.4) zijn aanmaken en dupliceren verborgen; de server weigert ze met 402.
const kanSchrijven = computed(() => sessie.toegang.schrijven);

// Enkel op de client geladen: de relatieve tijden hangen van het huidige moment af. Een andere
// actieve organisatie (de organisatiekeuze) laadt de lijst van die organisatie.
const { data: projecten, status, error, refresh } = useAsyncData("projecten", () => api.lijst(), {
  server: false,
  default: () => [] as ProjectInLijst[],
  watch: [() => sessie.actieveOrganisatieId],
});

// Verlopen sessie of niet meer lid van de actieve organisatie (spec 5b.5).
watch(error, useSessieHerstel());

const zoek = ref("");
const zoekveld = useTemplateRef("zoekveld");
const gefilterdeProjecten = computed(() => filterProjecten(projecten.value, zoek.value));

watch(() => sessie.actieveOrganisatieId, () => {
  zoek.value = "";
});

const gemount = ref(false);
const laadt = computed(() => gemount.value && status.value === "pending");
const nu = ref(new Date());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  gemount.value = true;
  timer = setInterval(() => (nu.value = new Date()), 30_000);
});
onBeforeUnmount(() => clearInterval(timer));

// Echt leeg: geladen, zonder fout en zonder projecten. Dan staat "Nieuw project" bij de stappen.
const leeg = computed(() => status.value === "success" && projecten.value.length === 0);
const leegStappen = ["klant", "schema", "plan", "export"] as const;

const exportDatum = computed(() => new Intl.DateTimeFormat(LOCALES[taal.value], { dateStyle: "short" }));

const kolommen = computed<TableColumn<ProjectInLijst>[]>(() => [
  { accessorKey: "naam", header: t("projecten.kolommen.naam") },
  { accessorKey: "klantnaam", header: t("projecten.kolommen.klant") },
  { accessorKey: "werfGemeente", header: t("projecten.kolommen.werf") },
  { id: "status", header: t("projecten.kolommen.status") },
  { accessorKey: "gewijzigd", header: t("projecten.kolommen.gewijzigd") },
  { id: "acties" },
]);

const nieuwOpen = ref(false);
const teVerwijderen = ref<ProjectInLijst | null>(null);
const verwijderOpen = computed({
  get: () => teVerwijderen.value !== null,
  set: (open) => {
    if (!open) teVerwijderen.value = null;
  },
});

// De toast meldt enkel het resultaat van de actie. Een mislukte herlaadbeurt
// erna komt in `error` terecht en toont de laadfout in plaats van de tabel.
async function voerActieUit(actie: () => Promise<unknown>): Promise<boolean> {
  try {
    await actie();
    return true;
  } catch (fout) {
    // Een 402 ververst de sessie en meldt alleen-lezen; een andere fout is een generieke fout.
    if (!(await alleenLezen(fout))) toast.add({ title: vertaalFout(fout, t), color: "error" });
    return false;
  }
}

// Eén lopende actie tegelijk per soort, zodat een dubbelklik geen twee kopieën maakt.
const dupliceerBezig = ref<string | null>(null);
const verwijderBezig = ref(false);

async function dupliceer(project: ProjectInLijst) {
  if (dupliceerBezig.value !== null) return;
  dupliceerBezig.value = project.id;
  try {
    if (await voerActieUit(() => api.dupliceer(project.id))) await refresh();
  } finally {
    dupliceerBezig.value = null;
  }
}

async function bevestigVerwijderen() {
  const project = teVerwijderen.value;
  if (!project || verwijderBezig.value) return;
  verwijderBezig.value = true;
  try {
    if (await voerActieUit(() => api.verwijder(project.id))) {
      teVerwijderen.value = null;
      await refresh();
    }
  } finally {
    verwijderBezig.value = false;
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <AppBovenbalk />
    <AbonnementBanner />
    <UContainer class="py-8">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 class="text-2xl font-semibold">{{ $t("projecten.titel") }}</h1>
        <div class="flex flex-wrap gap-2">
          <UButton v-if="kanSchrijven && !leeg" icon="i-lucide-plus" :label="$t('projecten.nieuw')" @click="nieuwOpen = true" />
        </div>
      </div>

      <UInput
        v-if="!leeg"
        ref="zoekveld"
        v-model="zoek"
        type="search"
        icon="i-lucide-search"
        :placeholder="$t('projecten.zoeken.placeholder')"
        :aria-label="$t('projecten.zoeken.label')"
        class="mb-4 w-full sm:max-w-md"
        :ui="{ base: '[&::-webkit-search-cancel-button]:appearance-none', trailing: 'pe-1' }"
      >
        <template v-if="zoek" #trailing>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="$t('projecten.zoeken.wissen')"
            :title="$t('projecten.zoeken.wissen')"
            @click="zoek = ''; zoekveld?.inputRef?.focus()"
          />
        </template>
      </UInput>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="$t('projecten.laden.fout.titel')"
        :description="$t('projecten.laden.fout.beschrijving')"
        :actions="[{ label: $t('projecten.laden.fout.opnieuw'), color: 'error', onClick: () => refresh() }]"
      />
      <!-- Nog geen projecten: de stappen van de workflow met "Nieuw project" als primaire actie, geen lege tabel. -->
      <section v-else-if="leeg" class="flex max-w-xl flex-col items-start gap-4 py-4" data-testid="projecten-leeg">
        <h2 class="font-medium text-highlighted">{{ $t("projecten.leeg") }}</h2>
        <ol class="list-decimal space-y-1 ps-5 text-muted">
          <li v-for="stap in leegStappen" :key="stap">{{ $t(`projecten.leegStappen.${stap}`) }}</li>
        </ol>
        <UButton v-if="kanSchrijven" icon="i-lucide-plus" :label="$t('projecten.nieuw')" @click="nieuwOpen = true" />
      </section>
      <UTable
        v-else
        :data="gefilterdeProjecten"
        :columns="kolommen"
        :loading="laadt"
      >
        <template #empty>
          <span v-if="zoek.trim()">{{ $t("projecten.zoeken.geenResultaten") }}</span>
        </template>
        <template #naam-cell="{ row }">
          <ULink :to="`/projecten/${row.original.id}`" class="font-medium text-primary underline-offset-4 hover:underline">
            {{ row.original.naam }}
          </ULink>
        </template>
        <template #acties-header>
          <span class="sr-only">{{ $t("projecten.kolommen.acties") }}</span>
        </template>
        <template #gewijzigd-cell="{ row }">
          {{ relatieveTijd(row.original.gewijzigd, taal, nu, $t("projecten.zojuist")) }}
        </template>
        <template #werfGemeente-cell="{ row }">
          {{ row.original.werfGemeente ?? "" }}
        </template>
        <template #status-cell="{ row }">
          <span v-if="row.original.laatsteExport" class="inline-flex items-center gap-2 whitespace-nowrap">
            <UBadge color="success" variant="subtle" :label="$t('projecten.status.geexporteerd')" />
            <time :datetime="row.original.laatsteExport" class="text-muted tabular-nums">
              {{ exportDatum.format(new Date(row.original.laatsteExport)) }}
            </time>
          </span>
          <UBadge v-else color="neutral" variant="subtle" :label="$t('projecten.status.concept')" />
        </template>
        <template #acties-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              :to="`/projecten/${row.original.id}`"
              icon="i-lucide-folder-open"
              color="neutral"
              variant="ghost"
              :aria-label="$t('projecten.acties.openen')"
              :title="$t('projecten.acties.openen')"
            />
            <UButton
              v-if="kanSchrijven"
              icon="i-lucide-copy"
              color="neutral"
              variant="ghost"
              :aria-label="$t('projecten.acties.dupliceren')"
              :title="$t('projecten.acties.dupliceren')"
              :loading="dupliceerBezig === row.original.id"
              :disabled="dupliceerBezig !== null"
              @click="dupliceer(row.original)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              :aria-label="$t('projecten.acties.verwijderen')"
              :title="$t('projecten.acties.verwijderen')"
              @click="teVerwijderen = row.original"
            />
          </div>
        </template>
      </UTable>

      <NieuwProjectDialoog v-model:open="nieuwOpen" />

      <UModal v-model:open="verwijderOpen" :title="$t('projecten.verwijderen.titel')">
        <template #body>
          <p>{{ $t("projecten.verwijderen.bevestiging", { naam: teVerwijderen?.naam ?? "" }) }}</p>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="verwijderOpen = false" />
            <UButton
              color="error"
              :label="$t('projecten.acties.verwijderen')"
              :loading="verwijderBezig"
              :disabled="verwijderBezig"
              @click="bevestigVerwijderen"
            />
          </div>
        </template>
      </UModal>
    </UContainer>
  </div>
</template>
