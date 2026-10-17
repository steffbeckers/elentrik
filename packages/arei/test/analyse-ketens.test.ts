import { describe, expect, test } from "vitest";
import {
  nieuwDocument,
  plaats,
  voegPaginaToe,
  voegToe,
  type InstallatieDocument,
  type NodeId,
  type NodeInvoer,
} from "@elentrik/model";
import { analyseer } from "../src/index";
import { installatie } from "../src/testing/index";
import { kloon } from "./hulp";

const CONTACTDOOS = {
  type: "contactdoos",
  aantal: 1,
  randaarde: true,
  kinderbeveiliging: true,
  waterdicht: false,
} as const satisfies NodeInvoer;
const LEIDING = { type: "leiding", kabeltype: "XVB", doorsnede_mm2: 2.5, aantalGeleiders: 3 } as const satisfies NodeInvoer;
const DIFFERENTIEEL = {
  type: "differentieel",
  gevoeligheid_mA: 30,
  nominaal_A: 40,
  polen: 2,
  klasse: "A",
} as const satisfies NodeInvoer;

const POSITIE = { x: 10, y: 20, rotatie: 0 };

function tellerVan(doc: InstallatieDocument): NodeId {
  return doc.nodes[doc.rootId]!.kinderen[0]!;
}

describe("analyseer: ketens", () => {
  test("contactdoos in een badkamer achter diff 300 → diff 30 → automaat → leiding", () => {
    const { doc, ids } = installatie()
      .differentieel(
        300,
        (d300) =>
          d300.differentieel(
            30,
            (d30) =>
              d30.verdeelbord((b) =>
                b.kring((k) =>
                  k.automaat(16).als("k").leiding(2.5).als("l").contactdozen(1, { ruimte: "badkamer" }).als("cd"),
                ),
              ),
            { als: "d30" },
          ),
        { als: "d300" },
      )
      .bouw();
    const analyse = analyseer(doc);
    expect(analyse.ketens[ids.cd!]).toEqual({
      leidingId: ids.l,
      beveiligingId: ids.k,
      differentielen: [ids.d30, ids.d300],
    });
  });

  test("elk punt heeft een keten; alleen punten staan in ketens", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("a").lichtpunten(1).als("b").schakelaar().als("c")),
      )
      .bouw();
    expect(Object.keys(analyseer(doc).ketens).sort()).toEqual([ids.a!, ids.b!, ids.c!].sort());
  });

  test("een punt zonder kring heeft een keten met beveiligingId null", () => {
    const basis = nieuwDocument();
    const d = voegToe(basis, tellerVan(basis), DIFFERENTIEEL);
    const l = voegToe(d.doc, d.id, LEIDING);
    const cd = voegToe(l.doc, l.id, CONTACTDOOS);
    const analyse = analyseer(cd.doc);
    expect(analyse.zonderKring).toEqual([cd.id]);
    expect(analyse.ketens).toEqual({
      [cd.id]: { leidingId: l.id, beveiligingId: null, differentielen: [d.id] },
    });
  });

  test("een punt onder een leiding rechtstreeks aan de teller heeft geen beveiliging en geen differentieel", () => {
    const basis = nieuwDocument();
    const l = voegToe(basis, tellerVan(basis), LEIDING);
    const cd = voegToe(l.doc, l.id, CONTACTDOOS);
    expect(analyseer(cd.doc).ketens[cd.id]).toEqual({ leidingId: l.id, beveiligingId: null, differentielen: [] });
  });

  test("een punt in een onderbord krijgt de dichtstbijzijnde leiding en beveiliging", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(32)
            .als("kC")
            .leiding(6)
            .als("lC")
            .onderbord((o) =>
              o.kring((ok) => ok.automaat(16).als("kCA").leiding(1.5).als("lCA").lichtpunten(1).als("p")),
            ),
        ),
      )
      .bouw();
    expect(analyseer(doc).ketens[ids.p!]).toEqual({ leidingId: ids.lCA, beveiligingId: ids.kCA, differentielen: [] });
  });

  test("differentielen onder de beveiliging komen ook in de keten, de dichtstbijzijnde eerst", () => {
    const basis = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).als("k")))
      .bouw();
    const d1 = voegToe(basis.doc, basis.ids.k!, DIFFERENTIEEL);
    const d2 = voegToe(d1.doc, d1.id, DIFFERENTIEEL);
    const l = voegToe(d2.doc, d2.id, LEIDING);
    const cd = voegToe(l.doc, l.id, CONTACTDOOS);
    expect(analyseer(cd.doc).ketens[cd.id]).toEqual({
      leidingId: l.id,
      beveiligingId: basis.ids.k,
      differentielen: [d2.id, d1.id],
    });
  });

  test("punten onder dezelfde differentieel delen een bevroren differentielen-array", () => {
    const { doc, ids } = installatie()
      .differentieel(
        30,
        (d) =>
          d.verdeelbord((b) =>
            b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("a").lichtpunten(1).als("b")),
          ),
        { als: "d" },
      )
      .bouw();
    const { ketens } = analyseer(doc);
    expect(ketens[ids.a!]!.differentielen).toEqual([ids.d]);
    expect(ketens[ids.b!]!.differentielen).toEqual([ids.d]);
    const gedeeld = ketens[ids.a!]!.differentielen as NodeId[];
    expect(() => gedeeld.push("x")).toThrow(TypeError);
    expect(() => gedeeld.pop()).toThrow(TypeError);
    expect(ketens[ids.b!]!.differentielen).toEqual([ids.d]);
  });

  test("de lege differentielen-lijst is ook bevroren", () => {
    const basis = nieuwDocument();
    const l = voegToe(basis, tellerVan(basis), LEIDING);
    const cd = voegToe(l.doc, l.id, CONTACTDOOS);
    const leeg = analyseer(cd.doc).ketens[cd.id]!.differentielen as NodeId[];
    expect(() => leeg.push("x")).toThrow(TypeError);
  });

  test("een diepe keten van 5.000 differentielen en een punt eronder geeft geen RangeError", () => {
    const doc = kloon(nieuwDocument());
    let ouder = tellerVan(doc);
    const verwacht: NodeId[] = [];
    for (let i = 0; i < 5000; i++) {
      const id = `diff-${i}`;
      doc.nodes[id] = { ...DIFFERENTIEEL, id, parentId: ouder, kinderen: [] };
      doc.nodes[ouder]!.kinderen.push(id);
      verwacht.unshift(id);
      ouder = id;
    }
    const leiding = "leiding-diep";
    doc.nodes[leiding] = { ...LEIDING, id: leiding, parentId: ouder, kinderen: [] };
    doc.nodes[ouder]!.kinderen.push(leiding);
    const cd = "cd-diep";
    doc.nodes[cd] = { ...CONTACTDOOS, id: cd, parentId: leiding, kinderen: [] };
    doc.nodes[leiding]!.kinderen.push(cd);
    expect(analyseer(doc).ketens[cd]!.differentielen).toEqual(verwacht);
  });

  test("5.000 punten in één keten onder dezelfde differentieel", () => {
    const gebouwd = installatie()
      .differentieel(
        30,
        (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("eerste"))),
        { als: "d" },
      )
      .bouw();
    const doc = kloon(gebouwd.doc);
    let ouder = gebouwd.ids.eerste!;
    for (let i = 1; i < 5000; i++) {
      const id = `keten-${i}`;
      doc.nodes[id] = { ...CONTACTDOOS, id, parentId: ouder, kinderen: [] };
      doc.nodes[ouder]!.kinderen.push(id);
      ouder = id;
    }
    const analyse = analyseer(doc);
    expect(Object.keys(analyse.ketens)).toHaveLength(5000);
    expect(analyse.ketens[ouder]!.differentielen).toEqual([gebouwd.ids.d]);
  });
});

