<script setup lang="ts">
const open = defineModel<boolean>("open", { default: false });
defineProps<{ bezig: boolean }>();
const emit = defineEmits<{ serverversie: []; kopie: [] }>();
</script>

<template>
  <UModal v-model:open="open" :title="$t('editor.conflict.titel')" :description="$t('editor.conflict.beschrijving')">
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
          <p class="mt-1 text-sm text-muted">{{ $t("editor.conflict.serverversieUitleg") }}</p>
        </div>
        <div>
          <UButton block :label="$t('editor.conflict.kopie')" :loading="bezig" :disabled="bezig" @click="emit('kopie')" />
          <p class="mt-1 text-sm text-muted">{{ $t("editor.conflict.kopieUitleg") }}</p>
        </div>
      </div>
    </template>
  </UModal>
</template>
