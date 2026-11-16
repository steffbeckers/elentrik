import { describe, expect, test } from "vitest";
import { installatie } from "../../src/testing/index";
import { PARAMETERS_AREI_2020_V1 } from "../../src/regelsets/arei-2020/parameters";
import { maakRegelLaadpaalDifferentieel } from "../../src/regelsets/arei-2020/regels/laadpaal-differentieel";
import { draaiRegel, metContext } from "../hulp";

const ID = "arei.laadpaal.differentieel";

/** Laadpaal achter een eigen differentieel `diff` onder het algemene van 300 mA. */
const metDifferentieel = (mA: number, klasse: "AC" | "A" | "F" | "B", dcDetectie_mA?: number) =>
  installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b.differentieel(
          mA,
          (n) =>
            n.kring((k) =>
              k
                .automaat(32)
                .leiding(10)
                .toestel("laadpaal", dcDetectie_mA === undefined ? {} : { dcDetectie_mA })
                .als("laadpaal"),
            ),
          { klasse, als: "diff" },
        ),
      ),
    )
    .bouw();

describe("laadpaal.differentieel", () => {
  const regel = maakRegelLaadpaalDifferentieel(PARAMETERS_AREI_2020_V1);

  test("is voorlopig, zonder artikel", () => {
    expect(regel.id).toBe(ID);
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("fout");
  });

  test.each([undefined, "nieuw", "bestaand"] as const)(
    "een laadpaal zonder differentieel van 30 mA is een fout (context %s)",
    (context) => {
      const { doc, ids } = installatie()
        .differentieel(300, (d) =>
          d.verdeelbord((b) => b.kring((k) => k.automaat(32).leiding(10).toestel("laadpaal").als("laadpaal"))),
        )
        .bouw();
      expect(draaiRegel(regel, metContext(doc, context))).toEqual([
        {
          regelId: ID,
          ernst: "fout",
          nodeIds: [ids["laadpaal"]],
          berichtSleutel: `${ID}.ontbreekt`,
          parameters: { max: 30 },
          afgeweken: false,
        },
      ]);
    },
  );

  test("een differentieel van 100 mA volstaat niet", () => {
    expect(draaiRegel(regel, metDifferentieel(100, "B").doc).map((b) => b.berichtSleutel)).toEqual([`${ID}.ontbreekt`]);
  });

  test("het algemene differentieel telt niet, ook niet bij 30 mA type B", () => {
    const { doc } = installatie()
      .differentieel(30, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(32).leiding(10).toestel("laadpaal"))), {
        klasse: "B",
      })
      .bouw();
    expect(draaiRegel(regel, doc).map((b) => b.berichtSleutel)).toEqual([`${ID}.ontbreekt`]);
  });

  test("30 mA type B geeft niets", () => {
    expect(draaiRegel(regel, metDifferentieel(30, "B").doc)).toEqual([]);
  });

  test("30 mA type A zonder DC-detectie geeft een waarschuwing op de laadpaal", () => {
    const { doc, ids } = metDifferentieel(30, "A");
    expect(draaiRegel(regel, doc)).toEqual([
      {
        regelId: ID,
        ernst: "waarschuwing",
        nodeIds: [ids["laadpaal"], ids["diff"]],
        berichtSleutel: `${ID}.type`,
        parameters: { max: 6 },
        afgeweken: false,
      },
    ]);
  });

  test("30 mA type A met DC-detectie van 6 mA geeft niets", () => {
    expect(draaiRegel(regel, metDifferentieel(30, "A", 6).doc)).toEqual([]);
  });

  test("DC-detectie boven 6 mA volstaat niet", () => {
    expect(draaiRegel(regel, metDifferentieel(30, "A", 30).doc).map((b) => b.berichtSleutel)).toEqual([`${ID}.type`]);
  });

  test("een ander toestel valt niet onder de regel", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(32).leiding(6).toestel("kookplaat"))))
      .bouw();
    expect(draaiRegel(regel, doc)).toEqual([]);
  });
});
