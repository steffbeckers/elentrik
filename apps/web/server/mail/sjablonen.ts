// Mailteksten van Elentrik in het Nederlands, Frans en Engels: zuivere functies, geen toegang tot
// omgeving of netwerk. De taal is die van de gebruiker (`user.taal`); een uitnodiging krijgt de
// taal van wie uitnodigt, want de genodigde heeft nog geen account. De woorden volgen
// docs/vertalingen.md; het Frans spreekt met "vous".
// Elke ingevoegde waarde wordt in de html ge-escaped; de platte tekst bevat ze ongewijzigd. Het
// adres (`aan`) vult de aanroeper in.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import type { Taal } from "../../shared/taal";
import type { Mail } from "./verzend";

function esc(waarde: string): string {
  return waarde
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "Werkt de knop niet?" onder de knop van elke mail. */
const KNOP_WERKT_NIET: Record<Taal, string> = {
  nl: "Werkt de knop niet? Kopieer dan deze link in je browser:",
  fr: "Le bouton ne fonctionne pas ? Copiez alors ce lien dans votre navigateur :",
  en: "Button not working? Copy this link into your browser:",
};

/** "Heb je dit niet aangevraagd?" in de drie talen; de rest van de slotregel verschilt per mail. */
const NIET_AANGEVRAAGD: Record<Taal, string> = {
  nl: "Heb je dit niet aangevraagd?",
  fr: "Vous n'avez pas fait cette demande ?",
  en: "Didn't request this?",
};

/** De rolnamen in een mail (interne rol `owner` of `member`); een onbekende rol blijft staan. */
const ROLNAMEN: Record<Taal, Record<string, string>> = {
  nl: { owner: "eigenaar", member: "lid" },
  fr: { owner: "propriétaire", member: "membre" },
  en: { owner: "owner", member: "member" },
};

export function rolNaamInMail(rol: string, taal: Taal): string {
  return Object.hasOwn(ROLNAMEN[taal], rol) ? ROLNAMEN[taal][rol]! : rol;
}

type Opbouw = {
  taal: Taal;
  onderwerp: string;
  /** Alinea's in platte tekst, voor de link. */
  alineas: string[];
  knop: string;
  link: string;
  /** Slotregels in platte tekst, na de link. */
  voetnoot: string[];
};

/** De teksten van een mail in één taal: een `Opbouw` zonder de taal en de link, die de aanroeper geeft. */
type Teksten = Omit<Opbouw, "taal" | "link">;

function bouw({ taal, onderwerp, alineas, knop, link, voetnoot }: Opbouw): Mail {
  const tekst = [...alineas, `${knop}: ${link}`, ...voetnoot, "Elentrik"].join("\n\n");
  const html = `<!doctype html>
<html lang="${taal}">
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
<div style="max-width:560px;margin:0 auto;padding:24px;background:#ffffff;border-radius:8px;">
${alineas.map((a) => `<p style="margin:0 0 16px;line-height:1.5;">${esc(a)}</p>`).join("\n")}
<p style="margin:24px 0;"><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">${esc(knop)}</a></p>
<p style="margin:0 0 16px;line-height:1.5;font-size:13px;color:#52525b;">${esc(KNOP_WERKT_NIET[taal])}<br>${esc(link)}</p>
${voetnoot.map((v) => `<p style="margin:0 0 16px;line-height:1.5;font-size:13px;color:#52525b;">${esc(v)}</p>`).join("\n")}
<p style="margin:0;font-size:13px;color:#52525b;">Elentrik</p>
</div>
</body>
</html>`;
  return { aan: "", onderwerp, tekst, html };
}

export function bevestigMail({ naam, link, taal }: { naam: string; link: string; taal: Taal }): Mail {
  const nietAangevraagd = NIET_AANGEVRAAGD[taal];
  const teksten: Record<Taal, Teksten> = {
    nl: {
      onderwerp: "Bevestig je e-mailadres bij Elentrik",
      alineas: [`Dag ${naam},`, "Welkom bij Elentrik. Bevestig je e-mailadres om je account te activeren."],
      knop: "Bevestig mijn e-mailadres",
      voetnoot: ["Deze link is 24 uur geldig.", `${nietAangevraagd} Dan mag je deze mail negeren.`],
    },
    fr: {
      onderwerp: "Confirmez votre adresse e-mail pour Elentrik",
      alineas: [
        `Bonjour ${naam},`,
        "Bienvenue sur Elentrik. Confirmez votre adresse e-mail pour activer votre compte.",
      ],
      knop: "Confirmer mon adresse e-mail",
      voetnoot: ["Ce lien est valable 24 heures.", `${nietAangevraagd} Vous pouvez ignorer cet e-mail.`],
    },
    en: {
      onderwerp: "Confirm your email address for Elentrik",
      alineas: [`Hello ${naam},`, "Welcome to Elentrik. Confirm your email address to activate your account."],
      knop: "Confirm my email address",
      voetnoot: ["This link is valid for 24 hours.", `${nietAangevraagd} You can ignore this email.`],
    },
  };
  // Ook een inlogpoging met een onbevestigd adres stuurt deze mail (sendOnSignIn).
  return bouw({ taal, link, ...teksten[taal] });
}

export function magicLinkMail({ link, taal }: { link: string; taal: Taal }): Mail {
  const nietAangevraagd = NIET_AANGEVRAAGD[taal];
  const teksten: Record<Taal, Teksten> = {
    nl: {
      onderwerp: "Je inloglink voor Elentrik",
      alineas: ["Dag,", "Met deze link log je in bij Elentrik, zonder wachtwoord."],
      knop: "Inloggen",
      voetnoot: [
        `Deze link is 15 minuten geldig en werkt maar één keer. ${nietAangevraagd} Dan kun je deze mail negeren.`,
      ],
    },
    fr: {
      onderwerp: "Votre lien de connexion pour Elentrik",
      alineas: ["Bonjour,", "Avec ce lien, vous vous connectez à Elentrik, sans mot de passe."],
      knop: "Se connecter",
      voetnoot: [
        `Ce lien est valable 15 minutes et ne fonctionne qu'une seule fois. ${nietAangevraagd} Vous pouvez ignorer cet e-mail.`,
      ],
    },
    en: {
      onderwerp: "Your sign-in link for Elentrik",
      alineas: ["Hello,", "Use this link to sign in to Elentrik without a password."],
      knop: "Sign in",
      voetnoot: [
        `This link is valid for 15 minutes and works only once. ${nietAangevraagd} You can ignore this email.`,
      ],
    },
  };
  return bouw({ taal, link, ...teksten[taal] });
}

export function herstelMail({ naam, link, taal }: { naam: string; link: string; taal: Taal }): Mail {
  const nietAangevraagd = NIET_AANGEVRAAGD[taal];
  const teksten: Record<Taal, Teksten> = {
    nl: {
      onderwerp: "Stel een nieuw wachtwoord in voor Elentrik",
      alineas: [`Dag ${naam},`, "Je vroeg om je wachtwoord te herstellen. Kies hieronder een nieuw wachtwoord."],
      knop: "Nieuw wachtwoord instellen",
      voetnoot: [`${nietAangevraagd} Dan kun je deze mail negeren; je wachtwoord blijft ongewijzigd.`],
    },
    fr: {
      onderwerp: "Définissez un nouveau mot de passe pour Elentrik",
      alineas: [
        `Bonjour ${naam},`,
        "Vous avez demandé à réinitialiser votre mot de passe. Choisissez ci-dessous un nouveau mot de passe.",
      ],
      knop: "Définir un nouveau mot de passe",
      voetnoot: [`${nietAangevraagd} Vous pouvez ignorer cet e-mail ; votre mot de passe reste inchangé.`],
    },
    en: {
      onderwerp: "Set a new password for Elentrik",
      alineas: [`Hello ${naam},`, "You asked to reset your password. Choose a new password below."],
      knop: "Set a new password",
      voetnoot: [`${nietAangevraagd} You can ignore this email; your password stays the same.`],
    },
  };
  return bouw({ taal, link, ...teksten[taal] });
}

export function uitnodigingMail({
  uitnodiger,
  organisatie,
  rol,
  link,
  taal,
}: {
  uitnodiger: string;
  organisatie: string;
  /** De rolnaam in de taal van de mail, zie `rolNaamInMail`. */
  rol: string;
  link: string;
  taal: Taal;
}): Mail {
  const teksten: Record<Taal, Teksten> = {
    nl: {
      onderwerp: `${uitnodiger} nodigt je uit voor ${organisatie} op Elentrik`,
      alineas: [
        "Dag,",
        `${uitnodiger} nodigt je uit om lid te worden van ${organisatie} op Elentrik, met de rol ${rol}.`,
      ],
      knop: "Uitnodiging bekijken",
      voetnoot: ["Deze uitnodiging is 7 dagen geldig."],
    },
    fr: {
      onderwerp: `${uitnodiger} vous invite à rejoindre ${organisatie} sur Elentrik`,
      alineas: [
        "Bonjour,",
        `${uitnodiger} vous invite à rejoindre ${organisatie} sur Elentrik, avec le rôle ${rol}.`,
      ],
      knop: "Voir l'invitation",
      voetnoot: ["Cette invitation est valable 7 jours."],
    },
    en: {
      onderwerp: `${uitnodiger} invites you to join ${organisatie} on Elentrik`,
      alineas: [
        "Hello,",
        `${uitnodiger} invites you to join ${organisatie} on Elentrik, with the role of ${rol}.`,
      ],
      knop: "View invitation",
      voetnoot: ["This invitation is valid for 7 days."],
    },
  };
  return bouw({ taal, link, ...teksten[taal] });
}
