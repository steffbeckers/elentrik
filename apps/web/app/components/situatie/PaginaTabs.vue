<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { SituatiePagina } from "@elentrik/model";
import AlleenLezenMelding from "~/components/editor/AlleenLezenMelding.vue";
import PaginaHernoemenDialoog from "~/components/situatie/PaginaHernoemenDialoog.vue";
import { formatteerMmPerPx } from "~/situatie/schaal";
import { useEditorStore } from "~/stores/editor";
import { useSituatieStore } from "~/stores/situatie";

const emit = defineEmits<{
  /** "Pagina toevoegen": een nieuw plan kiezen. */
  toevoegen: [];
  /** "Schaal instellen" voor deze (nu actieve) pagina: twee punten meten op het plan. */
  schaalInstellen: [paginaId: string];
}>();

const editor = useEditorStore();
const situatie = useSituatieStore();
const { t } = useI18n();
const { taal } = useTaal();
const voerUit = useDocumentFoutMelding();

const paginas = computed<SituatiePagina[]>(() => editor.document?.situatie.paginas ?? []);

const schaal = computed(() => situatie.actievePagina?.achtergrond?.schaal);

// --- Hernoemen en verwijderen ----------------------------------------------

const hernoemOpen = ref(false);
const hernoemPaginaId = ref<string | null>(null);

const verwijderOpen = ref(false);
const teVerwijderen = ref<{ id: string; titel: string; aantal: number } | null>(null);

function hernoem(pagina: SituatiePagina): void {
  hernoemPaginaId.value = pagina.id;
  hernoemOpen.value = true;
}

/** Een pagina zonder plaatsingen gaat meteen weg; anders eerst bevestigen. Ongedaan maken kan altijd. */
function verwijder(pagina: SituatiePagina): void {
  if (pagina.plaatsingen.length === 0) {
    voerUit(() => situatie.verwijderPagina(pagina.id));
    return;
  }
  teVerwijderen.value = { id: pagina.id, titel: pagina.titel, aantal: pagina.plaatsingen.length };
  verwijderOpen.value = true;
}

function bevestigVerwijderen(): void {
  if (editor.alleenLezen) return;
  const pagina = teVerwijderen.value;
  verwijderOpen.value = false;
  if (pagina) voerUit(() => situatie.verwijderPagina(pagina.id));
}

function schaalInstellen(pagina: SituatiePagina): void {
  situatie.actievePaginaId = pagina.id;
  emit("schaalInstellen", pagina.id);
}

function menu(pagina: SituatiePagina, index: number): DropdownMenuItem[][] {
  return [
    [
      {
        label: t("editor.situatie.paginas.hernoemen"),
        icon: "i-lucide-pencil",
        disabled: editor.alleenLezen,
        onSelect: () => hernoem(pagina),
      },
      {
        label: t("editor.situatie.paginas.schaalInstellen"),
        icon: "i-lucide-ruler",
        disabled: editor.alleenLezen || !pagina.achtergrond,
        onSelect: () => schaalInstellen(pagina),
      },
    ],
    [
      {
        label: t("editor.situatie.paginas.naarLinks"),
        icon: "i-lucide-arrow-left",
        disabled: editor.alleenLezen || index === 0,
        onSelect: () => voerUit(() => situatie.verplaatsPagina(pagina.id, index - 1)),
      },
      {
        label: t("editor.situatie.paginas.naarRechts"),
        icon: "i-lucide-arrow-right",
        disabled: editor.alleenLezen || index === paginas.value.length - 1,
        onSelect: () => voerUit(() => situatie.verplaatsPagina(pagina.id, index + 1)),
      },
    ],
    [
      {
        label: t("editor.situatie.paginas.verwijderen"),
        icon: "i-lucide-trash-2",
        color: "error",
        disabled: editor.alleenLezen,
        onSelect: () => verwijder(pagina),
      },
    ],
  ];
}

function wisSchaal(): void {
  const paginaId = situatie.actievePaginaId;
  if (paginaId !== null) voerUit(() => situatie.zetSchaal(paginaId, undefined));
}
</script>

<template>
  <div class="flex items-center gap-2 border-b border-default px-2 py-1">
    <div class="flex min-w-0 items-center gap-1 overflow-x-auto" role="tablist" :aria-label="$t('editor.situatie.paginas.titel')">
      <div
        v-for="(pagina, index) in paginas"
        :key="pagina.id"
        class="flex shrink-0 items-center rounded-md"
        :class="pagina.id === situatie.actievePaginaId ? 'bg-primary/10' : ''"
      >
        <UButton
          role="tab"
          :aria-selected="pagina.id === situatie.actievePaginaId"
          :data-testid="`pagina-tab-${index}`"
          :color="pagina.id === situatie.actievePaginaId ? 'primary' : 'neutral'"
          variant="ghost"
          size="sm"
          class="max-w-48"
          @click="situatie.actievePaginaId = pagina.id"
        >
          <span class="truncate">{{ pagina.titel }}</span>
        </UButton>
        <UDropdownMenu :items="menu(pagina, index)">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-ellipsis-vertical"
            :disabled="editor.alleenLezen"
            :aria-label="$t('editor.situatie.paginas.menu', { titel: pagina.titel })"
            :data-testid="`pagina-menu-${index}`"
          />
        </UDropdownMenu>
      </div>
    </div>
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-plus"
      class="shrink-0"
      :disabled="editor.alleenLezen"
      data-testid="pagina-toevoegen"
      :label="$t('editor.situatie.paginas.toevoegen')"
      @click="emit('toevoegen')"
    />

    <div v-if="schaal" class="ml-auto flex shrink-0 items-center gap-1 text-sm text-muted">
      <span data-testid="schaal-tekst">{{
        $t("editor.situatie.schaal.tekst", { waarde: formatteerMmPerPx(schaal.mmPerPx, taal) })
      }}</span>
      <UButton
        color="neutral"
        variant="link"
        size="sm"
        :disabled="editor.alleenLezen"
        data-testid="schaal-wissen"
        :label="$t('editor.situatie.schaal.wissen')"
        @click="wisSchaal"
      />
    </div>

    <PaginaHernoemenDialoog v-model:open="hernoemOpen" :pagina-id="hernoemPaginaId" />

    <UModal v-model:open="verwijderOpen" :title="$t('editor.situatie.verwijderen.titel')">
      <template #body>
        <AlleenLezenMelding class="mb-4" />
        <p>
          {{
            $t(
              "editor.situatie.verwijderen.beschrijving",
              { titel: teVerwijderen?.titel ?? "", aantal: teVerwijderen?.aantal ?? 0 },
              teVerwijderen?.aantal ?? 0,
            )
          }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="verwijderOpen = false" />
          <UButton
            color="error"
            :disabled="editor.alleenLezen"
            :label="$t('editor.situatie.verwijderen.bevestigen')"
            data-testid="pagina-verwijderen-bevestigen"
            @click="bevestigVerwijderen"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
