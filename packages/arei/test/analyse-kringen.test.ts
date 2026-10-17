import { describe, expect, test } from "vitest";
import {
  nieuwDocument,
  valideerStructuur,
  voegToe,
  type InstallatieDocument,
  type NodeId,
  type NodeInvoer,
} from "@elentrik/model";
import { analyseer, kringLetter } from "../src/index";
import { installatie } from "../src/testing/index";
import { kloon } from "./hulp";

const CONTACTDOOS = {
  type: "contactdoos",
  aantal: 1,
  randaarde: true,
  kinderbeveiliging: true,
  waterdicht: false,
} as const satisfies NodeInvoer;
const AUTOMAAT = { type: "automaat", nominaal_A: 16, polen: 2, curve: "B" } as const satisfies NodeInvoer;
const LEIDING = { type: "leiding", kabeltype: "XVB", doorsnede_mm2: 2.5, aantalGeleiders: 3 } as const satisfies NodeInvoer;
const DIFFERENTIEEL = {
  type: "differentieel",
  gevoeligheid_mA: 30,
  nominaal_A: 40,
  polen: 2,
  klasse: "A",
} as const satisfies NodeInvoer;

/** Kleine helper rond `voegToe` voor documenten die de bouwer niet kan uitdrukken. */
function handmatig(doc: InstallatieDocument = nieuwDocument()) {
  let huidig = doc;
  return {
    teller: huidig.nodes[huidig.rootId]!.kinderen[0]!,
    voeg(ouderId: NodeId, invoer: NodeInvoer): NodeId {
      const r = voegToe(huidig, ouderId, invoer);
      huidig = r.doc;
      return r.id;
    },
    get doc() {
      return huidig;
    },
  };
}

describe("kringLetter", () => {
  test.each([
    [0, "A"],
    [25, "Z"],
    [26, "AA"],
    [27, "AB"],
    [701, "ZZ"],
    [702, "AAA"],
  ])("%i → %s", (index, letter) => {
    expect(kringLetter(index)).toBe(letter);
  });

  test.each([-1, 1.5, Number.NaN])("ongeldige index %s gooit een RangeError", (index) => {
    expect(() => kringLetter(index)).toThrow(RangeError);
  });
});

