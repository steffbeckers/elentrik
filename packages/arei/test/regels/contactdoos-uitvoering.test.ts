import { describe, expect, test } from "vitest";
import { installatie } from "../../src/testing/index";
import { maakRegelContactdoosUitvoering } from "../../src/regelsets/arei-2020/regels/contactdoos-uitvoering";
import { draaiRegel, metContext } from "../hulp";

const ID = "arei.contactdoos.uitvoering";

const metContactdoos = (opties: { randaarde?: boolean; kinderbeveiliging?: boolean }) =>
  installatie()
    .verdeelbord((b) => b.kring((k) => k.automaat(20).leiding(2.5).contactdozen(1, opties).als("cd")))
    .bouw();

describe("contactdoos.uitvoering", () => {
  const regel = maakRegelContactdoosUitvoering();

  test("is een voorlopige waarschuwing zonder artikel", () => {
    expect(regel.id).toBe(ID);
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("waarschuwing");
  });

  test("een contactdoos met randaarde en kinderbeveiliging geeft niets", () => {
    expect(draaiRegel(regel, metContext(metContactdoos({}).doc, "nieuw"))).toEqual([]);
  });

  test("zonder randaarde in een nieuwe installatie: waarschuwing op de contactdoos", () => {
    const { doc, ids } = metContactdoos({ randaarde: false });
    expect(draaiRegel(regel, metContext(doc, "nieuw"))).toEqual([
      {
        regelId: ID,
        ernst: "waarschuwing",
        nodeIds: [ids["cd"]],
        berichtSleutel: `${ID}.randaarde`,
        parameters: {},
        afgeweken: false,
      },
    ]);
  });

  test("zonder kinderbeveiliging in een nieuwe installatie: waarschuwing op de contactdoos", () => {
    const { doc, ids } = metContactdoos({ kinderbeveiliging: false });
    expect(draaiRegel(regel, metContext(doc, "nieuw"))).toEqual([
      {
        regelId: ID,
        ernst: "waarschuwing",
        nodeIds: [ids["cd"]],
        berichtSleutel: `${ID}.kinderbeveiliging`,
        parameters: {},
        afgeweken: false,
      },
    ]);
  });

  test("een contactdoos met beide gebreken krijgt twee bevindingen", () => {
    const { doc } = metContactdoos({ randaarde: false, kinderbeveiliging: false });
    expect(
      draaiRegel(regel, metContext(doc, "nieuw"))
        .map((b) => b.berichtSleutel)
        .sort(),
    ).toEqual([`${ID}.kinderbeveiliging`, `${ID}.randaarde`]);
  });

  test.each([undefined, "bestaand", "onbekend"] as const)("context %s: de regel geldt alleen voor nieuw", (context) => {
    const { doc } = metContactdoos({ randaarde: false, kinderbeveiliging: false });
    expect(draaiRegel(regel, metContext(doc, context))).toEqual([]);
  });
});
