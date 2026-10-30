<script setup lang="ts">
import ProjectgegevensDialoog from "~/components/editor/ProjectgegevensDialoog.vue";
import type { AutosaveStatus } from "~/composables/useAutosave";
import { useEditorStore, type Tabblad } from "~/stores/editor";

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

const TABBLADEN = ["eendraadschema", "situatieschema", "kringenlijst"] as const satisfies readonly Tabblad[];

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
  <header class="flex items-center gap-3 border-b border-default px-3 py-2">
    <UButton
      to="/"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      :aria-label="$t('editor.bovenbalk.projecten')"
      :title="$t('editor.bovenbalk.projecten')"
    />
    <UButton
      color="neutral"
      variant="ghost"
      class="min-w-24 max-w-64 truncate font-semibold"
      :title="$t('editor.bovenbalk.projectgegevens')"
      data-testid="projectnaam"
      @click="projectgegevensOpen = true"
    >
      <span class="truncate">{{ store.naam }}</span>
    </UButton>

    <nav class="flex items-center gap-1" role="tablist">
      <UButton
        v-for="tabblad in TABBLADEN"
        :key="tabblad"
        role="tab"
        :aria-selected="store.tabblad === tabblad"
        :data-testid="`tab-${tabblad}`"
        :color="store.tabblad === tabblad ? 'primary' : 'neutral'"
        :variant="store.tabblad === tabblad ? 'soft' : 'ghost'"
        size="sm"
        :label="$t(`editor.bovenbalk.tabbladen.${tabblad}`)"
        @click="store.tabblad = tabblad"
      />
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <span
        class="flex items-center gap-1 text-sm"
        :class="weergave.klasse"
        role="status"
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
        <span v-else>{{ $t(`editor.status.${weergave.sleutel}`) }}</span>
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

      <UButton
        icon="i-lucide-file-down"
        size="sm"
        :label="$t('editor.bovenbalk.exporteren')"
        data-testid="exporteren"
        @click="emit('exporteren')"
      />

      <USeparator orientation="vertical" class="h-6" />
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
