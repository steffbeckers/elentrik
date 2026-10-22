// Mailteksten van Elentrik: zuivere functies, geen toegang tot omgeving of netwerk.
// Alles is Nederlands. Elke ingevoegde waarde wordt in de html ge-escaped; de platte tekst
// bevat ze ongewijzigd. Het adres (`aan`) vult de aanroeper in.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import type { Mail } from "./verzend";

function esc(waarde: string): string {
  return waarde
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type Opbouw = {
  onderwerp: string;
  /** Alinea's in platte tekst, voor de link. */
  alineas: string[];
  knop: string;
  link: string;
  /** Slotregels in platte tekst, na de link. */
  voetnoot: string[];
};

function bouw({ onderwerp, alineas, knop, link, voetnoot }: Opbouw): Mail {
  const tekst = [...alineas, `${knop}: ${link}`, ...voetnoot, "Elentrik"].join("\n\n");
  const html = `<!doctype html>
<html lang="nl">
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
<div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:8px;">
${alineas.map((a) => `<p style="margin:0 0 16px;line-height:1.5;">${esc(a)}</p>`).join("\n")}
<p style="margin:24px 0;"><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">${esc(knop)}</a></p>
<p style="margin:0 0 16px;line-height:1.5;font-size:13px;color:#52525b;">Werkt de knop niet? Kopieer dan deze link in je browser:<br>${esc(link)}</p>
${voetnoot.map((v) => `<p style="margin:0 0 16px;line-height:1.5;font-size:13px;color:#52525b;">${esc(v)}</p>`).join("\n")}
<p style="margin:0;font-size:13px;color:#52525b;">Elentrik</p>
</div>
</body>
</html>`;
  return { aan: "", onderwerp, tekst, html };
}

export function bevestigMail({ naam, link }: { naam: string; link: string }): Mail {
  return bouw({
    onderwerp: "Bevestig je e-mailadres bij Elentrik",
    alineas: [
      `Dag ${naam},`,
      "Welkom bij Elentrik. Bevestig je e-mailadres om je account te activeren.",
    ],
    knop: "Bevestig mijn e-mailadres",
    link,
    voetnoot: [
      "Deze link is 24 uur geldig. Heb je geen account aangemaakt? Dan kun je deze mail negeren.",
    ],
  });
}

export function magicLinkMail({ link }: { link: string }): Mail {
  return bouw({
    onderwerp: "Je inloglink voor Elentrik",
    alineas: ["Dag,", "Met deze link log je in bij Elentrik, zonder wachtwoord."],
    knop: "Inloggen",
    link,
    voetnoot: [
      "Deze link is 15 minuten geldig en werkt maar één keer. Heb je dit niet aangevraagd? Dan kun je deze mail negeren.",
    ],
  });
}

export function herstelMail({ naam, link }: { naam: string; link: string }): Mail {
  return bouw({
    onderwerp: "Stel een nieuw wachtwoord in voor Elentrik",
    alineas: [
      `Dag ${naam},`,
      "Je vroeg om je wachtwoord te herstellen. Kies hieronder een nieuw wachtwoord.",
    ],
    knop: "Nieuw wachtwoord instellen",
    link,
    voetnoot: [
      "Heb je dit niet aangevraagd? Dan kun je deze mail negeren; je wachtwoord blijft ongewijzigd.",
    ],
  });
}

export function uitnodigingMail({
  uitnodiger,
  organisatie,
  rol,
  link,
}: {
  uitnodiger: string;
  organisatie: string;
  rol: string;
  link: string;
}): Mail {
  return bouw({
    onderwerp: `${uitnodiger} nodigt je uit voor ${organisatie} op Elentrik`,
    alineas: [
      "Dag,",
      `${uitnodiger} nodigt je uit om lid te worden van ${organisatie} op Elentrik, met de rol ${rol}.`,
    ],
    knop: "Uitnodiging bekijken",
    link,
    voetnoot: ["Deze uitnodiging is 7 dagen geldig."],
  });
}
