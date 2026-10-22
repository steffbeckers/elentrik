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
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink, organization } from "better-auth/plugins";
import { memberAc, ownerAc } from "better-auth/plugins/organization/access";
import { type Db, gebruikDb } from "../db";
import * as schema from "../db/schema";
import { bevestigMail, herstelMail, magicLinkMail, uitnodigingMail } from "../mail/sjablonen";
import { gebruikVerzender, type Mail } from "../mail/verzend";

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
const alleenBijRegistratie = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/update-user") return;
  const body: unknown = ctx.body;
  if (body && typeof body === "object" && "wachtendeBedrijfsnaam" in body) {
    throw new APIError("BAD_REQUEST", {
      message: "wachtendeBedrijfsnaam kan alleen bij de registratie gezet worden.",
    });
  }
});

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
    hooks: { before: alleenBijRegistratie },
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
        organizationHooks: {
          beforeCreateInvitation: async ({ invitation }) => eisGeldigeRol(invitation.role),
          beforeAddMember: async ({ member }) => eisGeldigeRol(member.role),
          beforeUpdateMemberRole: async ({ newRole }) => eisGeldigeRol(newRole),
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
