<script setup lang="ts">
import { conflictSleutels } from "~/editor/conflict";

const open = defineModel<boolean>("open", { default: false });
const props = withDefaults(
  defineProps<{
    bezig: boolean;
    /** Staan er wijzigingen in de editor die nog niet op de server staan? Anders spreekt het scherm er niet van. */
    lokaleWijzigingen?: boolean;
    kopieToegestaan?: boolean;
  }>(),
  { lokaleWijzigingen: true, kopieToegestaan: true },
);
const emit = defineEmits<{ serverversie: []; kopie: []; download: [] }>();
const sleutels = computed(() => conflictSleutels(props.lokaleWijzigingen));
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.conflict.titel')" :description="$t(sleutels.beschrijving)">
    <template #body>
      <div class="flex flex-col gap-3">
        <div>
          <UButton
            block
            color="neutral"
            variant="outline"
            :label="$t('editor.conflict.serverversie')"
            :disabled="bezig"
            @click="emit('serverversie')"
          />
          <p class="mt-1 text-sm text-muted">{{ $t(sleutels.serverversieUitleg) }}</p>
        </div>
        <div>
          <UButton v-if="kopieToegestaan" block :label="$t(sleutels.kopie)" :loading="bezig" :disabled="bezig" @click="kopieToegestaan && emit('kopie')" />
          <UButton v-else block :label="$t('admin.support.download')" :disabled="bezig" @click="emit('download')" />
          <p class="mt-1 text-sm text-muted">{{ $t(kopieToegestaan ? sleutels.kopieUitleg : 'admin.jsonGeenArchief') }}</p>
        </div>
      </div>
    </template>
  </UModal>
</template>
