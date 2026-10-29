<script setup lang="ts">
// De balk bovenaan elke pagina van staging: je kunt hem niet wegklikken. Op productie en lokaal
// staat hij er niet.
import { toonBalk } from "../../shared/omgeving";

const omgeving = useOmgeving();
</script>

<template>
  <div
    v-if="toonBalk(omgeving)"
    role="note"
    class="sticky top-0 z-[100] flex h-[var(--staging-balk-hoogte)] items-center justify-center bg-warning px-3 text-center text-xs font-semibold text-black sm:text-sm"
    data-testid="staging-balk"
  >
    {{ $t("omgeving.staging") }}
  </div>
</template>
