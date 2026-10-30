<script setup lang="ts">
import { conflictSleutels } from "~/editor/conflict";

const open = defineModel<boolean>("open", { default: false });
const props = withDefaults(
  defineProps<{
    bezig: boolean;
    /** Staan er wijzigingen in de editor die nog niet op de server staan? Anders spreekt het scherm er niet van. */
    lokaleWijzigingen?: boolean;
  }>(),
  { lokaleWijzigingen: true },
);
const emit = defineEmits<{ serverversie: []; kopie: [] }>();
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
          <UButton block :label="$t(sleutels.kopie)" :loading="bezig" :disabled="bezig" @click="emit('kopie')" />
          <p class="mt-1 text-sm text-muted">{{ $t(sleutels.kopieUitleg) }}</p>
        </div>
      </div>
    </template>
  </UModal>
</template>
