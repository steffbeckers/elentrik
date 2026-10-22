<script setup lang="ts">
// Na opnieuw inloggen vanuit de editor (de knop "Opnieuw inloggen" opent een nieuw tabblad):
// het werk staat nog in het tabblad van de editor. Hier openen we bewust geen editor, zodat er geen
// tweede venster op hetzelfde project komt.
const { t } = useI18n();

useHead({ title: () => `${t("weerAangemeld.titel")} · ${t("app.naam")}` });

/** Lukt alleen voor een tabblad dat een script opende; anders blijft de tekst staan. */
function sluit(): void {
  window.close();
}
</script>

<template>
  <AuthKader :titel="$t('weerAangemeld.titel')">
    <div class="space-y-4" data-testid="weer-aangemeld">
      <p>{{ $t("weerAangemeld.tekst") }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-x"
          :label="$t('weerAangemeld.sluiten')"
          data-testid="tabblad-sluiten"
          @click="sluit"
        />
        <UButton to="/" color="neutral" variant="ghost" :label="$t('editor.bovenbalk.projecten')" />
      </div>
    </div>
  </AuthKader>
</template>
