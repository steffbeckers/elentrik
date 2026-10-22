// Organisaties, leden en uitnodigingen voor de routes onder /api/mij, /api/organisaties en
// /api/uitnodigingen. Wijzigingen lopen via de organization-API van Better Auth (`auth.api.*`),
// zodat dezelfde hooks gelden als op /api/auth/organization; vooraf controleren deze functies
// lidmaatschap (404), rol (403) en de laatste eigenaar (409 LAATSTE_EIGENAAR), en vertalen ze
// de fouten van Better Auth naar de statussen van deze API.
//
// Registreren via een uitnodiging gebeurt hier zelf, in één transactie: het adres geldt als
// bevestigd (de link kwam via dat adres) en er komt geen eigen organisatie.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { randomUUID } from "node:crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import {
  appendResponseHeader,
  createError,
  getRequestIP,
  getRouterParam,
  setResponseHeader,
  setResponseStatus,
  type H3Error,
  type H3Event,
} from "h3";
import { z } from "zod";
import { gebruikAuth } from "../auth";
import { gebruikDb } from "../db";
import { account, invitation, member, organization, session, user } from "../db/schema";
import { leesBody } from "../utils/projecten";
import { kiesActieveOrganisatie, naarRol, type Rol, vereisLid, vereisSessie } from "../utils/toegang";
import { maakLimiet } from "./limiet";
import {
  geldigeNaam,
  haaltLaatsteEigenaarWeg,
  isEigenaarRol,
  LAATSTE_EIGENAAR,
  LAATSTE_EIGENAAR_BOODSCHAP,
  MAX_NAAMLENGTE,
} from "./regels";
import { uitnodigingVanToken, wisUitnodigingstokens } from "./uitnodigingstoken";

// --- Fouten ----------------------------------------------------------------------------------

/** Een h3-fout met de boodschap in `message` (die mag accenten bevatten) en eventueel een code. */
function fout(statusCode: number, message: string, code?: string): H3Error {
  return createError({ statusCode, message, ...(code ? { data: { code } } : {}) });
}

const nietGevonden = () => fout(404, "Niet gevonden");
const nietMeerGeldig = () => fout(410, "Deze uitnodiging is niet meer geldig");
const laatsteEigenaar = () => fout(409, LAATSTE_EIGENAAR_BOODSCHAP, LAATSTE_EIGENAAR);

/** Codes van Better Auth (en van onze eigen hooks) naar status, boodschap en eigen code. */
const AUTH_CODES: Record<string, [number, string, string?]> = {
  LAATSTE_EIGENAAR: [409, LAATSTE_EIGENAAR_BOODSCHAP, LAATSTE_EIGENAAR],
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER: [409, LAATSTE_EIGENAAR_BOODSCHAP, LAATSTE_EIGENAAR],
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER: [409, LAATSTE_EIGENAAR_BOODSCHAP, LAATSTE_EIGENAAR],
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: [409, "Dit adres is al lid", "AL_LID"],
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: [409, "Dit adres is al uitgenodigd", "AL_UITGENODIGD"],
  INVITATION_NOT_FOUND: [410, "Deze uitnodiging is niet meer geldig"],
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: [403, "Deze uitnodiging is voor een ander adres"],
  EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION: [403, "Bevestig eerst je e-mailadres"],
  MEMBER_NOT_FOUND: [404, "Niet gevonden"],
};

/** Komt deze fout (ergens in de keten van oorzaken) van de databasetrigger voor de laatste eigenaar? */
function isTriggerLaatsteEigenaar(f: unknown): boolean {
  for (let huidig: unknown = f; huidig && typeof huidig === "object"; huidig = (huidig as { cause?: unknown }).cause) {
    if ((huidig as { message?: unknown }).message === LAATSTE_EIGENAAR) return true;
  }
  return false;
}

/**
 * Een fout van `auth.api.*` als h3-fout; de boodschap van Better Auth gaat niet mee. De
 * databasetrigger voor de laatste eigenaar (migratie 0005) wordt 409 `LAATSTE_EIGENAAR`.
 * Geëxporteerd voor de test van die vertaling.
 */
