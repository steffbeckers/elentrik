import { describe, expect, test } from "vitest";
import {
  nieuwDocument,
  pasPatchesToe,
  valideerStructuur,
  voegToe,
  type InstallatieDocument,
  type Node,
  type NodeId,
} from "../src/index";
import { pasSjabloonToe, type Sjabloon, type SjabloonNode } from "../src/sjablonen";
import { kloon, vangFout } from "./hulp";

const CONTACTDOOS = {
  type: "contactdoos",
  aantal: 1,
  randaarde: true,
  kinderbeveiliging: false,
  waterdicht: false,
  ruimte: "keuken",
} as const;

const KEUKEN: Sjabloon = {
  id: "stopcontacten-keuken",
  naam: "Stopcontacten keuken",
  boom: {
    type: "automaat",
    nominaal_A: 20,
    polen: 2,
    curve: "C",
    ruimte: "keuken",
    kinderen: [
      {
        type: "leiding",
        kabeltype: "XVB",
        doorsnede_mm2: 2.5,
        aantalGeleiders: 3,
        ruimte: "keuken",
        kinderen: [
          { ...CONTACTDOOS, kinderen: [{ ...CONTACTDOOS, kinderen: [{ ...CONTACTDOOS }] }] },
        ],
      },
    ],
  },
};

function metBord(): { doc: InstallatieDocument; bord: NodeId } {
  const doc0 = nieuwDocument();
  const teller = doc0.nodes[doc0.rootId]!.kinderen[0]!;
  const bord = voegToe(doc0, teller, { type: "verdeelbord" });
  return { doc: kloon(bord.doc), bord: bord.id };
}

