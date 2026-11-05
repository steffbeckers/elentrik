<script setup lang="ts">
import ProjectEditor from '~/components/editor/ProjectEditor.vue';
import type { EditorContext } from '~/editor/context';
import { useSessieStore } from '~/stores/sessie';
definePageMeta({ middleware: ['editor-gebruiker'] });
const id = String(useRoute().params.id); const gebruikerId = useSessieStore().gebruiker?.id ?? '';
const projecten = useProjectenApi({ gebruikerId }); const bestanden = useBestandenApi(); const exports = useExportsApi();
const context: EditorContext = {
  modus: 'klant', projectId: id, gebruikerId, terug: '/', projecten, bestanden,
  exportLijst: exports.lijst, bestandUrl: bestanden.url,
  mogelijkheden: { schrijven: true, dupliceren: true, nieuwProject: true, exporteren: true }, klant: projecten,
};
</script>
<template><ProjectEditor :key="id" :context="context" /></template>