export function vertaalAuthFout(fout_: unknown): unknown {
  if (isTriggerLaatsteEigenaar(fout_)) return laatsteEigenaar();
  if (!fout_ || typeof fout_ !== "object" || !("statusCode" in fout_) || !("body" in fout_)) return fout_;
  const status = (fout_ as { statusCode: unknown }).statusCode;
  const code = ((fout_ as { body?: { code?: unknown } }).body ?? {}).code;
  const bekend = typeof code === "string" ? AUTH_CODES[code] : undefined;
  if (bekend) return fout(bekend[0], bekend[1], bekend[2]);
  if (status === 401) return fout(401, "Niet ingelogd");
  if (status === 403) return fout(403, "Niet toegelaten");
  if (status === 400 || status === 422) return fout(400, "Ongeldige invoer");
  return fout_;
}

/** Een aanroep van `auth.api.*` met `returnHeaders`: nieuwe cookies gaan mee in het antwoord. */
async function viaAuth<T>(event: H3Event, aanroep: () => Promise<{ headers: Headers; response: T }>): Promise<T> {
  try {
    const { headers, response } = await aanroep();
    for (const cookie of headers.getSetCookie()) appendResponseHeader(event, "set-cookie", cookie);
    return response;
  } catch (f) {
    throw vertaalAuthFout(f);
  }
}

// --- Hulp ------------------------------------------------------------------------------------

function naarIntern(rol: Rol): "owner" | "member" {
  return rol === "eigenaar" ? "owner" : "member";
}

const RolSchema = z.enum(["eigenaar", "lid"]);

/** Een id uit het pad; leeg of absurd lang kan nooit bestaan: 404. */
function padId(event: H3Event): string {
  const id = getRouterParam(event, "id");
  if (!id || id.length > 200) throw nietGevonden();
  return id;
}

function isOpen(uitnodiging: { status: string; expiresAt: Date }): boolean {
  return uitnodiging.status === "pending" && uitnodiging.expiresAt.getTime() > Date.now();
}

export type Lid = { id: string; gebruikerId: string; naam: string; email: string; rol: Rol; sinds: string };

const lidKolommen = {
  id: member.id,
  gebruikerId: member.userId,
  naam: user.name,
  email: user.email,
  rol: member.role,
  sinds: member.createdAt,
};

function naarLid(rij: { id: string; gebruikerId: string; naam: string; email: string; rol: string; sinds: Date }): Lid {
  return { ...rij, rol: naarRol(rij.rol), sinds: rij.sinds.toISOString() };
}

/** Een lid van deze organisatie op zijn lidmaatschaps-id, of 404. */
async function vindLid(organisatieId: string, id: string): Promise<Lid> {
  const [rij] = await gebruikDb()
    .select(lidKolommen)
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.id, id), eq(member.organizationId, organisatieId)));
  if (!rij) throw nietGevonden();
  return naarLid(rij);
}

// --- De gebruiker en zijn organisaties -------------------------------------------------------

export type Mij = {
  gebruiker: { id: string; naam: string; email: string };
  organisaties: { id: string; naam: string; rol: Rol }[];
  actieveOrganisatieId: string | null;
};

/**
 * De ingelogde gebruiker, zijn organisaties en de actieve organisatie. Is de actieve organisatie
 * er niet meer een van de gebruiker (hij werd verwijderd), dan kiest de sessie opnieuw: het
 * oudste lidmaatschap, of geen.
 */
export async function mij(event: H3Event): Promise<Mij> {
  const sessie = await vereisSessie(event);
  const db = gebruikDb();
  const rijen = await db
    .select({ id: organization.id, naam: organization.name, rol: member.role })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, sessie.gebruiker.id))
    .orderBy(asc(organization.name), asc(organization.id));

  let actief = sessie.actieveOrganisatieId;
  if (actief !== null && !rijen.some((r) => r.id === actief)) {
    await db
      .update(session)
      .set({ activeOrganizationId: null })
      .where(and(eq(session.id, sessie.sessieId), eq(session.activeOrganizationId, actief)));
    actief = await kiesActieveOrganisatie(sessie.sessieId, sessie.gebruiker.id);
  }
  return {
    gebruiker: sessie.gebruiker,
    organisaties: rijen.map((r) => ({ id: r.id, naam: r.naam, rol: naarRol(r.rol) })),
    actieveOrganisatieId: actief,
  };
}

/** Maakt een organisatie waarvan de gebruiker lid is actief in zijn sessie; anders 404. */
export async function wisselActief(event: H3Event): Promise<{ actieveOrganisatieId: string }> {
  const { organisatieId } = await leesBody(event, z.object({ organisatieId: z.string().min(1).max(200) }));
  await vereisLid(event, { organisatieId });
  await viaAuth(event, () =>
    gebruikAuth().api.setActiveOrganization({
      body: { organizationId: organisatieId },
      headers: event.headers,
      returnHeaders: true,
    }),
  );
  return { actieveOrganisatieId: organisatieId };
}

