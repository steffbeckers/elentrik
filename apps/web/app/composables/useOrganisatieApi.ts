// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). `useOrganisatieApi` is de Nuxt-ingang; `maakOrganisatieApi` krijgt de
// fetch-functie van buitenaf en is zo zonder Nuxt te testen.
//
// Het beheer van de actieve organisatie (/organisatie). Elke schrijfactie stuurt mee welke
// organisatie de pagina bedoelt (`voorOrganisatie`): wisselde een ander tabblad intussen, dan
// weigert de server met 409 ANDERE_ORGANISATIE.
import { voorOrganisatie } from "../sessie/organisatie";
import { type Rol, useSessieStore } from "../stores/sessie";

export type OrganisatieFetch = (
  url: string,
  opties?: { method?: string; headers?: Record<string, string>; body?: unknown },
) => Promise<unknown>;

export type OrganisatieApiOpties = {
  /** De actieve organisatie zoals de pagina die nu kent. */
  actieveOrganisatieId?: () => string | null;
};

export function maakOrganisatieApi(haal: OrganisatieFetch, opties: OrganisatieApiOpties = {}) {
  const schrijf = async (url: string, verzoek: { method: string; body?: unknown }): Promise<void> => {
    await haal(url, { ...verzoek, ...voorOrganisatie(opties.actieveOrganisatieId?.()) });
  };
  const lid = (id: string) => `/api/organisaties/leden/${encodeURIComponent(id)}`;
  return {
    hernoem: (naam: string) => schrijf("/api/organisaties/naam", { method: "PUT", body: { naam } }),
    wijzigRol: (lidId: string, rol: Rol) => schrijf(lid(lidId), { method: "PUT", body: { rol } }),
    verwijderLid: (lidId: string) => schrijf(lid(lidId), { method: "DELETE" }),
    nodigUit: (email: string, rol: Rol) =>
      schrijf("/api/organisaties/uitnodigingen", { method: "POST", body: { email, rol } }),
    trekIn: (uitnodigingId: string) =>
      schrijf(`/api/organisaties/uitnodigingen/${encodeURIComponent(uitnodigingId)}`, { method: "DELETE" }),
    verlaat: () => schrijf("/api/organisaties/verlaten", { method: "POST" }),
  };
}

export type OrganisatieApi = ReturnType<typeof maakOrganisatieApi>;

export function useOrganisatieApi(): OrganisatieApi {
  const sessie = useSessieStore();
  return maakOrganisatieApi($fetch as unknown as OrganisatieFetch, {
    actieveOrganisatieId: () => sessie.actieveOrganisatieId,
  });
}
