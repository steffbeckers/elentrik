import type { Partij } from "@elentrik/model";
import type { AdminPagina } from "./basis";
import type { AdminAbonnement, AdminToegangsverklaring, AdminToegangGroep } from "./toegang";
import type { AdminAuditItem } from "./audit";
import type { AdminNotitie } from "./notities";
export type AdminGebruiker = { id: string; naam: string; email: string; aangemaakt: string; bedrijven: number; rol?: 'eigenaar' | 'lid' };
export type AdminOrganisatie = {
  id: string; naam: string; aangemaakt: string; leden: number; projecten: number;
  eigenaren: Array<{ id: string; naam: string; email: string }>;
  toegang: AdminToegangsverklaring; groep: AdminToegangGroep; status: string | null;
};
export type AdminProject = {
  id: string; naam: string; klantnaam: string; organisatieId: string | null; organisatieNaam: string | null;
  versie: number; aangemaakt: string; gewijzigd: string; verwijderd: string | null;
};
export type AdminGebruikerDetail = AdminGebruiker & {
  emailBevestigd: boolean; verwacht: string; organisaties: AdminPagina<AdminOrganisatie>;
};
export type AdminOrganisatieDetail = AdminOrganisatie & {
  installateur: Partij; verwacht: string; toegangVerwacht: string; abonnement: AdminAbonnement;
  gebruikers: AdminPagina<AdminGebruiker>; projectLijst: AdminPagina<AdminProject>;
};
export type AdminOverzicht = {
  beoordeeldOp: string; billing: boolean;
  aantallen: { gebruikers: number; organisaties: number; projecten: number; nieuweGebruikers: number; nieuweOrganisaties: number; gewijzigdeProjecten: number };
  toegang: Record<AdminToegangGroep, number>;
  aandacht: { proefEindigt: AdminPagina<AdminOrganisatie>; betaling: AdminPagina<AdminOrganisatie>; alleenLezen: AdminPagina<AdminOrganisatie> };
  recenteProjecten: AdminProject[]; recenteCorrecties: AdminAuditItem[];
  opvolging: AdminPagina<AdminNotitie>;
};