/** Hernoemt de actieve organisatie: alleen een eigenaar, 1 tot 80 tekens na trimmen. */
export async function hernoem(event: H3Event): Promise<{ id: string; naam: string }> {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const { naam: invoer } = await leesBody(event, z.object({ naam: z.string() }));
  const naam = geldigeNaam(invoer);
  if (naam === null) throw fout(400, `De naam telt 1 tot ${MAX_NAAMLENGTE} tekens`);
  const bijgewerkt = await viaAuth(event, () =>
    gebruikAuth().api.updateOrganization({
      body: { organizationId: organisatieId, data: { name: naam } },
      headers: event.headers,
      returnHeaders: true,
    }),
  );
  return { id: organisatieId, naam: bijgewerkt?.name ?? naam };
}

// --- Leden -----------------------------------------------------------------------------------

/** De leden van de actieve organisatie met hun rol; elk lid mag de lijst zien. */
export async function lijstLeden(event: H3Event): Promise<Lid[]> {
  const { organisatieId } = await vereisLid(event);
  const rijen = await gebruikDb()
    .select(lidKolommen)
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organisatieId))
    .orderBy(asc(member.createdAt), asc(member.id));
  return rijen.map(naarLid);
}

/** Wijzigt de rol van een lid: alleen een eigenaar; de laatste eigenaar blijft eigenaar. */
export async function wijzigRol(event: H3Event): Promise<Lid> {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const id = padId(event);
  const { rol } = await leesBody(event, z.object({ rol: RolSchema }));
  const lid = await vindLid(organisatieId, id);
  const nieuweRol = naarIntern(rol);
  if (await haaltLaatsteEigenaarWeg(gebruikDb(), organisatieId, { rol: naarIntern(lid.rol) }, nieuweRol)) {
    throw laatsteEigenaar();
  }
  await viaAuth(event, () =>
    gebruikAuth().api.updateMemberRole({
      body: { memberId: id, role: nieuweRol, organizationId: organisatieId },
      headers: event.headers,
      returnHeaders: true,
    }),
  );
  return vindLid(organisatieId, id);
}

/** Verwijdert een lid: alleen een eigenaar; de laatste eigenaar kan niet weg. */
export async function verwijderLid(event: H3Event): Promise<null> {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const lid = await vindLid(organisatieId, padId(event));
  if (await haaltLaatsteEigenaarWeg(gebruikDb(), organisatieId, { rol: naarIntern(lid.rol) }, null)) {
    throw laatsteEigenaar();
  }
  await viaAuth(event, () =>
    gebruikAuth().api.removeMember({
      body: { memberIdOrEmail: lid.id, organizationId: organisatieId },
      headers: event.headers,
      returnHeaders: true,
    }),
  );
  setResponseStatus(event, 204);
  return null;
}

/** Verlaat de actieve organisatie zelf; de laatste eigenaar kan niet weg. */
export async function verlaat(event: H3Event): Promise<null> {
  const { organisatieId, rol } = await vereisLid(event);
  if (await haaltLaatsteEigenaarWeg(gebruikDb(), organisatieId, { rol: naarIntern(rol) }, null)) {
    throw laatsteEigenaar();
  }
  await viaAuth(event, () =>
    gebruikAuth().api.leaveOrganization({
      body: { organizationId: organisatieId },
      headers: event.headers,
      returnHeaders: true,
    }),
  );
  setResponseStatus(event, 204);
  return null;
}

// --- Uitnodigingen beheren -------------------------------------------------------------------

export type Uitnodiging = { id: string; email: string; rol: Rol; verlooptOp: string };

/** De openstaande uitnodigingen van de actieve organisatie: alleen een eigenaar. */
export async function lijstUitnodigingen(event: H3Event): Promise<Uitnodiging[]> {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const rijen = await gebruikDb()
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, organisatieId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(invitation.createdAt), asc(invitation.id));
  return rijen.map((r) => ({
    id: r.id,
    email: r.email,
    rol: naarRol(r.role ?? "member"),
    verlooptOp: r.expiresAt.toISOString(),
  }));
}

