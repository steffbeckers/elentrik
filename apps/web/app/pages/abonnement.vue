<script setup lang="ts">
import type { AbonnementOverzicht, Formule } from "../../shared/abonnement";
import { beheerAbonnement, kiesFormule, verwerkTerug } from "~/abonnement/acties";
import { dagenTot, datumTekst, paginaWeergave } from "~/abonnement/weergave";
import { useAbonnementApi } from "~/composables/useAbonnementApi";
import { useAndereOrganisatie } from "~/composables/useAndereOrganisatie";
import { useSessieHerstel } from "~/composables/useSessieHerstel";
import { useSessieStore } from "~/stores/sessie";

const { t } = useI18n();
const sessie = useSessieStore();
const toast = useToast();
const route = useRoute();
const router = useRouter();
const api = useAbonnementApi();
const andereOrganisatie = useAndereOrganisatie();

useHead({ title: () => `${t("abonnement.titel")} · ${t("app.naam")}` });

// Enkel op de client geladen. Terug uit Checkout (`?terug=`) synchroniseert eerst; een andere
// actieve organisatie laadt het abonnement van die organisatie.
const {
  data: overzicht,
  error,
  status,
  refresh,
} = useAsyncData(
  "abonnement",
  async (): Promise<AbonnementOverzicht> => {
    const terug = typeof route.query.terug === "string" ? route.query.terug : undefined;
    const gesynchroniseerd = await verwerkTerug(terug, {
      api,
      laadSessie: () => sessie.laad(),
      verwijderTerug: () => router.replace({ query: { ...route.query, terug: undefined } }),
    });
    return gesynchroniseerd ?? (await api.haal());
  },
  { server: false, default: () => null as AbonnementOverzicht | null, watch: [() => sessie.actieveOrganisatieId] },
);

// Verlopen sessie of niet meer lid van de actieve organisatie (spec 5b.5).
watch(error, useSessieHerstel());

const nu = ref(new Date());
onMounted(() => (nu.value = new Date()));

const weergave = computed(() => (overzicht.value ? paginaWeergave(overzicht.value, sessie.rol) : null));

const formuleLabel = (formule: Formule) => t(`abonnement.formules.${formule}`);

/** De tekst van de statusregel, met de dagen, de datum of de formule die erin passen. */
const statusTekst = computed(() => {
  const o = overzicht.value;
  const w = weergave.value;
  if (!o || !w) return "";
  const einde =
    o.reden === "proef" ? o.proefEinde : o.reden === "betaling-mislukt" ? o.achterstalligTot : o.periodeEinde;
  return t(w.statusSleutel, {
    dagen: o.proefEinde ? Math.max(dagenTot(o.proefEinde, nu.value), 0) : 0,
    datum: einde ? datumTekst(einde) : t("abonnement.datumOnbekend"),
    formule: o.formule ? formuleLabel(o.formule).toLowerCase() : "",
  });
});

const bezig = ref<Formule | "beheer" | null>(null);

async function voerUit(soort: Formule | "beheer", actie: () => Promise<unknown>) {
  if (bezig.value !== null) return;
  bezig.value = soort;
  try {
    await actie();
  } catch (fout) {
    if (await andereOrganisatie(fout)) return;
    toast.add({ title: t("algemeen.fout"), color: "error" });
  } finally {
    bezig.value = null;
  }
}

const doorsturen = {
  navigeer: (url: string) => navigateTo(url, { external: true }),
  herlaad: () => refresh(),
};

const kies = (formule: Formule) => voerUit(formule, () => kiesFormule(formule, { api, ...doorsturen }));
const beheer = () => voerUit("beheer", () => beheerAbonnement({ api, ...doorsturen }));
</script>

<template>
  <div class="min-h-dvh">
    <AppBovenbalk />
    <UContainer class="max-w-3xl py-8">
      <h1 class="mb-6 text-2xl font-semibold">{{ $t("abonnement.titel") }}</h1>

      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="$t('abonnement.laden.fout.titel')"
        :description="$t('abonnement.laden.fout.beschrijving')"
        :actions="[{ label: $t('abonnement.laden.fout.opnieuw'), color: 'error', onClick: () => refresh() }]"
      />
      <p v-else-if="!overzicht || !weergave" class="text-muted" data-testid="abonnement-laden">
        {{ status === "pending" || status === "idle" ? $t("abonnement.laden.bezig") : "" }}
      </p>
      <div v-else class="space-y-6">
        <p class="text-lg" data-testid="abonnement-status">{{ statusTekst }}</p>

        <UAlert
          v-if="weergave.melding === 'lid'"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          :title="$t('abonnement.lid')"
          data-testid="abonnement-lid"
        />
        <UAlert
          v-else-if="weergave.melding === 'uit'"
          color="neutral"
          variant="subtle"
          icon="i-lucide-info"
          :title="$t('abonnement.status.uit')"
          data-testid="abonnement-uit"
        />
        <UAlert
          v-else-if="weergave.melding === 'prijzen'"
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="$t('abonnement.prijzenOntbreken')"
          data-testid="abonnement-prijzen-ontbreken"
        />

        <div v-if="weergave.kaarten.length" class="grid gap-4 sm:grid-cols-2">
          <UCard v-for="kaart in weergave.kaarten" :key="kaart.formule" :data-testid="`abonnement-kaart-${kaart.formule}`">
            <template #header>
              <div class="flex items-center justify-between gap-2">
                <h2 class="font-semibold">{{ formuleLabel(kaart.formule) }}</h2>
                <UBadge
                  v-if="kaart.korting"
                  color="success"
                  variant="subtle"
                  :label="$t('abonnement.korting', { percentage: kaart.korting })"
                  data-testid="abonnement-korting"
                />
              </div>
            </template>
            <p class="text-2xl font-semibold">
              {{ kaart.prijs.excl }}
              <span class="text-base font-normal text-muted">{{ $t(`abonnement.per.${kaart.formule}`) }}</span>
            </p>
            <p class="text-sm text-muted">{{ $t("abonnement.exclBtw", { incl: kaart.prijs.incl }) }}</p>
            <template #footer>
              <UButton
                block
                :label="$t('abonnement.kies')"
                :loading="bezig === kaart.formule"
                :disabled="bezig !== null"
                :data-testid="`abonnement-kies-${kaart.formule}`"
                @click="kies(kaart.formule)"
              />
            </template>
          </UCard>
        </div>

        <UButton
          v-if="weergave.beheer"
          icon="i-lucide-credit-card"
          :label="$t(weergave.beheer)"
          :loading="bezig === 'beheer'"
          :disabled="bezig !== null"
          data-testid="abonnement-beheren"
          @click="beheer"
        />
      </div>
    </UContainer>
  </div>
</template>
