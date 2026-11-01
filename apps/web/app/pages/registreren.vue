<script setup lang="ts">
import type { FormErrorEvent } from "@nuxt/ui";
import { vertaalFout } from "~/fouten";
import { isBedrijfsnaam, isEmail, isNaam, wachtwoordFout } from "~/sessie/invoer";
import { TAAL_HEADER } from "../../shared/taal";

const { t } = useI18n();
const { taal } = useTaal();

useHead({ title: () => `${t("registreren.titel")} · ${t("app.naam")}` });

const formulier = reactive({ naam: "", email: "", wachtwoord: "", bedrijfsnaam: "" });
const bezig = ref(false);
const verstuurd = ref(false);
const ontvanger = ref("");
const opnieuwBezig = ref(false);
const opnieuwVerstuurd = ref(false);
async function stuurOpnieuw() {
  if (opnieuwBezig.value || opnieuwVerstuurd.value || !ontvanger.value) return;
  opnieuwBezig.value = true;
  fout.value = null;
  try {
    const { error } = await useAuthClient().sendVerificationEmail({ email: ontvanger.value, callbackURL: "/" });
    if (error) fout.value = vertaalFout(error, t);
    else opnieuwVerstuurd.value = true;
  } catch (e) {
    fout.value = vertaalFout(e, t);
  } finally {
    opnieuwBezig.value = false;
  }
}
const fout = ref<string | null>(null);

async function focusEersteFout(event: FormErrorEvent) {
  await nextTick();
  const naam = event.errors[0]?.name;
  if (naam && ["naam", "email", "wachtwoord", "bedrijfsnaam"].includes(naam)) {
    // UForm clears its temporary loading/disabled state after emitting the error.
    // Focus after that render, when the input can receive focus again.
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-testid="registreren-${naam}"]`)?.focus());
  }
}

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
    opnieuwVerstuurd.value = false;
    ontvanger.value = formulier.email.trim();
    formulier.wachtwoord = "";
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
    <div v-if="verstuurd" class="space-y-4">
      <UAlert
        color="success"
        variant="subtle"
        icon="i-lucide-mail-check"
        :title="$t('registreren.bevestig')"
        :description="$t('werkbaarheidBeheer.mailOntvanger', { email: ontvanger })"
        data-testid="registreren-verstuurd"
      />
      <p class="text-sm text-muted">{{ $t('werkbaarheidBeheer.mailHulp') }}</p>
      <UAlert v-if="fout" color="error" variant="subtle" :title="fout" />
      <p v-if="opnieuwVerstuurd" role="status" class="text-sm text-muted">{{ $t('inloggen.onbevestigd.verstuurd') }}</p>
      <UButton block :loading="opnieuwBezig" :disabled="opnieuwBezig || opnieuwVerstuurd" :label="$t('werkbaarheidBeheer.mailOpnieuw')" @click="stuurOpnieuw" />
      <p class="text-sm text-muted">{{ $t('werkbaarheidBeheer.emailWijzigenUitleg') }}</p>
      <UButton color="neutral" variant="outline" block :label="$t('werkbaarheidBeheer.emailWijzigen')" @click="verstuurd = false" />
    </div>
    <div v-else class="space-y-4">
      <UAlert v-if="fout" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="fout" />
      <UForm :state="formulier" :validate="valideer" class="space-y-4" @submit="registreer" @error="focusEersteFout">
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
          <WachtwoordVeld
            v-model="formulier.wachtwoord"
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