/** Nodigt een adres uit als eigenaar of lid: alleen een eigenaar. Better Auth stuurt de mail. */
export async function nodigUit(event: H3Event): Promise<Uitnodiging> {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const { email, rol } = await leesBody(event, z.object({ email: z.email().max(254), rol: RolSchema }));
  const nieuw = await viaAuth(event, () =>
    gebruikAuth().api.createInvitation({
      body: { email, role: naarIntern(rol), organizationId: organisatieId },
      headers: event.headers,
      returnHeaders: true,
    }),
  );
  setResponseStatus(event, 201);
  return {
    id: nieuw.id,
    email: nieuw.email,
    rol: naarRol(nieuw.role ?? "member"),
    verlooptOp: new Date(nieuw.expiresAt).toISOString(),
  };
}

/** Trekt een openstaande uitnodiging in: alleen een eigenaar. Niet meer open: 410. */
export async function trekIn(event: H3Event): Promise<null> {
  const { organisatieId } = await vereisLid(event, { rol: "eigenaar" });
  const id = padId(event);
  const [rij] = await gebruikDb()
    .select({ status: invitation.status })
    .from(invitation)
    .where(and(eq(invitation.id, id), eq(invitation.organizationId, organisatieId)));
  if (!rij) throw nietGevonden();
  if (rij.status !== "pending") throw nietMeerGeldig();
  await viaAuth(event, () =>
    gebruikAuth().api.cancelInvitation({ body: { invitationId: id }, headers: event.headers, returnHeaders: true }),
  );
  setResponseStatus(event, 204);
  return null;
}

// --- Een uitnodiging bekijken en aanvaarden --------------------------------------------------

export type UitnodigingInfo = Uitnodiging & { organisatie: { naam: string } };

/**
 * De open uitnodiging bij de token uit het pad. Een onbekende, misvormde, verlopen, gebruikte of
 * ingetrokken token geeft altijd hetzelfde: 410.
 */
async function openUitnodiging(event: H3Event) {
  const token = getRouterParam(event, "token") ?? "";
  const id = await uitnodigingVanToken(gebruikDb(), token);
  if (!id) throw nietMeerGeldig();
  const [rij] = await gebruikDb()
    .select({
      id: invitation.id,
      email: invitation.email,
      rol: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organisatieId: invitation.organizationId,
      organisatie: organization.name,
    })
    .from(invitation)
    .innerJoin(organization, eq(organization.id, invitation.organizationId))
    .where(eq(invitation.id, id));
  if (!rij || !isOpen(rij)) throw nietMeerGeldig();
  return rij;
}

/**
 * Een uitnodiging op de geheime token uit de mail, zonder sessie (de pagina /uitnodiging/:token):
 * adres, rol en de naam van de organisatie. Niet (meer) geldig: 410.
 */
export async function toonUitnodiging(event: H3Event): Promise<UitnodigingInfo> {
  const rij = await openUitnodiging(event);
  return {
    id: rij.id,
    email: rij.email,
    rol: naarRol(rij.rol ?? "member"),
    organisatie: { naam: rij.organisatie },
    verlooptOp: rij.expiresAt.toISOString(),
  };
}

/**
 * Aanvaardt de uitnodiging achter de token voor de ingelogde gebruiker: alleen als ze nog geldig
 * is (anders 410) en met hetzelfde, bevestigde adres (anders 403). De organisatie wordt actief.
 */
export async function aanvaard(event: H3Event): Promise<{ organisatieId: string }> {
  const { gebruiker } = await vereisSessie(event);
  const rij = await openUitnodiging(event);
  if (rij.email.toLowerCase() !== gebruiker.email.toLowerCase()) {
    throw fout(403, "Deze uitnodiging is voor een ander adres");
  }
  const db = gebruikDb();
  const [account_] = await db.select({ bevestigd: user.emailVerified }).from(user).where(eq(user.id, gebruiker.id));
  if (!account_?.bevestigd) throw fout(403, "Bevestig eerst je e-mailadres");
  await viaAuth(event, () =>
    gebruikAuth().api.acceptInvitation({ body: { invitationId: rij.id }, headers: event.headers, returnHeaders: true }),
  );
  await wisUitnodigingstokens(db, rij.id);
  return { organisatieId: rij.organisatieId };
}

// --- Registreren via een uitnodiging ---------------------------------------------------------

/** Buiten de limiter van Better Auth: hoogstens 5 pogingen per minuut per IP. */
export const registratieLimiet = maakLimiet({ max: 5, vensterMs: 60_000 });

