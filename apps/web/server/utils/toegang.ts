// Toegangscontrole voor de API-routes: sessie, lidmaatschap en rol. Elke route onder server/api
// (behalve auth/) gebruikt `defineBeveiligdeHandler`; test/routes-beveiligd.test.ts dwingt dat af.
//
// - Zonder sessie: 401.
// - Iets van een organisatie waarvan je geen lid bent (of dat niet bestaat): 404, zodat het
//   bestaan ervan niet lekt.
// - Een vereiste rol die ontbreekt: 403.
//
// Het lidmaatschap wordt bij elk verzoek opnieuw in de database gecontroleerd; de actieve
// organisatie in de sessie bepaalt alleen welke organisatie een lijst of de bedrijfsgegevens tonen.
//
// Nitro importeert de exports van server/utils automatisch.
// Expliciete imports, geen Nitro-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { and, asc, eq } from "drizzle-orm";
import {
  appendResponseHeader,
  createError,
  defineEventHandler,
  type EventHandler,
  type EventHandlerRequest,
  type H3Event,
} from "h3";
import { gebruikAuth } from "../auth";
import { gebruikDb } from "../db";
import { member, session } from "../db/schema";
import { projectOrganisatie } from "../projecten/repo";

/** De rollen zoals de API en de UI ze noemen; intern heten ze `owner` en `member`. */
export type Rol = "eigenaar" | "lid";

export type Gebruiker = { id: string; naam: string; email: string };

export type Sessie = { gebruiker: Gebruiker; actieveOrganisatieId: string | null };

export type Context = { gebruiker: Gebruiker; organisatieId: string; rol: Rol };

const SESSIE_SLEUTEL = "elentrikSessie";

function nietGevonden(): never {
  throw createError({ statusCode: 404, statusMessage: "Niet gevonden" });
}

/** `owner` (ook in een lijst als `owner,member`) is eigenaar; elke andere rol is lid. */
function naarRol(rol: string): Rol {
  return rol.split(",").some((r) => r.trim() === "owner") ? "eigenaar" : "lid";
}

/**
 * Het oudste lidmaatschap van een gebruiker wordt de actieve organisatie van een sessie die er
 * geen heeft (bijvoorbeeld een latere aanmelding). Zonder lidmaatschap blijft het null.
 */
async function kiesActieveOrganisatie(sessieId: string, gebruikerId: string): Promise<string | null> {
  const db = gebruikDb();
  const [eerste] = await db
    .select({ organisatieId: member.organizationId })
    .from(member)
    .where(eq(member.userId, gebruikerId))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);
  if (!eerste) return null;
  await db
    .update(session)
    .set({ activeOrganizationId: eerste.organisatieId })
    .where(and(eq(session.id, sessieId), eq(session.userId, gebruikerId)));
  return eerste.organisatieId;
}

/**
 * De ingelogde gebruiker en de actieve organisatie van zijn sessie, of 401. Eén opzoeking per
 * verzoek. Verlengt Better Auth de sessie, dan gaat de nieuwe cookie mee in het antwoord.
 */
export async function vereisSessie(event: H3Event): Promise<Sessie> {
  const bewaard = event.context[SESSIE_SLEUTEL] as Sessie | undefined;
  if (bewaard) return bewaard;

  const { headers, response } = await gebruikAuth().api.getSession({
    headers: event.headers,
    returnHeaders: true,
  });
  for (const cookie of headers?.getSetCookie() ?? []) appendResponseHeader(event, "set-cookie", cookie);
  if (!response) throw createError({ statusCode: 401, statusMessage: "Niet ingelogd" });

  const { user, session: huidig } = response;
  const actieveOrganisatieId =
    huidig.activeOrganizationId ?? (await kiesActieveOrganisatie(huidig.id, user.id));
  const sessie: Sessie = {
    gebruiker: { id: user.id, naam: user.name, email: user.email },
    actieveOrganisatieId,
  };
  event.context[SESSIE_SLEUTEL] = sessie;
  return sessie;
}

/**
 * De context van een lid van een organisatie: standaard de actieve organisatie van de sessie.
 * Controleert het lidmaatschap in de database bij elke aanroep. Geen lid (of geen organisatie):
 * 404. Een vereiste rol die ontbreekt: 403.
 */
export async function vereisLid(
  event: H3Event,
  opties: { organisatieId?: string; rol?: Rol } = {},
): Promise<Context> {
  const { gebruiker, actieveOrganisatieId } = await vereisSessie(event);
  const organisatieId = opties.organisatieId ?? actieveOrganisatieId;
  if (!organisatieId) nietGevonden();

  const [lidmaatschap] = await gebruikDb()
    .select({ rol: member.role })
    .from(member)
    .where(and(eq(member.userId, gebruiker.id), eq(member.organizationId, organisatieId)))
    .limit(1);
  if (!lidmaatschap) nietGevonden();

  const rol = naarRol(lidmaatschap.rol);
  if (opties.rol === "eigenaar" && rol !== "eigenaar") {
    throw createError({ statusCode: 403, statusMessage: "Alleen een eigenaar mag dit" });
  }
  return { gebruiker, organisatieId, rol };
}

/**
 * Toegang tot een project op id: zoekt de organisatie van het project op en controleert dan het
 * lidmaatschap (niet alleen de actieve organisatie, spec 5b.1). Een onbekend of verwijderd
 * project, een project zonder organisatie of geen lidmaatschap: 404.
 */
export async function vereisProjecttoegang(
  event: H3Event,
  projectId: string,
): Promise<Context & { project: { id: string; organisatieId: string } }> {
  await vereisSessie(event);
  const organisatieId = await projectOrganisatie(gebruikDb(), projectId);
  if (!organisatieId) nietGevonden();
  const context = await vereisLid(event, { organisatieId });
  return { ...context, project: { id: projectId, organisatieId } };
}

/**
 * De handler van elke API-route (behalve /api/auth): eist eerst een sessie (anders 401) en roept
 * dan de handler aan, die zelf `vereisLid` of `vereisProjecttoegang` gebruikt.
 */
export function defineBeveiligdeHandler<T>(
  handler: (event: H3Event) => T | Promise<T>,
): EventHandler<EventHandlerRequest, Promise<T>> {
  return defineEventHandler(async (event) => {
    await vereisSessie(event);
    return handler(event);
  });
}
