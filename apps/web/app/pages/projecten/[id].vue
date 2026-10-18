<script setup lang="ts">
import BevindingenPaneel from "~/components/editor/BevindingenPaneel.vue";
import ConceptDialoog from "~/components/editor/ConceptDialoog.vue";
import ConflictDialoog from "~/components/editor/ConflictDialoog.vue";
import EditorBovenbalk from "~/components/editor/EditorBovenbalk.vue";
import EigenschappenPaneel from "~/components/editor/EigenschappenPaneel.vue";
import OnderdelenPaneel from "~/components/editor/OnderdelenPaneel.vue";
import SchemaCanvas from "~/components/editor/SchemaCanvas.vue";
import { nieuwerConcept, wisConcept, type Concept } from "~/composables/concepten";
import { useAutosave, waarschuwBijVerlaten } from "~/composables/useAutosave";
import { httpStatus } from "~/composables/useProjectenApi";
import { useEditorStore } from "~/stores/editor";

const route = useRoute();
// Een ander id geeft een nieuwe pagina-instantie (NuxtPage sleutelt op het pad).
const id = String(route.params.id);
const api = useProjectenApi();
const store = useEditorStore();
const { t } = useI18n();
const toast = useToast();

useHead({ title: () => (store.projectId === id && store.naam ? `${store.naam} · ${t("app.naam")}` : t("app.naam")) });

type Laadstatus = "laden" | "klaar" | "nietGevonden" | "fout";
const laadstatus = ref<Laadstatus>("laden");

const autosave = useAutosave({
  store,
  bewaar: api.bewaar,
  haal: api.haal,
  dupliceer: api.dupliceer,
  naarProject: async (kopieId) => {
    await navigateTo(`/projecten/${kopieId}`);
  },
});

// --- Laden en het lokale concept -------------------------------------------

const concept = ref<Concept | null>(null);
const conceptOpen = ref(false);

async function laad(): Promise<void> {
  laadstatus.value = "laden";
  let project;
  try {
    project = await api.haal(id);
  } catch (fout) {
    laadstatus.value = httpStatus(fout) === 404 ? "nietGevonden" : "fout";
    return;
  }
  store.laad({ id: project.id, naam: project.naam, versie: project.versie, document: project.document });
  // Een kapot conceptarchief mag het openen niet tegenhouden. Pas na de conceptcontrole is de pagina klaar.
  concept.value = await nieuwerConcept(project).catch(() => null);
  conceptOpen.value = concept.value !== null;
  laadstatus.value = "klaar";
}

function laadConcept(): void {
  const c = concept.value;
  concept.value = null;
  if (!c || store.projectId !== id) return;
  store.laad({ id, naam: c.naam, versie: c.versie, document: c.document });
  // Het concept staat nog niet op de server: als wijziging tellen, zodat de autosave het bewaart.
  // Is de server intussen verder dan `c.versie`, dan volgt een conflict.
  store.markeerGewijzigd();
}

async function verwerpConcept(): Promise<void> {
  concept.value = null;
  await wisConcept(id).catch(() => {});
}

// --- Conflict, fout en verlaten --------------------------------------------

const conflictOpen = ref(false);
const conflictBezig = ref(false);

watch(autosave.status, (status) => {
  conflictOpen.value = status === "conflict";
});

async function losConflictOp(actie: () => Promise<void>): Promise<void> {
  conflictBezig.value = true;
  try {
    await actie();
  } catch {
    toast.add({ title: t("algemeen.fout"), color: "error" });
  } finally {
    conflictBezig.value = false;
  }
}

async function opnieuwProberen(): Promise<void> {
  await autosave.nuOpslaan().catch(() => {
    toast.add({ title: t("algemeen.fout"), color: "error" });
  });
}

function toonBevindingen(): void {
  window.document.getElementById("bevindingen")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bijVerlaten(event: BeforeUnloadEvent): void {
  waarschuwBijVerlaten(autosave.status.value, event);
}

onMounted(() => {
  window.addEventListener("beforeunload", bijVerlaten);
  void laad();
});
onBeforeUnmount(() => window.removeEventListener("beforeunload", bijVerlaten));
</script>

<template>
  <div class="flex h-dvh flex-col">
    <template v-if="laadstatus === 'klaar' && store.document">
      <EditorBovenbalk
        :status="autosave.status.value"
        @opnieuw-proberen="opnieuwProberen"
        @toon-conflict="conflictOpen = true"
        @toon-bevindingen="toonBevindingen"
      />
      <div class="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <OnderdelenPaneel class="overflow-y-auto border-r border-default" />
        <SchemaCanvas />
        <div class="overflow-y-auto border-l border-default">
          <EigenschappenPaneel />
          <USeparator />
          <BevindingenPaneel id="bevindingen" />
        </div>
      </div>
    </template>

    <UContainer v-else-if="laadstatus === 'nietGevonden'" class="py-8">
      <UAlert
        color="neutral"
        variant="subtle"
        icon="i-lucide-file-question"
        :title="$t('editor.pagina.nietGevonden.titel')"
        :description="$t('editor.pagina.nietGevonden.beschrijving')"
        :actions="[{ label: $t('editor.pagina.nietGevonden.terug'), to: '/', color: 'neutral', variant: 'outline' }]"
      />
    </UContainer>

    <UContainer v-else-if="laadstatus === 'fout'" class="py-8">
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="$t('editor.pagina.ladenMislukt.titel')"
        :description="$t('editor.pagina.ladenMislukt.beschrijving')"
        :actions="[{ label: $t('editor.pagina.ladenMislukt.opnieuw'), color: 'error', onClick: () => laad() }]"
      />
    </UContainer>

    <div v-else class="flex flex-1 items-center justify-center text-muted">
      <UIcon name="i-lucide-loader-circle" class="mr-2 size-5 animate-spin" />
      {{ $t("editor.pagina.laden") }}
    </div>

    <ConceptDialoog
      v-if="concept"
      v-model:open="conceptOpen"
      :tijd="concept.tijd"
      @laden="laadConcept"
      @verwerpen="verwerpConcept"
    />
    <ConflictDialoog
      v-model:open="conflictOpen"
      :bezig="conflictBezig"
      @serverversie="losConflictOp(autosave.laadServerversie)"
      @kopie="losConflictOp(autosave.bewaarAlsKopie)"
    />
  </div>
</template>
