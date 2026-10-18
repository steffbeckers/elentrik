<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { ProjectSamenvatting } from "~/composables/useProjectenApi";

const { t } = useI18n();
const api = useProjectenApi();
const toast = useToast();

// Enkel op de client geladen: de relatieve tijden hangen van het huidige moment af.
const { data: projecten, status, refresh } = useAsyncData("projecten", () => api.lijst(), {
  server: false,
  default: () => [] as ProjectSamenvatting[],
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

async function metFoutmelding(actie: () => Promise<unknown>) {
  try {
    await actie();
  } catch {
    toast.add({ title: t("algemeen.fout"), color: "error" });
  }
}

const dupliceer = (project: ProjectSamenvatting) =>
  metFoutmelding(async () => {
    await api.dupliceer(project.id);
    await refresh();
  });

const bevestigVerwijderen = () =>
  metFoutmelding(async () => {
    const project = teVerwijderen.value;
    if (!project) return;
    await api.verwijder(project.id);
    teVerwijderen.value = null;
    await refresh();
  });
</script>

<template>
  <UContainer class="py-8">
    <div class="mb-6 flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold">{{ $t("projecten.titel") }}</h1>
      <UButton icon="i-lucide-plus" :label="$t('projecten.nieuw')" @click="nieuwOpen = true" />
    </div>

    <UTable
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
          <UButton color="error" :label="$t('projecten.acties.verwijderen')" @click="bevestigVerwijderen" />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>
