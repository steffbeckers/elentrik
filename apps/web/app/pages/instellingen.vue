<script setup lang="ts">
import { httpStatus } from "~/composables/useProjectenApi";
import {
  controleerLogo,
  formulierUitPartij,
  leegFormulier,
  partijUitFormulier,
  valideerFormulier,
  type BedrijfFormulier,
} from "~/instellingen/formulier";
import { useSessieStore } from "~/stores/sessie";

const { t } = useI18n();
const api = useBedrijfApi();
const bestanden = useBestandenApi();
const toast = useToast();
const sessie = useSessieStore();

/** Alleen een eigenaar wijzigt de bedrijfsgegevens; een lid ziet ze (de server weigert met 403). */
const alleenLezen = computed(() => sessie.rol !== "eigenaar");

useHead({ title: () => `${t("bedrijf.titel")} · ${t("app.naam")}` });

// Enkel op de client geladen, zoals de projectenlijst; opnieuw bij een andere actieve organisatie.
const { data: bedrijf, status, error, refresh } = useAsyncData("bedrijf", () => api.haal(), {
  server: false,
  default: () => null,
  watch: [() => sessie.actieveOrganisatieId],
});

const formulier = reactive<BedrijfFormulier>(leegFormulier());
const logoBestandId = ref<string | undefined>(undefined);
const geladen = ref(false);

watch(
  bedrijf,
  (partij) => {
    if (!partij) return;
    Object.assign(formulier, formulierUitPartij(partij));
    logoBestandId.value = partij.logoBestandId;
    geladen.value = true;
  },
  { immediate: true },
);

const gemount = ref(false);
onMounted(() => (gemount.value = true));
const laadt = computed(() => !geladen.value && !error.value && (!gemount.value || status.value === "pending"));

function valideer(waarden: BedrijfFormulier) {
  return valideerFormulier(waarden).map(({ name, fout }) => ({ name, message: t(`bedrijf.fouten.${fout}`) }));
}

const bezig = ref(false);

async function bewaar() {
  if (bezig.value || !geladen.value || alleenLezen.value) return;
  bezig.value = true;
  try {
    const bewaard = await api.bewaar(partijUitFormulier(formulier));
    Object.assign(formulier, formulierUitPartij(bewaard));
    logoBestandId.value = bewaard.logoBestandId;
    toast.add({ title: t("bedrijf.bewaard"), color: "success" });
  } catch {
    toast.add({ title: t("algemeen.fout"), color: "error" });
  } finally {
    bezig.value = false;
  }
}

const invoer = ref<HTMLInputElement | null>(null);
const logoBezig = ref(false);
const logoUrl = computed(() => (logoBestandId.value ? bestanden.url(logoBestandId.value) : null));

function meldLogoFout(sleutel: "onbekendType" | "teGroot" | "mislukt") {
  toast.add({ title: t(`bedrijf.logo.fout.${sleutel}`), color: "error" });
}

