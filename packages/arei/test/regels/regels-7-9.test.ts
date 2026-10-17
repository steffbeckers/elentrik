import { describe, expect, test } from "vitest";
import { plaats, voegPaginaToe, type InstallatieDocument } from "@elentrik/model";
import { controleer, type Bevinding, type Regel, type Regelset } from "../../src/index";
import { installatie } from "../../src/testing/index";
import { PARAMETERS_AREI_2020_V1 } from "../../src/regelsets/arei-2020/parameters";
import { maakRegelLeidingOnvolledig } from "../../src/regelsets/arei-2020/regels/leiding-onvolledig";
import { maakRegelNietGeplaatst } from "../../src/regelsets/arei-2020/regels/niet-geplaatst";
import { maakRegelPolenStroomtype } from "../../src/regelsets/arei-2020/regels/polen-stroomtype";
import { kloon, verwachtBekendeSleutels } from "../hulp";

function alleen(regel: Regel): Regelset {
  return { id: "test", versie: 1, gepubliceerd: false, regels: [regel] };
}

function draai(regel: Regel, doc: InstallatieDocument): Bevinding[] {
  const bevindingen = controleer(doc, alleen(regel));
  verwachtBekendeSleutels(regel, bevindingen);
  return bevindingen;
}

describe("regel 7: polen-stroomtype", () => {
  const regel = maakRegelPolenStroomtype(PARAMETERS_AREI_2020_V1);

  test("is voorlopig en heeft de verwachte metadata", () => {
    expect(regel.id).toBe("arei.polen.stroomtype");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("fout");
  });

  test("3N400V met een algemeen differentieel van 2 polen geeft .algemeen", () => {
    const { doc, ids } = installatie({ stroomtype: "3N400V" })
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))), {
        polen: 2,
        als: "alg",
      })
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.polen.stroomtype",
        ernst: "fout",
        nodeIds: [ids["alg"]],
        berichtSleutel: "arei.polen.stroomtype.algemeen",
        parameters: { polen: 2, verwacht: 4, stroomtype: "3N400V" },
        afgeweken: false,
      },
    ]);
  });

  test("3N400V met een algemeen differentieel van 4 polen geeft niets", () => {
    const { doc } = installatie({ stroomtype: "3N400V" })
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))), {
        polen: 4,
      })
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("2x230V met een algemeen differentieel van 2 polen en een automaat van 2 polen geeft niets", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("2x230V met een automaat van 4 polen geeft .te-veel op die automaat", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) => b.kring((k) => k.automaat(16, { polen: 4 }).als("auto").leiding(2.5).contactdozen(1))),
      )
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.polen.stroomtype",
        ernst: "fout",
        nodeIds: [ids["auto"]],
        berichtSleutel: "arei.polen.stroomtype.te-veel",
        parameters: { polen: 4, stroomtype: "2x230V" },
        afgeweken: false,
      },
    ]);
  });

  test("2x230V met een differentieel van 3 polen dat niet het algemene is geeft .te-veel", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.differentieel(30, (b2) => b2.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1)), {
            polen: 3,
            als: "extra",
          }),
        ),
      )
      .bouw();
    const bevindingen = draai(regel, doc);
    expect(bevindingen.map((b) => [b.berichtSleutel, b.nodeIds])).toEqual([
      ["arei.polen.stroomtype.te-veel", [ids["extra"]]],
    ]);
    expect(bevindingen[0]?.parameters).toEqual({ polen: 3, stroomtype: "2x230V" });
  });

  test("het algemeen differentieel krijgt nooit ook .te-veel", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))), {
        polen: 4,
        als: "alg",
      })
      .bouw();
    const bevindingen = draai(regel, doc);
    expect(bevindingen.map((b) => [b.berichtSleutel, b.nodeIds])).toEqual([
      ["arei.polen.stroomtype.algemeen", [ids["alg"]]],
    ]);
    expect(bevindingen[0]?.parameters).toEqual({ polen: 4, verwacht: 2, stroomtype: "2x230V" });
  });

  test("zonder algemeen differentieel is er geen .algemeen", () => {
    const { doc } = installatie({ stroomtype: "3N400V" })
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1)))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("3N400V met een automaat van 4 polen geeft geen .te-veel", () => {
    const { doc } = installatie({ stroomtype: "3N400V" })
      .differentieel(
        300,
        (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(32, { polen: 4 }).leiding(10).toestel("laadpaal"))),
        { polen: 4 },
      )
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("een zekering heeft geen polen en wordt overgeslagen", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.zekering(16).leiding(2.5).contactdozen(1))))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });
});

