import type { Adres } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import {
  adresFormulierUitAdres,
  adresUitFormulier,
  heeftAdres,
  leegAdresFormulier,
  ontbrekendeAdresvelden,
  volledigAdresUitFormulier,
  zelfdeAdres,
  type AdresFormulier,
} from "../app/editor/adres";

function formulier(wijziging: Partial<AdresFormulier> = {}): AdresFormulier {
  return { ...leegAdresFormulier(), ...wijziging };
}

const volledig = { straat: "Kerkstraat", nummer: "12", postcode: "2000", gemeente: "Antwerpen" };

describe("adresformulier", () => {
  test("leeg: land staat op België, de rest is leeg", () => {
    expect(leegAdresFormulier()).toEqual({
      straat: "",
      nummer: "",
      bus: "",
      postcode: "",
      gemeente: "",
      land: "België",
    });
  });

  test("uit een adres, en uit niets", () => {
    const adres: Adres = { ...volledig, bus: "3", land: "Nederland" };
    expect(adresFormulierUitAdres(adres)).toEqual({ ...volledig, bus: "3", land: "Nederland" });
    expect(adresFormulierUitAdres(undefined)).toEqual(leegAdresFormulier());
  });

  test("het land alleen telt niet als adres", () => {
    expect(heeftAdres(formulier({ land: "Nederland" }))).toBe(false);
    expect(heeftAdres(formulier({ bus: "2" }))).toBe(true);
    expect(heeftAdres(formulier({ straat: "  " }))).toBe(false);
  });

  test("ontbrekende velden: niets bij een leeg adres, de rest bij een gedeeltelijk adres", () => {
    expect(ontbrekendeAdresvelden(formulier())).toEqual([]);
    expect(ontbrekendeAdresvelden(formulier({ straat: "K" }))).toEqual(["nummer", "postcode", "gemeente"]);
    expect(ontbrekendeAdresvelden(formulier(volledig))).toEqual([]);
  });

  test("adresUitFormulier: undefined bij een leeg adres, anders getrimd met België als terugval", () => {
    expect(adresUitFormulier(formulier({ land: "Nederland" }))).toBeUndefined();
    expect(adresUitFormulier(formulier({ ...volledig, straat: " Kerkstraat ", land: " " }))).toEqual({
      ...volledig,
      land: "België",
    });
    expect("bus" in (adresUitFormulier(formulier(volledig)) ?? {})).toBe(false);
    expect(adresUitFormulier(formulier({ ...volledig, bus: "b" }))?.bus).toBe("b");
  });

  test("volledigAdresUitFormulier bouwt ook een adres uit lege velden", () => {
    expect(volledigAdresUitFormulier(formulier())).toEqual({
      straat: "",
      nummer: "",
      postcode: "",
      gemeente: "",
      land: "België",
    });
  });

  test("zelfdeAdres vergelijkt op inhoud; ontbrekend is gelijk aan ontbrekend", () => {
    const a: Adres = { ...volledig, land: "België" };
    expect(zelfdeAdres(a, { ...a })).toBe(true);
    expect(zelfdeAdres(a, { ...a, bus: "1" })).toBe(false);
    expect(zelfdeAdres(a, { ...a, gemeente: "Gent" })).toBe(false);
    expect(zelfdeAdres(undefined, undefined)).toBe(true);
    expect(zelfdeAdres(a, undefined)).toBe(false);
    expect(zelfdeAdres(undefined, a)).toBe(false);
  });
});
