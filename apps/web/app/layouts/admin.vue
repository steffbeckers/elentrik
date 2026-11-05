<script setup lang="ts">
import AdminZoeken from "~/components/admin/AdminZoeken.vue";
import { useSessieStore } from "~/stores/sessie";
const { t } = useI18n();
const sessie = useSessieStore();
const openingGebruiker = sessie.gebruiker?.id;
const geldig = computed(() => sessie.gebruiker?.id === openingGebruiker && sessie.gebruiker?.superuser);
watch(geldig, (waarde) => { if (!waarde) navigateTo('/inloggen'); });
const links = [{ pad: '/admin', label: 'overzicht' }, ...['gebruikers', 'organisaties', 'projecten', 'audit'].map(label => ({ pad: `/admin/${label}`, label }))];
</script>
<template>
  <div v-if="geldig" class="min-h-dvh bg-default">
    <a href="#admin-inhoud" class="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-default focus:p-3">{{ t('admin.naarInhoud') }}</a>
    <header class="border-b border-default">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
        <NuxtLink to="/admin" class="mr-auto inline-flex items-center gap-2 font-semibold"><UIcon name="i-lucide-shield-check" class="size-5 text-primary" />{{ t('admin.titel') }}</NuxtLink>
        <UButton to="/" color="neutral" variant="ghost" size="sm" icon="i-lucide-arrow-left">{{ t('admin.naarApp') }}</UButton>
        <div class="order-last w-full lg:order-none lg:w-96"><AdminZoeken /></div>
        <GebruikerMenu beheer />
      </div>
      <nav :aria-label="t('admin.navigatie')" class="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
        <NuxtLink v-for="link in links" :key="link.pad" :to="link.pad" class="whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-medium text-muted hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary" :class="($route.path === link.pad || (link.pad !== '/admin' && $route.path.startsWith(link.pad + '/'))) ? '!border-primary !text-primary' : ''">{{ t(`admin.${link.label}`) }}</NuxtLink>
      </nav>
    </header>
    <main id="admin-inhoud" class="mx-auto max-w-7xl px-4 py-8 sm:px-6"><slot /></main>
  </div>
</template>
