<script setup lang="ts">
import { foutStatus } from "~/sessie/fouten";
import { wachtwoordFout } from "~/sessie/invoer";

const { t } = useI18n();
const route = useRoute();

useHead({ title: () => `${t("wachtwoordHerstellen.titel")} · ${t("app.naam")}` });

// De token uit de link (`?token=…`, of `?error=INVALID_TOKEN`) wordt in de browser gelezen en
// meteen uit de adresbalk gehaald, zodat hij niet in de geschiedenis of een gedeelde URL blijft.
const token = ref<string | null>(null);
const ongeldig = ref(false);
const gelezen = ref(false);

onMounted(() => {
  const waarde = route.query.token;
  if (typeof waarde === "string" && waarde !== "" && route.query.error === undefined) token.value = waarde;
  else ongeldig.value = true;
  if (route.query.token !== undefined || route.query.error !== undefined) {
    window.history.replaceState(window.history.state, "", route.path);
  }
  gelezen.value = true;
});

const formulier = reactive({ wachtwoord: "" });
const bezig = ref(false);
const fout = ref<string | null>(null);

function valideer(waarden: typeof formulier) {
  const soort = wachtwoordFout(waarden.wachtwoord);
  return soort ? [{ name: "wachtwoord", message: t(`auth.fouten.${soort}`) }] : [];
}

async function herstel() {
  if (bezig.value || !token.value) return;
  bezig.value = true;
  fout.value = null;
  try {
    const { error } = await useAuthClient().resetPassword({ newPassword: formulier.wachtwoord, token: token.value });
    if (error) {
      const status = foutStatus(error);
      if (status === 400) ongeldig.value = true;
      else fout.value = status === 429 ? t("auth.fouten.teVeel") : t("algemeen.fout");
      return;
    }
    await navigateTo("/inloggen?melding=wachtwoord-gewijzigd", { replace: true });
  } catch {
    fout.value = t("algemeen.fout");
  } finally {
    bezig.value = false;
  }
}
</script>

<template>
  <AuthKader :titel="$t('wachtwoordHerstellen.titel')">
    <div v-if="ongeldig" class="space-y-4">
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="$t('wachtwoordHerstellen.ongeldig')"
        data-testid="wachtwoord-herstellen-ongeldig"
      />
      <UButton to="/wachtwoord-vergeten" block :label="$t('wachtwoordHerstellen.nieuweLink')" />
    </div>
    <div v-else-if="gelezen" class="space-y-4">
      <UAlert v-if="fout" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="fout" />
      <UForm :state="formulier" :validate="valideer" class="space-y-4" @submit="herstel">
        <UFormField
          name="wachtwoord"
          :label="$t('wachtwoordHerstellen.nieuw')"
          :hint="$t('auth.wachtwoordHulp')"
          required
        >
          <UInput
            v-model="formulier.wachtwoord"
            type="password"
            autocomplete="new-password"
            class="w-full"
            data-testid="wachtwoord-herstellen-wachtwoord"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :label="$t('wachtwoordHerstellen.knop')"
          :loading="bezig"
          :disabled="bezig"
          data-testid="wachtwoord-herstellen-knop"
        />
      </UForm>
    </div>
    <template #voet>
      <ULink to="/inloggen" class="text-sm font-medium text-primary">{{ $t("wachtwoordVergeten.terug") }}</ULink>
    </template>
  </AuthKader>
</template>