describe("analyseer: kringgegevens", () => {
  test("minDoorsnede_mm2 is het minimum over de leidingen van de kring", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).leiding(1.5).lichtpunten(1)))
      .bouw();
    expect(analyseer(doc).kringen[0]!.minDoorsnede_mm2).toBe(1.5);
  });

  test("leidingen met doorsnede 0 (niet ingevuld) worden genegeerd", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(0).contactdozen(1).leiding(2.5).lichtpunten(1)))
      .bouw();
    expect(analyseer(doc).kringen[0]!.minDoorsnede_mm2).toBe(2.5);
  });

  test("een kring met alleen een leiding met doorsnede 0 heeft minDoorsnede_mm2 null", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(0).contactdozen(1)))
      .bouw();
    expect(analyseer(doc).kringen[0]!.minDoorsnede_mm2).toBeNull();
  });

  test("een kring zonder leidingen heeft minDoorsnede_mm2 null en lege leidingIds", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16)))
      .bouw();
    expect(analyseer(doc).kringen[0]).toMatchObject({ leidingIds: [], minDoorsnede_mm2: null });
  });

  test("leidingIds bevat de leidingen van de kring in pre-order, niet die van een onderliggende kring", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(32)
            .leiding(6)
            .als("l1")
            .onderbord((o) => o.kring((ok) => ok.automaat(16).leiding(1.5).als("l3").contactdozen(1)))
            .contactdozen(1)
            .leiding(4)
            .als("l2")
            .lichtpunten(1),
        ),
      )
      .bouw();
    const analyse = analyseer(doc);
    expect(analyse.kringen[0]!.leidingIds).toEqual([ids.l1, ids.l2]);
    expect(analyse.kringen[1]!.leidingIds).toEqual([ids.l3]);
    expect(analyse.kringen[0]!.minDoorsnede_mm2).toBe(4);
    expect(analyse.kringen[1]!.minDoorsnede_mm2).toBe(1.5);
  });

  test("ruimtes zijn uniek, in volgorde van eerste voorkomen, zonder ontbrekende ruimtes", () => {
    const { doc } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(16)
            .leiding(2.5)
            .contactdozen(1, { ruimte: "keuken" })
            .contactdozen(1)
            .lichtpunten(1, { ruimte: "badkamer" })
            .contactdozen(1, { ruimte: "keuken" })
            .schakelaar({ ruimte: "leefruimte" })
            .lichtpunten(1, { ruimte: "badkamer" }),
        ),
      )
      .bouw();
    expect(analyseer(doc).kringen[0]!.ruimtes).toEqual(["keuken", "badkamer", "leefruimte"]);
  });

  test("ruimtes van een kring zonder ruimte-info is leeg", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(2)))
      .bouw();
    expect(analyseer(doc).kringen[0]!.ruimtes).toEqual([]);
  });
});

