<script setup lang="ts">
import { vertaalFout } from "~/fouten";
import { INLOGLINK_MISLUKT } from "../../shared/inloglink";
import { veiligTerugpad } from "../../shared/terugpad";
import { terugZonderFout } from "~/sessie/bestemming";
import { foutCode, foutStatus } from "~/sessie/fouten";
import { isEmail } from "~/sessie/invoer";
import { useSessieStore } from "~/stores/sessie";

const { t } = useI18n();
const route = useRoute();
const sessie = useSessieStore();

useHead({ title: () => `${t("inloggen.titel")} · ${t("app.naam")}` });

/**
 * Waar je na het inloggen heen gaat: alleen een lokaal pad, anders de start. Meldde Better Auth
 * daarin een mislukte link (bv. een verlopen bevestigingslink: `/?error=…`), dan zonder die melding.
 * Ook de server zet hier de bestemming van een mislukte link in (`&terug=`); dezelfde controle als daar.
 */
const terugInfo = computed(() => terugZonderFout(veiligTerugpad(route.query.terug) ?? "/"));
const terug = computed(() => terugInfo.value.pad);

/** `nieuweLink`: de melding biedt de knop "Stuur een nieuwe link" aan (een mislukte inloglink). */
type Melding = { kleur: "success" | "error" | "info"; tekst: string; nieuweLink?: true };

/** Een melding uit de URL: alleen vaste sleutels, nooit tekst uit de query zelf. */
function meldingUitQuery(): Melding | null {
  // De server stuurt hierheen na een serverfout bij het verifiëren van een inloglink.
  if (route.query.fout === INLOGLINK_MISLUKT) {
    return { kleur: "error", tekst: t(`fouten.${INLOGLINK_MISLUKT}`), nieuweLink: true };
  }
  if (route.query.error !== undefined || terugInfo.value.fout) {
    return { kleur: "error", tekst: t("inloggen.linkOngeldig") };
  }
  if (route.query.melding === "account-gemaakt") return { kleur: "success", tekst: t("inloggen.accountGemaakt") };
  if (route.query.melding === "wachtwoord-gewijzigd") {
    return { kleur: "success", tekst: t("inloggen.wachtwoordGewijzigd") };
  }
  return null;
}

const formulier = reactive({ email: "", wachtwoord: "" });
// Alleen het deel van UForm dat hier nodig is: één veld valideren, met de melding bij dat veld.
const form = useTemplateRef<{ validate(opties: { name: "email"; silent: true }): Promise<unknown> }>("form");
const melding = ref<Melding | null>(meldingUitQuery());
const onbevestigd = ref(false);
const bezig = ref<"wachtwoord" | "link" | "bevestiging" | null>(null);

function valideer(waarden: typeof formulier) {
  const fouten: { name: string; message: string }[] = [];
  if (!isEmail(waarden.email)) fouten.push({ name: "email", message: t("auth.fouten.emailOngeldig") });
  if (waarden.wachtwoord === "") fouten.push({ name: "wachtwoord", message: t("auth.fouten.wachtwoordVerplicht") });
  return fouten;
}

function foutMelding(fout: unknown): Melding {
  return { kleur: "error", tekst: vertaalFout(fout, t) };
}

async function inloggen() {
  if (bezig.value) return;
  bezig.value = "wachtwoord";
  melding.value = null;
  onbevestigd.value = false;
  try {
    const { error } = await useAuthClient().signIn.email({
      email: formulier.email.trim(),
      password: formulier.wachtwoord,
    });
    if (error) {
      if (foutCode(error) === "EMAIL_NOT_VERIFIED") onbevestigd.value = true;
      else if (foutStatus(error) === 401) melding.value = { kleur: "error", tekst: t("inloggen.ongeldig") };
      else melding.value = foutMelding(error);
      return;
    }
    // Lukt het lezen van de sessie nu niet (geen 401), dan probeert de middleware het opnieuw.
    await sessie.laad().catch(() => undefined);
    await navigateTo(terug.value, { replace: true });
  } catch (fout) {
    melding.value = foutMelding(fout);
  } finally {
    bezig.value = null;
  }
}

