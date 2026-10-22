// Better Auth: e-mail en wachtwoord (met verplichte bevestiging), magic link, wachtwoordherstel en
// organisaties, op de bestaande Drizzle-database. Mails gaan via de verzender uit server/mail en
// vertrekken op de achtergrond: een trage of falende SMTP-server blokkeert geen aanmelding, en de
// antwoordtijd verraadt niet of een adres bekend is.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { magicLink, organization } from "better-auth/plugins";
import { memberAc, ownerAc } from "better-auth/plugins/organization/access";
import { type Db, gebruikDb } from "../db";
import * as schema from "../db/schema";
import { bevestigMail, herstelMail, magicLinkMail, uitnodigingMail } from "../mail/sjablonen";
import { gebruikVerzender, type Mail } from "../mail/verzend";

const PLAATSHOUDER = "<vervang";

/** Het geheim voor sessies en tokens, uit BETTER_AUTH_SECRET. Zonder geheim start de app niet. */
export function leesGeheim(env: Record<string, string | undefined> = process.env): string {
  const geheim = env.BETTER_AUTH_SECRET?.trim();
  if (geheim && !geheim.startsWith(PLAATSHOUDER)) return geheim;
  if (env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET ontbreekt; in productie is een eigen geheim verplicht.");
  }
  throw new Error(
    "BETTER_AUTH_SECRET ontbreekt of is nog de plaatshouder; zet een lange willekeurige waarde in apps/web/.env (zie apps/web/.env.example).",
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
  if (rollen.some((r) => !(r in ROLNAMEN))) {
    throw new APIError("BAD_REQUEST", { message: "Onbekende rol; alleen eigenaar en lid bestaan." });
  }
}

/** Verstuurt op de achtergrond. Een fout wordt gelogd zonder adres, link of token. */
function verstuur(mail: Mail, aan: string): void {
  void gebruikVerzender()
    .verstuur({ ...mail, aan })
    .catch((fout: unknown) => {
      const reden = fout instanceof Error ? fout.message : String(fout);
      console.error(`Mail "${mail.onderwerp}" versturen mislukt: ${reden}`);
    });
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
      // Ook in ontwikkeling; de standaardlimieten volstaan.
      enabled: true,
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        verstuur(herstelMail({ naam: user.name, link: url }), user.email);
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: 24 * 3600,
      sendVerificationEmail: async ({ user, url }) => {
        verstuur(bevestigMail({ naam: user.name, link: url }), user.email);
      },
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: 15 * 60,
        // Het antwoord is altijd hetzelfde; alleen een bekend adres krijgt een mail.
        sendMagicLink: async ({ email, url }, ctx) => {
          const gevonden = await ctx?.context.internalAdapter.findUserByEmail(email);
          if (!gevonden?.user) return;
          verstuur(magicLinkMail({ link: url }), gevonden.user.email);
        },
      }),
      organization({
        creatorRole: "owner",
        invitationExpiresIn: 7 * 24 * 3600,
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
