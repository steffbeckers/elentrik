<script setup lang="ts">
import ProjectgegevensDialoog from "~/components/editor/ProjectgegevensDialoog.vue";
import type { AutosaveStatus } from "~/composables/useAutosave";
import { useEditorStore } from "~/stores/editor";

defineProps<{ status: AutosaveStatus }>();
const emit = defineEmits<{ opnieuwProberen: []; toonConflict: []; toonBevindingen: [] }>();

const store = useEditorStore();
const { t } = useI18n();
const projectgegevensOpen = ref(false);

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

const UITGESCHAKELDE_TABBLADEN = ["situatieschema", "kringenlijst"] as const;

const STATUS_STIJL: Record<AutosaveStatus, { icoon: string; klasse: string }> = {
  opgeslagen: { icoon: "i-lucide-cloud-check", klasse: "text-muted" },
  bezig: { icoon: "i-lucide-loader-circle", klasse: "text-muted" },
  lokaal: { icoon: "i-lucide-hard-drive", klasse: "text-muted" },
  onbewaard: { icoon: "i-lucide-triangle-alert", klasse: "text-warning" },
  conflict: { icoon: "i-lucide-git-compare", klasse: "text-error" },
  fout: { icoon: "i-lucide-cloud-alert", klasse: "text-error" },
};
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
      class="max-w-64 truncate font-semibold"
      :title="$t('editor.bovenbalk.projectgegevens')"
      data-testid="projectnaam"
      @click="projectgegevensOpen = true"
    >
      <span class="truncate">{{ store.naam }}</span>
    </UButton>

    <nav class="flex items-center gap-1" role="tablist">
      <UButton
        role="tab"
        aria-selected="true"
        color="primary"
        variant="soft"
        size="sm"
        :label="$t('editor.bovenbalk.tabbladen.eendraadschema')"
      />
      <UTooltip
        v-for="tabblad in UITGESCHAKELDE_TABBLADEN"
        :key="tabblad"
        :text="$t('editor.bovenbalk.tabbladen.binnenkort')"
      >
        <!-- Een uitgeschakelde knop krijgt geen muisgebeurtenissen: de tooltip hangt aan de span. -->
        <span tabindex="0">
          <UButton
            role="tab"
            aria-selected="false"
            disabled
            color="neutral"
            variant="ghost"
            size="sm"
            :label="$t(`editor.bovenbalk.tabbladen.${tabblad}`)"
          />
        </span>
      </UTooltip>
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <span
        class="flex items-center gap-1 text-sm"
        :class="STATUS_STIJL[status].klasse"
        role="status"
        data-testid="opslagstatus"
      >
        <UIcon :name="STATUS_STIJL[status].icoon" class="size-4" :class="status === 'bezig' ? 'animate-spin' : ''" />
        <UButton
          v-if="status === 'conflict'"
          size="xs"
          color="error"
          variant="link"
          :label="$t('editor.status.conflict')"
          @click="emit('toonConflict')"
        />
        <span v-else>{{ $t(`editor.status.${status}`) }}</span>
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
        :disabled="store.terug.length === 0"
        data-testid="ongedaan-maken"
        @click="store.ongedaanMaken()"
      />
      <UButton
        icon="i-lucide-redo-2"
        color="neutral"
        variant="ghost"
        :aria-label="$t('editor.bovenbalk.opnieuw')"
        :title="$t('editor.bovenbalk.opnieuw')"
        :disabled="store.vooruit.length === 0"
        data-testid="opnieuw"
        @click="store.opnieuw()"
      />
    </div>

    <ProjectgegevensDialoog v-model:open="projectgegevensOpen" />
  </header>
</template>
