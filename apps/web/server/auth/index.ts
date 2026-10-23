// Better Auth: e-mail en wachtwoord (met verplichte bevestiging), magic link, wachtwoordherstel en
// organisaties, op de bestaande Drizzle-database. Mails gaan via de verzender uit server/mail en
// vertrekken op de achtergrond: een trage of falende SMTP-server blokkeert geen aanmelding, en de
// antwoordtijd verraadt niet of een adres bekend is.
//
// Tokens: magic-link- en hersteltokens staan alleen gehasht in `verification`; de bevestigingslink
// is een ondertekende JWT die niet in de database staat. Sessietokens staan wel leesbaar in
// `session.token`: Better Auth 1.7.7 heeft daar geen optie voor. Aanvaarde beperking (ruling R4),
// beperkt door HttpOnly-cookies en een database die alleen lokaal bereikbaar is.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { magicLink, organization } from "better-auth/plugins";
import { memberAc, ownerAc } from "better-auth/plugins/organization/access";
import { and, eq } from "drizzle-orm";
import { kenProefperiodeToe } from "../abonnementen/proef";
import { type Db, gebruikDb } from "../db";
import * as schema from "../db/schema";
import { leesGebruikerstaal } from "../gebruikers/taal";
import { bevestigMail, herstelMail, magicLinkMail, rolNaamInMail, uitnodigingMail } from "../mail/sjablonen";
import { gebruikVerzender, type Mail } from "../mail/verzend";
import { richtEersteOrganisatieIn } from "../organisaties/registratie";
import { maakUitnodigingstoken } from "../organisaties/uitnodigingstoken";
import {
  geldigeNaam,
  haaltLaatsteEigenaarWeg,
  isEigenaarRol,
  LAATSTE_EIGENAAR,
  LAATSTE_EIGENAAR_BOODSCHAP,
  MAX_NAAMLENGTE,
} from "../organisaties/regels";
import { isTaal, TAAL_HEADER, type Taal } from "../../shared/taal";
import { basisUrl, vertrouwdeOorsprongen } from "./oorsprong";

const PLAATSHOUDER = "<vervang";
export const MINIMALE_GEHEIMLENGTE = 32;

/**
 * Het geheim voor sessies en tokens, uit BETTER_AUTH_SECRET: minstens 32 tekens en niet de
 * plaatshouder uit .env.example. Anders volgt een fout; de Nitro-plugin `auth-geheim` roept dit
 * bij het starten van de server aan, zodat de server dan niet start.
 */
export function leesGeheim(env: Record<string, string | undefined> = process.env): string {
  const geheim = env.BETTER_AUTH_SECRET?.trim();
  if (geheim && !geheim.startsWith(PLAATSHOUDER) && geheim.length >= MINIMALE_GEHEIMLENGTE) {
    return geheim;
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      `BETTER_AUTH_SECRET ontbreekt of is te kort; in productie is een eigen geheim van minstens ${MINIMALE_GEHEIMLENGTE} tekens verplicht.`,
    );
  }
  throw new Error(
    `BETTER_AUTH_SECRET ontbreekt, is nog de plaatshouder of is korter dan ${MINIMALE_GEHEIMLENGTE} tekens; zet een lange willekeurige waarde in apps/web/.env (zie apps/web/.env.example).`,
  );
}

/** De interne rollen; in mails krijgen ze een naam per taal (`rolNaamInMail`). */
const ROLLEN = new Set(["owner", "member"]);

function eisGeldigeRol(rol: string): void {
  const rollen = rol.split(",").map((r) => r.trim());
  if (rollen.some((r) => !ROLLEN.has(r))) {
    throw new APIError("BAD_REQUEST", { message: "Onbekende rol; alleen eigenaar en lid bestaan." });
  }
}

/**
 * De taal voor een mail: `taal` van de gebruiker zoals Better Auth ze geeft, anders uit de
 * database, anders nl. Een mislukte opzoeking breekt de mail niet af.
 */
async function mailtaal(db: Db, gebruiker: { id: string; taal?: unknown }): Promise<Taal> {
  if (isTaal(gebruiker.taal)) return gebruiker.taal;
  return leesGebruikerstaal(db, gebruiker.id).catch(() => "nl" as const);
}

