<script setup lang="ts">
// Een genummerde sectie van een lang formulier (de projectgegevens): een nummer, een kop en
// eventueel een korte uitleg eronder. Het nummer staat in de kop, zodat een schermlezer het meeleest.
defineProps<{ nummer: number; titel: string; uitleg?: string }>();
</script>

<template>
  <section class="space-y-4">
    <div>
      <h3 class="flex items-center gap-2 font-semibold">
        <span
          class="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm text-primary tabular-nums"
          >{{ nummer }}</span
        >
        {{ titel }}
      </h3>
      <p v-if="uitleg" class="mt-1 text-sm text-muted">{{ uitleg }}</p>
    </div>
    <slot />
  </section>
</template>