describe("regel 8: niet-geplaatst", () => {
  const regel = maakRegelNietGeplaatst();

  test("is een info-regel met de verwachte metadata", () => {
    expect(regel.id).toBe("arei.situatie.niet-geplaatst");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("info");
  });

  test("3 punten waarvan 1 geplaatst geeft 2 bevindingen met labels", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k.automaat(16).leiding(2.5).contactdozen(1).als("a").lichtpunten(1).als("b").schakelaar().als("c"),
        ),
      )
      .bouw();
    const pagina = voegPaginaToe(doc, "Gelijkvloers");
    const geplaatst = plaats(pagina.doc, pagina.id, ids["b"]!, { x: 0, y: 0, rotatie: 0 });
    expect(draai(regel, geplaatst.doc)).toEqual([
      {
        regelId: "arei.situatie.niet-geplaatst",
        ernst: "info",
        nodeIds: [ids["a"]],
        berichtSleutel: "arei.situatie.niet-geplaatst.punt",
        parameters: { label: "A1" },
        afgeweken: false,
      },
      {
        regelId: "arei.situatie.niet-geplaatst",
        ernst: "info",
        nodeIds: [ids["c"]],
        berichtSleutel: "arei.situatie.niet-geplaatst.punt",
        parameters: { label: "A3" },
        afgeweken: false,
      },
    ]);
  });

  test("een punt zonder kring heeft geen label en krijgt '?'", () => {
    const basis = installatie()
      .differentieel(300, () => {})
      .bouw();
    const doc = kloon(basis.doc);
    const teller = doc.nodes[doc.rootId]!.kinderen[0]!;
    // Een los contactdoospunt rechtstreeks onder de teller (geen kringbeveiliging).
    doc.nodes["p0"] = {
      id: "p0",
      parentId: teller,
      kinderen: [],
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
    };
    doc.nodes[teller]!.kinderen.push("p0");
    const bevindingen = controleer(doc, alleen(regel));
    expect(bevindingen.map((b) => [b.nodeIds, b.parameters])).toEqual([[["p0"], { label: "?" }]]);
  });

  test("alles geplaatst geeft niets", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("a")))
      .bouw();
    const pagina = voegPaginaToe(doc, "Gelijkvloers");
    const geplaatst = plaats(pagina.doc, pagina.id, ids["a"]!, { x: 0, y: 0, rotatie: 0 });
    expect(draai(regel, geplaatst.doc)).toEqual([]);
  });
});

describe("regel 9: leiding-onvolledig", () => {
  const regel = maakRegelLeidingOnvolledig();

  test("is een info-regel met de verwachte metadata", () => {
    expect(regel.id).toBe("arei.leiding.onvolledig");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("info");
  });

  test("een volledige leiding geeft niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1)))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("een leeg kabeltype geeft .kabeltype", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5, { kabeltype: "" }).als("l").contactdozen(1)))
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.leiding.onvolledig",
        ernst: "info",
        nodeIds: [ids["l"]],
        berichtSleutel: "arei.leiding.onvolledig.kabeltype",
        parameters: {},
        afgeweken: false,
      },
    ]);
  });

  test("een kabeltype van enkel spaties telt als leeg", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5, { kabeltype: "  " }).contactdozen(1)))
      .bouw();
    expect(draai(regel, doc).map((b) => b.berichtSleutel)).toEqual(["arei.leiding.onvolledig.kabeltype"]);
  });

  test("een doorsnede van 0 geeft .doorsnede", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(0).als("l").contactdozen(1)))
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.leiding.onvolledig",
        ernst: "info",
        nodeIds: [ids["l"]],
        berichtSleutel: "arei.leiding.onvolledig.doorsnede",
        parameters: {},
        afgeweken: false,
      },
    ]);
  });

  test("een leiding met beide gebreken krijgt twee bevindingen", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(0, { kabeltype: "" }).als("l").contactdozen(1)))
      .bouw();
    const bevindingen = draai(regel, doc);
    expect(bevindingen.map((b) => b.berichtSleutel).sort()).toEqual([
      "arei.leiding.onvolledig.doorsnede",
      "arei.leiding.onvolledig.kabeltype",
    ]);
    for (const b of bevindingen) expect(b.nodeIds).toEqual([ids["l"]]);
  });

  test("alle leidingen in het document worden gecontroleerd, ook die in een onderbord", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(32)
            .leiding(6)
            .onderbord((o) => o.kring((k2) => k2.automaat(16).leiding(0).als("diep").contactdozen(1))),
        ),
      )
      .bouw();
    expect(draai(regel, doc).map((b) => b.nodeIds)).toEqual([[ids["diep"]]]);
  });
});