describe("pasSjabloonToe", () => {
  test("voegt het hele sjabloon in als één operatie", () => {
    const { doc, bord } = metBord();
    const voor = kloon(doc);
    const r = pasSjabloonToe(doc, bord, KEUKEN);

    expect(Object.keys(r.doc.nodes)).toHaveLength(Object.keys(doc.nodes).length + 5);
    expect(valideerStructuur(r.doc)).toEqual([]);

    const wortel = r.doc.nodes[r.id]!;
    expect(wortel.type).toBe("automaat");
    expect(wortel.parentId).toBe(bord);
    expect(r.doc.nodes[bord]!.kinderen).toEqual([r.id]);

    const keten: string[] = [];
    let huidig: NodeId | undefined = r.id;
    while (huidig) {
      const node: Node = r.doc.nodes[huidig]!;
      keten.push(node.type);
      expect(node.ruimte).toBe("keuken");
      huidig = node.kinderen[0];
    }
    expect(keten).toEqual(["automaat", "leiding", "contactdoos", "contactdoos", "contactdoos"]);

    // één undo-stap
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(voor);
    expect(pasPatchesToe(voor, r.patches)).toEqual(r.doc);
  });

  test("elke toepassing geeft nieuwe id's", () => {
    const { doc, bord } = metBord();
    const a = pasSjabloonToe(doc, bord, KEUKEN);
    const b = pasSjabloonToe(a.doc, bord, KEUKEN);
    const ids = Object.keys(b.doc.nodes);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b.doc.nodes[bord]!.kinderen).toEqual([a.id, b.id]);
    expect(valideerStructuur(b.doc)).toEqual([]);
  });

  test("index volgt de regels van voegToe", () => {
    const { doc, bord } = metBord();
    const eerste = voegToe(doc, bord, { type: "zekering", nominaal_A: 10 });
    const r = pasSjabloonToe(eerste.doc, bord, KEUKEN, 0);
    expect(r.doc.nodes[bord]!.kinderen).toEqual([r.id, eerste.id]);

    expect(vangFout(() => pasSjabloonToe(doc, bord, KEUKEN, 2)).code).toBe("ONGELDIGE_INDEX");
    expect(vangFout(() => pasSjabloonToe(doc, bord, KEUKEN, -1)).code).toBe("ONGELDIGE_INDEX");
  });

  test("onbekende ouder gooit ONBEKENDE_NODE", () => {
    const { doc } = metBord();
    expect(vangFout(() => pasSjabloonToe(doc, "bestaat-niet", KEUKEN)).code).toBe(
      "ONBEKENDE_NODE",
    );
  });

  test("een niet-toegelaten kind op de wortel gooit NIET_TOEGELATEN_KIND", () => {
    const { doc, bord } = metBord();
    const voor = kloon(doc);
    const slecht: Sjabloon = { id: "x", naam: "x", boom: { ...CONTACTDOOS } };
    expect(vangFout(() => pasSjabloonToe(doc, bord, slecht)).code).toBe("NIET_TOEGELATEN_KIND");
    expect(doc).toEqual(voor);
  });

  test("een niet-toegelaten kind dieper in het sjabloon gooit en laat het document ongewijzigd", () => {
    const { doc, bord } = metBord();
    const voor = kloon(doc);
    const slecht: Sjabloon = {
      id: "x",
      naam: "x",
      boom: {
        ...KEUKEN.boom,
        kinderen: [
          {
            type: "leiding",
            kabeltype: "",
            doorsnede_mm2: 0,
            aantalGeleiders: 3,
            // een zekering mag niet onder een contactdoos
            kinderen: [{ ...CONTACTDOOS, kinderen: [{ type: "zekering", nominaal_A: 10 }] }],
          },
        ],
      },
    };
    const fout = vangFout(() => pasSjabloonToe(doc, bord, slecht));
    expect(fout.code).toBe("NIET_TOEGELATEN_KIND");
    expect(doc).toEqual(voor);
  });

  test("een ongeldige node dieper in het sjabloon gooit ONGELDIG_SCHEMA", () => {
    const { doc, bord } = metBord();
    const voor = kloon(doc);
    const slecht = {
      id: "x",
      naam: "x",
      boom: {
        ...KEUKEN.boom,
        kinderen: [{ type: "leiding", kabeltype: "", doorsnede_mm2: -1, aantalGeleiders: 3 }],
      },
    } as Sjabloon;
    expect(vangFout(() => pasSjabloonToe(doc, bord, slecht)).code).toBe("ONGELDIG_SCHEMA");
    expect(doc).toEqual(voor);
  });

  test("id en parentId in een sjabloonnode zijn niet toegelaten", () => {
    const { doc, bord } = metBord();
    const slecht = {
      id: "x",
      naam: "x",
      boom: { ...KEUKEN.boom, kinderen: [], id: "vast" },
    } as unknown as Sjabloon;
    expect(vangFout(() => pasSjabloonToe(doc, bord, slecht)).code).toBe("ONGELDIG_SCHEMA");
  });

  test("een onbekend type en een ongeldige kinderenlijst gooien ONGELDIG_SCHEMA", () => {
    const { doc, bord } = metBord();
    const onbekend = { id: "x", naam: "x", boom: { type: "constructor" } } as unknown as Sjabloon;
    expect(vangFout(() => pasSjabloonToe(doc, bord, onbekend)).code).toBe("ONGELDIG_SCHEMA");
    const geenLijst = {
      id: "x",
      naam: "x",
      boom: { ...KEUKEN.boom, kinderen: "nee" },
    } as unknown as Sjabloon;
    expect(vangFout(() => pasSjabloonToe(doc, bord, geenLijst)).code).toBe("ONGELDIG_SCHEMA");
  });

  test("een zeer diep sjabloon veroorzaakt geen stack overflow", () => {
    const { doc, bord } = metBord();
    const leiding = {
      type: "leiding",
      kabeltype: "",
      doorsnede_mm2: 0,
      aantalGeleiders: 3,
    } as const;
    let boom: SjabloonNode = { ...CONTACTDOOS };
    for (let i = 0; i < 20_000; i++) boom = { ...leiding, kinderen: [boom] };
    const sjabloon: Sjabloon = { id: "diep", naam: "diep", boom: { ...leiding, kinderen: [boom] } };
    const r = pasSjabloonToe(doc, bord, sjabloon);
    expect(Object.keys(r.doc.nodes)).toHaveLength(Object.keys(doc.nodes).length + 20_002);
    expect(valideerStructuur(r.doc)).toEqual([]);
  });
});
