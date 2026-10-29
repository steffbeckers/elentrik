// De zuivere delen van de e2e-hulpmiddelen: het veiligheidsnet en het lezen van mail-links.
import { isAbsolute, sep } from "node:path";
import { describe, expect, test } from "vitest";
import {
  E2E_BESTANDEN_DIR,
  E2E_DATABASE_URL,
  E2E_URL,
  WEB_DIR,
  eisE2eDatabase,
} from "../e2e/omgeving";
import { linkUitTekst } from "../e2e/hulp/link";
import { bevestigMail, herstelMail, magicLinkMail, uitnodigingMail } from "../server/mail/sjablonen";
import { TALEN } from "../shared/taal";

describe("eisE2eDatabase", () => {
  test("de e2e-url wordt aanvaard", () => {
    expect(eisE2eDatabase(E2E_DATABASE_URL)).toBe(E2E_DATABASE_URL);
    expect(eisE2eDatabase("postgres://elentrik:elentrik@localhost:5432/elentrik_e2e")).toContain(
      "elentrik_e2e",
    );
  });

  test("de echte database wordt geweigerd", () => {
    expect(() => eisE2eDatabase("postgres://elentrik:elentrik@127.0.0.1:5432/elentrik")).toThrow(
      "Geweigerd",
    );
  });

  test("een andere host, poort of databasenaam wordt geweigerd", () => {
    for (const url of [
      "postgres://elentrik:elentrik@db.voorbeeld.be:5432/elentrik_e2e",
      "postgres://elentrik:elentrik@127.0.0.1:5433/elentrik_e2e",
      "postgres://elentrik:elentrik@127.0.0.1/elentrik_e2e",
      "postgres://elentrik:elentrik@127.0.0.1:5432/andere_elentrik_e2e",
      "postgres://elentrik:elentrik@127.0.0.1:5432/elentrik_e2e/extra",
      "niet-een-url",
      "",
      undefined,
    ]) {
      expect(() => eisE2eDatabase(url as string | undefined), String(url)).toThrow("Geweigerd");
    }
  });
});

describe("e2e-bestandenmap", () => {
  test("is absoluut en ligt onder apps/web, onafhankelijk van de werkmap", () => {
    const web = WEB_DIR.split(sep).filter(Boolean);
    expect(web.slice(-2)).toEqual(["apps", "web"]);
    const bestanden = E2E_BESTANDEN_DIR.split(sep).filter(Boolean);
    expect(bestanden.slice(-4)).toEqual(["apps", "web", ".data", "e2e-bestanden"]);
    expect(isAbsolute(E2E_BESTANDEN_DIR)).toBe(true);
  });
});

describe("linkUitTekst", () => {
  const basis = E2E_URL;
  const links = {
    herstel: `${basis}/reset-password?token=abc123XYZ`,
    bevestiging: `${basis}/api/auth/verify-email?token=eyJhbGciOi.s3cr3t-_x&callbackURL=%2Fprojecten`,
    uitnodiging: `${basis}/uitnodiging/3f2a9c1e-7b64-4d8e-9a10-5c2b7e8d4f60`,
    magic: `${basis}/api/auth/magic-link/verify?token=ssss&callbackURL=%2F`,
  };

  test.each(TALEN)("haalt de herstellink exact uit de herstelmail in het %s (met s'en en punten)", (taal) => {
    const mail = herstelMail({ naam: "Jan", link: links.herstel, taal });
    expect(linkUitTekst(mail.tekst, basis)).toBe(links.herstel);
  });

  test.each(TALEN)("haalt de bevestigingslink met & en %-codes exact uit de tekst in het %s, zonder &amp;", (taal) => {
    const mail = bevestigMail({ naam: "Jan", link: links.bevestiging, taal });
    const gevonden = linkUitTekst(mail.tekst, basis);
    expect(gevonden).toBe(links.bevestiging);
    expect(gevonden).not.toContain("&amp;");
  });

  test.each(TALEN)("haalt de uitnodigingslink en de magic link exact uit hun mails in het %s", (taal) => {
    const uitnodiging = uitnodigingMail({
      uitnodiger: "Els",
      organisatie: "Janssens Elektro",
      rol: "lid",
      link: links.uitnodiging,
      taal,
    });
    expect(linkUitTekst(uitnodiging.tekst, basis)).toBe(links.uitnodiging);
    expect(linkUitTekst(magicLinkMail({ link: links.magic, taal }).tekst, basis)).toBe(links.magic);
  });

  test("stopt bij witruimte, < , > en aanhalingstekens", () => {
    expect(linkUitTekst(`Klik ${basis}/a/b?x=1 daarna meer`, basis)).toBe(`${basis}/a/b?x=1`);
    expect(linkUitTekst(`<a href="${basis}/a">`, basis)).toBe(`${basis}/a`);
  });

  test("de punten van de host zijn letterlijk, en een andere host telt niet", () => {
    expect(() => linkUitTekst("http://127x0x0x1:3100/a", basis)).toThrow("Geen link");
    expect(() => linkUitTekst("http://127.0.0.1:3000/a", basis)).toThrow("Geen link");
  });
});
