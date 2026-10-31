// Het antwoord van GET /api/mij: de ingelogde gebruiker, zijn organisaties en de actieve
// organisatie. De server (server/organisaties/leden.ts) bouwt het, de client (de sessie-store en de
// Nuxt-plugin) leest het; dit is de enige plaats waar het type staat.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import type { Toegang } from "./abonnement";
import type { Taal } from "./taal";

export type Rol = "eigenaar" | "lid";

export type MijGebruiker = { id: string; naam: string; email: string; proefGebruikt: boolean; taal: Taal };

export type MijOrganisatie = { id: string; naam: string; rol: Rol; toegang: Toegang };

export type Mij = {
  gebruiker: MijGebruiker;
  organisaties: MijOrganisatie[];
  actieveOrganisatieId: string | null;
  /** Staan abonnementen aan (Stripe is ingesteld)? Uit is "zoals vóór plan 7": geen proef, geen hints. */
  abonnementenIngeschakeld: boolean;
};
