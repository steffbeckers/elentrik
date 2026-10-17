import { describe, expect, test } from "vitest";
import { voegToe, type InstallatieDocument } from "@elentrik/model";
import { controleer, type Bevinding, type Regel, type Regelset } from "../../src/index";
import { installatie } from "../../src/testing/index";
import { PARAMETERS_AREI_2020_V1 } from "../../src/regelsets/arei-2020/parameters";
import { maakRegelAlgemeenDifferentieel } from "../../src/regelsets/arei-2020/regels/algemeen-differentieel";
import { maakRegelDoorsnedeBeveiliging } from "../../src/regelsets/arei-2020/regels/doorsnede-beveiliging";
import { maakRegelNatteRuimteDifferentieel } from "../../src/regelsets/arei-2020/regels/natte-ruimte-differentieel";
import { verwachtBekendeSleutels } from "../hulp";

function alleen(regel: Regel): Regelset {
  return { id: "test", versie: 1, gepubliceerd: false, regels: [regel] };
}

function draai(regel: Regel, doc: InstallatieDocument): Bevinding[] {
  const bevindingen = controleer(doc, alleen(regel));
  verwachtBekendeSleutels(regel, bevindingen);
  return bevindingen;
}

describe("regel 1: algemeen differentieel", () => {
  const regel = maakRegelAlgemeenDifferentieel(PARAMETERS_AREI_2020_V1);

  test("is voorlopig en heeft de verwachte metadata", () => {
    expect(regel.id).toBe("arei.differentieel.algemeen");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("fout");
  });

  test("differentieel 300 bovenaan geeft geen bevinding", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(2))))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("geen differentieel geeft .ontbreekt op de teller", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(2)))
      .bouw();
    const tellerId = doc.nodes[doc.rootId]!.kinderen[0]!;
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.differentieel.algemeen",
        ernst: "fout",
        nodeIds: [tellerId],
        berichtSleutel: "arei.differentieel.algemeen.ontbreekt",
        parameters: {},
        afgeweken: false,
      },
    ]);
  });

  test("zonder kringen geeft een ontbrekend differentieel geen bevinding", () => {
    const { doc } = installatie().bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("differentieel 500 geeft .te-ongevoelig", () => {
    const { doc, ids } = installatie()
      .differentieel(
        500,
        (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(2))),
        { als: "algemeen" },
      )
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.differentieel.algemeen",
        ernst: "fout",
        nodeIds: [ids["algemeen"]],
        berichtSleutel: "arei.differentieel.algemeen.te-ongevoelig",
        parameters: { gevoeligheid: 500, max: 300 },
        afgeweken: false,
      },
    ]);
  });
});

