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
import type { Toegang } from "../../shared/abonnement";
import type { Taal } from "../../shared/taal";
import type { SessieInfo } from "../sessie/bestemming";
import { foutStatus } from "../sessie/fouten";

export type Rol = "eigenaar" | "lid";

export type Gebruiker = { id: string; naam: string; email: string };

/** De gebruiker zoals /api/mij hem geeft: ook of zijn gratis proefperiode al gebruikt is. */
export type SessieGebruiker = Gebruiker & { proefGebruikt?: boolean };

export type Organisatie = { id: string; naam: string; rol: Rol; toegang: Toegang };

/** Het antwoord van GET /api/mij. */
export type Mij = {
  gebruiker: Gebruiker & { proefGebruikt: boolean; taal: Taal };
  organisaties: Organisatie[];
  actieveOrganisatieId: string | null;
  /** Staan abonnementen aan? Uit is "zoals vóór plan 7". */
  abonnementenIngeschakeld: boolean;
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
  const gebruiker = ref<SessieGebruiker | null>(null);
  const organisaties = ref<Organisatie[]>([]);
  const actieveOrganisatieId = ref<string | null>(null);
  /** Staan abonnementen aan op de server? */
  const abonnementenIngeschakeld = ref(false);
  /** Werd /api/mij al (met succes, of met 401) gelezen? */
  const geladen = ref(false);

  // Geen state: niet in de SSR-payload, en per instantie (dus per verzoek) gezet.
  let api: SessieApi | null = null;
  let voorVertrek: VoorVertrek = altijdDoor;
  /** Hoort bij `voorVertrek`: het vertrek ging toch niet door (wisselen of uitloggen mislukte). */
  let bijAfbreken: (() => void) | undefined;

  const actieveOrganisatie = computed<Organisatie | null>(
    () => organisaties.value.find((o) => o.id === actieveOrganisatieId.value) ?? null,
  );
  const rol = computed<Rol | null>(() => actieveOrganisatie.value?.rol ?? null);
  /** De toegang van de actieve organisatie; zonder organisatie geen beperking. */
  const toegang = computed<Toegang>(
    () => actieveOrganisatie.value?.toegang ?? { schrijven: true, reden: "uit", proefEinde: null, achterstalligTot: null },
  );
  /** Gebruikte deze gebruiker zijn gratis proefperiode al (voor een eerder eigen bedrijf)? */
  const proefGebruikt = computed(() => gebruiker.value?.proefGebruikt ?? false);
  /** Moet het formulier voor een nieuw bedrijf zeggen dat er geen gratis proef is? Alleen met abonnementen aan. */
  const toonGeenProefHint = computed(() => abonnementenIngeschakeld.value && proefGebruikt.value);
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
    abonnementenIngeschakeld.value = false;
  }

  /**
   * Leest /api/mij opnieuw. Een 401 betekent niet ingelogd; elke andere fout gaat door en laat
   * de sessie ongeladen (ook na een eerdere lading, bv. net na inloggen), zodat de volgende
   * navigatie opnieuw probeert.
   */
  async function laad(): Promise<void> {
    try {
      const mij = await vereisApi().mij();
      gebruiker.value = mij.gebruiker;
      organisaties.value = mij.organisaties;
      actieveOrganisatieId.value = mij.actieveOrganisatieId;
      abonnementenIngeschakeld.value = mij.abonnementenIngeschakeld;
    } catch (fout) {
      if (foutStatus(fout) !== 401) {
        geladen.value = false;
        throw fout;
      }
      wis();
    }
    geladen.value = true;
  }

  /**
   * Registreert de callback vóór wisselen en uitloggen; de vorige vervalt. Geeft een functie
   * terug die ze weer afmeldt (alleen als ze nog de geregistreerde is).
   */
  function registreerVoorVertrek(callback: VoorVertrek, afgebroken?: () => void): () => void {
    voorVertrek = callback;
    bijAfbreken = afgebroken;
    return () => {
      if (voorVertrek !== callback) return;
      voorVertrek = altijdDoor;
      bijAfbreken = undefined;
    };
  }

  /** Het vertrek zelf, na een `voorVertrek` dat ja zei; mislukt het, dan hoort de registratie dat. */
  async function vertrek(actie: () => Promise<void>): Promise<void> {
    const afgebroken = bijAfbreken;
    try {
      await actie();
    } catch (fout) {
      afgebroken?.();
      throw fout;
    }
  }

  /** Maakt een andere organisatie actief. false: `voorVertrek` hield het tegen. */
  async function wissel(organisatieId: string): Promise<boolean> {
    if (organisatieId === actieveOrganisatieId.value) return true;
    if (!(await voorVertrek())) return false;
    await vertrek(async () => {
      await vereisApi().wisselActief(organisatieId);
      await laad();
    });
    return true;
  }

  /** Logt uit en wist de sessie. false: `voorVertrek` hield het tegen. */
  async function uitloggen(): Promise<boolean> {
    if (!(await voorVertrek())) return false;
    await vertrek(() => vereisApi().uitloggen());
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
    toegang,
    proefGebruikt,
    abonnementenIngeschakeld,
    toonGeenProefHint,
    sessieInfo,
    gebruikApi,
    laad,
    registreerVoorVertrek,
    wissel,
    uitloggen,
  };
});
