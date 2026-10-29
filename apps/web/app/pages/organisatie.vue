<script setup lang="ts">
import { datumTekst } from "~/abonnement/weergave";
import { useAndereOrganisatie } from "~/composables/useAndereOrganisatie";
import { useOrganisatieApi } from "~/composables/useOrganisatieApi";
import { useSessieHerstel } from "~/composables/useSessieHerstel";
import { vertaalFout } from "~/fouten";
import { foutCode, foutStatus } from "~/sessie/fouten";
import { isBedrijfsnaam, isEmail } from "~/sessie/invoer";
import { useSessieStore, type Rol } from "~/stores/sessie";

type Lid = { id: string; gebruikerId: string; naam: string; email: string; rol: Rol; sinds: string };
type Uitnodiging = { id: string; email: string; rol: Rol; verlooptOp: string };

const { t } = useI18n();
const { taal } = useTaal();
const sessie = useSessieStore();
const toast = useToast();
// Elke wijziging stuurt de actieve organisatie van deze pagina mee (een ander tabblad kan wisselen).
const api = useOrganisatieApi();
const andereOrganisatie = useAndereOrganisatie();

useHead({ title: () => `${t("organisatie.titel")} · ${t("app.naam")}` });

const isEigenaar = computed(() => sessie.rol === "eigenaar");
const organisatieNaam = computed(() => sessie.actieveOrganisatie?.naam ?? "");

// Enkel op de client geladen, zoals de projectenlijst; opnieuw bij een andere actieve organisatie.
const {
  data: leden,
  error: ledenFout,
  status: ledenStatus,
  refresh: herlaadLeden,
} = useAsyncData("leden", () => $fetch<Lid[]>("/api/organisaties/leden"), {
  server: false,
  default: () => [] as Lid[],
  watch: [() => sessie.actieveOrganisatieId],
});

// Alleen een eigenaar ziet de openstaande uitnodigingen (met hun adressen).
const {
  data: uitnodigingen,
  error: uitnodigingenFout,
  status: uitnodigingenStatus,
  refresh: herlaadUitnodigingen,
} = useAsyncData(
  "uitnodigingen",
  () => (isEigenaar.value ? $fetch<Uitnodiging[]>("/api/organisaties/uitnodigingen") : Promise.resolve([])),
  { server: false, default: () => [] as Uitnodiging[], watch: [() => sessie.actieveOrganisatieId, isEigenaar] },
);

// Nog niets binnen (ook tijdens SSR, waar de lijsten niet laden): "Laden…" in plaats van een
// lege lijst.
const ledenLaden = computed(() => !ledenFout.value && ledenStatus.value !== "success");
const uitnodigingenLaden = computed(() => !uitnodigingenFout.value && uitnodigingenStatus.value !== "success");

// Niet meer lid, of geen eigenaar meer (spec 5b.5): de sessie opnieuw lezen.
const herstelSessie = useSessieHerstel();
watch(ledenFout, herstelSessie);
watch(uitnodigingenFout, herstelSessie);

const rolOpties = computed(() => [
  { value: "eigenaar", label: t("rollen.eigenaar") },
  { value: "lid", label: t("rollen.lid") },
]);

/**
 * De melding bij een mislukte actie: de vertaalde foutcode (`fouten.<CODE>`). Een 403 zonder code
 * (een route die geen code meestuurt) betekent hier dat alleen een eigenaar dit mag; een 403 mét
 * code gaat langs `vertaalFout` zoals elke andere fout.
 */
function foutTekst(fout: unknown): string {
  if (foutStatus(fout) === 403 && !foutCode(fout)) return t("organisatie.alleenEigenaar");
  return vertaalFout(fout, t);
}

/** Wisselde een ander tabblad de organisatie (409 ANDERE_ORGANISATIE), dan meldt die dat zelf. */
async function meldFout(fout: unknown) {
  if (await andereOrganisatie(fout)) return;
  toast.add({ title: foutTekst(fout), color: "error" });
}

// --- Naam ------------------------------------------------------------------------------------

const naamFormulier = reactive({ naam: "" });
watch(organisatieNaam, (naam) => (naamFormulier.naam = naam), { immediate: true });
const naamBezig = ref(false);

function valideerNaam(waarden: typeof naamFormulier) {
  return isBedrijfsnaam(waarden.naam) ? [] : [{ name: "naam", message: t("auth.fouten.bedrijfsnaam") }];
}

