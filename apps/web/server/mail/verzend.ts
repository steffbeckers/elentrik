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

function maakSmtpTransport(): MailTransport {
  return createTransport({
    host: process.env.SMTP_HOST || "127.0.0.1",
    port: Number(process.env.SMTP_PORT || 1025),
    // Lokaal zonder TLS of aanmelding (Mailpit); zie .env.example.
    secure: false,
  });
}

export function maakVerzender(transport?: MailTransport): Verzender {
  let t = transport;
  return {
    async verstuur(mail) {
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
