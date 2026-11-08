// Het compatibiliteitsgetal tussen client en server: lezen van de header, wanneer de server een
// schrijfactie weigert, en de regels van de client.
import { SCHEMA_VERSIE } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { CLIENT_COMPATIBILITEIT, leesClientversie, moetWeigeren } from "../shared/clientversie";
import { isNieuweVersieFout, verschiltVanClient } from "../app/versie/regels";

describe("leesClientversie", () => {
  test("een geheel getal vanaf 1", () => {
    expect(leesClientversie("1")).toBe(1);
    expect(leesClientversie("12")).toBe(12);
  });

  test.each(["0", "-1", "1.5", "abc", "", null, undefined])("%j geeft null", (waarde) => {
    expect(leesClientversie(waarde)).toBeNull();
  });
});

describe("moetWeigeren", () => {
  test("een schrijfactie met een ander getal wordt geweigerd", () => {
    expect(moetWeigeren("POST", 1, 2)).toBe(true);
    expect(moetWeigeren("PUT", 3, 2)).toBe(true); // terugrol van de server
    expect(moetWeigeren("PATCH", 1, 2)).toBe(true);
  });

  test("hetzelfde getal gaat door", () => {
    expect(moetWeigeren("DELETE", 2, 2)).toBe(false);
  });

  test("lezen gaat altijd door", () => {
    expect(moetWeigeren("GET", 1, 2)).toBe(false);
    expect(moetWeigeren("HEAD", 1, 2)).toBe(false);
    expect(moetWeigeren("OPTIONS", 1, 2)).toBe(false);
  });

  test("zonder getal gaat het door", () => {
    expect(moetWeigeren("POST", null, 2)).toBe(false);
  });

  test("de methode is hoofdletterongevoelig", () => {
    expect(moetWeigeren("post", 1, 2)).toBe(true);
    expect(moetWeigeren("get", 1, 2)).toBe(false);
  });
});

test("het eigen getal is een geldig getal", () => {
  expect(leesClientversie(String(CLIENT_COMPATIBILITEIT))).toBe(CLIENT_COMPATIBILITEIT);
});

describe("verschiltVanClient", () => {
  test("een ander getal verschilt", () => {
    expect(verschiltVanClient("2", 1)).toBe(true);
  });

  test("hetzelfde getal, geen waarde of een onleesbare waarde niet", () => {
    expect(verschiltVanClient("1", 1)).toBe(false);
    expect(verschiltVanClient(null, 1)).toBe(false);
    expect(verschiltVanClient("x", 1)).toBe(false);
  });
});

describe("isNieuweVersieFout", () => {
  test("426 met de code NIEUWE_VERSIE_VEREIST", () => {
    expect(isNieuweVersieFout({ status: 426, data: { data: { code: "NIEUWE_VERSIE_VEREIST" } } })).toBe(true);
  });

  test("een 426 met een andere code niet", () => {
    expect(isNieuweVersieFout({ status: 426, data: { data: { code: "ANDERE" } } })).toBe(false);
  });

  test("een 401 niet", () => {
    expect(isNieuweVersieFout({ status: 401, data: { data: { code: "NIET_AANGEMELD" } } })).toBe(false);
  });
});

describe("CLIENT_COMPATIBILITEIT en SCHEMA_VERSIE", () => {
  // Migratie maakt oude dossiers leesbaar, maar beschermt niet tegen oude editors die nieuwe
  // velden/onderdelen verliezen. Het aparte HTTP-contract blokkeert hun schrijfacties.
  // Compatibiliteit 3: de metingen (meta.metingen, testResultaat en uitschakeltijd_ms per
  // differentieel) zijn optioneel binnen schema 2, maar een editor van client 2 kent ze niet. Zijn
  // documentkopie zou ze bij bewaren wegschrijven, dus de server weigert zijn schrijfacties.
  // Compatibiliteit 4: het prijsmodel. `Toegang.schrijven` werd `niveau` en de 402-codes werden
  // PROJECT_LIMIET en PROJECT_ALLEEN_LEZEN; een client 3 leest de toegang en de weigering verkeerd.
  test("het beoordeelde paar blijft bij elkaar (schema 2, compatibiliteit 4)", () => {
    expect(
      [SCHEMA_VERSIE, CLIENT_COMPATIBILITEIT],
      "Verhoog je SCHEMA_VERSIE (packages/model), controleer dan of CLIENT_COMPATIBILITEIT " +
        "(apps/web/shared/clientversie.ts) mee omhoog moet, en voeg een migratie toe in MIGRATIES; " +
        "verhoog je CLIENT_COMPATIBILITEIT, controleer dan SCHEMA_VERSIE. Pas daarna dit paar aan.",
    ).toEqual([2, 4]);
  });
});
