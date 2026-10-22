import { describe, expect, test } from "vitest";
import {
  bevestigMail,
  herstelMail,
  magicLinkMail,
  uitnodigingMail,
} from "../server/mail/sjablonen";

const link = "http://127.0.0.1:3100/api/auth/verify?token=abc&x=1";

describe("mailsjablonen", () => {
  test("bevestigMail: Nederlands onderwerp, link in tekst en als knop", () => {
    const mail = bevestigMail({ naam: "Jan", link });
    expect(mail.onderwerp).toBe("Bevestig je e-mailadres bij Elentrik");
    expect(mail.tekst).toContain("Jan");
    expect(mail.tekst).toContain(link);
    // In html staat de link ge-escaped (& wordt &amp;) in de knop.
    expect(mail.html).toContain('href="http://127.0.0.1:3100/api/auth/verify?token=abc&amp;x=1"');
    expect(mail.html).toContain("Bevestig mijn e-mailadres");
    expect(mail.aan).toBe("");
  });

  test("magicLinkMail: Nederlands onderwerp, link in tekst en html, vermeldt 15 minuten", () => {
    const mail = magicLinkMail({ link });
    expect(mail.onderwerp).toBe("Je inloglink voor Elentrik");
    expect(mail.tekst).toContain(link);
    expect(mail.tekst).toContain("15 minuten");
    expect(mail.html).toContain("token=abc&amp;x=1");
    expect(mail.html).toContain("15 minuten");
  });

  test("herstelMail: Nederlands onderwerp, link in tekst en html", () => {
    const mail = herstelMail({ naam: "Jan", link });
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
    });
    expect(mail.html).toContain("&lt;b&gt;&amp;");
    expect(mail.html).not.toContain("<b>&");
    expect(mail.html).toContain("&lt;i&gt;&quot;Els&quot;&lt;/i&gt;");
    expect(mail.html).not.toContain("<i>");
    expect(mail.tekst).toContain("<b>&");

    const bevestiging = bevestigMail({ naam: "<script>x</script>", link });
    expect(bevestiging.html).not.toContain("<script>");
    expect(bevestiging.html).toContain("&lt;script&gt;x&lt;/script&gt;");
  });
});