describe("regel 2: natte-ruimte-differentieel", () => {
  const regel = maakRegelNatteRuimteDifferentieel(PARAMETERS_AREI_2020_V1);

  test("is voorlopig en heeft de verwachte metadata", () => {
    expect(regel.id).toBe("arei.differentieel.natte-ruimte");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("fout");
  });

  test("badkamer achter diff 300 en diff 30 geeft geen bevinding", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.differentieel(30, (b2) =>
            b2.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1, { ruimte: "badkamer" })),
          ),
        ),
      )
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("badkamer alleen achter diff 300 geeft .ontbreekt met reden badkamer", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1, { ruimte: "badkamer" }).als("punt")),
        ),
      )
      .bouw();
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.differentieel.natte-ruimte",
        ernst: "fout",
        nodeIds: [ids["punt"]],
        berichtSleutel: "arei.differentieel.natte-ruimte.ontbreekt",
        parameters: { reden: "badkamer", max: 30 },
        afgeweken: false,
      },
    ]);
  });

  test("wasmachine in de leefruimte zonder diff 30 geeft reden wasmachine", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.kring((k) =>
            k.automaat(16).leiding(2.5).toestel("wasmachine", { ruimte: "leefruimte" }).als("wasmachine"),
          ),
        ),
      )
      .bouw();
    expect(draai(regel, doc)).toMatchObject([
      {
        nodeIds: [ids["wasmachine"]],
        berichtSleutel: "arei.differentieel.natte-ruimte.ontbreekt",
        parameters: { reden: "wasmachine", max: 30 },
      },
    ]);
  });

  test("een toestel in een natte ruimte krijgt de ruimte als reden", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.kring((k) => k.automaat(16).leiding(2.5).toestel("wasmachine", { ruimte: "wasplaats" })),
        ),
      )
      .bouw();
    expect(draai(regel, doc)[0]?.parameters).toEqual({ reden: "wasplaats", max: 30 });
  });

  test("één bevinding per punt", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(3, { ruimte: "badkamer" }))),
      )
      .bouw();
    expect(draai(regel, doc)).toHaveLength(3);
  });

  test("een differentieel van precies 30 mA volstaat", () => {
    const { doc } = installatie()
      .differentieel(30, (d) =>
        d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1, { ruimte: "badkamer" }))),
      )
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("punten buiten natte ruimtes en zonder laag-gevoelig toestel geven niets", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(2, { ruimte: "leefruimte" }).toestel("oven")),
        ),
      )
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("een punt zonder kring wordt ook gecontroleerd", () => {
    const { doc } = installatie()
      .differentieel(300, () => {})
      .bouw();
    const tellerId = doc.nodes[doc.rootId]!.kinderen[0]!;
    const diffId = doc.nodes[tellerId]!.kinderen[0]!;
    const { doc: metLeiding, id: leidingId } = voegToe(doc, diffId, {
      type: "leiding",
      kabeltype: "XVB",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
    });
    const { doc: metPunt, id } = voegToe(metLeiding, leidingId, {
      type: "contactdoos",
      aantal: 1,
      randaarde: true,
      kinderbeveiliging: true,
      waterdicht: false,
      ruimte: "badkamer",
    });
    expect(draai(regel, metPunt)).toMatchObject([{ nodeIds: [id], parameters: { reden: "badkamer", max: 30 } }]);
  });
});

describe("regel 3: doorsnede-beveiliging", () => {
  const regel = maakRegelDoorsnedeBeveiliging(PARAMETERS_AREI_2020_V1);

  const kringMet = (A: number, mm2: number) =>
    installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(A).leiding(mm2).contactdozen(1).als("laatste")))
      .bouw();

  const beveiligingIdVan = (doc: InstallatieDocument) =>
    Object.values(doc.nodes).find((n) => n.type === "automaat")!.id;

  test("is voorlopig en heeft de verwachte metadata", () => {
    expect(regel.id).toBe("arei.kring.doorsnede-beveiliging");
    expect(regel.nagekeken).toBe(false);
    expect(regel.artikel).toBe("");
    expect(regel.ernst).toBe("fout");
  });

  test("16 A op 1,5 mm2 geeft geen bevinding", () => {
    expect(draai(regel, kringMet(16, 1.5).doc)).toEqual([]);
  });

  test("20 A op 1,5 mm2 geeft .te-hoog op de beveiliging", () => {
    const { doc } = kringMet(20, 1.5);
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.kring.doorsnede-beveiliging",
        ernst: "fout",
        nodeIds: [beveiligingIdVan(doc)],
        berichtSleutel: "arei.kring.doorsnede-beveiliging.te-hoog",
        parameters: { nominaal: 20, doorsnede: 1.5, max: 16 },
        afgeweken: false,
      },
    ]);
  });

  test("16 A op 3 mm2 geeft .onbekende-doorsnede als waarschuwing", () => {
    const { doc } = kringMet(16, 3);
    expect(draai(regel, doc)).toEqual([
      {
        regelId: "arei.kring.doorsnede-beveiliging",
        ernst: "waarschuwing",
        nodeIds: [beveiligingIdVan(doc)],
        berichtSleutel: "arei.kring.doorsnede-beveiliging.onbekende-doorsnede",
        parameters: { doorsnede: 3 },
        afgeweken: false,
      },
    ]);
  });

  test("een kring met alleen een leiding van 0 mm2 geeft niets", () => {
    expect(draai(regel, kringMet(16, 0).doc)).toEqual([]);
  });

  test("een kring zonder leiding geeft niets", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16)))
      .bouw();
    expect(draai(regel, doc)).toEqual([]);
  });

  test("de kleinste doorsnede bepaalt het maximum", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(20).leiding(2.5).leiding(1.5).contactdozen(1)))
      .bouw();
    expect(draai(regel, doc)[0]?.parameters).toEqual({ nominaal: 20, doorsnede: 1.5, max: 16 });
  });
});
