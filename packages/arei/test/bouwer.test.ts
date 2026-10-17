import { describe, expect, test } from "vitest";
import { DocumentFout, valideerStructuur, type InstallatieDocument, type Node } from "@elentrik/model";
import { installatie } from "../src/testing/index";

function knoop(doc: InstallatieDocument, id: string | undefined): Node {
  const node = doc.nodes[id!];
  if (!node) throw new Error(`node ${String(id)} bestaat niet`);
  return node;
}

describe("bouwer", () => {
  test("bouwer maakt een geldige installatie met benoemde ids", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .kring((k) => k.automaat(16).als("kA").leiding(2.5).contactdozen(3, { ruimte: "keuken" }))
            .kring((k) => k.automaat(16).leiding(1.5).lichtpunten(2)),
        ),
      )
      .bouw();
    expect(valideerStructuur(doc)).toEqual([]);
    expect(doc.nodes[ids.kA!]!.type).toBe("automaat");
    expect(Object.values(doc.nodes).filter((n) => n.type === "contactdoos")).toHaveLength(3);
  });

  test("plaats in de boom: beveiliging, leiding en keten van punten", () => {
    const { doc, ids } = installatie()
      .differentieel(30, (d) =>
        d.verdeelbord((b) =>
          b
            .als("bord")
            .kring((k) => k.automaat(16).als("auto").leiding(2.5).als("lei").contactdozen(2).als("laatste")),
        ),
      )
      .bouw();
    const auto = knoop(doc, ids.auto);
    const lei = knoop(doc, ids.lei);
    expect(auto.parentId).toBe(ids.bord);
    expect(lei.parentId).toBe(ids.auto);
    const eerste = knoop(doc, lei.kinderen[0]);
    expect(eerste.type).toBe("contactdoos");
    const tweede = knoop(doc, eerste.kinderen[0]);
    expect(tweede.type).toBe("contactdoos");
    expect(tweede.id).toBe(ids.laatste);
    expect(lei.kinderen).toHaveLength(1);
  });

  test("het eerste differentieel hangt onder de teller", () => {
    const { doc, ids } = installatie().differentieel(300, () => {}, { als: "diff" }).bouw();
    const diff = knoop(doc, ids.diff);
    const teller = knoop(doc, diff.parentId!);
    expect(teller.type).toBe("teller");
    expect(teller.parentId).toBe(doc.rootId);
  });

  test("standaardwaarden", () => {
    const { doc, ids } = installatie()
      .differentieel(
        300,
        (d) =>
          d.verdeelbord((b) =>
            b.kring((k) =>
              k
                .automaat(16)
                .als("auto")
                .leiding(2.5)
                .als("lei")
                .contactdozen(1)
                .als("cd")
                .lichtpunten(1)
                .als("lp")
                .schakelaar()
                .als("sch")
                .toestel("oven")
                .als("toe"),
            ),
          ),
        { als: "diff" },
      )
      .bouw();
    expect(knoop(doc, ids.diff)).toMatchObject({
      type: "differentieel",
      gevoeligheid_mA: 300,
      nominaal_A: 40,
      polen: 2,
      klasse: "A",
    });
    expect(knoop(doc, ids.auto)).toMatchObject({ type: "automaat", nominaal_A: 16, polen: 2, curve: "B" });
    expect(knoop(doc, ids.lei)).toMatchObject({
      type: "leiding",
      kabeltype: "XVB",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
    });
    expect(knoop(doc, ids.cd)).toMatchObject({
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
    });
    expect(knoop(doc, ids.lp)).toMatchObject({ type: "lichtpunt", aantal: 1 });
    expect("soort" in knoop(doc, ids.lp)).toBe(false);
    expect(knoop(doc, ids.sch)).toMatchObject({ type: "schakelaar", soort: "enkel", waterdicht: false });
    expect(knoop(doc, ids.toe)).toMatchObject({ type: "toestel", soort: "oven" });
    expect("vermogen_W" in knoop(doc, ids.toe)).toBe(false);
    expect("ruimte" in knoop(doc, ids.cd)).toBe(false);
  });

  test("opties overschrijven de standaardwaarden", () => {
    const { doc, ids } = installatie({ stroomtype: "3N400V" })
      .differentieel(
        30,
        (d) =>
          d.verdeelbord((b) =>
            b.kring((k) =>
              k
                .automaat(20, { polen: 4, curve: "C" })
                .als("auto")
                .leiding(4, { kabeltype: "", aantalGeleiders: 5 })
                .als("lei")
                .schakelaar({ soort: "wissel", ruimte: "buiten" })
                .als("sch")
                .toestel("kookplaat", { ruimte: "keuken", vermogen_W: 7200 })
                .als("toe")
                .lichtpunten(1, { ruimte: "garage" })
                .als("lp"),
            ),
          ),
        { polen: 4, als: "diff" },
      )
      .bouw();
    expect(doc.voeding.stroomtype).toBe("3N400V");
    expect(knoop(doc, ids.diff)).toMatchObject({ polen: 4, gevoeligheid_mA: 30 });
    expect(knoop(doc, ids.auto)).toMatchObject({ polen: 4, curve: "C", nominaal_A: 20 });
    expect(knoop(doc, ids.lei)).toMatchObject({ kabeltype: "", aantalGeleiders: 5 });
    expect(knoop(doc, ids.sch)).toMatchObject({ soort: "wissel", ruimte: "buiten" });
    expect(knoop(doc, ids.toe)).toMatchObject({ ruimte: "keuken", vermogen_W: 7200 });
    expect(knoop(doc, ids.lp)).toMatchObject({ ruimte: "garage" });
  });

  test("zekering als beveiliging", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.zekering(10).als("zek").leiding(1.5))))
      .bouw();
    expect(knoop(doc, ids.zek)).toMatchObject({ type: "zekering", nominaal_A: 10 });
    expect(valideerStructuur(doc)).toEqual([]);
  });

  test("onderbord hangt onder de laatste leiding en als() benoemt het onderbord", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.kring((k) =>
            k
              .automaat(32)
              .leiding(6)
              .als("lei")
              .onderbord(
                (o) => o.kring((k2) => k2.automaat(16).als("subAuto").leiding(2.5).lichtpunten(1)),
                "garage",
              )
              .als("onder"),
          ),
        ),
      )
      .bouw();
    expect(valideerStructuur(doc)).toEqual([]);
    const onder = knoop(doc, ids.onder);
    expect(onder).toMatchObject({ type: "verdeelbord", naam: "garage", parentId: ids.lei });
    expect(knoop(doc, ids.subAuto).parentId).toBe(ids.onder);
  });

  test("differentieel binnen een bord voedt kringen; BordBouwer.als benoemt het bord", () => {
    const { doc, ids } = installatie()
      .verdeelbord(
        (b) =>
          b
            .als("bord")
            .differentieel(
              30,
              (b2) => b2.kring((k) => k.automaat(16).als("auto").leiding(2.5).lichtpunten(1)),
              { als: "bordDiff" },
            ),
        "hoofd",
      )
      .bouw();
    expect(valideerStructuur(doc)).toEqual([]);
    expect(knoop(doc, ids.bord)).toMatchObject({ type: "verdeelbord", naam: "hoofd" });
    expect(knoop(doc, ids.bordDiff).parentId).toBe(ids.bord);
    expect(knoop(doc, ids.auto).parentId).toBe(ids.bordDiff);
  });

  test("een kring zonder beveiliging hangt onder het bord", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) => b.als("bord").kring((k) => k.leiding(2.5).als("lei").lichtpunten(1))),
      )
      .bouw();
    expect(valideerStructuur(doc)).toEqual([]);
    expect(knoop(doc, ids.lei).parentId).toBe(ids.bord);
  });

  test("een kring zonder beveiliging hangt onder de differentieel van het bord", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.differentieel(30, (b2) => b2.kring((k) => k.leiding(2.5).als("lei")), { als: "diff" }),
        ),
      )
      .bouw();
    expect(knoop(doc, ids.lei).parentId).toBe(ids.diff);
  });

  test("geneste differentielen in de voeding", () => {
    const { doc, ids } = installatie()
      .differentieel(
        300,
        (d) => d.differentieel(30, (d2) => d2.verdeelbord(() => {}, "nest"), { als: "binnen" }),
        { als: "buiten" },
      )
      .bouw();
    expect(valideerStructuur(doc)).toEqual([]);
    expect(knoop(doc, ids.binnen).parentId).toBe(ids.buiten);
  });

  test("dubbele namen gooien een fout", () => {
    expect(() =>
      installatie().differentieel(300, (d) =>
        d.verdeelbord((b) => b.kring((k) => k.automaat(16).als("x")).kring((k) => k.automaat(16).als("x"))),
      ),
    ).toThrow(/x/);
    expect(() =>
      installatie()
        .differentieel(300, () => {}, { als: "x" })
        .differentieel(300, () => {}, { als: "x" }),
    ).toThrow(/x/);
  });

  test("als() zonder eerder aangemaakte node gooit", () => {
    expect(() =>
      installatie().differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.als("x")))),
    ).toThrow(Error);
  });

  test("een structureel ongeldige keten gooit de DocumentFout van voegToe", () => {
    // een contactdoos kan niet rechtstreeks onder een automaat hangen
    expect(() =>
      installatie().differentieel(300, (d) =>
        d.verdeelbord((b) => b.kring((k) => k.automaat(16).contactdozen(1))),
      ),
    ).toThrow(DocumentFout);
  });

  test("bouw() geeft ook zonder inhoud een geldig resultaat", () => {
    const { doc, ids } = installatie().bouw();
    expect(valideerStructuur(doc)).toEqual([]);
    expect(ids).toEqual({});
  });
});
