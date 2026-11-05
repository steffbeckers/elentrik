import type { Partij } from "@elentrik/model";
import { createError } from "h3";
import type { AdminAuditDetail, AdminAuditItem } from "../../shared/admin/audit";
import type { AdminMutatie, AdminPagina } from "../../shared/admin/basis";
import type { AdminNotitie } from "../../shared/admin/notities";
import type { AdminRevisie } from "../../shared/admin/projecten";
import type { AdminGebruiker, AdminGebruikerDetail, AdminOrganisatie, AdminOrganisatieDetail, AdminOverzicht, AdminProject } from "../../shared/admin/records";
import type { AdminZoekresultaten } from "../../shared/admin/zoeken";
import type { ExportInfo } from "../../shared/exports";
import { VERWACHTE_GEBRUIKER_HEADER } from "../../shared/gebruiker";
import { useSessieStore } from "../stores/sessie";
import type { ProjectenFetch } from "./useProjectenApi";

type Query = Record<string, string | number | boolean | null | undefined>;
type Correctie<T> = Omit<AdminMutatie<T>, "mutatieId">;
export function adminQuery(q: Query = {}): string {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
  return s.size ? `?${s}` : "";
}
export function maakAdminApi(haal: ProjectenFetch, gebruikerId: string) {
  const headers = { [VERWACHTE_GEBRUIKER_HEADER]: gebruikerId };
  const id = encodeURIComponent;
  const lees = <T>(pad: string, query?: Query) => haal(`/api/admin/${pad}${adminQuery(query)}`, { headers }) as Promise<T>;
  const pending = new Map<string, { inhoud: string; body: Record<string, unknown> }>();
  async function wijzig<T>(pad: string, body: object, method = "PUT"): Promise<T> {
    const sleutel = `${method}:${pad}`;
    const inhoud = JSON.stringify(body);
    let verzoek = pending.get(sleutel);
    if (!verzoek || verzoek.inhoud !== inhoud) {
      verzoek = { inhoud, body: { ...JSON.parse(inhoud), mutatieId: crypto.randomUUID() } };
      pending.set(sleutel, verzoek);
    }
    const result = await haal(`/api/admin/${pad}`, { method, headers, body: verzoek.body }) as T;
    if (pending.get(sleutel) === verzoek) pending.delete(sleutel);
    return result;
  }
  return {
    overzicht: () => lees<AdminOverzicht>("overzicht"),
    opvolging: (q?: Query) => lees<AdminPagina<AdminNotitie>>("opvolging", q),
    zoek: (zoek: string) => lees<AdminZoekresultaten>("zoeken", { zoek }),
    gebruikers: (q?: Query) => lees<AdminPagina<AdminGebruiker>>("gebruikers", q),
    gebruiker: (target: string) => lees<AdminGebruikerDetail>(`gebruikers/${id(target)}`),
    organisaties: (q?: Query) => lees<AdminPagina<AdminOrganisatie>>("organisaties", q),
    organisatie: (target: string) => lees<AdminOrganisatieDetail>(`organisaties/${id(target)}`),
    projecten: (q?: Query) => lees<AdminPagina<AdminProject>>("projecten", q),
    project: (target: string) => lees<AdminProject>(`projecten/${id(target)}`),
    audit: (q?: Query) => lees<AdminPagina<AdminAuditItem>>("audit", q),
    auditDetail: (target: string) => lees<AdminAuditDetail>(`audit/${id(target)}`),
    revisie: (target: string) => lees<AdminRevisie>(`revisies/${id(target)}`),
    exports: (target: string) => lees<ExportInfo[]>(`projecten/${id(target)}/exports`),
    bestandUrl: (target: string) => `/api/admin/bestanden/${id(target)}${adminQuery({ gebruiker: gebruikerId })}`,
    corrigeerGebruiker: (target: string, body: Correctie<{ naam: string }>) => wijzig<AdminGebruikerDetail>(`gebruikers/${id(target)}`, body),
    corrigeerOrganisatie: (target: string, body: Correctie<{ naam: string; installateur: Partij }>) => wijzig<AdminOrganisatieDetail>(`organisaties/${id(target)}`, body),
    vrijstelling: (target: string, body: Correctie<{ vrijgesteld: boolean; stripeBevestigd: boolean }>) => wijzig<AdminOrganisatieDetail>(`organisaties/${id(target)}/vrijstelling`, body),
    proef: (target: string, body: Correctie<{ einddatum: string; stripeBevestigd: boolean }>) => wijzig<AdminOrganisatieDetail>(`organisaties/${id(target)}/proefperiode`, body),
    notities: (q: Query) => lees<AdminPagina<AdminNotitie>>("notities", q),
    maakNotitie: (body: { organisatieId: string; projectId: string | null; tekst: string; opvolgdatum: string | null }) => wijzig<AdminNotitie>("notities", body, "POST"),
    wijzigNotitie: (target: string, body: Correctie<{ tekst: string; opvolgdatum: string | null; gearchiveerd: boolean }>) => wijzig<AdminNotitie>(`notities/${id(target)}`, body),
  };
}
export type AdminApi = ReturnType<typeof maakAdminApi>;
export function useAdminApi(): AdminApi {
  const gebruikerId = useSessieStore().gebruiker?.id;
  if (!gebruikerId) throw createError({ statusCode: 401 });
  return maakAdminApi($fetch as unknown as ProjectenFetch, gebruikerId);
}
