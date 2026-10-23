// Toegangscontrole voor de API-routes: sessie, lidmaatschap en rol. Elke route onder server/api
// (behalve auth/) gebruikt `defineBeveiligdeHandler`; test/routes-beveiligd.test.ts dwingt dat af.
// Een publieke route (zonder sessie) zegt dat expliciet met `{ publiek: true }`, en staat met naam
// in de lijst PUBLIEKE_ROUTES van test/routes.ts.
//
// - Zonder sessie: 401.
// - Iets van een organisatie waarvan je geen lid bent (of dat niet bestaat): 404, zodat het
//   bestaan ervan niet lekt.
// - Een vereiste rol die ontbreekt: 403.
//
// Het lidmaatschap wordt bij elk verzoek opnieuw in de database gecontroleerd; de actieve
// organisatie in de sessie bepaalt alleen welke organisatie een lijst of de bedrijfsgegevens tonen.
//
// Een schrijfactie op de actieve organisatie mag meegeven welke organisatie de pagina bedoelt
// (header `x-elentrik-organisatie`); is de sessie intussen van een andere organisatie (een ander
// tabblad wisselde), dan volgt 409 `ANDERE_ORGANISATIE`. Een wijzigend verzoek dat een andere site
// stuurt (CSRF), weigert `defineBeveiligdeHandler` met 403.
//
// Nitro importeert de exports van server/utils automatisch.
// Expliciete imports, geen Nitro-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import {
  appendResponseHeader,
  createError,
  getRequestHeader,
  defineEventHandler,
  type EventHandler,
  type EventHandlerRequest,
  type H3Event,
} from "h3";
import { ANDERE_GEBRUIKER, VERWACHTE_GEBRUIKER_HEADER } from "../../shared/gebruiker";
import { ACTIEVE_ORGANISATIE_HEADER, ANDERE_ORGANISATIE } from "../../shared/organisatie";
import { gebruikAuth } from "../auth";
import { vertrouwdeOorsprongen } from "../auth/oorsprong";
import { gebruikDb } from "../db";
import { member, session } from "../db/schema";
import { isEigenaarRol } from "../organisaties/regels";
import { projectOrganisatie } from "../projecten/repo";

/** De rollen zoals de API en de UI ze noemen; intern heten ze `owner` en `member`. */
export type Rol = "eigenaar" | "lid";

export type Gebruiker = { id: string; naam: string; email: string };

export type Sessie = { gebruiker: Gebruiker; sessieId: string; actieveOrganisatieId: string | null };

export type Context = { gebruiker: Gebruiker; organisatieId: string; rol: Rol };

const SESSIE_SLEUTEL = "elentrikSessie";

function nietGevonden(): never {
  throw createError({ statusCode: 404, statusMessage: "Niet gevonden" });
}

/** `owner` (ook in een lijst als `owner,member`) is eigenaar; elke andere rol is lid. */
export function naarRol(rol: string): Rol {
  return isEigenaarRol(rol) ? "eigenaar" : "lid";
}

/**
 * De organisatie die een sessie zonder actieve organisatie krijgt (bijvoorbeeld een latere
 * aanmelding): de laatst gekozen organisatie (spec 2.4), dat is de actieve organisatie van de
 * laatst bijgewerkte andere sessie van de gebruiker waarvan hij nog lid is; anders zijn oudste
 * lidmaatschap. Zonder lidmaatschap: null.
 */
async function voorkeur(sessieId: string, gebruikerId: string): Promise<string | null> {
  const db = gebruikDb();
  const [laatst] = await db
    .select({ organisatieId: member.organizationId })
    .from(session)
    .innerJoin(
      member,
      and(eq(member.userId, session.userId), eq(member.organizationId, session.activeOrganizationId)),
    )
    .where(and(eq(session.userId, gebruikerId), ne(session.id, sessieId)))
    .orderBy(desc(session.updatedAt), desc(session.createdAt))
    .limit(1);
  if (laatst) return laatst.organisatieId;
  const [eerste] = await db
    .select({ organisatieId: member.organizationId })
    .from(member)
    .where(eq(member.userId, gebruikerId))
    .orderBy(asc(member.createdAt), asc(member.id))
    .limit(1);
  return eerste?.organisatieId ?? null;
}

/**
 * Geeft een sessie zonder actieve organisatie er een: de laatst gekozen, anders het oudste
 * lidmaatschap (`voorkeur`). Zonder lidmaatschap blijft het null.
 *
 * Alleen een sessie die nog altijd geen actieve organisatie heeft, wordt bijgewerkt: kiest de
 * gebruiker intussen zelf een organisatie (of zet de eerste aanmelding er een), dan wint die
 * keuze. Daarna wordt de sessie opnieuw gelezen, zodat het antwoord de waarde in de database is.
 * Geëxporteerd voor de test van die race.
 */
