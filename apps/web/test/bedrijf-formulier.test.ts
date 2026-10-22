import { describe, expect, test } from "vitest";
import type { Partij } from "@elentrik/model";
import { MAX_LOGO_BYTES } from "../shared/bestandsinhoud";
import {
  controleerLogo,
  formulierUitPartij,
  leegFormulier,
  partijUitFormulier,
  valideerFormulier,
  type BedrijfFormulier,
} from "../app/instellingen/formulier";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

function formulier(wijziging: Partial<BedrijfFormulier> = {}): BedrijfFormulier {
  return { ...leegFormulier(), naam: "Elektro Peeters", ...wijziging };
}

describe("leegFormulier", () => {
  test("land staat standaard op België en de rest is leeg", () => {
    expect(leegFormulier()).toEqual({
      naam: "",
      ondernemingsnummer: "",
      telefoon: "",
      email: "",
      straat: "",
      nummer: "",
      bus: "",
      postcode: "",
      gemeente: "",
      land: "België",
    });
  });
});

describe("formulierUitPartij", () => {
  test("zonder adres blijft land op België", () => {
    expect(formulierUitPartij({ naam: "Peeters" })).toEqual({ ...leegFormulier(), naam: "Peeters" });
  });

  test("neemt alle velden over, ook het adres", () => {
    const partij: Partij = {
      naam: "Peeters",
      ondernemingsnummer: "BE 0123.456.789",
      email: "info@peeters.be",
      telefoon: "03 123 45 67",
      adres: { straat: "Kerkstraat", nummer: "12", bus: "3", postcode: "2000", gemeente: "Antwerpen", land: "Nederland" },
      logoBestandId: "l1",
    };
    expect(formulierUitPartij(partij)).toEqual({
      naam: "Peeters",
      ondernemingsnummer: "BE 0123.456.789",
      email: "info@peeters.be",
      telefoon: "03 123 45 67",
      straat: "Kerkstraat",
      nummer: "12",
      bus: "3",
      postcode: "2000",
      gemeente: "Antwerpen",
      land: "Nederland",
    });
  });
});

describe("partijUitFormulier", () => {
  test("laat lege optionele velden weg en stuurt geen adres als het adres leeg is", () => {
    const partij = partijUitFormulier(formulier());
    expect(partij).toEqual({ naam: "Elektro Peeters" });
    expect("adres" in partij).toBe(false);
    expect("email" in partij).toBe(false);
  });

  test("trimt waarden en laat velden met enkel spaties weg", () => {
    expect(
      partijUitFormulier(formulier({ naam: "  Peeters  ", email: "  ", telefoon: " 03 1 ", ondernemingsnummer: " BE 1 " })),
    ).toEqual({ naam: "Peeters", telefoon: "03 1", ondernemingsnummer: "BE 1" });
  });

  test("een volledig adres wordt getrimd meegestuurd; een lege bus ontbreekt", () => {
    const partij = partijUitFormulier(
      formulier({ straat: " Kerkstraat ", nummer: "12", postcode: "2000", gemeente: "Antwerpen", land: "België" }),
    );
    expect(partij).toEqual({
      naam: "Elektro Peeters",
      adres: { straat: "Kerkstraat", nummer: "12", postcode: "2000", gemeente: "Antwerpen", land: "België" },
    });
    expect("bus" in (partij.adres ?? {})).toBe(false);
  });

  test("een ingevulde bus gaat mee", () => {
    const partij = partijUitFormulier(
      formulier({ straat: "K", nummer: "1", bus: "b2", postcode: "2000", gemeente: "A" }),
    );
    expect(partij.adres?.bus).toBe("b2");
  });

  test("een land zonder de andere adresvelden telt als geen adres", () => {
    expect(partijUitFormulier(formulier({ land: "België" })).adres).toBeUndefined();
    expect(partijUitFormulier(formulier({ land: "" })).adres).toBeUndefined();
    expect(partijUitFormulier(formulier({ land: "Nederland" })).adres).toBeUndefined();
  });

  test("een ander land gaat mee zodra het adres ingevuld is", () => {
    const partij = partijUitFormulier(
      formulier({ straat: "K", nummer: "1", postcode: "2000", gemeente: "A", land: "Nederland" }),
    );
    expect(partij.adres?.land).toBe("Nederland");
  });

  test("een leeg land bij een ingevuld adres valt terug op België", () => {
    const partij = partijUitFormulier(
      formulier({ straat: "K", nummer: "1", postcode: "2000", gemeente: "A", land: " " }),
    );
    expect(partij.adres?.land).toBe("België");
  });

  test("stuurt nooit een logoBestandId mee", () => {
    expect("logoBestandId" in partijUitFormulier(formulier())).toBe(false);
  });
});

describe("valideerFormulier", () => {
  test("een geldig formulier zonder adres heeft geen fouten", () => {
    expect(valideerFormulier(formulier())).toEqual([]);
  });

  test("de naam is verplicht", () => {
    expect(valideerFormulier(formulier({ naam: "   " }))).toEqual([{ name: "naam", fout: "naamVerplicht" }]);
  });

  test("een gedeeltelijk adres vraagt de ontbrekende verplichte velden", () => {
    expect(valideerFormulier(formulier({ straat: "Kerkstraat" }))).toEqual([
      { name: "nummer", fout: "adresVerplicht" },
      { name: "postcode", fout: "adresVerplicht" },
      { name: "gemeente", fout: "adresVerplicht" },
    ]);
  });

  test("een bus alleen is al een gedeeltelijk adres", () => {
    expect(valideerFormulier(formulier({ bus: "2" })).map((f) => f.name)).toEqual([
      "straat",
      "nummer",
      "postcode",
      "gemeente",
    ]);
  });

  test("een gewijzigd land alleen is geen gedeeltelijk adres", () => {
    expect(valideerFormulier(formulier({ land: "Nederland" }))).toEqual([]);
  });

  test("een volledig adres is geldig", () => {
    expect(
      valideerFormulier(formulier({ straat: "K", nummer: "1", postcode: "2000", gemeente: "A" })),
    ).toEqual([]);
  });
});

describe("controleerLogo", () => {
  test("PNG en JPEG tot de limiet zijn goed", () => {
    expect(controleerLogo(100, PNG)).toEqual({ ok: true });
    expect(controleerLogo(MAX_LOGO_BYTES, JPEG)).toEqual({ ok: true });
  });

  test("te groot", () => {
    expect(controleerLogo(MAX_LOGO_BYTES + 1, PNG)).toEqual({ ok: false, reden: "te-groot" });
  });

  test("een PDF, SVG of onbekend type wordt geweigerd", () => {
    expect(controleerLogo(10, PDF)).toEqual({ ok: false, reden: "onbekend-type" });
    expect(controleerLogo(10, new TextEncoder().encode("<svg xmlns="))).toEqual({ ok: false, reden: "onbekend-type" });
    expect(controleerLogo(0, new Uint8Array())).toEqual({ ok: false, reden: "onbekend-type" });
  });
});
