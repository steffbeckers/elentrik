<script setup lang="ts">
import { vertaalFout } from "~/fouten";
import { isBedrijfsnaam, isEmail, isNaam, wachtwoordFout } from "~/sessie/invoer";
import { TAAL_HEADER } from "../../shared/taal";

const { t } = useI18n();
const { taal } = useTaal();

useHead({ title: () => `${t("registreren.titel")} · ${t("app.naam")}` });

const formulier = reactive({ naam: "", email: "", wachtwoord: "", bedrijfsnaam: "" });
const bezig = ref(false);
const verstuurd = ref(false);
const fout = ref<string | null>(null);

function valideer(waarden: typeof formulier) {
  const fouten: { name: string; message: string }[] = [];
  if (!isNaam(waarden.naam)) fouten.push({ name: "naam", message: t("auth.fouten.naamVerplicht") });
  if (!isEmail(waarden.email)) fouten.push({ name: "email", message: t("auth.fouten.emailOngeldig") });
  const wachtwoord = wachtwoordFout(waarden.wachtwoord);
  if (wachtwoord) fouten.push({ name: "wachtwoord", message: t(`auth.fouten.${wachtwoord}`) });
  if (!isBedrijfsnaam(waarden.bedrijfsnaam)) {
    fouten.push({ name: "bedrijfsnaam", message: t("auth.fouten.bedrijfsnaam") });
  }
  return fouten;
}

async function registreer() {
  if (bezig.value) return;
  bezig.value = true;
  fout.value = null;
  try {
    // Bestaat het adres al, dan antwoordt Better Auth hetzelfde (geen opsomming van adressen).
    const { error } = await useAuthClient().signUp.email({
      name: formulier.naam.trim(),
      email: formulier.email.trim(),
      password: formulier.wachtwoord,
      wachtendeBedrijfsnaam: formulier.bedrijfsnaam.trim(),
      callbackURL: "/",
      // De taal van de interface wordt die van het account (en van de bevestigingsmail).
      fetchOptions: { headers: { [TAAL_HEADER]: taal.value } },
    });
    if (error) {
      fout.value = vertaalFout(error, t);
      return;
    }
    verstuurd.value = true;
  } catch (e) {
    fout.value = vertaalFout(e, t);
  } finally {
    bezig.value = false;
  }
}
</script>

<template>
  <AuthKader :titel="$t('registreren.titel')">
    <UAlert
      v-if="verstuurd"
      color="success"
      variant="subtle"
      icon="i-lucide-mail-check"
      :title="$t('registreren.bevestig')"
      data-testid="registreren-verstuurd"
    />
    <div v-else class="space-y-4">
      <UAlert v-if="fout" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="fout" />
      <UForm :state="formulier" :validate="valideer" class="space-y-4" @submit="registreer">
        <UFormField name="naam" :label="$t('auth.naam')" required>
          <UInput v-model="formulier.naam" autocomplete="name" class="w-full" data-testid="registreren-naam" />
        </UFormField>
        <UFormField name="email" :label="$t('auth.email')" required>
          <UInput
            v-model="formulier.email"
            type="email"
            autocomplete="email"
            class="w-full"
            data-testid="registreren-email"
          />
        </UFormField>
        <UFormField name="wachtwoord" :label="$t('auth.wachtwoord')" :hint="$t('auth.wachtwoordHulp')" required>
          <UInput
            v-model="formulier.wachtwoord"
            type="password"
            autocomplete="new-password"
            class="w-full"
            data-testid="registreren-wachtwoord"
          />
        </UFormField>
        <UFormField name="bedrijfsnaam" :label="$t('auth.bedrijfsnaam')" required>
          <UInput
            v-model="formulier.bedrijfsnaam"
            autocomplete="organization"
            class="w-full"
            data-testid="registreren-bedrijfsnaam"
          />
        </UFormField>
        <UButton
          type="submit"
          block
          :label="$t('registreren.knop')"
          :loading="bezig"
          :disabled="bezig"
          data-testid="registreren-knop"
        />
      </UForm>
    </div>

    <template #voet>
      <p class="text-sm text-muted">
        {{ $t("registreren.alAccount") }}
        <ULink to="/inloggen" class="font-medium text-primary" data-testid="registreren-naar-inloggen">
          {{ $t("registreren.inloggen") }}
        </ULink>
      </p>
    </template>
  </AuthKader>
</template>
