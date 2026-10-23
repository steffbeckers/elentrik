import { describe, expect, test } from "vitest";
import {
  bevestigMail,
  herstelMail,
  magicLinkMail,
  rolNaamInMail,
  uitnodigingMail,
} from "../server/mail/sjablonen";
import { TALEN, type Taal } from "../shared/taal";

const link = "http://127.0.0.1:3100/api/auth/verify?token=abc&x=1";

describe("mailsjablonen", () => {
  test("bevestigMail: Nederlands onderwerp, link in tekst en als knop", () => {
    const mail = bevestigMail({ naam: "Jan", link, taal: "nl" });
    expect(mail.onderwerp).toBe("Bevestig je e-mailadres bij Elentrik");
    expect(mail.tekst).toContain("Jan");
    expect(mail.tekst).toContain(link);
    // In html staat de link ge-escaped (& wordt &amp;) in de knop.
    expect(mail.html).toContain('href="http://127.0.0.1:3100/api/auth/verify?token=abc&amp;x=1"');
    expect(mail.html).toContain("Bevestig mijn e-mailadres");
    expect(mail.aan).toBe("");
  });

  test("bevestigMail: wie niets aanvroeg, mag de mail negeren (ze komt ook bij een inlogpoging)", () => {
    const mail = bevestigMail({ naam: "Jan", link, taal: "nl" });
    const regel = "Heb je dit niet aangevraagd? Dan mag je deze mail negeren.";
    expect(mail.tekst).toContain(regel);
    expect(mail.html).toContain(regel);
    expect(mail.tekst).toContain("24 uur");
  });

  test("magicLinkMail: Nederlands onderwerp, link in tekst en html, vermeldt 15 minuten", () => {
    const mail = magicLinkMail({ link, taal: "nl" });
    expect(mail.onderwerp).toBe("Je inloglink voor Elentrik");
    expect(mail.tekst).toContain(link);
    expect(mail.tekst).toContain("15 minuten");
    expect(mail.html).toContain("token=abc&amp;x=1");
    expect(mail.html).toContain("15 minuten");
  });

  test("herstelMail: Nederlands onderwerp, link in tekst en html", () => {
    const mail = herstelMail({ naam: "Jan", link, taal: "nl" });
    expect(mail.onderwerp).toBe("Stel een nieuw wachtwoord in voor Elentrik");
    expect(mail.tekst).toContain("Jan");
    expect(mail.tekst).toContain(link);
    expect(mail.html).toContain("token=abc&amp;x=1");
  });

  test("uitnodigingMail: onderwerp met organisatie, rol en uitnodiger, link in tekst en html", () => {
    const mail = uitnodigingMail({
      uitnodiger: "Els",
      organisatie: "Janssens Elektro",
      rol: "lid",
      link,
      taal: "nl",
    });
    expect(mail.onderwerp).toBe("Els nodigt je uit voor Janssens Elektro op Elentrik");
    expect(mail.tekst).toContain("Els");
    expect(mail.tekst).toContain("Janssens Elektro");
    expect(mail.tekst).toContain("lid");
    expect(mail.tekst).toContain(link);
    expect(mail.html).toContain("token=abc&amp;x=1");
    expect(mail.html).toContain("7 dagen");
  });

  test("elke waarde wordt ge-escaped in html, maar niet in de platte tekst", () => {
    const mail = uitnodigingMail({
      uitnodiger: '<i>"Els"</i>',
      organisatie: "<b>&",
      rol: "eigenaar",
      link,
      taal: "nl",
    });
    expect(mail.html).toContain("&lt;b&gt;&amp;");
    expect(mail.html).not.toContain("<b>&");
    expect(mail.html).toContain("&lt;i&gt;&quot;Els&quot;&lt;/i&gt;");
    expect(mail.html).not.toContain("<i>");
    expect(mail.tekst).toContain("<b>&");

    const bevestiging = bevestigMail({ naam: "<script>x</script>", link, taal: "nl" });
    expect(bevestiging.html).not.toContain("<script>");
    expect(bevestiging.html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});

// --- Drie talen --------------------------------------------------------------------------------

const PER_TAAL: Record<
  Taal,
  {
    lang: string;
    bevestig: string;
    magicLink: string;
    herstel: string;
    uitnodiging: string;
    /** De regel "Heb je dit niet aangevraagd?" in de taal. */
    nietAangevraagd: string;
    /** "Werkt de knop niet?" in de taal. */
    knopWerktNiet: string;
  }
> = {
  nl: {
    lang: "nl",
    bevestig: "Bevestig",
    magicLink: "inloglink",
    herstel: "nieuw wachtwoord",
    uitnodiging: "nodigt je uit",
    nietAangevraagd: "Heb je dit niet aangevraagd?",
    knopWerktNiet: "Werkt de knop niet?",
  },
  fr: {
    lang: "fr",
    bevestig: "Confirmez",
    magicLink: "lien de connexion",
    herstel: "nouveau mot de passe",
    uitnodiging: "vous invite",
    nietAangevraagd: "Vous n'avez pas fait cette demande ?",
    knopWerktNiet: "Le bouton ne fonctionne pas ?",
  },
  en: {
    lang: "en",
    bevestig: "Confirm",
    magicLink: "sign-in link",
    herstel: "new password",
    uitnodiging: "invites you",
    nietAangevraagd: "Didn't request this?",
    knopWerktNiet: "Button not working?",
  },
};

describe.each(TALEN)("mailsjablonen in het %s", (taal) => {
  const t = PER_TAAL[taal];

  test("bevestigMail: onderwerp, tekst en html in de taal; de link blijft ongewijzigd", () => {
    const mail = bevestigMail({ naam: "Jan", link, taal });
    expect(mail.onderwerp).toContain(t.bevestig);
    expect(mail.tekst).toContain("Jan");
    expect(mail.tekst).toContain(link);
    expect(mail.html).toContain(`<html lang="${t.lang}">`);
    expect(mail.html).toContain("token=abc&amp;x=1");
    expect(mail.html).toContain(t.knopWerktNiet);
    expect(mail.tekst).toContain("24");
  });

  test("magicLinkMail: onderwerp en tekst in de taal, 15 minuten", () => {
    const mail = magicLinkMail({ link, taal });
    expect(mail.onderwerp.toLowerCase()).toContain(t.magicLink);
    expect(mail.tekst).toContain(link);
    expect(mail.tekst).toContain("15");
    expect(mail.html).toContain(`<html lang="${t.lang}">`);
  });

  test("herstelMail: onderwerp en tekst in de taal", () => {
    const mail = herstelMail({ naam: "Jan", link, taal });
    expect(mail.onderwerp.toLowerCase()).toContain(t.herstel);
    expect(mail.tekst).toContain("Jan");
    expect(mail.tekst).toContain(link);
    expect(mail.html).toContain(`<html lang="${t.lang}">`);
  });

  test("uitnodigingMail: uitnodiger, organisatie en rol in de taal, 7 dagen", () => {
    const mail = uitnodigingMail({
      uitnodiger: "Els",
      organisatie: "Janssens Elektro",
      rol: rolNaamInMail("member", taal),
      link,
      taal,
    });
    expect(mail.onderwerp).toContain(t.uitnodiging);
    expect(mail.onderwerp).toContain("Els");
    expect(mail.onderwerp).toContain("Janssens Elektro");
    expect(mail.tekst).toContain(rolNaamInMail("member", taal));
    expect(mail.tekst).toContain("7");
    expect(mail.tekst).toContain(link);
    expect(mail.html).toContain(`<html lang="${t.lang}">`);
  });

  test("de regel 'niet aangevraagd' staat in tekst en html van bevestiging, inloglink en herstel", () => {
    for (const mail of [
      bevestigMail({ naam: "Jan", link, taal }),
      magicLinkMail({ link, taal }),
      herstelMail({ naam: "Jan", link, taal }),
    ]) {
      expect(mail.tekst).toContain(t.nietAangevraagd);
      // In html staat de apostrof ge-escaped (&#39;).
      expect(mail.html).toContain(t.nietAangevraagd.replace(/'/g, "&#39;"));
    }
  });

  test("elke ingevoegde waarde wordt ge-escaped in html, niet in de platte tekst", () => {
    const mail = uitnodigingMail({
      uitnodiger: '<i>"Els"</i>',
      organisatie: "<b>&",
      rol: rolNaamInMail("owner", taal),
      link,
      taal,
    });
    expect(mail.html).toContain("&lt;b&gt;&amp;");
    expect(mail.html).not.toContain("<b>&");
    expect(mail.html).toContain("&lt;i&gt;&quot;Els&quot;&lt;/i&gt;");
    expect(mail.tekst).toContain("<b>&");
    const bevestiging = bevestigMail({ naam: "<script>x</script>", link, taal });
    expect(bevestiging.html).not.toContain("<script>");
    expect(bevestiging.html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});

describe("mailsjablonen: de talen verschillen", () => {
  test("elke taal heeft een eigen onderwerp per sjabloon", () => {
    const onderwerpen = (maak: (taal: Taal) => string) => new Set(TALEN.map(maak));
    expect(onderwerpen((taal) => bevestigMail({ naam: "Jan", link, taal }).onderwerp).size).toBe(3);
    expect(onderwerpen((taal) => magicLinkMail({ link, taal }).onderwerp).size).toBe(3);
    expect(onderwerpen((taal) => herstelMail({ naam: "Jan", link, taal }).onderwerp).size).toBe(3);
    expect(
      onderwerpen((taal) => uitnodigingMail({ uitnodiger: "Els", organisatie: "X", rol: "lid", link, taal }).onderwerp)
        .size,
    ).toBe(3);
  });

  test("Frans en Engels hebben geen Nederlandse resten", () => {
    for (const taal of ["fr", "en"] as const) {
      const mails = [
        bevestigMail({ naam: "Jan", link, taal }),
        magicLinkMail({ link, taal }),
        herstelMail({ naam: "Jan", link, taal }),
        uitnodigingMail({ uitnodiger: "Els", organisatie: "X", rol: rolNaamInMail("member", taal), link, taal }),
      ];
      for (const mail of mails) {
        const woorden = mail.tekst.split(/[^A-Za-zà-ÿ']+/);
        for (const nederlands of ["je", "jouw", "negeren", "geldig", "Dag", "knop"]) {
          expect(woorden).not.toContain(nederlands);
        }
      }
    }
  });

  test("het Frans spreekt met 'vous'", () => {
    const mail = herstelMail({ naam: "Jan", link, taal: "fr" });
    const woorden = mail.tekst.toLowerCase().split(/[^a-zà-ÿ']+/);
    expect(woorden).toContain("vous");
    for (const woord of ["tu", "ton", "ta", "tes"]) expect(woorden).not.toContain(woord);
  });

  test("rolNaamInMail: eigenaar en lid per taal; een onbekende rol blijft staan", () => {
    expect(rolNaamInMail("owner", "nl")).toBe("eigenaar");
    expect(rolNaamInMail("member", "nl")).toBe("lid");
    expect(rolNaamInMail("owner", "fr")).toBe("propriétaire");
    expect(rolNaamInMail("member", "fr")).toBe("membre");
    expect(rolNaamInMail("owner", "en")).toBe("owner");
    expect(rolNaamInMail("member", "en")).toBe("member");
    expect(rolNaamInMail("admin", "fr")).toBe("admin");
  });
});
