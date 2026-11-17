import { describe, expect, test } from "vitest";
import { installatie } from "../../src/testing/index";
import { maakRegelDifferentieelTypeAc } from "../../src/regelsets/arei-2020/regels/differentieel-type-ac";
import { draaiRegel, metContext } from "../hulp";

const ID = "arei.differentieel.type-ac";

const woning = (klasse: "AC" | "A" | "F" | "B") =>
  installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b.differentieel(30, (n) => n.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1)), { klasse, als: "diff" }),
      ),
    )
    .bouw();

describe("differentieel.type-ac", () => {
  const regel = maakRegelDifferentieelTypeAc();

  test("is voorlopig en verwijst naar 4.2.4.3", () => {
    expect(regel.id).toBe(ID);
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("4.2.4.3");
    expect(regel.ernst).toBe("fout");
  });

  test.each(["A", "F", "B"] as const)("type %s geeft niets", (klasse) => {
    expect(draaiRegel(regel, metContext(woning(klasse).doc, "nieuw"))).toEqual([]);
  });

  test("type AC in een nieuwe installatie is een fout op het differentieel", () => {
    const { doc, ids } = woning("AC");
    expect(draaiRegel(regel, metContext(doc, "nieuw"))).toEqual([
      {
        regelId: ID,
        ernst: "fout",
        nodeIds: [ids["diff"]],
        berichtSleutel: `${ID}.niet-toegelaten`,
        parameters: {},
        afgeweken: false,
      },
    ]);
  });

  test.each([undefined, "bestaand", "onbekend"] as const)("context %s geeft een waarschuwing", (context) => {
    const { doc, ids } = woning("AC");
    expect(draaiRegel(regel, metContext(doc, context))).toEqual([
      {
        regelId: ID,
        ernst: "waarschuwing",
        nodeIds: [ids["diff"]],
        berichtSleutel: `${ID}.context`,
        parameters: {},
        afgeweken: false,
      },
    ]);
  });

  test("ook het algemene differentieel wordt gemeld", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))), {
        klasse: "AC",
        als: "algemeen",
      })
      .bouw();
    expect(draaiRegel(regel, metContext(doc, "nieuw")).map((b) => b.nodeIds)).toEqual([[ids["algemeen"]]]);
  });
});