describe("analyseer: teller en algemeen differentieel", () => {
  test("tellerId is de teller van een nieuw document", () => {
    const doc = nieuwDocument();
    expect(analyseer(doc).tellerId).toBe(tellerVan(doc));
  });

  test("tellerId is null als het document geen teller heeft", () => {
    const doc = kloon(nieuwDocument());
    const teller = tellerVan(doc);
    doc.nodes[doc.rootId]!.kinderen = [];
    delete doc.nodes[teller];
    expect(analyseer(doc).tellerId).toBeNull();
  });

  test("algemeenDifferentieelId: diff 300 bovenaan is het algemeen differentieel", () => {
    const { doc, ids } = installatie()
      .differentieel(
        300,
        (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))),
        { als: "d300" },
      )
      .bouw();
    expect(analyseer(doc).algemeenDifferentieelId).toBe(ids.d300);
  });

  test("een tweede bord rechtstreeks onder de teller, buiten die differentieel, geeft null", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1)))
      .bouw();
    expect(analyseer(doc).algemeenDifferentieelId).toBeNull();
  });

  test("de eerste differentieel in pre-order die voorouder is van alle kringen wint, ook bij geneste differentielen", () => {
    const { doc, ids } = installatie()
      .differentieel(
        300,
        (d300) =>
          d300.differentieel(
            30,
            (d30) => d30.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))),
            { als: "d30" },
          ),
        { als: "d300" },
      )
      .bouw();
    expect(analyseer(doc).algemeenDifferentieelId).toBe(ids.d300);
  });

  test("gesplitste differentielen onder een gedeelde diff: alleen de gedeelde komt in aanmerking", () => {
    const { doc, ids } = installatie()
      .differentieel(
        300,
        (d300) =>
          d300
            .differentieel(30, (a) => a.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
            .differentieel(30, (a) => a.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1)))),
        { als: "d300" },
      )
      .bouw();
    expect(analyseer(doc).algemeenDifferentieelId).toBe(ids.d300);
  });

  test("twee differentielen naast elkaar, elk met een eigen kring, geven null", () => {
    const { doc } = installatie()
      .differentieel(30, (a) => a.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
      .differentieel(30, (a) => a.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
      .bouw();
    expect(analyseer(doc).algemeenDifferentieelId).toBeNull();
  });

  test("geen kringen geeft null, ook als er een differentieel is", () => {
    const basis = nieuwDocument();
    const d = voegToe(basis, tellerVan(basis), DIFFERENTIEEL);
    expect(analyseer(d.doc).algemeenDifferentieelId).toBeNull();
  });

  test("een kring zonder differentieel geeft null", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1)))
      .bouw();
    expect(analyseer(doc).algemeenDifferentieelId).toBeNull();
  });
});