async function opLogoGekozen(gebeurtenis: Event) {
  const veld = gebeurtenis.target as HTMLInputElement;
  const gekozen = veld.files?.[0];
  // Zodat dezelfde keuze opnieuw kan na een afkeuring.
  veld.value = "";
  if (!gekozen || logoBezig.value || alleenLezen.value) return;

  // De eerste 16 bytes volstaan voor het type; zo gaat er niets over het netwerk bij een afkeuring.
  const kop = new Uint8Array(await gekozen.slice(0, 16).arrayBuffer());
  const controle = controleerLogo(gekozen.size, kop);
  if (!controle.ok) {
    meldLogoFout(controle.reden === "te-groot" ? "teGroot" : "onbekendType");
    return;
  }

  logoBezig.value = true;
  try {
    const info = await api.uploadLogo(gekozen, gekozen.name);
    logoBestandId.value = info.id;
    toast.add({ title: t("bedrijf.logo.bewaard"), color: "success" });
  } catch (fout) {
    const code = httpStatus(fout);
    meldLogoFout(code === 413 ? "teGroot" : code === 415 ? "onbekendType" : "mislukt");
  } finally {
    logoBezig.value = false;
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <AppBovenbalk />
    <UContainer class="max-w-3xl py-8">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h1 class="text-2xl font-semibold">{{ $t("bedrijf.titel") }}</h1>
          <p class="mt-1 text-sm text-muted">{{ $t("bedrijf.beschrijving") }}</p>
        </div>
        <UButton
          to="/"
          icon="i-lucide-arrow-left"
          color="neutral"
          variant="outline"
          :label="$t('bedrijf.terug')"
        />
      </div>

      <UAlert
        v-if="alleenLezen && !error"
        class="mb-6"
        color="info"
        variant="subtle"
        icon="i-lucide-lock"
        :title="$t('bedrijf.alleenLezen')"
        data-testid="bedrijf-alleen-lezen"
      />

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="$t('bedrijf.laden.fout.titel')"
        :description="$t('bedrijf.laden.fout.beschrijving')"
        :actions="[{ label: $t('bedrijf.laden.fout.opnieuw'), color: 'error', onClick: () => refresh() }]"
      />

      <div v-else class="space-y-6" :aria-busy="laadt">
        <UCard>
          <template #header>
            <h2 class="font-semibold">{{ $t("bedrijf.logo.titel") }}</h2>
          </template>
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div
              class="flex h-28 w-full items-center justify-center rounded-md border border-default bg-white p-2 sm:w-56 sm:shrink-0"
            >
              <img
                v-if="logoUrl"
                :src="logoUrl"
                :alt="$t('bedrijf.logo.voorbeeldAlt')"
                class="max-h-full max-w-full object-contain"
                data-testid="bedrijf-logo-voorbeeld"
              />
              <span v-else class="text-sm text-neutral-500">{{ $t("bedrijf.logo.geen") }}</span>
            </div>
            <div class="space-y-2">
              <p class="text-sm text-muted">{{ $t("bedrijf.logo.beschrijving") }}</p>
              <input
                ref="invoer"
                type="file"
                class="hidden"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                data-testid="bedrijf-logo"
                @change="opLogoGekozen"
              />
              <UButton
                v-if="!alleenLezen"
                icon="i-lucide-upload"
                color="neutral"
                variant="outline"
                :label="logoUrl ? $t('bedrijf.logo.vervang') : $t('bedrijf.logo.kies')"
                :loading="logoBezig"
                :disabled="logoBezig"
                @click="invoer?.click()"
              />
            </div>
          </div>
        </UCard>

        <UForm
          id="bedrijf-formulier"
          :state="formulier"
          :validate="valideer"
          :disabled="laadt || alleenLezen"
          class="space-y-6"
          @submit="bewaar"
        >
          <UCard>
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <UFormField name="naam" :label="$t('bedrijf.velden.naam')" required class="sm:col-span-2">
                <UInput v-model="formulier.naam" class="w-full" data-testid="bedrijf-naam" />
              </UFormField>
              <UFormField name="ondernemingsnummer" :label="$t('bedrijf.velden.ondernemingsnummer')">
                <UInput v-model="formulier.ondernemingsnummer" class="w-full" />
              </UFormField>
              <UFormField name="telefoon" :label="$t('bedrijf.velden.telefoon')">
                <UInput v-model="formulier.telefoon" type="tel" class="w-full" />
              </UFormField>
              <UFormField name="email" :label="$t('bedrijf.velden.email')" class="sm:col-span-2">
                <UInput v-model="formulier.email" type="email" class="w-full" />
              </UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="font-semibold">{{ $t("bedrijf.adres.titel") }}</h2>
            </template>
            <div class="grid grid-cols-6 gap-4">
              <UFormField name="straat" :label="$t('bedrijf.adres.straat')" class="col-span-6 sm:col-span-4">
                <UInput v-model="formulier.straat" class="w-full" />
              </UFormField>
              <UFormField name="nummer" :label="$t('bedrijf.adres.nummer')" class="col-span-3 sm:col-span-1">
                <UInput v-model="formulier.nummer" class="w-full" />
              </UFormField>
              <UFormField name="bus" :label="$t('bedrijf.adres.bus')" class="col-span-3 sm:col-span-1">
                <UInput v-model="formulier.bus" class="w-full" />
              </UFormField>
              <UFormField name="postcode" :label="$t('bedrijf.adres.postcode')" class="col-span-2 sm:col-span-2">
                <UInput v-model="formulier.postcode" class="w-full" />
              </UFormField>
              <UFormField name="gemeente" :label="$t('bedrijf.adres.gemeente')" class="col-span-4 sm:col-span-2">
                <UInput v-model="formulier.gemeente" class="w-full" />
              </UFormField>
              <UFormField name="land" :label="$t('bedrijf.adres.land')" class="col-span-6 sm:col-span-2">
                <UInput v-model="formulier.land" class="w-full" />
              </UFormField>
            </div>
          </UCard>

          <div v-if="!alleenLezen" class="flex justify-end">
            <UButton
              type="submit"
              :label="$t('bedrijf.bewaren')"
              :loading="bezig"
              :disabled="bezig || laadt"
              data-testid="bedrijf-bewaar"
            />
          </div>
        </UForm>
      </div>
    </UContainer>
  </div>
</template>
