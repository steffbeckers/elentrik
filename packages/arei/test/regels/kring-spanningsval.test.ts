import { describe, expect, test } from "vitest";
import { formatteerBericht } from "../../src/index";
import { installatie } from "../../src/testing/index";
import { PARAMETERS_AREI_2020_V1 } from "../../src/regelsets/arei-2020/parameters";
import { maakRegelKringSpanningsval } from "../../src/regelsets/arei-2020/regels/kring-spanningsval";
import { draaiRegel } from "../hulp";

const ID = "arei.kring.spanningsval";

/** Kring contactdozen: automaat 16 A, 2,5 mm². ΔU = 2 · L · 16 · 0,0225 / 2,5 = 0,288 · L volt. */
const contactdozen = (lengte_m: number | undefined) =>
  installatie()
    .verdeelbord((b) =>
      b.kring((k) =>
        k
          .automaat(16)
          .als("kring")
          .leiding(2.5, lengte_m === undefined ? {} : { lengte_m })
          .contactdozen(2),
      ),
    )
    .bouw();

/** Kring verlichting: automaat 10 A, 1,5 mm². ΔU = 2 · L · 10 · 0,0225 / 1,5 = 0,3 · L volt. */
const verlichting = (lengte_m: number) =>
  installatie()
    .verdeelbord((b) => b.kring((k) => k.automaat(10).leiding(1.5, { lengte_m }).schakelaar().lichtpunten(3)))
    .bouw();

describe("kring.spanningsval", () => {
  const regel = maakRegelKringSpanningsval(PARAMETERS_AREI_2020_V1);

  test("is een voorlopige info-regel zonder artikel: een richtwaarde, geen AREI-eis", () => {
    expect(regel.id).toBe(ID);
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("info");
  });

  test("zonder lengte geeft de regel niets", () => {
    expect(draaiRegel(regel, contactdozen(undefined).doc)).toEqual([]);
  });

  test("onder de richtwaarde van 5 % geeft de regel niets", () => {
    // 0,288 · 30 = 8,64 V = 3,8 %
    expect(draaiRegel(regel, contactdozen(30).doc)).toEqual([]);
  });

  test("boven 5 % volgt een melding op de kringbeveiliging met de berekende waarde", () => {
    // 0,288 · 45 = 12,96 V = 5,63 %
    const { doc, ids } = contactdozen(45);
    expect(draaiRegel(regel, doc)).toEqual([
      {
        regelId: ID,
        ernst: "info",
        nodeIds: [ids["kring"]],
        berichtSleutel: `${ID}.te-hoog`,
        parameters: { kring: "A", spanningsval: 5.6, max: 5 },
        afgeweken: false,
      },
    ]);
  });

  test("een waarde die afgerond op de richtwaarde valt, geeft geen melding", () => {
    // 0,288 · 40 = 11,52 V = 5,009 %
    expect(draaiRegel(regel, contactdozen(40).doc)).toEqual([]);
  });

  test("een kring met alleen verlichting heeft een richtwaarde van 3 %", () => {
    // 0,3 · 20 = 6 V = 2,6 %; 0,3 · 30 = 9 V = 3,9 %
    expect(draaiRegel(regel, verlichting(20).doc)).toEqual([]);
    expect(draaiRegel(regel, verlichting(30).doc)).toMatchObject([{ parameters: { spanningsval: 3.9, max: 3 } }]);
  });

  test("een gemengde kring volgt de richtwaarde van 5 %", () => {
    // Dezelfde 3,9 % als hierboven, maar met een contactdoos op de kring.
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(10).leiding(1.5, { lengte_m: 30 }).lichtpunten(3).contactdozen(1)))
      .bouw();
    expect(draaiRegel(regel, doc)).toEqual([]);
  });

  test("de lengtes worden opgeteld en de kleinste doorsnede telt", () => {
    // 2 · 50 · 16 · 0,0225 / 1,5 = 24 V = 10,4 %
    const { doc } = installatie()
      .verdeelbord((b) =>
        b.kring((k) => k.automaat(16).leiding(2.5, { lengte_m: 30 }).leiding(1.5, { lengte_m: 20 }).contactdozen(1)),
      )
      .bouw();
    expect(draaiRegel(regel, doc)).toMatchObject([{ parameters: { spanningsval: 10.4, max: 5 } }]);
  });

  test("één leiding zonder lengte of zonder doorsnede schakelt de berekening voor de kring uit", () => {
    const zonderLengte = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5, { lengte_m: 80 }).leiding(2.5).contactdozen(1)))
      .bouw();
    expect(draaiRegel(regel, zonderLengte.doc)).toEqual([]);
    const zonderDoorsnede = installatie()
      .verdeelbord((b) =>
        b.kring((k) => k.automaat(16).leiding(2.5, { lengte_m: 80 }).leiding(0, { lengte_m: 5 }).contactdozen(1)),
      )
      .bouw();
    expect(draaiRegel(regel, zonderDoorsnede.doc)).toEqual([]);
  });

  test("een kring zonder leiding geeft niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16)))
      .bouw();
    expect(draaiRegel(regel, doc)).toEqual([]);
  });

  test("een zekering rekent tweepolig tegenover 230 V", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.zekering(16).leiding(2.5, { lengte_m: 45 }).contactdozen(1)))
      .bouw();
    expect(draaiRegel(regel, doc)).toMatchObject([{ parameters: { spanningsval: 5.6, max: 5 } }]);
  });

  // 32 A over 100 m van 6 mm²: tweepolig 2 · 12 = 24 V; drie- of vierpolig √3 · 12 = 20,78 V.
  test.each([
    ["2x230V", 2, 10.4],
    ["3x230V", 3, 9],
    ["3N400V", 4, 5.2],
    ["3N400V", 2, 10.4],
  ] as const)("%s met %i polen: %s %%", (stroomtype, polen, verwacht) => {
    const { doc } = installatie({ stroomtype })
      .verdeelbord((b) => b.kring((k) => k.automaat(32, { polen }).leiding(6, { lengte_m: 100 }).toestel("laadpaal")))
      .bouw();
    expect(draaiRegel(regel, doc)).toMatchObject([{ parameters: { spanningsval: verwacht, max: 5 } }]);
  });

  test("het bericht toont het percentage met één decimaal in de notatie van de taal", () => {
    const [bevinding] = draaiRegel(regel, contactdozen(45).doc);
    expect(formatteerBericht(bevinding!, "nl")).toContain("5,6 %");
    expect(formatteerBericht(bevinding!, "fr")).toContain("5,6 %");
    expect(formatteerBericht(bevinding!, "en")).toContain("5.6%");
  });
});