export type MailSoort = "bevestiging" | "magic-link" | "herstel" | "uitnodiging";

/** Naam of code van een fout, zonder de boodschap (die kan het adres bevatten). */
function foutSoort(fout: unknown): string {
  if (fout && typeof fout === "object") {
    const code = (fout as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(code)) return code;
    if (fout instanceof Error) return fout.name;
  }
  return "onbekend";
}

/**
 * Verstuurt op de achtergrond. Een fout wordt gelogd met alleen de soort mail en de naam of code
 * van de fout: nooit het adres, het onderwerp, de link, een token of de foutboodschap.
 */
function verstuur(soort: MailSoort, mail: Mail, aan: string): void {
  void gebruikVerzender()
    .verstuur({ ...mail, aan })
    .catch((fout: unknown) => {
      console.error(`Mail (${soort}) versturen mislukt: ${foutSoort(fout)}`);
    });
}

/**
 * De eigen velden van de gebruiker die een client niet vrij mag zetten:
 * - `wachtendeBedrijfsnaam` alleen bij de registratie, niet via /update-user. Bij de registratie
 *   wordt ze de naam van de organisatie, dus geldt dezelfde regel: 1 tot 80 tekens na trimmen,
 *   anders 400 (en geen account).
 * - `laatsteOrganisatieId` nooit: de server zet het bij het wisselen (`input: false` weigert het
 *   al bij de registratie; dit weigert het ook uitdrukkelijk via /update-user).
 * - `proefGebruikt` nooit, om dezelfde reden: de server zet het bij het aanmaken van het eerste
 *   eigen bedrijf.
 * - `taal` nooit: de registratie neemt ze uit de header `x-elentrik-taal` (zie `databaseHooks`),
 *   het wijzigen gaat via PUT /api/mij/taal.
 */
function alleenBijRegistratie(path: string, body: unknown): void {
  if (!body || typeof body !== "object") return;
  if ((path === "/update-user" || path === "/sign-up/email") && "laatsteOrganisatieId" in body) {
    throw new APIError("BAD_REQUEST", { message: "laatsteOrganisatieId kan niet gezet worden." });
  }
  if ((path === "/update-user" || path === "/sign-up/email") && "proefGebruikt" in body) {
    throw new APIError("BAD_REQUEST", { message: "proefGebruikt kan niet gezet worden." });
  }
  if ((path === "/update-user" || path === "/sign-up/email") && "taal" in body) {
    throw new APIError("BAD_REQUEST", { message: "taal kan niet gezet worden." });
  }
  if (!("wachtendeBedrijfsnaam" in body)) return;
  if (path === "/update-user") {
    throw new APIError("BAD_REQUEST", {
      message: "wachtendeBedrijfsnaam kan alleen bij de registratie gezet worden.",
    });
  }
  const naam = (body as { wachtendeBedrijfsnaam?: unknown }).wachtendeBedrijfsnaam;
  if (path === "/sign-up/email" && naam !== undefined && naam !== null) eisGeldigeNaam(naam);
}

function laatsteEigenaar(): APIError {
  return new APIError("CONFLICT", { code: LAATSTE_EIGENAAR, message: LAATSTE_EIGENAAR_BOODSCHAP });
}

function eisGeldigeNaam(naam: unknown): string {
  const geldig = geldigeNaam(naam);
  if (geldig === null) {
    throw new APIError("BAD_REQUEST", { message: `De naam telt 1 tot ${MAX_NAAMLENGTE} tekens.` });
  }
  return geldig;
}

type Body = Record<string, unknown>;

/** Endpoints van Better Auth die alleen een eigenaar van de organisatie mag gebruiken (ruling R5). */
const ALLEEN_EIGENAAR = new Set([
  "/organization/update",
  "/organization/invite-member",
  "/organization/cancel-invitation",
  "/organization/remove-member",
  "/organization/update-member-role",
  // Uitnodigingen (met hun adressen) zijn beheer: een lid ziet ze niet, ook niet in het geheel.
  "/organization/list-invitations",
  "/organization/get-full-organization",
]);

/** Endpoints die de laatste eigenaar kunnen weghalen. */
const RAAKT_EIGENAAR = new Set([
  "/organization/leave",
  "/organization/remove-member",
  "/organization/update-member-role",
]);

