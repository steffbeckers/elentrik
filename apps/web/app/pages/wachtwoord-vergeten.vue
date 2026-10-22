<script setup lang="ts">
import { foutStatus } from "~/sessie/fouten";
import { isEmail } from "~/sessie/invoer";

const { t } = useI18n();

useHead({ title: () => `${t("wachtwoordVergeten.titel")} · ${t("app.naam")}` });

const formulier = reactive({ email: "" });
const bezig = ref(false);
const melding = ref<{ kleur: "info" | "error"; tekst: string } | null>(null);

function valideer(waarden: typeof formulier) {
  return isEmail(waarden.email) ? [] : [{ name: "email", message: t("auth.fouten.emailOngeldig") }];
}

/** Het antwoord is altijd dezelfde, neutrale melding: niemand leert zo welke adressen bestaan. */
async function verstuur() {
  if (bezig.value) return;
  bezig.value = true;
  melding.value = null;
  try {
    const { error } = await useAuthClient().requestPasswordReset({
      email: formulier.email.trim(),
      redirectTo: "/wachtwoord-herstellen",
    });
    melding.value = error
      ? { kleur: "error", tekst: foutStatus(error) === 429 ? t("auth.fouten.teVeel") : t("algemeen.fout") }
      : { kleur: "info", tekst: t("wachtwoordVergeten.verstuurd") };
  } catch {
    melding.value = { kleur: "error", tekst: t("algemeen.fout") };
  } finally {
    bezig.value = false;
  }
}
</script>

<template>
  <AuthKader :titel="$t('wachtwoordVergeten.titel')">
    <div class="space-y-4">
      <p class="text-sm text-muted">{{ $t("wachtwoordVergeten.uitleg") }}</p>
      <UAlert
        v-if="melding"
        :color="melding.kleur"
        variant="subtle"
        :icon="melding.kleur === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-info'"
        :title="melding.tekst"
        data-testid="wachtwoord-vergeten-melding"
      />
      <UForm :state="formulier" :validate="valideer" class="space-y-4" @submit="verstuur">
        <UFormField name="email" :label="$t('auth.email')" required>
          <UInput
            v-model="formulier.email"
            type="email"
            autocomplete="email"
            class="w-full"
            data-testid="wachtwoord-vergeten-email"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :label="$t('wachtwoordVergeten.knop')"
          :loading="bezig"
          :disabled="bezig"
          data-testid="wachtwoord-vergeten-knop"
        />
      </UForm>
    </div>
    <template #voet>
      <ULink to="/inloggen" class="text-sm font-medium text-primary">{{ $t("wachtwoordVergeten.terug") }}</ULink>
    </template>
  </AuthKader>
</template>
