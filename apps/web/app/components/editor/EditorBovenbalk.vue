<script setup lang="ts">
import ProjectgegevensDialoog from "~/components/editor/ProjectgegevensDialoog.vue";
import type { AutosaveStatus } from "~/composables/useAutosave";
import { useEditorStore } from "~/stores/editor";

/**
 * `afgemeld`: de sessie is verlopen (401 bij het opslaan); het werk staat lokaal in het concept.
 * `andereGebruiker`: nu is een ander ingelogd dan wie dit venster opende (`oorspronkelijk`).
 */
const props = defineProps<{
  status: AutosaveStatus;
  afgemeld?: boolean;
  andereGebruiker?: { naam: string; oorspronkelijk: string } | null;
}>();
const emit = defineEmits<{
  opnieuwProberen: [];
  opnieuwInloggen: [];
  toonConflict: [];
  toonBevindingen: [];
  exporteren: [];
}>();

const store = useEditorStore();
const { t } = useI18n();
const projectgegevensOpen = ref(false);

/** De melding over de aanmelding, of null: eerst een andere gebruiker, dan een verlopen sessie. */
const aanmeldingMelding = computed(() => {
  if (props.andereGebruiker) return t("editor.andereGebruiker.melding", props.andereGebruiker);
  if (props.afgemeld) return t("editor.afgemeld.melding");
  return null;
});

/** "1 fout en 3 waarschuwingen": enkelvoud en meervoud via de pluralisatie van vue-i18n. */
const bevindingenTekst = computed(() =>
  t("editor.bovenbalk.bevindingen", {
    fouten: t("editor.bovenbalk.aantalFouten", { n: store.aantalFouten }, store.aantalFouten),
    waarschuwingen: t(
      "editor.bovenbalk.aantalWaarschuwingen",
      { n: store.aantalWaarschuwingen },
      store.aantalWaarschuwingen,
    ),
  }),
);

const STATUS_STIJL: Record<AutosaveStatus, { icoon: string; klasse: string }> = {
  opgeslagen: { icoon: "i-lucide-cloud-check", klasse: "text-muted" },
  bezig: { icoon: "i-lucide-loader-circle", klasse: "text-muted" },
  lokaal: { icoon: "i-lucide-hard-drive", klasse: "text-muted" },
  onbewaard: { icoon: "i-lucide-triangle-alert", klasse: "text-warning" },
  conflict: { icoon: "i-lucide-git-compare", klasse: "text-error" },
  fout: { icoon: "i-lucide-cloud-alert", klasse: "text-error" },
  "alleen-lezen": { icoon: "i-lucide-lock", klasse: "text-warning" },
  verwijderd: { icoon: "i-lucide-trash-2", klasse: "text-error" },
};

/**
 * De statusregel. Is de organisatie alleen-lezen en staat alles op de server, dan zegt ze
 * "Alleen lezen"; zijn er wijzigingen die niet bewaard konden worden, dan zegt de status zelf het.
 */
const weergave = computed(() =>
  props.status === "opgeslagen" && store.alleenLezen
    ? { sleutel: "alleenLezen", ...STATUS_STIJL["alleen-lezen"] }
    : { sleutel: props.status, ...STATUS_STIJL[props.status] },
);
</script>