/** Een magic link: alleen het adres telt. Het antwoord is altijd dezelfde, neutrale melding. */
async function stuurInloglink() {
  if (bezig.value) return;
  if (!(await form.value?.validate({ name: "email", silent: true }))) return;
  bezig.value = "link";
  melding.value = null;
  onbevestigd.value = false;
  try {
    const { error } = await useAuthClient().signIn.magicLink({
      email: formulier.email.trim(),
      callbackURL: terug.value,
      errorCallbackURL: "/inloggen",
    });
    melding.value = error ? foutMelding(error) : { kleur: "info", tekst: t("inloggen.inloglinkVerstuurd") };
  } catch (fout) {
    melding.value = foutMelding(fout);
  } finally {
    bezig.value = null;
  }
}

async function stuurBevestiging() {
  if (bezig.value) return;
  bezig.value = "bevestiging";
  try {
    const { error } = await useAuthClient().sendVerificationEmail({
      email: formulier.email.trim(),
      callbackURL: terug.value,
    });
    melding.value = error ? foutMelding(error) : { kleur: "info", tekst: t("inloggen.onbevestigd.verstuurd") };
    if (!error) onbevestigd.value = false;
  } catch (fout) {
    melding.value = foutMelding(fout);
  } finally {
    bezig.value = null;
  }
}
</script>

<template>
  <AuthKader :titel="$t('inloggen.titel')">
    <div class="space-y-4">
      <UAlert
        v-if="melding"
        :color="melding.kleur"
        variant="subtle"
        :icon="melding.kleur === 'error' ? 'i-lucide-circle-alert' : 'i-lucide-info'"
        :title="melding.tekst"
        data-testid="inloggen-melding"
      >
        <template v-if="melding.nieuweLink" #actions>
          <UButton
            color="error"
            variant="outline"
            size="sm"
            icon="i-lucide-mail"
            :label="$t('inloggen.nieuweLink')"
            :loading="bezig === 'link'"
            :disabled="bezig !== null"
            data-testid="inloggen-nieuwe-link"
            @click="stuurInloglink"
          />
        </template>
      </UAlert>
      <UAlert
        v-if="onbevestigd"
        color="warning"
        variant="subtle"
        icon="i-lucide-mail-warning"
        :title="$t('inloggen.onbevestigd.titel')"
        :description="$t('inloggen.onbevestigd.beschrijving')"
        data-testid="inloggen-onbevestigd"
      >
        <template #actions>
          <UButton
            color="warning"
            variant="outline"
            size="sm"
            :label="$t('inloggen.onbevestigd.opnieuw')"
            :loading="bezig === 'bevestiging'"
            data-testid="inloggen-bevestiging-opnieuw"
            @click="stuurBevestiging"
          />
        </template>
      </UAlert>

      <UForm ref="form" :state="formulier" :validate="valideer" class="space-y-4" @submit="inloggen">
        <UFormField name="email" :label="$t('auth.email')" required>
          <UInput
            v-model="formulier.email"
            type="email"
            autocomplete="email"
            class="w-full"
            data-testid="inloggen-email"
          />
        </UFormField>
        <UFormField name="wachtwoord" :label="$t('auth.wachtwoord')">
          <UInput
            v-model="formulier.wachtwoord"
            type="password"
            autocomplete="current-password"
            class="w-full"
            data-testid="inloggen-wachtwoord"
          />
          <template #hint>
            <ULink to="/wachtwoord-vergeten" class="text-sm" data-testid="inloggen-wachtwoord-vergeten">
              {{ $t("inloggen.wachtwoordVergeten") }}
            </ULink>
          </template>
        </UFormField>
        <UButton
          type="submit"
          block
          :label="$t('inloggen.knop')"
          :loading="bezig === 'wachtwoord'"
          :disabled="bezig !== null"
          data-testid="inloggen-knop"
        />
      </UForm>

      <USeparator :label="$t('inloggen.of')" />

      <div class="space-y-2">
        <UButton
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-mail"
          :label="$t('inloggen.inloglink')"
          :loading="bezig === 'link'"
          :disabled="bezig !== null"
          data-testid="inloglink-knop"
          @click="stuurInloglink"
        />
        <p class="text-xs text-muted">{{ $t("inloggen.inloglinkUitleg") }}</p>
      </div>
    </div>

    <template #voet>
      <p class="text-sm text-muted">
        {{ $t("inloggen.geenAccount") }}
        <ULink to="/registreren" class="font-medium text-primary" data-testid="inloggen-naar-registreren">
          {{ $t("inloggen.registreren") }}
        </ULink>
      </p>
    </template>
  </AuthKader>
</template>
