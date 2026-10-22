// De ingelogde gebruiker, zijn organisaties en de actieve organisatie, uit GET /api/mij.
//
// Wisselen van organisatie en uitloggen gaan eerst langs `voorVertrek`: de editor registreert
// daar (Task 7) een callback die het project nog opslaat; geeft die false terug, dan stopt de
// actie. Zonder registratie gaat de actie meteen door.
//
// De API komt van buitenaf (`gebruikApi`): de Nuxt-plugin `sessie` geeft ze, met de cookies van
// het verzoek tijdens SSR. Zo is de store zonder Nuxt te testen.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { SessieInfo } from "../sessie/bestemming";
import { foutStatus } from "../sessie/fouten";

export type Rol = "eigenaar" | "lid";

export type Gebruiker = { id: string; naam: string; email: string };

export type Organisatie = { id: string; naam: string; rol: Rol };

/** Het antwoord van GET /api/mij. */
export type Mij = {
  gebruiker: Gebruiker;
  organisaties: Organisatie[];
  actieveOrganisatieId: string | null;
};

export type SessieApi = {
  /** GET /api/mij; zonder sessie een fout met status 401. */
  mij(): Promise<Mij>;
  /** POST /api/organisaties/actief. */
  wisselActief(organisatieId: string): Promise<void>;
  /** Better Auth: de sessie beëindigen. */
  uitloggen(): Promise<void>;
};

/** Mag de actie (wisselen, uitloggen) doorgaan? false stopt ze. */
export type VoorVertrek = () => boolean | Promise<boolean>;

const altijdDoor: VoorVertrek = () => true;

export const useSessieStore = defineStore("sessie", () => {
  const gebruiker = ref<Gebruiker | null>(null);
  const organisaties = ref<Organisatie[]>([]);
  const actieveOrganisatieId = ref<string | null>(null);
  /** Werd /api/mij al (met succes, of met 401) gelezen? */
  const geladen = ref(false);

  // Geen state: niet in de SSR-payload, en per instantie (dus per verzoek) gezet.
  let api: SessieApi | null = null;
  let voorVertrek: VoorVertrek = altijdDoor;

  const actieveOrganisatie = computed<Organisatie | null>(
    () => organisaties.value.find((o) => o.id === actieveOrganisatieId.value) ?? null,
  );
  const rol = computed<Rol | null>(() => actieveOrganisatie.value?.rol ?? null);
  /** Wat `bestemming` van de sessie nodig heeft: null is niet ingelogd. */
  const sessieInfo = computed<SessieInfo>(() =>
    gebruiker.value ? { actieveOrganisatieId: actieveOrganisatieId.value } : null,
  );

  function gebruikApi(nieuw: SessieApi): void {
    api = nieuw;
  }

  function vereisApi(): SessieApi {
    if (!api) throw new Error("De sessie-store heeft nog geen API (gebruikApi).");
    return api;
  }

  function wis(): void {
    gebruiker.value = null;
    organisaties.value = [];
    actieveOrganisatieId.value = null;
  }

  /** Leest /api/mij opnieuw. Een 401 betekent niet ingelogd; elke andere fout gaat door. */
  async function laad(): Promise<void> {
    try {
      const mij = await vereisApi().mij();
      gebruiker.value = mij.gebruiker;
      organisaties.value = mij.organisaties;
      actieveOrganisatieId.value = mij.actieveOrganisatieId;
    } catch (fout) {
      if (foutStatus(fout) !== 401) throw fout;
      wis();
    }
    geladen.value = true;
  }

  /**
   * Registreert de callback vóór wisselen en uitloggen; de vorige vervalt. Geeft een functie
   * terug die ze weer afmeldt (alleen als ze nog de geregistreerde is).
   */
  function registreerVoorVertrek(callback: VoorVertrek): () => void {
    voorVertrek = callback;
    return () => {
      if (voorVertrek === callback) voorVertrek = altijdDoor;
    };
  }

  /** Maakt een andere organisatie actief. false: `voorVertrek` hield het tegen. */
  async function wissel(organisatieId: string): Promise<boolean> {
    if (organisatieId === actieveOrganisatieId.value) return true;
    if (!(await voorVertrek())) return false;
    await vereisApi().wisselActief(organisatieId);
    await laad();
    return true;
  }

  /** Logt uit en wist de sessie. false: `voorVertrek` hield het tegen. */
  async function uitloggen(): Promise<boolean> {
    if (!(await voorVertrek())) return false;
    await vereisApi().uitloggen();
    wis();
    geladen.value = true;
    return true;
  }

  return {
    gebruiker,
    organisaties,
    actieveOrganisatieId,
    geladen,
    actieveOrganisatie,
    rol,
    sessieInfo,
    gebruikApi,
    laad,
    registreerVoorVertrek,
    wissel,
    uitloggen,
  };
});
