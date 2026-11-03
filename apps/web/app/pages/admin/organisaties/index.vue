<script setup lang="ts">
import AdminRecords from '~/components/admin/AdminRecords.vue';
definePageMeta({ layout: 'admin', middleware: ['superuser'] });
</script>
<template><AdminRecords soort="organisaties" /></template>
