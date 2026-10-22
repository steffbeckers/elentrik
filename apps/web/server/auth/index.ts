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
import { type Db, gebruikDb } from "../db";
import * as schema from "../db/schema";
import { bevestigMail, herstelMail, magicLinkMail, uitnodigingMail } from "../mail/sjablonen";
import { gebruikVerzender, type Mail } from "../mail/verzend";
import { richtEersteOrganisatieIn } from "../organisaties/registratie";
import {
  geldigeNaam,
  haaltLaatsteEigenaarWeg,
  LAATSTE_EIGENAAR,
  LAATSTE_EIGENAAR_BOODSCHAP,
  MAX_NAAMLENGTE,
} from "../organisaties/regels";

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

/** De publieke basis-URL van de app, voor links in mails. */
function basisUrl(): string {
  return (process.env.BETTER_AUTH_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
}

/** Interne rolnamen naar de namen in mails en UI. */
const ROLNAMEN: Record<string, string> = { owner: "eigenaar", member: "lid" };

function eisGeldigeRol(rol: string): void {
  const rollen = rol.split(",").map((r) => r.trim());
  if (rollen.some((r) => !Object.hasOwn(ROLNAMEN, r))) {
    throw new APIError("BAD_REQUEST", { message: "Onbekende rol; alleen eigenaar en lid bestaan." });
  }
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

/** `wachtendeBedrijfsnaam` mag alleen bij de registratie gezet worden, niet via /update-user. */
function alleenBijRegistratie(path: string, body: unknown): void {
  if (path !== "/update-user") return;
  if (body && typeof body === "object" && "wachtendeBedrijfsnaam" in body) {
    throw new APIError("BAD_REQUEST", {
      message: "wachtendeBedrijfsnaam kan alleen bij de registratie gezet worden.",
    });
  }
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

/**
 * De laatste eigenaar blijft, ook via de endpoints van Better Auth (ruling R5): vóór verlaten,
 * een lid verwijderen of een rol wijzigen. Better Auth weigert die gevallen zelf ook, maar met
 * 400 en een eigen code; dit geeft overal 409 met `LAATSTE_EIGENAAR`. Zonder sessie of met een
 * onbekend lid doet dit niets: dan weigert Better Auth zelf.
 */
async function eisEenEigenaarBlijft(
  db: Db,
  ctx: Parameters<typeof getSessionFromCtx>[0] & { path: string; body?: unknown },
): Promise<void> {
  const paden = ["/organization/leave", "/organization/remove-member", "/organization/update-member-role"];
  if (!paden.includes(ctx.path)) return;
  const body = (ctx.body && typeof ctx.body === "object" ? ctx.body : {}) as Body;
  const sessie = await getSessionFromCtx(ctx).catch(() => null);
  if (!sessie) return;
  const actief = (sessie.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null;
  const organisatieId = typeof body.organizationId === "string" && body.organizationId ? body.organizationId : actief;
  if (!organisatieId) return;

  let doel: { rol: string } | undefined;
  let nieuweRol: string | null = null;
  if (ctx.path === "/organization/leave") {
    [doel] = await db
      .select({ rol: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.userId, sessie.user.id), eq(schema.member.organizationId, organisatieId)));
  } else if (ctx.path === "/organization/remove-member") {
    const sleutel = typeof body.memberIdOrEmail === "string" ? body.memberIdOrEmail : "";
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
    const memberId = typeof body.memberId === "string" ? body.memberId : "";
    [doel] = await db
      .select({ rol: schema.member.role })
      .from(schema.member)
      .where(and(eq(schema.member.id, memberId), eq(schema.member.organizationId, organisatieId)));
    nieuweRol = Array.isArray(body.role) ? body.role.join(",") : typeof body.role === "string" ? body.role : "";
  }
  if (doel && (await haaltLaatsteEigenaarWeg(db, organisatieId, doel, nieuweRol))) throw laatsteEigenaar();
}

export function maakAuth(db: Db = gebruikDb()) {
  return betterAuth({
    appName: "Elentrik",
    baseURL: basisUrl(),
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
        await eisEenEigenaarBlijft(db, ctx);
      }),
    },
    databaseHooks: {
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
      sendResetPassword: async ({ user, url }) => {
        verstuur("herstel", herstelMail({ naam: user.name, link: url }), user.email);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      // Wie onbevestigd probeert in te loggen, krijgt de bevestigingsmail opnieuw.
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 3600,
      sendVerificationEmail: async ({ user, url }) => {
        verstuur("bevestiging", bevestigMail({ naam: user.name, link: url }), user.email);
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
          verstuur("magic-link", magicLinkMail({ link: url }), gevonden.user.email);
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
          beforeUpdateOrganization: async ({ organization }) => {
            if (organization.name === undefined) return;
            return { data: { name: eisGeldigeNaam(organization.name) } };
          },
        },
        sendInvitationEmail: async ({ id, email, role, organization, inviter }) => {
          verstuur(
            "uitnodiging",
            uitnodigingMail({
              uitnodiger: inviter.user.name,
              organisatie: organization.name,
              rol: ROLNAMEN[role] ?? role,
              link: `${basisUrl()}/uitnodiging/${id}`,
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
