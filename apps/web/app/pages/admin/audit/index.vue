<script setup lang="ts">
import AdminAudit from '~/components/admin/AdminAudit.vue';
definePageMeta({ layout: 'admin', middleware: ['superuser'] });
const { t } = useI18n(); const route = useRoute(); const router = useRouter();
const velden = ['doelId', 'actorId', 'organisatieId', 'projectId', 'actie', 'vanaf', 'tot'] as const;
const form = reactive(Object.fromEntries(velden.map(k => [k, typeof route.query[k] === 'string' ? route.query[k] : ''])) as Record<typeof velden[number], string>);
const filters = computed(() => Object.fromEntries(velden.map(k => [k, typeof route.query[k] === 'string' ? route.query[k] as string : undefined])));
function filter() { router.replace({ query: Object.fromEntries(velden.map(k => [k, form[k] || undefined])) }); }
useHead({ title: () => `${t('admin.audit')} · ${t('admin.titel')}` });
</script>
<template>
  <h1 class="mb-6 text-2xl font-semibold">{{ t('admin.audit') }}</h1>
  <form class="mb-6 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4" @submit.prevent="filter"><UFormField v-for="veld in velden" :key="veld" :label="t(`admin.auditFilters.${veld}`)"><UInput v-model="form[veld]" class="w-full" :placeholder="veld === 'vanaf' || veld === 'tot' ? '2026-11-03T00:00:00Z' : undefined" /></UFormField><UButton type="submit" color="neutral" variant="outline" class="justify-center">{{ t('admin.filteren') }}</UButton></form>
  <AdminAudit :filters="filters" :titel="false" />
</template>