type AuthCtx = Parameters<typeof getSessionFromCtx>[0] & { path: string; body?: unknown; query?: unknown };

function tekst(waarde: unknown): string | undefined {
  return typeof waarde === "string" && waarde !== "" ? waarde : undefined;
}

/**
 * Alle organisaties die een organization-endpoint kan bedoelen: uit body, query, slug, de
 * uitnodiging en de actieve organisatie van de sessie. Better Auth kiest per endpoint een andere
 * voorrang; daarom controleert de eigenaarsregel ze allemaal, zodat een mengeling (bv. het id van
 * de ene en de slug van een andere organisatie) niets omzeilt.
 */
async function mogelijkeOrganisaties(db: Db, ctx: AuthCtx, body: Body, actief: string | null): Promise<string[]> {
  const query = (ctx.query && typeof ctx.query === "object" ? ctx.query : {}) as Body;
  const ids = new Set<string>();
  for (const id of [tekst(body.organizationId), tekst(query.organizationId), actief]) if (id) ids.add(id);
  const slug = tekst(query.organizationSlug) ?? tekst(body.organizationSlug);
  if (slug) {
    const [rij] = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.slug, slug));
    if (rij) ids.add(rij.id);
  }
  const invitationId = tekst(body.invitationId) ?? tekst(query.invitationId);
  if (invitationId) {
    const [rij] = await db
      .select({ org: schema.invitation.organizationId })
      .from(schema.invitation)
      .where(eq(schema.invitation.id, invitationId));
    if (rij) ids.add(rij.org);
  }
  return [...ids];
}

/**
 * De regels voor organisaties op de endpoints van Better Auth zelf (ruling R5), vóór Better Auth
 * het verzoek behandelt. Van buitenaf zijn die endpoints dicht (ruling R7, de auth-route); dit is
 * de verdediging in de diepte voor de server-side aanroepen (`auth.api.*`):
 * - beheer (leden, rollen, uitnodigingen, hernoemen, en het geheel met de uitnodigingen) alleen
 *   door een eigenaar: een lid krijgt 403 `ALLEEN_EIGENAAR`;
 * - de laatste eigenaar kan niet vertrekken, verwijderd of gedegradeerd worden: 409
 *   `LAATSTE_EIGENAAR` (Better Auth weigert dat zelf ook, maar met 400 en een eigen code).
 * Zonder sessie, zonder lidmaatschap of met een onbekend doel doet dit niets: dan weigert Better
 * Auth zelf. De databasetrigger (migratie 0005) houdt de laatste eigenaar ook bij gelijktijdige
 * verzoeken vast.
 */
async function bewaakOrganisatie(db: Db, ctx: AuthCtx): Promise<void> {
  if (!ALLEEN_EIGENAAR.has(ctx.path) && !RAAKT_EIGENAAR.has(ctx.path)) return;
  const body = (ctx.body && typeof ctx.body === "object" ? ctx.body : {}) as Body;
  const sessie = await getSessionFromCtx(ctx).catch(() => null);
  if (!sessie) return;
  const actief = (sessie.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;

  if (ALLEEN_EIGENAAR.has(ctx.path)) {
    for (const organisatieId of await mogelijkeOrganisaties(db, ctx, body, actief)) {
      const [zelf] = await db
        .select({ rol: schema.member.role })
        .from(schema.member)
        .where(and(eq(schema.member.userId, sessie.user.id), eq(schema.member.organizationId, organisatieId)));
      if (zelf && !isEigenaarRol(zelf.rol)) {
        throw new APIError("FORBIDDEN", { code: "ALLEEN_EIGENAAR", message: "Alleen een eigenaar mag dit." });
      }
    }
  }
  if (!RAAKT_EIGENAAR.has(ctx.path)) return;
  // Verlaten, verwijderen en een rol wijzigen werken op organizationId uit de body of de actieve.
  const organisatieId = tekst(body.organizationId) ?? actief;
  if (!organisatieId) return;

  let doel: { rol: string } | undefined;
  let nieuweRol: string | null = null;
  if (ctx.path === "/organization/leave") {
    [doel] = await db
      .select({ rol: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.userId, sessie.user.id), eq(schema.member.organizationId, organisatieId)));
  } else if (ctx.path === "/organization/remove-member") {
    const sleutel = tekst(body.memberIdOrEmail) ?? "";
    [doel] = sleutel.includes("@")
      ? await db
          .select({ rol: schema.member.role })
          .from(schema.member)
          .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
          .where(and(eq(schema.user.email, sleutel.toLowerCase()), eq(schema.member.organizationId, organisatieId)))
      : await db
          .select({ rol: schema.member.role })
          .from(schema.member)
          .where(and(eq(schema.member.id, sleutel), eq(schema.member.organizationId, organisatieId)));
  } else {
    [doel] = await db
      .select({ rol: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.id, tekst(body.memberId) ?? ""), eq(schema.member.organizationId, organisatieId)));
    nieuweRol = Array.isArray(body.role) ? body.role.join(",") : typeof body.role === "string" ? body.role : "";
  }
  if (doel && (await haaltLaatsteEigenaarWeg(db, organisatieId, doel, nieuweRol))) throw laatsteEigenaar();
}

