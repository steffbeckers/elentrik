import { describe, expect, test } from "vitest";
import { BERICHTEN, REGELSETS, haalRegelset } from "../src/index";

describe("haalRegelset", () => {
  test("geeft arei-2020@1 terug", () => {
    const set = haalRegelset("arei-2020@1");
    expect(set.id).toBe("arei-2020");
    expect(set.versie).toBe(1);
  });

  test("gooit ONBEKENDE_REGELSET voor een onbekende sleutel", () => {
    expect(() => haalRegelset("x@9")).toThrow("ONBEKENDE_REGELSET: x@9");
  });
});

describe("arei-2020@1", () => {
  test("bevat de 10 regels in volgorde en is niet gepubliceerd", () => {
    const set = haalRegelset("arei-2020@1");
    expect(set.gepubliceerd).toBe(false);
    expect(set.regels.map((r) => r.id)).toEqual([
      "arei.differentieel.algemeen",
      "arei.differentieel.natte-ruimte",
      "arei.kring.doorsnede-beveiliging",
      "arei.kring.max-contactdozen",
      "arei.kring.min-doorsnede",
      "arei.toestel.eigen-kring",
      "arei.polen.stroomtype",
      "arei.situatie.niet-geplaatst",
      "arei.leiding.onvolledig",
      "arei.punt.zonder-beveiliging",
    ]);
  });
});

describe("waarborgen", () => {
  test("een gepubliceerde regelset bevat enkel nagekeken regels met een artikel", () => {
    for (const [sleutel, set] of Object.entries(REGELSETS)) {
      if (!set.gepubliceerd) continue;
      for (const regel of set.regels) {
        expect(regel.nagekeken, `${sleutel}/${regel.id} nagekeken`).toBe(true);
        expect(regel.artikel.trim(), `${sleutel}/${regel.id} artikel`).not.toBe("");
      }
    }
  });

  test("elke berichtSleutel van elke regel bestaat in nl, fr en en", () => {
    for (const [sleutel, set] of Object.entries(REGELSETS)) {
      for (const regel of set.regels) {
        for (const berichtSleutel of regel.berichtSleutels) {
          for (const taal of ["nl", "fr", "en"] as const) {
            const tekst = BERICHTEN[taal][berichtSleutel];
            expect(tekst, `${sleutel}/${regel.id} ${taal} ${berichtSleutel}`).toBeTypeOf("string");
            expect(tekst?.trim(), `${sleutel}/${regel.id} ${taal} ${berichtSleutel} leeg`).not.toBe("");
          }
        }
      }
    }
  });
});