describe("analyseer: nietGeplaatst", () => {
  test("alle punten zijn niet geplaatst in een document zonder plaatsingen", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("a").lichtpunten(1).als("b")))
      .bouw();
    expect(analyseer(doc).nietGeplaatst).toEqual([ids.a, ids.b]);
  });

  test("na het plaatsen van één van de drie punten blijven er 2 over, in pre-order", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("a").lichtpunten(1).als("b").schakelaar().als("c")),
      )
      .bouw();
    const pagina = voegPaginaToe(doc, "Gelijkvloers");
    const geplaatst = plaats(pagina.doc, pagina.id, ids.b!, POSITIE);
    expect(analyseer(geplaatst.doc).nietGeplaatst).toEqual([ids.a, ids.c]);
  });

  test("een plaatsing op een andere pagina telt ook, en niet-punten (verdeelbord) tellen niet mee", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) => b.als("bord").kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("a")))
      .bouw();
    const p1 = voegPaginaToe(doc, "Eerste");
    const p2 = voegPaginaToe(p1.doc, "Tweede");
    const bordGeplaatst = plaats(p2.doc, p2.id, ids.bord!, POSITIE);
    expect(analyseer(bordGeplaatst.doc).nietGeplaatst).toEqual([ids.a]);
    const puntGeplaatst = plaats(bordGeplaatst.doc, p2.id, ids.a!, POSITIE);
    expect(analyseer(puntGeplaatst.doc).nietGeplaatst).toEqual([]);
  });

  test("punten zonder kring tellen mee in pre-order tussen de andere punten", () => {
    const basis = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("a")))
      .bouw();
    const d = voegToe(basis.doc, tellerVan(basis.doc), DIFFERENTIEEL);
    const l = voegToe(d.doc, d.id, LEIDING);
    const cd = voegToe(l.doc, l.id, CONTACTDOOS);
    const analyse = analyseer(cd.doc);
    expect(analyse.nietGeplaatst).toEqual([basis.ids.a, cd.id]);
    expect(analyse.zonderKring).toEqual([cd.id]);
  });
});
