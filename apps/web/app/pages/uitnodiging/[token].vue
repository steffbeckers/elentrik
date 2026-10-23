<script setup lang="ts">
import { vertaalFout } from "~/fouten";
import { foutCode, foutStatus } from "~/sessie/fouten";
import { isNaam, wachtwoordFout } from "~/sessie/invoer";
import { useSessieStore, type Rol } from "~/stores/sessie";
import { TAAL_HEADER } from "../../../shared/taal";

type UitnodigingInfo = {
  id: string;
  email: string;
  rol: Rol;
  verlooptOp: string;
  organisatie: { naam: string };
};

const { t } = useI18n();
const route = useRoute();
const sessie = useSessieStore();
const { taal } = useTaal();

useHead({ title: () => `${t("uitnodiging.titel")} · ${t("app.naam")}` });

const token = computed(() => String(route.params.token ?? ""));
const pad = computed(() => `/api/uitnodigingen/${encodeURIComponent(token.value)}`);

// Enkel op de client, zoals de andere pagina's met gegevens.
const {
  data: uitnodiging,
  error,
  status,
  refresh,
} = useAsyncData("uitnodiging", () => $fetch<UitnodigingInfo>(pad.value), {
  server: false,
  default: () => null,
});

const nietMeerGeldig = ref(false);
const ongeldig = computed(() => nietMeerGeldig.value || foutStatus(error.value) === 410);

type Toestand = "laden" | "ongeldig" | "fout" | "aanvaarden" | "anderAdres" | "nietIngelogd";

const toestand = computed<Toestand>(() => {
  if (ongeldig.value) return "ongeldig";
  if (error.value) return "fout";
  if (!uitnodiging.value || status.value === "pending") return "laden";
  if (!sessie.gebruiker) return "nietIngelogd";
  return sessie.gebruiker.email.toLowerCase() === uitnodiging.value.email.toLowerCase() ? "aanvaarden" : "anderAdres";
});

const inloggenNaar = computed(() => `/inloggen?terug=${encodeURIComponent(route.fullPath)}`);

const bezig = ref<"aanvaarden" | "uitloggen" | "registreren" | null>(null);
const melding = ref<string | null>(null);
const accountBestaat = ref(false);

/** Een fout van de uitnodigingsroutes als melding; 410 toont de pagina "niet meer geldig". */
function verwerkFout(fout: unknown): void {
  const status = foutStatus(fout);
  if (status === 410) nietMeerGeldig.value = true;
  else if (foutCode(fout) === "ACCOUNT_BESTAAT") accountBestaat.value = true;
  else if (status === 403 && !foutCode(fout)) melding.value = t("fouten.EMAIL_NIET_BEVESTIGD");
  else melding.value = vertaalFout(fout, t);
}

async function aanvaard() {
  if (bezig.value) return;
  bezig.value = "aanvaarden";
  melding.value = null;
  try {
    await $fetch(`${pad.value}/aanvaard`, { method: "POST" });
    await sessie.laad();
    await navigateTo("/", { replace: true });
  } catch (fout) {
    verwerkFout(fout);
  } finally {
    bezig.value = null;
  }
}

async function uitloggen() {
  if (bezig.value) return;
  bezig.value = "uitloggen";
  melding.value = null;
  try {
    await sessie.uitloggen();
  } catch {
    melding.value = t("menu.uitloggenMislukt");
  } finally {
    bezig.value = null;
  }
}

const formulier = reactive({ naam: "", wachtwoord: "" });

function valideer(waarden: typeof formulier) {
  const fouten: { name: string; message: string }[] = [];
  if (!isNaam(waarden.naam)) fouten.push({ name: "naam", message: t("auth.fouten.naamVerplicht") });
  const wachtwoord = wachtwoordFout(waarden.wachtwoord);
  if (wachtwoord) fouten.push({ name: "wachtwoord", message: t(`auth.fouten.${wachtwoord}`) });
  return fouten;
}

/**
 * Registreert met het adres van de uitnodiging; de server maakt het account, aanvaardt de
 * uitnodiging en start een sessie. Is er toch geen sessie, dan volgt inloggen met een melding.
 */
async function registreer() {
  if (bezig.value) return;
  bezig.value = "registreren";
  melding.value = null;
  accountBestaat.value = false;
  try {
    await $fetch(`${pad.value}/registreer`, {
      method: "POST",
      body: { naam: formulier.naam.trim(), wachtwoord: formulier.wachtwoord },
      // De taal van de interface wordt die van het nieuwe account.
      headers: { [TAAL_HEADER]: taal.value },
    });
    await sessie.laad();
    if (sessie.gebruiker) await navigateTo("/", { replace: true });
    else await navigateTo("/inloggen?melding=account-gemaakt", { replace: true });
  } catch (fout) {
    verwerkFout(fout);
  } finally {
    bezig.value = null;
  }
}
</script>