export function maakAuth(db: Db = gebruikDb()) {
  return betterAuth({
    appName: "Elentrik",
    baseURL: basisUrl(),
    // Lokaal is http://localhost:<poort> dezelfde server als http://127.0.0.1:<poort>.
    trustedOrigins: vertrouwdeOorsprongen(),
    secret: leesGeheim(),
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),
    // Hersteltokens (en elke andere identifier) alleen gehasht opslaan.
    verification: { storeIdentifier: "hashed" },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        alleenBijRegistratie(ctx.path, ctx.body);
        await bewaakOrganisatie(db, ctx);
      }),
    },
    databaseHooks: {
      user: {
        create: {
          // De taal van de interface bij de registratie: de header `x-elentrik-taal` als die een
          // geldige taal is, anders nl. De header (en niet de body) omdat `taal` `input: false` is:
          // een client kan ze zo niet vrij zetten, en deze hook ziet elk pad waarlangs een gebruiker
          // ontstaat. Het verzoek zit in de context van het endpoint (`ctx.headers`, of bij een
          // echt HTTP-verzoek `ctx.request`).
          before: async (nieuw, ctx) => {
            const waarde = ctx?.headers?.get(TAAL_HEADER) ?? ctx?.request?.headers.get(TAAL_HEADER) ?? null;
            return { data: { ...nieuw, taal: isTaal(waarde) ? waarde : "nl" } };
          },
        },
      },
      session: {
        create: {
          // Na elke nieuwe sessie (dus elke aanmelding), nadat ze vastgelegd is: bij de eerste
          // bevestigde aanmelding wordt de wachtende bedrijfsnaam een organisatie (Task 3).
          after: async (sessie) => {
            await richtEersteOrganisatieIn(db, { id: sessie.userId }, { sessieId: sessie.id });
          },
        },
      },
    },
    user: {
      additionalFields: {
        // De bedrijfsnaam uit de registratie, tot de eerste bevestigde aanmelding (Task 3).
        wachtendeBedrijfsnaam: { type: "string", required: false, input: true },
        // De laatst gekozen actieve organisatie (spec 2.4); alleen de server zet ze.
        laatsteOrganisatieId: { type: "string", required: false, input: false },
        // Waar zodra de gebruiker zijn eerste eigen bedrijf aanmaakte (spec 4.1); alleen de server zet het.
        proefGebruikt: { type: "boolean", required: false, defaultValue: false, input: false },
        // De taal van de interface (nl, fr of en); de registratie zet ze uit de header, daarna alleen
        // PUT /api/mij/taal.
        taal: { type: "string", required: false, defaultValue: "nl", input: false },
      },
    },
    session: {
      expiresIn: 30 * 24 * 3600,
      updateAge: 24 * 3600,
    },
    rateLimit: {
      // Ook in ontwikkeling; de standaardlimieten volstaan. Het IP komt uit x-forwarded-for, dat
      // de route in server/api/auth vervangt door het IP van de socket.
      enabled: true,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      requireEmailVerification: true,
      // Na een wachtwoordherstel gelden de bestaande sessies niet meer.
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const taal = await mailtaal(db, user);
        verstuur("herstel", herstelMail({ naam: user.name, link: url, taal }), user.email);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Wie onbevestigd probeert in te loggen, krijgt de bevestigingsmail opnieuw.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 3600,
      sendVerificationEmail: async ({ user, url }) => {
        const taal = await mailtaal(db, user);
        verstuur("bevestiging", bevestigMail({ naam: user.name, link: url, taal }), user.email);
      },
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: 15 * 60,
        storeToken: "hashed",
        // Het antwoord is altijd hetzelfde; alleen een bekend adres krijgt een mail.
        sendMagicLink: async ({ email, url }, ctx) => {
          const gevonden = await ctx?.context.internalAdapter.findUserByEmail(email);
          if (!gevonden?.user) return;
          const taal = await mailtaal(db, gevonden.user);
          verstuur("magic-link", magicLinkMail({ link: url, taal }), gevonden.user.email);
        },
      }),
      organization({
        creatorRole: "owner",
        invitationExpiresIn: 7 * 24 * 3600,
        // Een organisatie verwijderen is geen functie (spec: niet-doel); projecten zouden verweesd raken.
        disableOrganizationDeletion: true,
        // Een uitnodiging aanvaarden vereist een bevestigd adres (spec 5b.4).
        requireEmailVerificationOnInvitation: true,
        roles: { owner: ownerAc, member: memberAc },
        // Alleen een eigenaar beheert leden en uitnodigingen: dat volgt uit de rechten van
        // `memberAc` (geen enkel recht op leden, uitnodigingen of de organisatie).
        organizationHooks: {
          beforeCreateInvitation: async ({ invitation }) => eisGeldigeRol(invitation.role),
          beforeAddMember: async ({ member }) => eisGeldigeRol(member.role),
          // Ook hier de laatste eigenaar, als vangnet naast de controle vóór het verzoek.
          beforeUpdateMemberRole: async ({ member, newRole }) => {
            eisGeldigeRol(newRole);
            if (await haaltLaatsteEigenaarWeg(db, member.organizationId, { rol: member.role }, newRole)) {
              throw laatsteEigenaar();
            }
          },
          beforeRemoveMember: async ({ member }) => {
            if (await haaltLaatsteEigenaarWeg(db, member.organizationId, { rol: member.role }, null)) {
              throw laatsteEigenaar();
            }
          },
          // Een organisatienaam telt 1 tot 80 tekens na trimmen, ook via Better Auth.
          beforeCreateOrganization: async ({ organization }) => {
            eisGeldigeNaam(organization.name);
          },
          // Het eerste bedrijf dat iemand zelf aanmaakt krijgt de proefperiode, elk volgend niet
          // (spec 4.1). De registratie doet hetzelfde in richtEersteOrganisatieIn.
          afterCreateOrganization: async ({ organization, user }) => {
            await kenProefperiodeToe(db, { organisatieId: organization.id, gebruikerId: user.id, nu: new Date() });
          },
          beforeUpdateOrganization: async ({ organization }) => {
            if (organization.name === undefined) return;
            return { data: { name: eisGeldigeNaam(organization.name) } };
          },
        },
        // De link bevat een geheime token, niet het id van de uitnodiging: het id kan een lid of
        // eigenaar zien, de token staat alleen in deze mail (de database kent alleen de hash).
        sendInvitationEmail: async ({ id, email, role, organization, inviter, invitation }) => {
          const token = await maakUitnodigingstoken(db, id, new Date(invitation.expiresAt));
          // De genodigde heeft nog geen account en dus geen taal: de mail volgt wie uitnodigt.
          const taal = await mailtaal(db, inviter.user);
          verstuur(
            "uitnodiging",
            uitnodigingMail({
              uitnodiger: inviter.user.name,
              organisatie: organization.name,
              rol: rolNaamInMail(role, taal),
              link: `${basisUrl()}/uitnodiging/${token}`,
              taal,
            }),
            email,
          );
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof maakAuth>;

let huidige: Auth | undefined;

export function gebruikAuth(): Auth {
  huidige ??= maakAuth();
  return huidige;
}

/** Alleen voor tests: vervangt de instantie die `gebruikAuth()` teruggeeft. */
export function zetAuth(auth: Auth): void {
  huidige = auth;
}
