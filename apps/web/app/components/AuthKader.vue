<script setup lang="ts">
// Het kader van de inlog-, registratie- en uitnodigingspagina's: de naam van de app en een kaart
// met de titel, gecentreerd, ook op een smal scherm.
defineProps<{ titel: string }>();
</script>

<template>
  <main class="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
    <p class="mb-6 flex items-center gap-2 text-lg font-semibold">
      <UIcon name="i-lucide-zap" class="size-5 text-primary" />{{ $t("app.naam") }}
    </p>
    <UCard class="w-full max-w-md">
      <template #header>
        <h1 class="text-xl font-semibold">{{ titel }}</h1>
      </template>
      <slot />
      <template v-if="$slots.voet" #footer>
        <slot name="voet" />
      </template>
    </UCard>
  </main>
</template>
