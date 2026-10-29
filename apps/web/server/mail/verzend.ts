// Mail versturen via SMTP (nodemailer). Het transport is injecteerbaar, zodat tests niets
// versturen. Een fout van het transport komt boven; de aanroeper beslist wat ermee gebeurt.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { createTransport } from "nodemailer";
import { maakGraphVerzender } from "./graph";

export type Bijlage = { naam: string; inhoud: Uint8Array; type: string };

export type Mail = { aan: string; onderwerp: string; tekst: string; html: string; bijlagen?: Bijlage[] };

export type SmtpBericht = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
};

export type MailTransport = { sendMail(m: SmtpBericht): Promise<unknown> };

export type Verzender = { verstuur(mail: Mail): Promise<void> };

const STANDAARD_VAN = "Elentrik <noreply@elentrik.local>";

const STANDAARD_POORT = 1025;

/** Een geldige poort (geheel getal 1 tot 65535), anders de standaardpoort 1025. */
export function smtpPoort(waarde: string | undefined): number {
  const poort = Number(waarde);
  return waarde && Number.isInteger(poort) && poort >= 1 && poort <= 65535 ? poort : STANDAARD_POORT;
}

export type SmtpOpties = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
};

/**
 * De SMTP-instellingen uit de omgeving. Zonder SMTP_GEBRUIKER en SMTP_WACHTWOORD geen aanmelding,
 * zonder SMTP_BEVEILIGD=true geen TLS: zo werkt Mailpit lokaal (zie .env.example). Deze waarden
 * worden nergens gelogd.
 */
export function smtpOpties(env: Record<string, string | undefined> = process.env): SmtpOpties {
  const opties: SmtpOpties = {
    host: env.SMTP_HOST || "127.0.0.1",
    port: smtpPoort(env.SMTP_PORT),
    secure: env.SMTP_BEVEILIGD?.trim().toLowerCase() === "true",
  };
  if (env.SMTP_GEBRUIKER && env.SMTP_WACHTWOORD) {
    opties.auth = { user: env.SMTP_GEBRUIKER, pass: env.SMTP_WACHTWOORD };
  }
  return opties;
}

function maakSmtpTransport(): MailTransport {
  return createTransport(smtpOpties());
}

export function maakVerzender(transport?: MailTransport): Verzender {
  let t = transport;
  return {
    async verstuur(mail) {
      if (!mail.aan.trim()) throw new Error("Mail zonder ontvanger (aan is leeg)");
      t ??= maakSmtpTransport();
      await t.sendMail({
        from: process.env.SMTP_VAN || STANDAARD_VAN,
        to: mail.aan,
        subject: mail.onderwerp,
        text: mail.tekst,
        html: mail.html,
        ...(mail.bijlagen?.length
          ? {
              attachments: mail.bijlagen.map((b) => ({ filename: b.naam, content: Buffer.from(b.inhoud), contentType: b.type })),
            }
          : {}),
      });
    },
  };
}

let huidige: Verzender | undefined;

/**
 * De verzender volgens MAIL_VERZENDER: `graph` (Microsoft Graph, met GRAPH_TENANT_ID, GRAPH_CLIENT_ID,
 * GRAPH_CLIENT_GEHEIM en MAIL_AFZENDER), anders SMTP. Ontbreekt een Graph-variabele, dan noemt de fout
 * alleen de naam.
 */
function kiesVerzender(env: Record<string, string | undefined> = process.env): Verzender {
  if (env.MAIL_VERZENDER?.trim() !== "graph") return maakVerzender();
  const waarde = (naam: string): string => {
    const w = env[naam]?.trim();
    if (!w) throw new Error(`MAIL_VERZENDER=graph vraagt ${naam}`);
    return w;
  };
  return maakGraphVerzender({
    tenantId: waarde("GRAPH_TENANT_ID"),
    clientId: waarde("GRAPH_CLIENT_ID"),
    clientGeheim: waarde("GRAPH_CLIENT_GEHEIM"),
    afzender: waarde("MAIL_AFZENDER"),
  });
}

export function gebruikVerzender(): Verzender {
  huidige ??= kiesVerzender();
  return huidige;
}

/** Alleen voor tests: vervangt de verzender die `gebruikVerzender()` teruggeeft (`undefined`: opnieuw kiezen). */
export function zetVerzender(verzender: Verzender | undefined): void {
  huidige = verzender;
}