<template>
  <AuthKader :titel="$t('uitnodiging.titel')">
    <div v-if="toestand === 'laden'" class="flex items-center gap-2 text-muted" aria-busy="true">
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />{{ $t("uitnodiging.laden") }}
    </div>

    <div v-else-if="toestand === 'ongeldig'" class="space-y-4">
      <UAlert
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="$t('uitnodiging.ongeldig.titel')"
        :description="$t('uitnodiging.ongeldig.beschrijving')"
        data-testid="uitnodiging-ongeldig"
      />
      <UButton to="/" color="neutral" variant="outline" block :label="$t('uitnodiging.naarStart')" />
    </div>

    <UAlert
      v-else-if="toestand === 'fout'"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :title="$t('uitnodiging.ladenMislukt')"
      :actions="[{ label: $t('uitnodiging.opnieuw'), color: 'error', onClick: () => refresh() }]"
    />

    <div v-else-if="uitnodiging" class="space-y-4">
      <p data-testid="uitnodiging-uitleg">
        <i18n-t keypath="uitnodiging.uitleg" scope="global">
          <template #organisatie>
            <strong data-testid="uitnodiging-organisatie">{{ uitnodiging.organisatie.naam }}</strong>
          </template>
          <template #rol>
            <strong data-testid="uitnodiging-rol">{{ $t(`rollenInZin.${uitnodiging.rol}`) }}</strong>
          </template>
        </i18n-t>
      </p>
      <p class="text-sm text-muted">{{ $t("uitnodiging.voor", { email: uitnodiging.email }) }}</p>

      <UAlert v-if="melding" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="melding" />
      <UAlert
        v-if="accountBestaat"
        color="warning"
        variant="subtle"
        icon="i-lucide-user-check"
        :title="$t('uitnodiging.accountBestaat')"
        data-testid="uitnodiging-account-bestaat"
      />

      <UButton
        v-if="toestand === 'aanvaarden'"
        block
        icon="i-lucide-check"
        :label="$t('uitnodiging.aanvaarden')"
        :loading="bezig === 'aanvaarden'"
        :disabled="bezig !== null"
        data-testid="uitnodiging-aanvaarden"
        @click="aanvaard"
      />

      <template v-else-if="toestand === 'anderAdres'">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-user-x"
          :title="$t('uitnodiging.nietVoorJou')"
          :description="$t('uitnodiging.anderAdres', { email: sessie.gebruiker?.email ?? '' })"
          data-testid="uitnodiging-ander-adres"
        />
        <UButton
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-log-out"
          :label="$t('uitnodiging.uitloggen')"
          :loading="bezig === 'uitloggen'"
          :disabled="bezig !== null"
          data-testid="uitnodiging-uitloggen"
          @click="uitloggen"
        />
      </template>

      <template v-else>
        <p class="text-sm">{{ $t("uitnodiging.nietIngelogd") }}</p>
        <UButton
          :to="inloggenNaar"
          block
          color="neutral"
          variant="outline"
          icon="i-lucide-log-in"
          :label="$t('uitnodiging.inloggen')"
          data-testid="uitnodiging-inloggen"
        />
        <USeparator :label="$t('inloggen.of')" />
        <h2 class="font-semibold">{{ $t("uitnodiging.registreren.titel") }}</h2>
        <UForm :state="formulier" :validate="valideer" class="space-y-4" @submit="registreer">
          <UFormField name="email" :label="$t('auth.email')">
            <UInput
              :model-value="uitnodiging.email"
              type="email"
              disabled
              class="w-full"
              data-testid="uitnodiging-email"
            />
          </UFormField>
          <UFormField name="naam" :label="$t('auth.naam')" required>
            <UInput v-model="formulier.naam" autocomplete="name" class="w-full" data-testid="uitnodiging-naam" />
          </UFormField>
          <UFormField name="wachtwoord" :label="$t('auth.wachtwoord')" :hint="$t('auth.wachtwoordHulp')" required>
            <UInput
              v-model="formulier.wachtwoord"
              type="password"
              autocomplete="new-password"
              class="w-full"
              data-testid="uitnodiging-wachtwoord"
            />
          </UFormField>
          <UButton
            type="submit"
            block
            :label="$t('uitnodiging.registreren.knop')"
            :loading="bezig === 'registreren'"
            :disabled="bezig !== null"
            data-testid="uitnodiging-registreren"
          />
        </UForm>
      </template>
    </div>
  </AuthKader>
</template>
