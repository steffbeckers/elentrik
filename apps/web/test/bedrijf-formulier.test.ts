import { describe, expect, test, vi } from "vitest";
import type { Partij } from "@elentrik/model";
import { MAX_LOGO_BYTES } from "../shared/bestandsinhoud";
import {
  controleerLogo,
  logoUploadFout,
  formulierUitPartij,
  leegFormulier,
  partijUitFormulier,
  valideerFormulier,
  type BedrijfFormulier,
} from "../app/instellingen/formulier";
import { laadBedrijf } from "../app/instellingen/laden";
import { maakBedrijfBewaarder, type BewaarderToestand } from "../app/instellingen/bewaarder";

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

describe("logoUploadFout", () => {
  const fetchFout = (status: number, code?: string) =>
    Object.assign(new Error(`HTTP ${status}`), { status, ...(code ? { data: { data: { code } } } : {}) });

  test.each([
    [fetchFout(413, "OPSLAG_VOL"), "opslagVol"],
    [fetchFout(413, "BESTAND_TE_GROOT"), "teGroot"],
    [fetchFout(413), "teGroot"],
    [fetchFout(415, "BESTANDSTYPE_NIET_TOEGELATEN"), "onbekendType"],
    [fetchFout(500), "mislukt"],
    [new Error("netwerk"), "mislukt"],
  ])("%#: %s", (fout, sleutel) => {
    expect(logoUploadFout(fout)).toBe(sleutel);
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

describe("maakBedrijfBewaarder", () => {
  const ANDERE = { statusCode: 409, data: { code: "ANDERE_ORGANISATIE" } };

  function opzet(geladenVoor: string | null = "org-a") {
    const toestand: BewaarderToestand = { geladenVoor, bezig: false, logoBezig: false };
    const bewaar = vi.fn(async (partij: Partij, _organisatieId: string): Promise<Partij> => partij);
    const uploadLogo = vi.fn(async (_bestand: Blob, _naam: string, _organisatieId: string) => ({
      id: "l1",
      mime: "image/png",
      grootte: 1,
    }));
    const andereOrganisatie = vi.fn(async (fout: unknown) => fout === ANDERE);
    const herlaad = vi.fn(async () => {});
    const bewaarder = maakBedrijfBewaarder(toestand, { bewaar, uploadLogo, andereOrganisatie, herlaad });
    return { toestand, bewaar, uploadLogo, andereOrganisatie, herlaad, bewaarder };
  }

  test("bewaart voor het bedrijf waarvoor het formulier geladen werd", async () => {
    const { bewaar, bewaarder } = opzet("org-a");
    const uitkomst = await bewaarder.bewaar({ naam: "Peeters" });
    expect(uitkomst).toEqual({ status: "gedaan", waarde: { naam: "Peeters" } });
    expect(bewaar).toHaveBeenCalledWith({ naam: "Peeters" }, "org-a");
  });

  test("het logo gaat naar hetzelfde bedrijf", async () => {
    const { uploadLogo, bewaarder } = opzet("org-a");
    const bestand = new Blob([new Uint8Array([1])]);
    await bewaarder.uploadLogo(bestand, "logo.png");
    expect(uploadLogo).toHaveBeenCalledWith(bestand, "logo.png", "org-a");
  });

  test("zolang er niets geladen is, wordt er niets bewaard", async () => {
    const { bewaar, uploadLogo, bewaarder } = opzet(null);
    expect(await bewaarder.bewaar({ naam: "x" })).toEqual({ status: "overgeslagen" });
    expect(await bewaarder.uploadLogo(new Blob([]), "x.png")).toEqual({ status: "overgeslagen" });
    expect(bewaar).not.toHaveBeenCalled();
    expect(uploadLogo).not.toHaveBeenCalled();
  });

  test("een tweede bewaaractie tijdens een lopende geeft geen tweede verzoek", async () => {
    const { bewaar, toestand, bewaarder } = opzet();
    let rond: (() => void) | undefined;
    bewaar.mockImplementationOnce(
      (partij) =>
        new Promise((klaar) => {
          rond = () => klaar(partij);
        }),
    );
    const eerste = bewaarder.bewaar({ naam: "een" });
    expect(toestand.bezig).toBe(true);
    expect(await bewaarder.bewaar({ naam: "twee" })).toEqual({ status: "overgeslagen" });
    expect(bewaar).toHaveBeenCalledTimes(1);
    rond?.();
    expect(await eerste).toEqual({ status: "gedaan", waarde: { naam: "een" } });
    expect(toestand.bezig).toBe(false);
    // Daarna kan bewaren weer.
    await bewaarder.bewaar({ naam: "drie" });
    expect(bewaar).toHaveBeenCalledTimes(2);
  });

  test("na een 409 ANDERE_ORGANISATIE wordt eerst herladen; zolang kan er niet bewaard worden", async () => {
    const { bewaar, toestand, herlaad, andereOrganisatie, bewaarder } = opzet("org-a");
    bewaar.mockRejectedValueOnce(ANDERE);
    let tijdensHerladen: Awaited<ReturnType<typeof bewaarder.bewaar>> | undefined;
    herlaad.mockImplementationOnce(async () => {
      expect(toestand.geladenVoor).toBeNull();
      tijdensHerladen = await bewaarder.bewaar({ naam: "te vroeg" });
      // Het herladen zet het formulier voor het actieve bedrijf klaar.
      toestand.geladenVoor = "org-b";
    });

    expect(await bewaarder.bewaar({ naam: "Peeters" })).toEqual({ status: "andereOrganisatie" });
    expect(andereOrganisatie).toHaveBeenCalledTimes(1);
    expect(herlaad).toHaveBeenCalledTimes(1);
    expect(tijdensHerladen).toEqual({ status: "overgeslagen" });
    expect(bewaar).toHaveBeenCalledTimes(1);
    expect(toestand.bezig).toBe(false);

    await bewaarder.bewaar({ naam: "Nieuw" });
    expect(bewaar).toHaveBeenLastCalledWith({ naam: "Nieuw" }, "org-b");
  });

  test("een 409 ANDERE_ORGANISATIE bij het logo herlaadt ook", async () => {
    const { uploadLogo, herlaad, toestand, bewaarder } = opzet("org-a");
    uploadLogo.mockRejectedValueOnce(ANDERE);
    expect(await bewaarder.uploadLogo(new Blob([]), "x.png")).toEqual({ status: "andereOrganisatie" });
    expect(herlaad).toHaveBeenCalledTimes(1);
    expect(toestand.geladenVoor).toBeNull();
    expect(toestand.logoBezig).toBe(false);
  });

  test("hoort het formulier na het bewaren bij een ander bedrijf, dan is het antwoord verlopen en blijft het formulier ongemoeid", async () => {
    const { bewaar, uploadLogo, toestand, bewaarder } = opzet("org-a");
    bewaar.mockImplementationOnce(async (partij) => {
      // Een wissel tijdens de aanvraag: het formulier is voor een ander bedrijf (aan het) laden.
      toestand.geladenVoor = null;
      return partij;
    });
    expect(await bewaarder.bewaar({ naam: "A" })).toEqual({ status: "verlopen" });
    expect(toestand.bezig).toBe(false);

    toestand.geladenVoor = "org-a";
    uploadLogo.mockImplementationOnce(async () => {
      toestand.geladenVoor = "org-b";
      return { id: "l1", mime: "image/png", grootte: 1 };
    });
    expect(await bewaarder.uploadLogo(new Blob([]), "x.png")).toEqual({ status: "verlopen" });
    expect(toestand.logoBezig).toBe(false);
  });

  test("een andere fout wordt doorgegeven en laat het formulier geladen", async () => {
    const { bewaar, herlaad, toestand, bewaarder } = opzet("org-a");
    const fout = new Error("netwerk");
    bewaar.mockRejectedValueOnce(fout);
    await expect(bewaarder.bewaar({ naam: "x" })).rejects.toBe(fout);
    expect(herlaad).not.toHaveBeenCalled();
    expect(toestand.geladenVoor).toBe("org-a");
    expect(toestand.bezig).toBe(false);
  });
});

describe("laadBedrijf", () => {
  const ANDERE = { status: 409, data: { statusCode: 409, data: { code: "ANDERE_ORGANISATIE" } } };

  function opzet(actief: string | null = "org-a") {
    let huidig = actief;
    const haal = vi.fn(async (_organisatieId: string | null): Promise<Partij> => ({ naam: "Peeters" }));
    const herleesSessie = vi.fn(async () => {
      huidig = "org-b";
    });
    const opties = { haal, organisatieId: () => huidig, herleesSessie };
    return { haal, herleesSessie, opties };
  }

  test("laadt voor het actieve bedrijf en geeft dat bedrijf terug", async () => {
    const { haal, herleesSessie, opties } = opzet("org-a");
    expect(await laadBedrijf(opties)).toEqual({ partij: { naam: "Peeters" }, organisatieId: "org-a" });
    expect(haal).toHaveBeenCalledExactlyOnceWith("org-a");
    expect(herleesSessie).not.toHaveBeenCalled();
  });

  test("een 409 ANDERE_ORGANISATIE: sessie herlezen en nog een keer laden voor het nieuwe bedrijf", async () => {
    const { haal, herleesSessie, opties } = opzet("org-a");
    haal.mockRejectedValueOnce(ANDERE);
    expect(await laadBedrijf(opties)).toEqual({ partij: { naam: "Peeters" }, organisatieId: "org-b" });
    expect(herleesSessie).toHaveBeenCalledTimes(1);
    expect(haal.mock.calls.map(([id]) => id)).toEqual(["org-a", "org-b"]);
  });

  test("een tweede 409 wordt doorgegeven (geen lus)", async () => {
    const { haal, opties } = opzet("org-a");
    haal.mockRejectedValue(ANDERE);
    await expect(laadBedrijf(opties)).rejects.toBe(ANDERE);
    expect(haal).toHaveBeenCalledTimes(2);
  });

  test("een andere fout wordt doorgegeven zonder de sessie te herlezen", async () => {
    const { haal, herleesSessie, opties } = opzet("org-a");
    const fout = { status: 500 };
    haal.mockRejectedValueOnce(fout);
    await expect(laadBedrijf(opties)).rejects.toBe(fout);
    expect(herleesSessie).not.toHaveBeenCalled();
  });
});
