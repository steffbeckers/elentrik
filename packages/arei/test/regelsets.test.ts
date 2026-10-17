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

describe("waarborgen", () => {
  test("een gepubliceerde regelset bevat enkel nagekeken regels met een artikel", () => {
    for (const [sleutel, set] of Object.entries(REGELSETS)) {
      if (!set.gepubliceerd) continue;
      for (const regel of set.regels) {
        expect(regel.nagekeken, `${sleutel}/${regel.id} nagekeken`).toBe(true);
        expect(regel.artikel, `${sleutel}/${regel.id} artikel`).not.toBe("");
      }
    }
  });

  test("elke berichtSleutel van elke regel bestaat in nl en fr", () => {
    for (const [sleutel, set] of Object.entries(REGELSETS)) {
      for (const regel of set.regels) {
        for (const berichtSleutel of regel.berichtSleutels) {
          expect(BERICHTEN.nl[berichtSleutel], `${sleutel}/${regel.id} nl ${berichtSleutel}`).toBeTypeOf("string");
          expect(BERICHTEN.fr[berichtSleutel], `${sleutel}/${regel.id} fr ${berichtSleutel}`).toBeTypeOf("string");
        }
      }
    }
  });
});
