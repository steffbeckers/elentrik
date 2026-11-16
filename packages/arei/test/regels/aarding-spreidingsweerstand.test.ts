import { describe, expect, test } from "vitest";
import { installatie } from "../../src/testing/index";
import { PARAMETERS_AREI_2020_V1 } from "../../src/regelsets/arei-2020/parameters";
import { maakRegelAardingSpreidingsweerstand } from "../../src/regelsets/arei-2020/regels/aarding-spreidingsweerstand";
import { draaiRegel, metAardingsweerstand, metContext, tellerVan } from "../hulp";

const ID = "arei.aarding.spreidingsweerstand";

/** Twee differentiëlen van 30 mA en de kookplaat achter 100 mA: voldoet ook boven 30 Ω. */
const goed = () =>
  installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .differentieel(30, (n) =>
            n
              .kring((k) => k.automaat(20).leiding(2.5).contactdozen(8))
              .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(4)),
          )
          .differentieel(30, (n) => n.kring((k) => k.automaat(20).leiding(2.5).toestel("wasmachine")))
          .differentieel(100, (n) => n.kring((k) => k.automaat(32).leiding(6).toestel("kookplaat"))),
      ),
    )
    .bouw();

/** Eén differentieel van 30 mA voor alles, en de kookplaat rechtstreeks onder het algemene. */
const gewoon = () =>
  installatie()
    .differentieel(300, (d) =>
      d.verdeelbord((b) =>
        b
          .differentieel(30, (n) => n.kring((k) => k.automaat(20).leiding(2.5).contactdozen(4)), { als: "diff" })
          .kring((k) => k.automaat(32).als("kookplaat").leiding(6).toestel("kookplaat")),
      ),
    )
    .bouw();

describe("aarding.spreidingsweerstand", () => {
  const regel = maakRegelAardingSpreidingsweerstand(PARAMETERS_AREI_2020_V1);

  test("is voorlopig en verwijst naar 4.2.4.3", () => {
    expect(regel.id).toBe(ID);
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("4.2.4.3");
    expect(regel.ernst).toBe("fout");
  });

  test("zonder ingevulde aardingsweerstand doet de regel niets", () => {
    expect(draaiRegel(regel, metContext(gewoon().doc, "nieuw"))).toEqual([]);
  });

  test("tot en met 30 Ω doet de regel niets", () => {
    expect(draaiRegel(regel, metAardingsweerstand(metContext(gewoon().doc, "nieuw"), 30))).toEqual([]);
  });

  test("boven 30 Ω geeft een installatie die aan de eisen voldoet niets", () => {
    expect(draaiRegel(regel, metAardingsweerstand(metContext(goed().doc, "nieuw"), 45))).toEqual([]);
  });

  test("boven 30 Ω zonder kringen valt er niets te beoordelen", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord(() => {}))
      .bouw();
    expect(draaiRegel(regel, metAardingsweerstand(metContext(doc, "nieuw"), 45))).toEqual([]);
  });

  test("boven 30 Ω: te weinig differentiëlen van 30 mA en een kring zonder 100 mA", () => {
    const { doc, ids } = gewoon();
    const bevindingen = draaiRegel(regel, metAardingsweerstand(metContext(doc, "nieuw"), 31));
    expect(bevindingen).toHaveLength(2);
    expect(bevindingen).toContainEqual({
      regelId: ID,
      ernst: "fout",
      nodeIds: [tellerVan(doc)],
      berichtSleutel: `${ID}.te-weinig-differentielen`,
      parameters: { aantal: 1, min: 2 },
      afgeweken: false,
    });
    expect(bevindingen).toContainEqual({
      regelId: ID,
      ernst: "fout",
      nodeIds: [ids["kookplaat"]],
      berichtSleutel: `${ID}.kring-onbeschermd`,
      parameters: { kring: "B", max: 100 },
      afgeweken: false,
    });
  });

  test.each([undefined, "bestaand", "onbekend"] as const)("context %s geeft waarschuwingen", (context) => {
    const bevindingen = draaiRegel(regel, metAardingsweerstand(metContext(gewoon().doc, context), 31));
    expect(bevindingen.map((b) => b.ernst)).toEqual(["waarschuwing", "waarschuwing"]);
  });

  test("het algemene differentieel telt niet als differentieel van 30 mA of 100 mA", () => {
    const { doc, ids } = installatie()
      .differentieel(30, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(20).als("kring").leiding(2.5).contactdozen(2))))
      .bouw();
    const bevindingen = draaiRegel(regel, metAardingsweerstand(metContext(doc, "nieuw"), 60));
    const perSleutel = bevindingen
      .map((b) => [b.berichtSleutel, b.nodeIds, b.parameters] as const)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    expect(perSleutel).toEqual([
      [`${ID}.kring-onbeschermd`, [ids["kring"]], { kring: "A", max: 100 }],
      [`${ID}.te-weinig-differentielen`, [tellerVan(doc)], { aantal: 0, min: 2 }],
    ]);
  });

  test("meer dan 16 contactdozen achter één differentieel van 30 mA; een vast toestel telt als één", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .differentieel(
              30,
              (n) =>
                n
                  .kring((k) => k.automaat(20).leiding(2.5).contactdozen(8))
                  .kring((k) => k.automaat(20).leiding(2.5).contactdozen(8))
                  .kring((k) => k.automaat(20).leiding(2.5).toestel("wasmachine")),
              { als: "vol" },
            )
            .differentieel(30, (n) => n.kring((k) => k.automaat(16).leiding(1.5).lichtpunten(4))),
        ),
      )
      .bouw();
    expect(draaiRegel(regel, metAardingsweerstand(metContext(doc, "nieuw"), 45))).toEqual([
      {
        regelId: ID,
        ernst: "fout",
        nodeIds: [ids["vol"]],
        berichtSleutel: `${ID}.te-veel-contactdozen`,
        parameters: { aantal: 17, max: 16 },
        afgeweken: false,
      },
    ]);
  });

  test("een meervoudige contactdoos telt als één: 16 dubbele dozen geven niets", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .differentieel(30, (n) =>
              n
                .kring((k) => k.automaat(20).leiding(2.5).contactdozen(8, { aantal: 2 }))
                .kring((k) => k.automaat(20).leiding(2.5).contactdozen(8, { aantal: 2 })),
            )
            .differentieel(30, (n) => n.kring((k) => k.automaat(16).leiding(1.5).lichtpunten(4))),
        ),
      )
      .bouw();
    expect(draaiRegel(regel, metAardingsweerstand(metContext(doc, "nieuw"), 45))).toEqual([]);
  });

  test("een kring zonder punten (bijvoorbeeld de voeding van een onderbord) wordt niet gemeld", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .differentieel(30, (n) => n.kring((k) => k.automaat(20).leiding(2.5).contactdozen(4)))
            .differentieel(30, (n) => n.kring((k) => k.automaat(16).leiding(1.5).lichtpunten(4)))
            .kring((k) =>
              k
                .automaat(40)
                .leiding(10)
                .onderbord((o) => o.differentieel(100, (n) => n.kring((k2) => k2.automaat(20).leiding(2.5).contactdozen(2)))),
            ),
        ),
      )
      .bouw();
    expect(draaiRegel(regel, metAardingsweerstand(metContext(doc, "nieuw"), 45))).toEqual([]);
  });
});