export async function kiesActieveOrganisatie(sessieId: string, gebruikerId: string): Promise<string | null> {
  const db = gebruikDb();
  const gekozen = await voorkeur(sessieId, gebruikerId);
  const deSessie = and(eq(session.id, sessieId), eq(session.userId, gebruikerId));
  if (gekozen) {
    await db
      .update(session)
      .set({ activeOrganizationId: gekozen })
      .where(and(deSessie, isNull(session.activeOrganizationId)));
  }
  const [huidig] = await db.select({ actief: session.activeOrganizationId }).from(session).where(deSessie);
  return huidig?.actief ?? null;
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
    sessieId: huidig.id,
    actieveOrganisatieId,
  };
  event.context[SESSIE_SLEUTEL] = sessie;
  return sessie;
}

/**
 * Bewaart de client namens een bepaalde gebruiker (header `x-elentrik-gebruiker`), dan moet de
 * sessie van die gebruiker zijn; anders 401 met code `ANDERE_GEBRUIKER` en verandert er niets.
 * Zonder header geldt gewoon de sessie. Komt vóór elke toegangscontrole, zodat het antwoord niets
 * zegt over het gevraagde.
 */
export async function vereisVerwachteGebruiker(event: H3Event): Promise<Sessie> {
  const sessie = await vereisSessie(event);
  const verwacht = getRequestHeader(event, VERWACHTE_GEBRUIKER_HEADER);
  if (verwacht !== undefined && verwacht !== sessie.gebruiker.id) {
    throw createError({
      statusCode: 401,
      statusMessage: "Ingelogd als een andere gebruiker",
      data: { code: ANDERE_GEBRUIKER },
    });
  }
  return sessie;
}

/**
 * Bedoelt de client met header `x-elentrik-organisatie` een andere organisatie dan de actieve van
 * de sessie (een oud tabblad, terwijl een ander tabblad wisselde), dan 409 met code
 * `ANDERE_ORGANISATIE`, vóór er iets gelezen of gewijzigd wordt. Zonder header, of zonder actieve
 * organisatie (dan volgt 404), gebeurt hier niets.
 */
function eisVerwachteOrganisatie(event: H3Event, actieveOrganisatieId: string | null): void {
  const verwacht = getRequestHeader(event, ACTIEVE_ORGANISATIE_HEADER);
  if (verwacht === undefined || actieveOrganisatieId === null || verwacht === actieveOrganisatieId) return;
  throw createError({
    statusCode: 409,
    statusMessage: "De actieve organisatie is intussen een andere",
    data: { code: ANDERE_ORGANISATIE },
  });
}

/**
 * De context van een lid van een organisatie: standaard de actieve organisatie van de sessie.
 * Controleert het lidmaatschap in de database bij elke aanroep. Geen lid (of geen organisatie):
 * 404. Een vereiste rol die ontbreekt: 403. Op de actieve organisatie geldt ook de header
 * `x-elentrik-organisatie` (409 `ANDERE_ORGANISATIE`); met een expliciete `organisatieId` (een
 * project op id, wisselen) niet.
 */
export async function vereisLid(
  event: H3Event,
  opties: { organisatieId?: string; rol?: Rol } = {},
): Promise<Context> {
  const { gebruiker, actieveOrganisatieId } = await vereisSessie(event);
  if (opties.organisatieId === undefined) eisVerwachteOrganisatie(event, actieveOrganisatieId);
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

export type HandlerOpties = {
  /**
   * Een publieke route, zonder sessie (bijvoorbeeld registreren via een uitnodiging). Alleen
   * expliciet, en de route staat dan met naam in PUBLIEKE_ROUTES van test/routes.ts.
   */
  publiek?: true;
};

const WIJZIGENDE_METHODES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF: een wijzigend verzoek (POST, PUT, PATCH, DELETE) dat een andere site stuurt, krijgt 403.
 * - Met `Sec-Fetch-Site` (elke huidige browser) beslist die: alleen `cross-site` wordt geweigerd.
 * - Zonder `Sec-Fetch-Site` maar met een `Origin`: die moet de oorsprong van de basis-URL zijn
 *   (of haar localhost-variant), anders 403.
 * - Zonder beide (server-side aanroepen, tests, oude clients): toegelaten.
 */
export function eisEigenSite(event: H3Event): void {
  if (!WIJZIGENDE_METHODES.has(event.method)) return;
  const site = getRequestHeader(event, "sec-fetch-site");
  const oorsprong = getRequestHeader(event, "origin");
  const vreemd =
    site !== undefined
      ? site === "cross-site"
      : oorsprong !== undefined && !vertrouwdeOorsprongen().includes(oorsprong);
  if (vreemd) throw createError({ statusCode: 403, statusMessage: "Verzoek van een andere site" });
}

/**
 * De handler van elke API-route (behalve /api/auth): weigert eerst een wijzigend verzoek van een
 * andere site (403, `eisEigenSite`), eist dan een sessie (anders 401) en roept de handler aan, die
 * zelf `vereisLid` of `vereisProjecttoegang` gebruikt. Met `{ publiek: true }` vervalt de
 * sessie-eis; de handler doet dan zelf alle andere controles.
 */
export function defineBeveiligdeHandler<T>(
  handler: (event: H3Event) => T | Promise<T>,
  opties: HandlerOpties = {},
): EventHandler<EventHandlerRequest, Promise<T>> {
  return defineEventHandler(async (event) => {
    eisEigenSite(event);
    if (opties.publiek !== true) await vereisSessie(event);
    return handler(event);
  });
}