async function bewaarNaam() {
  if (naamBezig.value) return;
  naamBezig.value = true;
  try {
    await api.hernoem(naamFormulier.naam.trim());
    await sessie.laad();
    toast.add({ title: t("organisatie.naam.bewaard"), color: "success" });
  } catch (fout) {
    await meldFout(fout);
  } finally {
    naamBezig.value = false;
  }
}

// --- Leden -----------------------------------------------------------------------------------

const lidBezig = ref<string | null>(null);

async function wijzigRol(lid: Lid, rol: string) {
  if (lidBezig.value || rol === lid.rol || (rol !== "eigenaar" && rol !== "lid")) return;
  lidBezig.value = lid.id;
  try {
    await api.wijzigRol(lid.id, rol);
    toast.add({ title: t("organisatie.leden.rolGewijzigd"), color: "success" });
    // Wie zichzelf lid maakt, verliest het beheer: de sessie weet dat meteen.
    if (lid.gebruikerId === sessie.gebruiker?.id) await sessie.laad();
  } catch (fout) {
    await meldFout(fout);
  } finally {
    lidBezig.value = null;
    // Ook na een weigering: de keuzelijst toont weer de echte rol.
    await herlaadLeden();
  }
}

const teVerwijderen = ref<Lid | null>(null);
const verwijderOpen = computed({
  get: () => teVerwijderen.value !== null,
  set: (open) => {
    if (!open) teVerwijderen.value = null;
  },
});

async function bevestigVerwijderen() {
  const lid = teVerwijderen.value;
  if (!lid || lidBezig.value) return;
  lidBezig.value = lid.id;
  try {
    await api.verwijderLid(lid.id);
    toast.add({ title: t("organisatie.leden.verwijderd", { naam: lid.naam }), color: "success" });
    teVerwijderen.value = null;
    await herlaadLeden();
  } catch (fout) {
    teVerwijderen.value = null;
    await meldFout(fout);
  } finally {
    lidBezig.value = null;
  }
}

// --- Uitnodigingen ---------------------------------------------------------------------------

const uitnodigFormulier = reactive<{ email: string; rol: Rol }>({ email: "", rol: "lid" });
const uitnodigBezig = ref(false);

function valideerUitnodiging(waarden: typeof uitnodigFormulier) {
  return isEmail(waarden.email) ? [] : [{ name: "email", message: t("auth.fouten.emailOngeldig") }];
}

async function nodigUit() {
  if (uitnodigBezig.value) return;
  uitnodigBezig.value = true;
  try {
    const email = uitnodigFormulier.email.trim();
    await api.nodigUit(email, uitnodigFormulier.rol);
    toast.add({ title: t("organisatie.uitnodigen.verstuurd", { email }), color: "success" });
    uitnodigFormulier.email = "";
    uitnodigFormulier.rol = "lid";
    await herlaadUitnodigingen();
  } catch (fout) {
    await meldFout(fout);
  } finally {
    uitnodigBezig.value = false;
  }
}

const intrekBezig = ref<string | null>(null);

async function trekIn(uitnodiging: Uitnodiging) {
  if (intrekBezig.value) return;
  intrekBezig.value = uitnodiging.id;
  try {
    await api.trekIn(uitnodiging.id);
    toast.add({ title: t("organisatie.uitnodigingen.ingetrokken"), color: "success" });
  } catch (fout) {
    if (foutStatus(fout) !== 410) await meldFout(fout);
  } finally {
    intrekBezig.value = null;
    await herlaadUitnodigingen();
  }
}

function datum(iso: string): string {
  return datumTekst(iso, taal.value);
}

// --- Verlaten --------------------------------------------------------------------------------

const verlatenOpen = ref(false);
const verlatenBezig = ref(false);
const verlatenFout = ref<string | null>(null);

watch(verlatenOpen, (open) => {
  if (open) verlatenFout.value = null;
});

async function verlaat() {
  if (verlatenBezig.value) return;
  verlatenBezig.value = true;
  verlatenFout.value = null;
  try {
    await api.verlaat();
    verlatenOpen.value = false;
    // De sessie kiest zelf een andere organisatie, of geen: dan volgt /geen-organisatie.
    await sessie.laad();
    await navigateTo("/", { replace: true });
  } catch (fout) {
    if (await andereOrganisatie(fout)) {
      verlatenOpen.value = false;
      return;
    }
    verlatenFout.value = foutTekst(fout);
  } finally {
    verlatenBezig.value = false;
  }
}
</script>

