<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { ProjectSamenvatting } from "~/composables/useProjectenApi";
import { bestemming } from "~/sessie/bestemming";
import { foutStatus } from "~/sessie/fouten";
import { useSessieStore } from "~/stores/sessie";

const { t } = useI18n();
const api = useProjectenApi();
const toast = useToast();
const sessie = useSessieStore();
const route = useRoute();

// Enkel op de client geladen: de relatieve tijden hangen van het huidige moment af. Een andere
// actieve organisatie (de organisatiekeuze) laadt de lijst van die organisatie.
const { data: projecten, status, error, refresh } = useAsyncData("projecten", () => api.lijst(), {
  server: false,
  default: () => [] as ProjectSamenvatting[],
  watch: [() => sessie.actieveOrganisatieId],
});

// Verlopen sessie (401) of niet meer lid van de actieve organisatie (404/403, spec 5b.5): de
// sessie opnieuw lezen. De server kiest dan een andere organisatie (de lijst laadt opnieuw), of
// er volgt /inloggen of /geen-organisatie.
watch(error, async (fout) => {
  const code = foutStatus(fout);
  if (code !== 401 && code !== 403 && code !== 404) return;
  try {
    await sessie.laad();
  } catch {
    return;
  }
  const doel = bestemming(route, sessie.gebruiker ? { actieveOrganisatieId: sessie.actieveOrganisatieId } : null);
  if (doel) await navigateTo(doel, { replace: true });
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

const kolommen = computed<TableColumn<ProjectSamenvatting>[]>(() => [
  { accessorKey: "naam", header: t("projecten.kolommen.naam") },
  { accessorKey: "klantnaam", header: t("projecten.kolommen.klant") },
  { accessorKey: "gewijzigd", header: t("projecten.kolommen.gewijzigd") },
  { id: "acties" },
]);

const nieuwOpen = ref(false);
const teVerwijderen = ref<ProjectSamenvatting | null>(null);
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
  } catch {
    toast.add({ title: t("algemeen.fout"), color: "error" });
    return false;
  }
}

// Eén lopende actie tegelijk per soort, zodat een dubbelklik geen twee kopieën maakt.
const dupliceerBezig = ref<string | null>(null);
const verwijderBezig = ref(false);

async function dupliceer(project: ProjectSamenvatting) {
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
    <UContainer class="py-8">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 class="text-2xl font-semibold">{{ $t("projecten.titel") }}</h1>
        <div class="flex flex-wrap gap-2">
          <UButton
            to="/instellingen"
            icon="i-lucide-building-2"
            color="neutral"
            variant="outline"
            :label="$t('bedrijf.link')"
          />
          <UButton icon="i-lucide-plus" :label="$t('projecten.nieuw')" @click="nieuwOpen = true" />
        </div>
      </div>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="$t('projecten.laden.fout.titel')"
        :description="$t('projecten.laden.fout.beschrijving')"
        :actions="[{ label: $t('projecten.laden.fout.opnieuw'), color: 'error', onClick: () => refresh() }]"
      />
      <UTable
        v-else
        :data="projecten"
        :columns="kolommen"
        :loading="laadt"
        :empty="$t('projecten.leeg')"
      >
        <template #acties-header>
          <span class="sr-only">{{ $t("projecten.kolommen.acties") }}</span>
        </template>
        <template #gewijzigd-cell="{ row }">
          {{ relatieveTijd(row.original.gewijzigd, nu) }}
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

      <NieuwProjectDialoog v-model:open="nieuwOpen" @aangemaakt="() => refresh()" />

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
