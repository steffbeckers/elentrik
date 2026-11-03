<script setup lang="ts">
import { maakAdminZoeken } from "~/composables/useAdminZoeken";
import { useAdminApi } from "~/composables/useAdminApi";
import { useSessieStore } from "~/stores/sessie";
const sessie = useSessieStore();
const api = useAdminApi();
const { t } = useI18n();
const zoek = ref('');
const { resultaat, fout, bezig, wis, zoek: laad, gebruikerGewijzigd } = maakAdminZoeken(api.zoek, sessie.gebruiker!.id);
const groepen = ['gebruikers', 'organisaties', 'projecten'] as const;
const open = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(zoek, (waarde) => { clearTimeout(timer); wis(); open.value = true; timer = setTimeout(() => laad(waarde), 250); });
watch(() => sessie.gebruiker?.id, (id) => { clearTimeout(timer); zoek.value = ''; gebruikerGewijzigd(id ?? null); open.value = false; });
onBeforeUnmount(() => { clearTimeout(timer); wis(); });
const geen = computed(() => resultaat.value && groepen.every((g) => !resultaat.value![g].items.length));
</script>
<template>
  <div class="relative w-full max-w-xl" @keydown.esc="open = false">
    <UInput v-model="zoek" :aria-label="t('admin.zoeken')" :placeholder="t('admin.zoekHint')" icon="i-lucide-search" :loading="bezig" maxlength="200" class="w-full" @focus="open = true" />
    <div v-if="open && zoek.trim().length >= 2" class="absolute inset-x-0 top-full z-40 mt-2 max-h-[65dvh] overflow-y-auto rounded-lg border border-default bg-default p-4 shadow-lg" :aria-label="t('admin.zoekresultaten')">
      <div class="mb-2 flex items-center justify-between gap-3">
        <span class="text-sm font-medium">{{ t('admin.zoekresultaten') }}</span>
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :aria-label="t('admin.sluiten')" @click="open = false" />
      </div>
      <p v-if="bezig" role="status" class="text-sm text-muted">{{ t('admin.laden') }}</p>
      <p v-else-if="fout" role="alert" class="text-sm text-error">{{ t('admin.zoekFout') }} <button class="underline underline-offset-4" @click="laad(zoek)">{{ t('admin.opnieuw') }}</button></p>
      <p v-else-if="geen" role="status" class="text-sm text-muted">{{ t('admin.geenResultaten') }}</p>
      <template v-else-if="resultaat">
        <section v-for="groep in groepen.filter(g => resultaat![g].items.length)" :key="groep" class="mt-4 first:mt-0">
          <h2 class="mb-1 text-sm font-semibold">{{ t(`admin.${groep}`) }}</h2>
          <ul class="space-y-1">
            <li v-for="item in resultaat[groep].items" :key="item.id">
              <NuxtLink :to="`/admin/${groep}/${item.id}`" class="block rounded-md p-2 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary" @click="open = false">
                <span class="font-medium">{{ item.naam }}</span> <UBadge v-if="item.verwijderd" color="neutral" variant="subtle" size="sm">{{ t('admin.verwijderd') }}</UBadge>
                <span class="block break-words text-xs text-muted">{{ item.context }}</span>
              </NuxtLink>
            </li>
          </ul>
          <NuxtLink v-if="resultaat[groep].meer" :to="{ path: `/admin/${groep}`, query: { zoek } }" class="mt-2 inline-block text-sm text-primary underline underline-offset-4" @click="open = false">{{ t('admin.alleResultaten') }}</NuxtLink>
        </section>
      </template>
    </div>
  </div>
</template>
