// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). `useAbonnementApi` is de Nuxt-ingang; `maakAbonnementApi` krijgt de fetch-functie
// van buitenaf en is zo zonder Nuxt te testen.
//
// Het abonnement van de actieve organisatie. De POST's zijn voor eigenaars en sturen mee welke
// organisatie de pagina bedoelt (`voorOrganisatie`): wisselde een ander tabblad intussen, dan
// weigert de server met 409 ANDERE_ORGANISATIE.
import type { AbonnementOverzicht, Formule } from "../../shared/abonnement";
import { voorOrganisatie } from "../sessie/organisatie";
import { useSessieStore } from "../stores/sessie";

export type AbonnementFetch = (
  url: string,
  opties?: { method?: string; headers?: Record<string, string>; body?: unknown },
) => Promise<unknown>;

export type AbonnementApiOpties = {
  /** De actieve organisatie zoals de pagina die nu kent. */
  actieveOrganisatieId?: () => string | null;
};

export function maakAbonnementApi(haal: AbonnementFetch, opties: AbonnementApiOpties = {}) {
  const schrijf = (url: string, body?: unknown) =>
    haal(url, { method: "POST", ...(body === undefined ? {} : { body }), ...voorOrganisatie(opties.actieveOrganisatieId?.()) });
  return {
    haal: () => haal("/api/abonnement") as Promise<AbonnementOverzicht>,
    checkout: (formule: Formule) => schrijf("/api/abonnement/checkout", { formule }) as Promise<{ url: string }>,
    portaal: () => schrijf("/api/abonnement/portaal") as Promise<{ url: string }>,
    synchroniseer: (sessie: string) =>
      schrijf("/api/abonnement/synchroniseer", { sessie }) as Promise<AbonnementOverzicht>,
  };
}

export type AbonnementApi = ReturnType<typeof maakAbonnementApi>;

export function useAbonnementApi(): AbonnementApi {
  const sessie = useSessieStore();
  return maakAbonnementApi($fetch as unknown as AbonnementFetch, {
    actieveOrganisatieId: () => sessie.actieveOrganisatieId,
  });
}
