import { describe, expect, test } from "vitest";
import { installatie, type BordBouwer } from "../../src/testing/index";
import { PARAMETERS_AREI_2020_V1 } from "../../src/regelsets/arei-2020/parameters";
import { maakRegelDifferentieelMaxStroombanen } from "../../src/regelsets/arei-2020/regels/differentieel-max-stroombanen";
import { draaiRegel, metContext } from "../hulp";

const ID = "arei.differentieel.max-stroombanen";

const kringen = (n: number) => (b: BordBouwer) => {
  for (let i = 0; i < n; i++) b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1));
};

/** Algemeen differentieel van 300 mA met daaronder één differentieel `diff` dat `n` kringen voedt. */
const woning = (n: number, mA = 30) =>
  installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.differentieel(mA, kringen(n), { als: "diff" })))
    .bouw();

describe("differentieel.max-stroombanen", () => {
  const regel = maakRegelDifferentieelMaxStroombanen(PARAMETERS_AREI_2020_V1);

  test("is voorlopig en verwijst naar 4.2.4.3", () => {
    expect(regel.id).toBe(ID);
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("4.2.4.3");
    expect(regel.ernst).toBe("fout");
  });

  test("8 kringen achter een differentieel van 30 mA geven niets", () => {
    expect(draaiRegel(regel, metContext(woning(8).doc, "nieuw"))).toEqual([]);
  });

  test("9 kringen in een nieuwe installatie geven een fout op het differentieel", () => {
    const { doc, ids } = woning(9);
    expect(draaiRegel(regel, metContext(doc, "nieuw"))).toEqual([
      {
        regelId: ID,
        ernst: "fout",
        nodeIds: [ids["diff"]],
        berichtSleutel: `${ID}.overschreden`,
        parameters: { gevoeligheid: 30, aantal: 9, max: 8 },
        afgeweken: false,
      },
    ]);
  });

  test.each([undefined, "bestaand", "onbekend"] as const)("context %s geeft een waarschuwing", (context) => {
    const { doc, ids } = woning(9);
    expect(draaiRegel(regel, metContext(doc, context))).toEqual([
      {
        regelId: ID,
        ernst: "waarschuwing",
        nodeIds: [ids["diff"]],
        berichtSleutel: `${ID}.context`,
        parameters: { gevoeligheid: 30, aantal: 9, max: 8 },
        afgeweken: false,
      },
    ]);
  });

  test("een differentieel boven 30 mA valt niet onder de regel", () => {
    expect(draaiRegel(regel, metContext(woning(9, 100).doc, "nieuw"))).toEqual([]);
  });

  test("het algemene differentieel telt nooit mee, ook niet bij 30 mA", () => {
    const { doc } = installatie()
      .differentieel(30, (d) => d.verdeelbord(kringen(9)))
      .bouw();
    expect(draaiRegel(regel, metContext(doc, "nieuw"))).toEqual([]);
  });

  test("elk differentieel telt zijn eigen kringen", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .differentieel(30, kringen(8), { als: "vol" })
            .differentieel(30, kringen(9), { als: "te-veel" })
            .differentieel(30, kringen(2)),
        ),
      )
      .bouw();
    const bevindingen = draaiRegel(regel, metContext(doc, "nieuw"));
    expect(bevindingen.map((b) => [b.nodeIds, b.parameters["aantal"]])).toEqual([[[ids["te-veel"]], 9]]);
  });

  test("een kring telt bij het dichtstbijzijnde differentieel boven zijn beveiliging", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.differentieel(30, (buiten) => buiten.differentieel(30, kringen(9), { als: "binnen" }), { als: "buiten" }),
        ),
      )
      .bouw();
    expect(draaiRegel(regel, metContext(doc, "nieuw")).map((b) => b.nodeIds)).toEqual([[ids["binnen"]]]);
  });

  test("kringen van een onderbord zonder eigen differentieel tellen mee", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.differentieel(
            30,
            (n) => {
              kringen(6)(n);
              n.kring((k) => k.automaat(32).leiding(6).onderbord(kringen(2), "Garage"));
            },
            { als: "diff" },
          ),
        ),
      )
      .bouw();
    // 6 kringen, de voedende kring van het onderbord en de 2 kringen erin.
    expect(draaiRegel(regel, metContext(doc, "nieuw"))).toMatchObject([
      { nodeIds: [ids["diff"]], parameters: { aantal: 9, max: 8 } },
    ]);
  });
});