const RegistratieSchema = z.object({
  naam: z.string().trim().min(1).max(100),
  // Zoals Better Auth: minstens 10 tekens, hoogstens 128.
  wachtwoord: z.string().min(10).max(128),
});

function isUniekeSleutelFout(f: unknown): boolean {
  for (let huidig: unknown = f; huidig && typeof huidig === "object"; huidig = (huidig as { cause?: unknown }).cause) {
    if ((huidig as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

/**
 * Registreert een nieuw account via een uitnodiging, zonder sessie: met het adres van de
 * uitnodiging, dat meteen als bevestigd geldt. Het account wordt lid met de rol van de
 * uitnodiging, die daarmee aanvaard is; er komt geen eigen organisatie. Daarna volgt een sessie
 * met die organisatie actief.
 *
 * De token uit de mail bewijst het adres; het id van de uitnodiging volstaat niet. Een
 * onbekende, verlopen, gebruikte of ingetrokken token: 410. Een account met dat adres bestaat al: 409
 * `ACCOUNT_BESTAAT` (de pagina biedt dan inloggen aan). Meer dan 5 pogingen per minuut: 429.
 */
export async function registreerViaUitnodiging(event: H3Event): Promise<{ organisatieId: string }> {
  const ip = getRequestIP(event) ?? "onbekend";
  const poging = registratieLimiet.probeer(ip);
  if (!poging.toegelaten) {
    setResponseHeader(event, "retry-after", poging.wachtSeconden);
    throw fout(429, "Te veel pogingen; probeer het straks opnieuw");
  }
  const { naam, wachtwoord } = await leesBody(event, RegistratieSchema);
  const db = gebruikDb();
  const id = await uitnodigingVanToken(db, getRouterParam(event, "token") ?? "");
  if (!id) throw nietMeerGeldig();

  const auth = gebruikAuth();
  const hash = await (await auth.$context).password.hash(wachtwoord);
  let gegevens: { email: string; organisatieId: string };
  try {
    gegevens = await db.transaction(async (tx) => {
      // De uitnodiging vergrendelen: twee gelijktijdige registraties gebruiken ze samen één keer.
      const [rij] = await tx.select().from(invitation).where(eq(invitation.id, id)).for("update");
      if (!rij || !isOpen(rij)) throw nietMeerGeldig();
      const email = rij.email.toLowerCase();
      const [bestaand] = await tx.select({ id: user.id }).from(user).where(eq(user.email, email));
      if (bestaand) throw fout(409, "Er bestaat al een account met dit adres", "ACCOUNT_BESTAAT");

      const gebruikerId = randomUUID();
      const nu = new Date();
      await tx.insert(user).values({
        id: gebruikerId,
        name: naam,
        email,
        emailVerified: true,
        createdAt: nu,
        updatedAt: nu,
      });
      await tx.insert(account).values({
        id: randomUUID(),
        accountId: gebruikerId,
        providerId: "credential",
        userId: gebruikerId,
        password: hash,
        createdAt: nu,
        updatedAt: nu,
      });
      await tx.insert(member).values({
        id: randomUUID(),
        organizationId: rij.organizationId,
        userId: gebruikerId,
        role: isEigenaarRol(rij.role) ? "owner" : "member",
        createdAt: nu,
      });
      await tx.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, id));
      return { email, organisatieId: rij.organizationId };
    });
  } catch (f) {
    if (isUniekeSleutelFout(f)) throw fout(409, "Er bestaat al een account met dit adres", "ACCOUNT_BESTAAT");
    throw f;
  }
  await wisUitnodigingstokens(db, id);

  // Inloggen met het nieuwe wachtwoord geeft de sessie en haar cookie; de organisatie van de
  // uitnodiging wordt er de actieve organisatie.
  const headers = new Headers({ "user-agent": event.headers.get("user-agent") ?? "" });
  if (ip !== "onbekend") headers.set("x-forwarded-for", ip);
  const sessie = await viaAuth(event, () =>
    auth.api.signInEmail({ body: { email: gegevens.email, password: wachtwoord }, headers, returnHeaders: true }),
  );
  await db
    .update(session)
    .set({ activeOrganizationId: gegevens.organisatieId })
    .where(eq(session.token, sessie.token));
  setResponseStatus(event, 201);
  return { organisatieId: gegevens.organisatieId };
}