<template>
  <div class="min-h-dvh">
    <AppBovenbalk />
    <AbonnementBanner />
    <UContainer class="max-w-3xl space-y-6 py-8">
      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div class="min-w-0">
          <h1 class="text-2xl font-semibold">{{ $t("organisatie.titel") }}</h1>
          <p v-if="sessie.rol" class="mt-1 text-sm text-muted" data-testid="organisatie-rol">
            {{
              $t("organisatie.rolUitleg", { rol: $t(`rollenInZin.${sessie.rol}`), organisatie: organisatieNaam })
            }}
          </p>
        </div>
        <UButton to="/" icon="i-lucide-arrow-left" color="neutral" variant="outline" :label="$t('organisatie.terug')" />
      </div>

      <UCard v-if="isEigenaar">
        <UForm :state="naamFormulier" :validate="valideerNaam" class="flex flex-wrap items-end gap-3" @submit="bewaarNaam">
          <UFormField name="naam" :label="$t('organisatie.naam.veld')" class="min-w-0 flex-1 basis-56">
            <UInput v-model="naamFormulier.naam" class="w-full" data-testid="organisatie-naam" />
          </UFormField>
          <UButton
            type="submit"
            color="neutral"
            variant="outline"
            :label="$t('organisatie.naam.bewaren')"
            :loading="naamBezig"
            :disabled="naamBezig"
            data-testid="organisatie-naam-bewaar"
          />
        </UForm>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">{{ $t("organisatie.leden.titel") }}</h2>
        </template>
        <UAlert
          v-if="ledenFout"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :title="$t('organisatie.leden.ladenMislukt')"
          :actions="[{ label: $t('uitnodiging.opnieuw'), color: 'error', onClick: () => herlaadLeden() }]"
        />
        <p v-else-if="ledenLaden" class="flex items-center gap-2 text-sm text-muted" data-testid="organisatie-leden-laden">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />{{ $t("organisatie.laden") }}
        </p>
        <ul v-else class="divide-y divide-default" data-testid="organisatie-leden">
          <li
            v-for="lid in leden"
            :key="lid.id"
            class="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
            :data-testid="`organisatie-lid-${lid.email}`"
          >
            <div class="min-w-0 flex-1 basis-48">
              <p class="truncate font-medium">
                {{ lid.naam }}
                <span v-if="lid.gebruikerId === sessie.gebruiker?.id" class="font-normal text-muted">
                  ({{ $t("organisatie.leden.jij") }})
                </span>
              </p>
              <p class="truncate text-sm text-muted">{{ lid.email }}</p>
            </div>
            <template v-if="isEigenaar">
              <USelect
                :model-value="lid.rol"
                :items="rolOpties"
                :disabled="lidBezig !== null"
                :aria-label="$t('organisatie.leden.rolVan', { naam: lid.naam })"
                class="w-32"
                data-testid="organisatie-lid-rol"
                @update:model-value="(rol: string) => wijzigRol(lid, rol)"
              />
              <UButton
                v-if="lid.gebruikerId !== sessie.gebruiker?.id"
                icon="i-lucide-user-minus"
                color="error"
                variant="ghost"
                :aria-label="$t('organisatie.leden.verwijderenVan', { naam: lid.naam })"
                :title="$t('organisatie.leden.verwijderenVan', { naam: lid.naam })"
                :disabled="lidBezig !== null"
                data-testid="organisatie-lid-verwijderen"
                @click="teVerwijderen = lid"
              />
              <span v-else class="w-8" aria-hidden="true" />
            </template>
            <UBadge v-else color="neutral" variant="subtle" :label="$t(`rollen.${lid.rol}`)" />
          </li>
        </ul>
      </UCard>

      <template v-if="isEigenaar">
        <UCard>
          <template #header>
            <h2 class="font-semibold">{{ $t("organisatie.uitnodigen.titel") }}</h2>
          </template>
          <UForm
            :state="uitnodigFormulier"
            :validate="valideerUitnodiging"
            class="flex flex-wrap items-end gap-3"
            @submit="nodigUit"
          >
            <UFormField name="email" :label="$t('organisatie.uitnodigen.email')" class="min-w-0 flex-1 basis-56">
              <UInput
                v-model="uitnodigFormulier.email"
                type="email"
                class="w-full"
                data-testid="organisatie-uitnodigen-email"
              />
            </UFormField>
            <UFormField name="rol" :label="$t('organisatie.uitnodigen.rol')">
              <USelect
                v-model="uitnodigFormulier.rol"
                :items="rolOpties"
                class="w-32"
                data-testid="organisatie-uitnodigen-rol"
              />
            </UFormField>
            <UButton
              type="submit"
              icon="i-lucide-send"
              :label="$t('organisatie.uitnodigen.knop')"
              :loading="uitnodigBezig"
              :disabled="uitnodigBezig"
              data-testid="organisatie-uitnodigen-knop"
            />
          </UForm>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold">{{ $t("organisatie.uitnodigingen.titel") }}</h2>
          </template>
          <UAlert
            v-if="uitnodigingenFout"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="$t('organisatie.uitnodigingen.ladenMislukt')"
            :actions="[{ label: $t('uitnodiging.opnieuw'), color: 'error', onClick: () => herlaadUitnodigingen() }]"
          />
          <p v-else-if="uitnodigingenLaden" class="flex items-center gap-2 text-sm text-muted">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />{{ $t("organisatie.laden") }}
          </p>
          <p v-else-if="uitnodigingen.length === 0" class="text-sm text-muted">
            {{ $t("organisatie.uitnodigingen.leeg") }}
          </p>
          <ul v-else class="divide-y divide-default" data-testid="organisatie-uitnodigingen">
            <li
              v-for="uitnodiging in uitnodigingen"
              :key="uitnodiging.id"
              class="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
              :data-testid="`organisatie-uitnodiging-${uitnodiging.email}`"
            >
              <div class="min-w-0 flex-1 basis-48">
                <p class="truncate font-medium">{{ uitnodiging.email }}</p>
                <p class="text-sm text-muted">
                  {{ $t(`rollen.${uitnodiging.rol}`) }} ·
                  {{ $t("organisatie.uitnodigingen.verlooptOp", { datum: datum(uitnodiging.verlooptOp) }) }}
                </p>
              </div>
              <UButton
                icon="i-lucide-x"
                color="error"
                variant="ghost"
                :label="$t('organisatie.uitnodigingen.intrekken')"
                :aria-label="$t('organisatie.uitnodigingen.intrekkenVan', { email: uitnodiging.email })"
                :loading="intrekBezig === uitnodiging.id"
                :disabled="intrekBezig !== null"
                data-testid="organisatie-uitnodiging-intrekken"
                @click="trekIn(uitnodiging)"
              />
            </li>
          </ul>
        </UCard>
      </template>

      <div class="flex justify-end">
        <UButton
          icon="i-lucide-log-out"
          color="error"
          variant="outline"
          :label="$t('organisatie.verlaten.knop')"
          data-testid="organisatie-verlaten"
          @click="verlatenOpen = true"
        />
      </div>
    </UContainer>

    <UModal v-model:open="verwijderOpen" :title="$t('organisatie.leden.verwijderenTitel')">
      <template #body>
        <p>
          {{
            $t("organisatie.leden.verwijderenBevestiging", {
              naam: teVerwijderen?.naam ?? "",
              organisatie: organisatieNaam,
            })
          }}
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="verwijderOpen = false" />
          <UButton
            color="error"
            :label="$t('organisatie.leden.verwijderen')"
            :loading="lidBezig !== null"
            :disabled="lidBezig !== null"
            data-testid="organisatie-lid-verwijderen-bevestig"
            @click="bevestigVerwijderen"
          />
        </div>
      </template>
    </UModal>

    <UModal v-model:open="verlatenOpen" :title="$t('organisatie.verlaten.titel')">
      <template #body>
        <div class="space-y-3">
          <p>{{ $t("organisatie.verlaten.bevestiging", { organisatie: organisatieNaam }) }}</p>
          <UAlert
            v-if="verlatenFout"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :title="verlatenFout"
            data-testid="organisatie-verlaten-fout"
          />
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :label="$t('algemeen.annuleren')" @click="verlatenOpen = false" />
          <UButton
            color="error"
            :label="$t('organisatie.verlaten.bevestigen')"
            :loading="verlatenBezig"
            :disabled="verlatenBezig"
            data-testid="organisatie-verlaten-bevestig"
            @click="verlaat"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
