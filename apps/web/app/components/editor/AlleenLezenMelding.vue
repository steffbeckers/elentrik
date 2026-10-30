<script setup lang="ts">
import { useEditorStore } from "~/stores/editor";

// De melding in een bewerkingsdialoog zodra de editor alleen-lezen is (ook als de dialoog al open
// stond toen het abonnement verviel): de dialoog blijft open en zegt waarom bewaren niet meer kan.
const store = useEditorStore();
</script>

<template>
  <UAlert
    v-if="store.alleenLezen"
    color="warning"
    variant="subtle"
    icon="i-lucide-lock"
    :title="$t('editor.alleenLezen.dialoogTitel')"
    :description="$t('editor.alleenLezen.dialoogBeschrijving')"
    data-testid="dialoog-alleen-lezen"
  />
</template>
