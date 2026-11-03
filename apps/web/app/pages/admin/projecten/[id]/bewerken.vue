<script setup lang="ts">
import ProjectEditor from '~/components/editor/ProjectEditor.vue';
import { maakAdminProjectApi, type AdminProjectFetch } from '~/composables/useAdminProjectApi';
import type { EditorContext } from '~/editor/context';
import { useSessieStore } from '~/stores/sessie';
import type { AdminProject } from '../../../../../shared/admin/records';
definePageMeta({ layout: false, middleware: ['superuser'] });
const id = String(useRoute().params.id); const sessie = useSessieStore(); const gebruikerId = sessie.gebruiker!.id;
const support = maakAdminProjectApi($fetch as unknown as AdminProjectFetch, gebruikerId, id);
const meta = await useRequestFetch()<AdminProject>(`/api/admin/projecten/${encodeURIComponent(id)}`, { headers: { 'x-elentrik-gebruiker': gebruikerId } });
const context: EditorContext = {
  modus: 'admin', projectId: id, gebruikerId, terug: `/admin/projecten/${id}`,
  projecten: support.projecten, bestanden: support.bestanden, exportLijst: support.exportLijst, bestandUrl: support.bestandUrl,
  mogelijkheden: { get schrijven() { return support.schrijven.value; }, dupliceren: false, nieuwProject: false, exporteren: false },
  support, bedrijfNaam: meta.organisatieNaam ?? meta.organisatieId ?? '',
};
</script>
<template><ProjectEditor :key="id" :context="context" /></template>