<template>
  <header class="grid min-w-0 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 gap-y-0 border-b border-default px-2 py-1 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]">
    <NuxtLink
      to="/"
      class="flex min-h-9 min-w-9 items-center justify-center gap-2 rounded px-1 font-semibold focus-visible:outline-2 focus-visible:outline-primary"
      :aria-label="$t('editor.bovenbalk.projecten')"
      :title="$t('editor.bovenbalk.projecten')"
    >
      <UIcon name="i-lucide-zap" class="size-5 shrink-0 text-primary" />
      <span class="hidden sm:inline">{{ $t('app.naam') }}</span>
    </NuxtLink>
    <UButton
      color="neutral"
      variant="ghost"
      class="min-w-0 justify-start truncate font-semibold"
      :title="$t('editor.bovenbalk.projectgegevens')"
      data-testid="projectnaam"
      @click="projectgegevensOpen = true"
    >
      <span class="truncate">{{ store.naam }}</span>
      <UIcon name="i-lucide-pencil" class="size-3.5 shrink-0 text-muted" />
    </UButton>

    <div class="col-span-4 row-start-2 flex min-w-0 items-center gap-1 sm:col-span-1 sm:col-start-3 sm:row-start-1">
      <span
        class="mr-auto flex min-w-0 items-center gap-1 text-sm"
        :class="weergave.klasse"
        role="status"
        :title="$t(`editor.status.${weergave.sleutel}`)"
        data-testid="opslagstatus"
      >
        <UIcon :name="weergave.icoon" class="size-4" :class="status === 'bezig' ? 'animate-spin' : ''" />
        <UButton
          v-if="status === 'conflict'"
          size="xs"
          color="error"
          variant="link"
          :label="$t('editor.status.conflict')"
          @click="emit('toonConflict')"
        />
        <span v-else class="sr-only sm:not-sr-only">{{ $t(`editor.status.${weergave.sleutel}`) }}</span>
      </span>
      <UButton
        v-if="status === 'fout'"
        size="xs"
        color="error"
        variant="outline"
        icon="i-lucide-rotate-cw"
        :label="$t('editor.status.opnieuwProberen')"
        @click="emit('opnieuwProberen')"
      />

      <UButton
        color="neutral"
        variant="ghost"
        size="sm"
        :aria-label="bevindingenTekst"
        :title="bevindingenTekst"
        data-testid="bevindingenteller"
        @click="emit('toonBevindingen')"
      >
        <span class="flex items-center gap-1 text-error">
          <UIcon name="i-lucide-circle-x" class="size-4" />{{ store.aantalFouten }}
        </span>
        <span class="flex items-center gap-1 text-warning">
          <UIcon name="i-lucide-triangle-alert" class="size-4" />{{ store.aantalWaarschuwingen }}
        </span>
      </UButton>

      <UButton
        icon="i-lucide-undo-2"
        color="neutral"
        variant="ghost"
        :aria-label="$t('editor.bovenbalk.ongedaanMaken')"
        :title="$t('editor.bovenbalk.ongedaanMaken')"
        :disabled="store.alleenLezen || store.terug.length === 0"
        data-testid="ongedaan-maken"
        @click="store.ongedaanMaken()"
      />
      <UButton
        icon="i-lucide-redo-2"
        color="neutral"
        variant="ghost"
        :aria-label="$t('editor.bovenbalk.opnieuw')"
        :title="$t('editor.bovenbalk.opnieuw')"
        :disabled="store.alleenLezen || store.vooruit.length === 0"
        data-testid="opnieuw"
        @click="store.opnieuw()"
      />

    </div>

    <UButton
      icon="i-lucide-file-down"
      size="sm"
      class="col-start-3 row-start-1 min-h-9 shrink-0 sm:col-start-4"
      :label="$t('editor.bovenbalk.exporteren')"
      data-testid="exporteren"
      @click="emit('exporteren')"
    />
    <div class="col-start-4 row-start-1 flex items-center gap-1 sm:col-start-5">
      <OrganisatieKeuze compact />
      <GebruikerMenu compact />
    </div>

    <ProjectgegevensDialoog v-model:open="projectgegevensOpen" />
  </header>
  <UAlert
    v-if="aanmeldingMelding"
    color="warning"
    variant="subtle"
    icon="i-lucide-log-in"
    orientation="horizontal"
    class="rounded-none border-b border-default py-2"
    :title="aanmeldingMelding"
    data-testid="afgemeld-melding"
  >
    <template #actions>
      <UButton
        size="xs"
        color="warning"
        icon="i-lucide-external-link"
        :label="$t('editor.afgemeld.opnieuwInloggen')"
        data-testid="opnieuw-inloggen"
        @click="emit('opnieuwInloggen')"
      />
      <UButton
        size="xs"
        color="neutral"
        variant="outline"
        icon="i-lucide-rotate-cw"
        :label="$t('editor.status.opnieuwProberen')"
        data-testid="afgemeld-opnieuw-proberen"
        @click="emit('opnieuwProberen')"
      />
    </template>
  </UAlert>
</template>
