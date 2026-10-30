<script setup lang="ts">
import {
  controleerLogo,
  formulierUitPartij,
  leegFormulier,
  logoUploadFout,
  partijUitFormulier,
  valideerFormulier,
  type BedrijfFormulier,
  type LogoFoutSleutel,
} from "~/instellingen/formulier";
import { laadBedrijf } from "~/instellingen/laden";
import { maakBedrijfBewaarder, type BewaarderToestand } from "~/instellingen/bewaarder";
import { useAndereOrganisatie } from "~/composables/useAndereOrganisatie";
import { useSessieHerstel } from "~/composables/useSessieHerstel";
import { vertaalFout } from "~/fouten";
import { useSessieStore } from "~/stores/sessie";

const { t } = useI18n();
const api = useBedrijfApi();
const bestanden = useBestandenApi();
const toast = useToast();
const sessie = useSessieStore();
// Bewaren en het logo sturen het bedrijf mee waarvoor het formulier geladen werd; wisselde het
// actieve bedrijf intussen (in dit of een ander tabblad), dan meldt dit dat (409 ANDERE_ORGANISATIE)
// en gaat er niets verloren aan de serverkant.
const andereOrganisatie = useAndereOrganisatie();

/** Alleen een eigenaar wijzigt de bedrijfsgegevens; een lid ziet ze (de server weigert met 403). */
const alleenLezen = computed(() => sessie.rol !== "eigenaar");

useHead({ title: () => `${t("bedrijf.titel")} · ${t("app.naam")}` });

// Enkel op de client geladen, zoals de projectenlijst; opnieuw bij een andere actieve organisatie.
// Het bedrijf waarvoor de gegevens geladen werden gaat mee, want daarvoor bewaart het formulier.
const { data: geladenBedrijf, error, refresh } = useAsyncData(
  "bedrijf",
  () =>
    laadBedrijf({
      haal: (organisatieId) => api.haal(organisatieId),
      organisatieId: () => sessie.actieveOrganisatieId,
      herleesSessie: () => sessie.laad(),
    }),
  {
    server: false,
    default: () => null,
    watch: [() => sessie.actieveOrganisatieId],
  },
);

// Verlopen sessie of niet meer lid van de actieve organisatie (spec 5b.5).
watch(error, useSessieHerstel());

const formulier = reactive<BedrijfFormulier>(leegFormulier());
const logoBestandId = ref<string | undefined>(undefined);

const toestand = reactive<BewaarderToestand>({ geladenVoor: null, bezig: false, logoBezig: false });
const bewaarder = maakBedrijfBewaarder(toestand, {
  bewaar: (partij, organisatieId) => api.bewaar(partij, organisatieId),
  uploadLogo: (bestand, naam, organisatieId) => api.uploadLogo(bestand, naam, organisatieId),
  andereOrganisatie,
  herlaad: () => refresh(),
});

// Het formulier toont nog gegevens van het vorige bedrijf: pas weer bewaarbaar als die van het
// nieuwe geladen zijn.
watch(
  () => sessie.actieveOrganisatieId,
  () => (toestand.geladenVoor = null),
);

watch(
  geladenBedrijf,
  (geladen) => {
    if (!geladen) return;
    Object.assign(formulier, formulierUitPartij(geladen.partij));
    logoBestandId.value = geladen.partij.logoBestandId;
    toestand.geladenVoor = geladen.organisatieId;
  },
  { immediate: true },
);

const laadt = computed(() => toestand.geladenVoor === null && !error.value);

function valideer(waarden: BedrijfFormulier) {
  return valideerFormulier(waarden).map(({ name, fout }) => ({ name, message: t(`bedrijf.fouten.${fout}`) }));
}

async function bewaar() {
  if (alleenLezen.value) return;
  try {
    const uitkomst = await bewaarder.bewaar(partijUitFormulier(formulier));
    if (uitkomst.status !== "gedaan") return;
    Object.assign(formulier, formulierUitPartij(uitkomst.waarde));
    logoBestandId.value = uitkomst.waarde.logoBestandId;
    toast.add({ title: t("bedrijf.bewaard"), color: "success" });
  } catch (fout) {
    toast.add({ title: vertaalFout(fout, t), color: "error" });
  }
}

const invoer = ref<HTMLInputElement | null>(null);
const logoUrl = computed(() => (logoBestandId.value ? bestanden.url(logoBestandId.value) : null));

function meldLogoFout(sleutel: LogoFoutSleutel) {
  const titel = sleutel === "opslagVol" ? t("fouten.OPSLAG_VOL") : t(`bedrijf.logo.fout.${sleutel}`);
  toast.add({ title: titel, color: "error" });
}

async function opLogoGekozen(gebeurtenis: Event) {
  const veld = gebeurtenis.target as HTMLInputElement;
  const gekozen = veld.files?.[0];
  // Zodat dezelfde keuze opnieuw kan na een afkeuring.
  veld.value = "";
  if (!gekozen || toestand.logoBezig || alleenLezen.value) return;

  // De eerste 16 bytes volstaan voor het type; zo gaat er niets over het netwerk bij een afkeuring.
  const kop = new Uint8Array(await gekozen.slice(0, 16).arrayBuffer());
  const controle = controleerLogo(gekozen.size, kop);
  if (!controle.ok) {
    meldLogoFout(controle.reden === "te-groot" ? "teGroot" : "onbekendType");
    return;
  }

  try {
    const uitkomst = await bewaarder.uploadLogo(gekozen, gekozen.name);
    if (uitkomst.status !== "gedaan") return;
    logoBestandId.value = uitkomst.waarde.id;
    toast.add({ title: t("bedrijf.logo.bewaard"), color: "success" });
  } catch (fout) {
    meldLogoFout(logoUploadFout(fout));
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <AppBovenbalk />
    <AbonnementBanner />
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
                :loading="toestand.logoBezig"
                :disabled="toestand.logoBezig"
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
              :loading="toestand.bezig"
              :disabled="toestand.bezig || laadt"
              data-testid="bedrijf-bewaar"
            />
          </div>
        </UForm>
      </div>
    </UContainer>
  </div>
</template>
