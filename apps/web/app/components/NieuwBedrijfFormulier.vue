<script setup lang="ts">
// Een nieuw bedrijf (organisatie) aanmaken: via Better Auth (`organization.create`, de enige
// organisatieroute die de client zelf aanspreekt), daarna actief maken via onze eigen route.
// De bedrijfsgegevens van de nieuwe organisatie ontstaan op de server wanneer ze nodig zijn.
import { vertaalFout } from "~/fouten";
import { isBedrijfsnaam } from "~/sessie/invoer";
import { maakSlug } from "~/sessie/slug";
import { useSessieStore } from "~/stores/sessie";

const emit = defineEmits<{ aangemaakt: [id: string] }>();

const { t } = useI18n();
const sessie = useSessieStore();

const formulier = reactive({ naam: "" });
const bezig = ref(false);
const fout = ref<string | null>(null);

function valideer(waarden: typeof formulier) {
  return isBedrijfsnaam(waarden.naam) ? [] : [{ name: "naam", message: t("auth.fouten.bedrijfsnaam") }];
}

async function maak() {
  if (bezig.value) return;
  bezig.value = true;
  fout.value = null;
  try {
    const naam = formulier.naam.trim();
    // De huidige organisatie blijft actief tot het wisselen: zo gaat een open project eerst nog
    // langs `voorVertrek` (opslaan) voor de nieuwe organisatie actief wordt.
    const { data, error } = await useAuthClient().organization.create({
      name: naam,
      slug: maakSlug(naam),
      keepCurrentActiveOrganization: true,
    });
    if (error || !data) {
      fout.value = vertaalFout(error, t);
      return;
    }
    await sessie.laad();
    if (await sessie.wissel(data.id)) emit("aangemaakt", data.id);
  } catch (e) {
    fout.value = vertaalFout(e, t);
  } finally {
    bezig.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <UAlert v-if="fout" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="fout" />
    <UForm :state="formulier" :validate="valideer" class="space-y-4" @submit="maak">
      <UFormField
        name="naam"
        :label="$t('geenOrganisatie.nieuw.naam')"
        :hint="sessie.toonGeenProefHint ? $t('geenOrganisatie.nieuw.geenProef') : undefined"
        required
      >
        <UInput
          v-model="formulier.naam"
          autocomplete="organization"
          class="w-full"
          data-testid="organisatie-nieuw-naam"
        />
      </UFormField>
      <UButton
        type="submit"
        block
        icon="i-lucide-building-2"
        :label="$t('geenOrganisatie.nieuw.knop')"
        :loading="bezig"
        :disabled="bezig"
        data-testid="organisatie-nieuw-knop"
      />
    </UForm>
  </div>
</template>