describe("analyseer: kringen en nummering", () => {
  test("2 kringen krijgen A en B, de punten A1, A2 en B1", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) =>
          b
            .als("bord")
            .kring((k) => k.automaat(16).als("kA").leiding(2.5).contactdozen(1).als("a1").lichtpunten(1).als("a2"))
            .kring((k) => k.automaat(16).als("kB").leiding(1.5).lichtpunten(1).als("b1")),
        ),
      )
      .bouw();
    const analyse = analyseer(doc);
    expect(analyse.kringen.map((k) => k.label)).toEqual(["A", "B"]);
    expect(analyse.puntLabels).toEqual({ [ids.a1!]: "A1", [ids.a2!]: "A2", [ids.b1!]: "B1" });
    const [a, b] = analyse.kringen;
    expect(a).toMatchObject({ id: ids.kA, beveiligingId: ids.kA, verdeelbordId: ids.bord, puntIds: [ids.a1, ids.a2] });
    expect(b).toMatchObject({ id: ids.kB, beveiligingId: ids.kB, verdeelbordId: ids.bord, puntIds: [ids.b1] });
    expect(analyse.zonderKring).toEqual([]);
  });

  test("28 kringen: het 27e label is AA en het 28e AB", () => {
    const { doc } = installatie()
      .verdeelbord((b) => {
        for (let i = 0; i < 28; i++) b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1));
      })
      .bouw();
    const labels = analyseer(doc).kringen.map((k) => k.label);
    expect(labels).toHaveLength(28);
    expect(labels[25]).toBe("Z");
    expect(labels[26]).toBe("AA");
    expect(labels[27]).toBe("AB");
  });

  test("onderbord zonder naam in kring C: C.A en C.B, met eigen puntnummering", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))
          .kring((k) =>
            k
              .automaat(32)
              .als("kC")
              .leiding(6)
              .onderbord((o) =>
                o
                  .als("onderbord")
                  .kring((ok) => ok.automaat(16).als("kCA").leiding(2.5).contactdozen(2).als("ca2"))
                  .kring((ok) => ok.automaat(16).leiding(1.5).lichtpunten(1).als("cb1")),
              ),
          )
          .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("d1")),
      )
      .bouw();
    const analyse = analyseer(doc);
    expect(analyse.kringen.map((k) => k.label)).toEqual(["A", "B", "C", "C.A", "C.B", "D"]);
    expect(analyse.puntLabels[ids.ca2!]).toBe("C.A2");
    expect(analyse.puntLabels[ids.cb1!]).toBe("C.B1");
    expect(analyse.puntLabels[ids.d1!]).toBe("D1");
    expect(analyse.kringen[3]!.verdeelbordId).toBe(ids.onderbord);
    // Het onderbord zelf hoort bij de omsluitende kring.
    expect(analyse.kringVanNode[ids.onderbord!]).toBe(ids.kC);
    expect(analyse.kringVanNode[ids.ca2!]).toBe(ids.kCA);
    expect(analyse.kringen[2]!.puntIds).toEqual([]);
  });

  test('onderbord met naam "Garage" geeft Garage.A', () => {
    const { doc } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(32)
            .leiding(6)
            .onderbord((o) => o.kring((ok) => ok.automaat(16).leiding(2.5).contactdozen(1)), "Garage"),
        ),
      )
      .bouw();
    expect(analyseer(doc).kringen.map((k) => k.label)).toEqual(["A", "Garage.A"]);
  });

  test("onderbord met lege naam valt terug op het kringlabel", () => {
    const { doc } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(32)
            .leiding(6)
            .onderbord((o) => o.kring((ok) => ok.automaat(16).leiding(2.5).contactdozen(1)), ""),
        ),
      )
      .bouw();
    expect(analyseer(doc).kringen.map((k) => k.label)).toEqual(["A", "A.A"]);
  });

  test("onderbord met een naam van alleen witruimte valt terug op het kringlabel", () => {
    const { doc } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(32)
            .leiding(6)
            .onderbord((o) => o.kring((ok) => ok.automaat(16).leiding(2.5).contactdozen(1)), "  \t "),
        ),
      )
      .bouw();
    expect(analyseer(doc).kringen.map((k) => k.label)).toEqual(["A", "A.A"]);
  });

  test("punten worden in pre-order genummerd: leiding → [cd1 → cd2, cd3] geeft A1, A2, A3", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).als("leiding").contactdozen(1).als("cd1")))
      .bouw();
    const r2 = voegToe(doc, ids.cd1!, CONTACTDOOS);
    const r3 = voegToe(r2.doc, ids.leiding!, CONTACTDOOS);
    const analyse = analyseer(r3.doc);
    expect(analyse.kringen[0]!.puntIds).toEqual([ids.cd1, r2.id, r3.id]);
    expect(analyse.puntLabels).toEqual({ [ids.cd1!]: "A1", [r2.id]: "A2", [r3.id]: "A3" });
  });

  test("onderbord in een onderbord stapelt de prefixen", () => {
    const { doc } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(40)
            .leiding(10)
            .onderbord((o) =>
              o.kring((ok) =>
                ok
                  .automaat(32)
                  .leiding(6)
                  .onderbord((oo) => oo.kring((ook) => ook.automaat(16).leiding(2.5).contactdozen(1))),
              ),
            ),
        ),
      )
      .bouw();
    expect(analyseer(doc).kringen.map((k) => k.label)).toEqual(["A", "A.A", "A.A.A"]);
  });

  test("alle hoofdborden delen één letterreeks", () => {
    const { doc, ids } = installatie()
      .differentieel(300, (d) =>
        d
          .verdeelbord((b) =>
            b
              .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))
              .kring((k) => k.automaat(16).leiding(2.5).contactdozen(1)),
          )
          .verdeelbord((b) => b.als("bord2").kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("c1"))),
      )
      .bouw();
    const analyse = analyseer(doc);
    expect(analyse.kringen.map((k) => k.label)).toEqual(["A", "B", "C"]);
    expect(analyse.kringen[2]!.verdeelbordId).toBe(ids.bord2);
    expect(analyse.puntLabels[ids.c1!]).toBe("C1");
  });

  test("differentieel → leiding → contactdoos zonder automaat staat in zonderKring", () => {
    const h = handmatig();
    const diff = h.voeg(h.teller, DIFFERENTIEEL);
    const leiding = h.voeg(diff, LEIDING);
    const cd = h.voeg(leiding, CONTACTDOOS);
    const analyse = analyseer(h.doc);
    expect(analyse.zonderKring).toEqual([cd]);
    expect(analyse.kringen).toEqual([]);
    expect(analyse.puntLabels).toEqual({});
    expect(analyse.kringVanNode).toEqual({});
  });

  test("een automaat zonder verdeelbord erboven start geen kring", () => {
    const h = handmatig();
    const auto = h.voeg(h.teller, AUTOMAAT);
    const leiding = h.voeg(auto, LEIDING);
    const cd = h.voeg(leiding, CONTACTDOOS);
    const analyse = analyseer(h.doc);
    expect(analyse.kringen).toEqual([]);
    expect(analyse.zonderKring).toEqual([cd]);
  });

  test("een geneste beveiliging zonder onderbord start een nieuwe kring in dezelfde reeks", () => {
    const h = handmatig();
    const bord = h.voeg(h.teller, { type: "verdeelbord" });
    const kA = h.voeg(bord, AUTOMAAT);
    const leidingA = h.voeg(kA, LEIDING);
    const a1 = h.voeg(leidingA, CONTACTDOOS);
    const diff = h.voeg(kA, DIFFERENTIEEL);
    const kB = h.voeg(diff, AUTOMAAT);
    const leidingB = h.voeg(kB, LEIDING);
    const b1 = h.voeg(leidingB, CONTACTDOOS);
    const kC = h.voeg(bord, AUTOMAAT);
    const analyse = analyseer(h.doc);
    expect(analyse.kringen.map((k) => [k.id, k.label, k.verdeelbordId])).toEqual([
      [kA, "A", bord],
      [kB, "B", bord],
      [kC, "C", bord],
    ]);
    expect(analyse.kringen[0]!.puntIds).toEqual([a1]);
    expect(analyse.kringen[1]!.puntIds).toEqual([b1]);
    expect(analyse.kringVanNode).toEqual({
      [kA]: kA,
      [leidingA]: kA,
      [a1]: kA,
      [diff]: kA,
      [kB]: kB,
      [leidingB]: kB,
      [b1]: kB,
      [kC]: kC,
    });
  });

  test("punten in een onderbord zonder eigen beveiliging horen bij de omsluitende kring", () => {
    const h = handmatig();
    const bord = h.voeg(h.teller, { type: "verdeelbord" });
    const kA = h.voeg(bord, AUTOMAAT);
    const leiding = h.voeg(kA, LEIDING);
    const a1 = h.voeg(leiding, CONTACTDOOS);
    const onderbord = h.voeg(leiding, { type: "verdeelbord" });
    const onderLeiding = h.voeg(onderbord, LEIDING);
    const a2 = h.voeg(onderLeiding, CONTACTDOOS);
    const kAA = h.voeg(onderbord, AUTOMAAT);
    const aa1 = h.voeg(h.voeg(kAA, LEIDING), CONTACTDOOS);
    const analyse = analyseer(h.doc);
    expect(analyse.kringen.map((k) => k.label)).toEqual(["A", "A.A"]);
    expect(analyse.kringen[0]!.puntIds).toEqual([a1, a2]);
    expect(analyse.puntLabels).toEqual({ [a1]: "A1", [a2]: "A2", [aa1]: "A.A1" });
    expect(analyse.kringVanNode[onderbord]).toBe(kA);
    expect(analyse.kringVanNode[onderLeiding]).toBe(kA);
    expect(analyse.kringVanNode[bord]).toBeUndefined();
  });

  test("zekering start ook een kring", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) => b.kring((k) => k.zekering(16).als("z").leiding(2.5).lichtpunten(1)))
      .bouw();
    expect(analyseer(doc).kringen).toMatchObject([{ id: ids.z, label: "A" }]);
  });

  test("tellingen: contactdozen en lichtpunten tellen aantal op, schakelaars en toestellen nodes", () => {
    const { doc, ids } = installatie()
      .verdeelbord((b) =>
        b.kring((k) =>
          k
            .automaat(16)
            .leiding(2.5)
            .contactdozen(3)
            .als("laatste")
            .lichtpunten(2)
            .schakelaar()
            .schakelaar()
            .toestel("oven"),
        ),
      )
      .bouw();
    const r1 = voegToe(doc, ids.laatste!, { ...CONTACTDOOS, aantal: 2 });
    const r2 = voegToe(r1.doc, r1.id, { type: "lichtpunt", aantal: 3 });
    const analyse = analyseer(r2.doc);
    expect(analyse.kringen[0]!.tellingen).toEqual({ contactdozen: 5, lichtpunten: 5, schakelaars: 2, toestellen: 1 });
    expect(analyse.kringen[0]!.puntIds).toHaveLength(10);
  });

  test("een keten van 5.000 contactdozen in één kring geeft geen RangeError", () => {
    const gebouwd = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1).als("eerste")))
      .bouw();
    // De keten rechtstreeks verlengen: 5.000 keer `voegToe` is kwadratisch en te traag voor een test.
    const doc = kloon(gebouwd.doc);
    let ouder = gebouwd.ids.eerste!;
    for (let i = 1; i < 5000; i++) {
      const id = `keten-${i}`;
      doc.nodes[id] = { ...CONTACTDOOS, id, parentId: ouder, kinderen: [] };
      doc.nodes[ouder]!.kinderen.push(id);
      ouder = id;
    }
    expect(valideerStructuur(doc)).toEqual([]);
    const analyse = analyseer(doc);
    expect(analyse.kringen[0]!.puntIds.length).toBe(5000);
    expect(analyse.kringen[0]!.tellingen.contactdozen).toBe(5000);
    expect(analyse.puntLabels[analyse.kringen[0]!.puntIds[4999]!]).toBe("A5000");
  });

  test("analyseer is deterministisch en wijzigt het document niet", () => {
    const { doc } = installatie()
      .verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(2)))
      .bouw();
    const voor = JSON.stringify(doc);
    expect(analyseer(doc)).toEqual(analyseer(doc));
    expect(JSON.stringify(doc)).toBe(voor);
  });
});
