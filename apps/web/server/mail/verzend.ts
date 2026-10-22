// Mail versturen via SMTP (nodemailer). Het transport is injecteerbaar, zodat tests niets
// versturen. Een fout van het transport komt boven; de aanroeper beslist wat ermee gebeurt.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { createTransport } from "nodemailer";

export type Mail = { aan: string; onderwerp: string; tekst: string; html: string };

export type SmtpBericht = { from: string; to: string; subject: string; text: string; html: string };

export type MailTransport = { sendMail(m: SmtpBericht): Promise<unknown> };

export type Verzender = { verstuur(mail: Mail): Promise<void> };

const STANDAARD_VAN = "Elentrik <noreply@elentrik.local>";

const STANDAARD_POORT = 1025;

/** Een geldige poort (geheel getal 1 tot 65535), anders de standaardpoort 1025. */
export function smtpPoort(waarde: string | undefined): number {
  const poort = Number(waarde);
  return waarde && Number.isInteger(poort) && poort >= 1 && poort <= 65535 ? poort : STANDAARD_POORT;
}

function maakSmtpTransport(): MailTransport {
  return createTransport({
    host: process.env.SMTP_HOST || "127.0.0.1",
    port: smtpPoort(process.env.SMTP_PORT),
    // Lokaal zonder TLS of aanmelding (Mailpit); zie .env.example.
    secure: false,
  });
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
      });
    },
  };
}

let huidige: Verzender | undefined;

export function gebruikVerzender(): Verzender {
  huidige ??= maakVerzender();
  return huidige;
}

/** Alleen voor tests: vervangt de verzender die `gebruikVerzender()` teruggeeft. */
export function zetVerzender(verzender: Verzender): void {
  huidige = verzender;
}
