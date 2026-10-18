import { describe, expect, test } from "vitest";
import {
  nieuwDocument,
  pasPatchesToe,
  valideerStructuur,
  verplaats,
  verwijder,
  verwijderEnkel,
  voegToe,
  wijzigEigenschappen,
  type InstallatieDocument,
  type NodeId,
} from "../src/index";
import { kloon, vangFout } from "./hulp";

const DIFFERENTIEEL = {
  type: "differentieel",
  gevoeligheid_mA: 300,
  nominaal_A: 40,
  polen: 2,
  klasse: "A",
} as const;

function start(): { doc0: InstallatieDocument; root: NodeId; teller: NodeId } {
  const doc0 = nieuwDocument();
  return { doc0, root: doc0.rootId, teller: doc0.nodes[doc0.rootId]!.kinderen[0]! };
}

/** teller > bord > automaat > leiding > contactdoos, met plaatsing en afwijking op de contactdoos. */
function diepDocument(): {
  doc: InstallatieDocument;
  teller: NodeId;
  bord: NodeId;
  automaat: NodeId;
  leiding: NodeId;
  doos: NodeId;
} {
  const { doc0, teller } = start();
  const bord = voegToe(doc0, teller, { type: "verdeelbord" });
  const automaat = voegToe(bord.doc, bord.id, {
    type: "automaat",
    nominaal_A: 16,
    polen: 2,
    curve: "B",
  });
  const leiding = voegToe(automaat.doc, automaat.id, {
    type: "leiding",
    kabeltype: "",
    doorsnede_mm2: 0,
    aantalGeleiders: 3,
  });
  const doos = voegToe(leiding.doc, leiding.id, {
    type: "contactdoos",
    aantal: 1,
    randaarde: true,
    kinderbeveiliging: false,
    waterdicht: false,
  });
  const doc = kloon(doos.doc);
  doc.situatie.paginas.push({
    id: "p1",
    titel: "Gelijkvloers",
    plaatsingen: [
      { nodeId: doos.id, x: 1, y: 2, rotatie: 0 },
      { nodeId: teller, x: 5, y: 5, rotatie: 0 },
    ],
  });
  doc.afwijkingen.push(
    { regelId: "r1", nodeId: doos.id, motivatie: "m", door: "d", datum: "2026-10-17" },
    { regelId: "r2", nodeId: teller, motivatie: "m", door: "d", datum: "2026-10-17" },
  );
  return {
    doc,
    teller,
    bord: bord.id,
    automaat: automaat.id,
    leiding: leiding.id,
    doos: doos.id,
  };
}

describe("voegToe", () => {
  test("voegToe plaatst kind op index en zet parentId", () => {
    const { doc0, teller } = start();
    const a = voegToe(doc0, teller, { type: "verdeelbord" });
    const b = voegToe(a.doc, teller, DIFFERENTIEEL, 0);
    expect(b.doc.nodes[teller]!.kinderen).toEqual([b.id, a.id]);
    expect(b.doc.nodes[b.id]!.parentId).toBe(teller);
    expect(b.doc.nodes[b.id]!.kinderen).toEqual([]);
    expect(valideerStructuur(b.doc)).toEqual([]);
  });

  test("zonder index komt het kind achteraan", () => {
    const { doc0, teller } = start();
    const a = voegToe(doc0, teller, { type: "verdeelbord" });
    const b = voegToe(a.doc, teller, DIFFERENTIEEL);
    expect(b.doc.nodes[teller]!.kinderen).toEqual([a.id, b.id]);
  });

  test("index gelijk aan kinderen.length is toegelaten", () => {
    const { doc0, teller } = start();
    const a = voegToe(doc0, teller, { type: "verdeelbord" });
    const b = voegToe(a.doc, teller, DIFFERENTIEEL, 1);
    expect(b.doc.nodes[teller]!.kinderen).toEqual([a.id, b.id]);
  });

  test("het invoerdocument blijft ongewijzigd", () => {
    const { doc0, teller } = start();
    const voor = kloon(doc0);
    voegToe(doc0, teller, { type: "verdeelbord" });
    expect(doc0).toEqual(voor);
  });

  test("onbekende ouder → ONBEKENDE_NODE", () => {
    const { doc0 } = start();
    expect(vangFout(() => voegToe(doc0, "bestaat-niet", { type: "verdeelbord" })).code).toBe(
      "ONBEKENDE_NODE",
    );
    // ids die op het prototype bestaan tellen niet als node
    expect(vangFout(() => voegToe(doc0, "constructor", { type: "verdeelbord" })).code).toBe(
      "ONBEKENDE_NODE",
    );
  });

  test("contactdoos onder teller → NIET_TOEGELATEN_KIND, doc ongewijzigd", () => {
    const { doc0, teller } = start();
    const voor = kloon(doc0);
    const fout = vangFout(() =>
      voegToe(doc0, teller, {
        type: "contactdoos",
        aantal: 1,
        randaarde: true,
        kinderbeveiliging: false,
        waterdicht: false,
      }),
    );
    expect(fout.code).toBe("NIET_TOEGELATEN_KIND");
    expect(doc0).toEqual(voor);
  });

  test.each([-1, 2, 1.5, Number.NaN])("index %s buiten bereik → ONGELDIGE_INDEX", (index) => {
    const { doc0, teller } = start();
    const voor = kloon(doc0);
    const fout = vangFout(() => voegToe(doc0, teller, { type: "verdeelbord" }, index));
    expect(fout.code).toBe("ONGELDIGE_INDEX");
    expect(doc0).toEqual(voor);
  });

  test("ongeldige eigenschappen → ONGELDIG_SCHEMA, doc ongewijzigd", () => {
    const { doc0, teller } = start();
    const voor = kloon(doc0);
    const fout = vangFout(() => voegToe(doc0, teller, { ...DIFFERENTIEEL, nominaal_A: -1 }));
    expect(fout.code).toBe("ONGELDIG_SCHEMA");
    expect(doc0).toEqual(voor);
  });

  test("onbekende eigenschappen of structuurvelden in de invoer → ONGELDIG_SCHEMA", () => {
    const { doc0, teller } = start();
    const metExtra = { type: "verdeelbord", extra: 1 } as never;
    expect(vangFout(() => voegToe(doc0, teller, metExtra)).code).toBe("ONGELDIG_SCHEMA");
    const metKinderen = { type: "verdeelbord", kinderen: ["x"] } as never;
    expect(vangFout(() => voegToe(doc0, teller, metKinderen)).code).toBe("ONGELDIG_SCHEMA");
  });
});

describe("verwijder", () => {
  test("verwijder ruimt subboom, plaatsingen en afwijkingen op", () => {
    const { doc, teller, bord, automaat, leiding, doos } = diepDocument();
    const voor = kloon(doc);
    const r = verwijder(doc, bord);
    for (const id of [bord, automaat, leiding, doos]) {
      expect(Object.hasOwn(r.doc.nodes, id)).toBe(false);
    }
    expect(r.doc.nodes[teller]!.kinderen).toEqual([]);
    expect(r.doc.situatie.paginas[0]!.plaatsingen).toEqual([
      { nodeId: teller, x: 5, y: 5, rotatie: 0 },
    ]);
    expect(r.doc.afwijkingen.map((a) => a.regelId)).toEqual(["r2"]);
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(doc).toEqual(voor);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(voor);
  });

  test("verwijder van een blad laat de rest staan", () => {
    const { doc, leiding, doos } = diepDocument();
    const r = verwijder(doc, doos);
    expect(r.doc.nodes[leiding]!.kinderen).toEqual([]);
    expect(Object.hasOwn(r.doc.nodes, doos)).toBe(false);
    expect(r.doc.afwijkingen.map((a) => a.regelId)).toEqual(["r2"]);
  });

  test("root verwijderen → ROOT_NIET_WIJZIGBAAR", () => {
    const { doc0, root } = start();
    expect(vangFout(() => verwijder(doc0, root)).code).toBe("ROOT_NIET_WIJZIGBAAR");
  });

  test("onbekende node → ONBEKENDE_NODE", () => {
    const { doc0 } = start();
    expect(vangFout(() => verwijder(doc0, "bestaat-niet")).code).toBe("ONBEKENDE_NODE");
  });

  test("diepe keten geeft geen stack overflow", () => {
    const { doc0, teller } = start();
    const doc = kloon(doc0);
    const diepte = 20000;
    let ouder: NodeId = teller;
    let eerste: NodeId | undefined;
    for (let i = 0; i < diepte; i++) {
      const id = `l${i}`;
      doc.nodes[id] = {
        id,
        parentId: ouder,
        kinderen: [],
        type: "leiding",
        kabeltype: "",
        doorsnede_mm2: 0,
        aantalGeleiders: 2,
      };
      doc.nodes[ouder]!.kinderen.push(id);
      eerste ??= id;
      ouder = id;
    }
    const r = verwijder(doc, eerste!);
    expect(Object.keys(r.doc.nodes)).toHaveLength(2);
    // CYCLUS-controle in verplaats is ook iteratief
    const fout = vangFout(() => verplaats(doc, eerste!, ouder));
    expect(fout.code).toBe("CYCLUS");
  });
});

describe("verplaats", () => {
  test("verplaats naar eigen nakomeling → CYCLUS", () => {
    const { doc, bord, leiding } = diepDocument();
    const voor = kloon(doc);
    expect(vangFout(() => verplaats(doc, bord, leiding)).code).toBe("CYCLUS");
    expect(doc).toEqual(voor);
  });

  test("verplaats naar zichzelf → CYCLUS", () => {
    const { doc, bord } = diepDocument();
    expect(vangFout(() => verplaats(doc, bord, bord)).code).toBe("CYCLUS");
  });

  test("root verplaatsen → ROOT_NIET_WIJZIGBAAR", () => {
    const { doc, teller } = diepDocument();
    expect(vangFout(() => verplaats(doc, doc.rootId, teller)).code).toBe("ROOT_NIET_WIJZIGBAAR");
  });

  test("onbekende node of ouder → ONBEKENDE_NODE", () => {
    const { doc, bord } = diepDocument();
    expect(vangFout(() => verplaats(doc, "nee", bord)).code).toBe("ONBEKENDE_NODE");
    expect(vangFout(() => verplaats(doc, bord, "nee")).code).toBe("ONBEKENDE_NODE");
  });

  test("niet toegelaten type bij nieuwe ouder → NIET_TOEGELATEN_KIND", () => {
    const { doc, doos, teller } = diepDocument();
    const voor = kloon(doc);
    expect(vangFout(() => verplaats(doc, doos, teller)).code).toBe("NIET_TOEGELATEN_KIND");
    expect(doc).toEqual(voor);
  });

  test("verplaatst naar een andere ouder op index, parentId en kinderen kloppen", () => {
    const { doc0, teller } = start();
    const a = voegToe(doc0, teller, { type: "verdeelbord" });
    const b = voegToe(a.doc, teller, DIFFERENTIEEL);
    const voor = kloon(b.doc);
    const r = verplaats(b.doc, a.id, b.id, 0);
    expect(r.doc.nodes[teller]!.kinderen).toEqual([b.id]);
    expect(r.doc.nodes[b.id]!.kinderen).toEqual([a.id]);
    expect(r.doc.nodes[a.id]!.parentId).toBe(b.id);
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(b.doc).toEqual(voor);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(voor);
  });

  test("index buiten bereik van de nieuwe ouder → ONGELDIGE_INDEX", () => {
    const { doc0, teller } = start();
    const a = voegToe(doc0, teller, { type: "verdeelbord" });
    const b = voegToe(a.doc, teller, DIFFERENTIEEL);
    expect(vangFout(() => verplaats(b.doc, a.id, b.id, 1)).code).toBe("ONGELDIGE_INDEX");
    expect(vangFout(() => verplaats(b.doc, a.id, b.id, -1)).code).toBe("ONGELDIGE_INDEX");
  });

  describe("binnen dezelfde ouder: index geldt na verwijderen van de node", () => {
    function drie(): { doc: InstallatieDocument; teller: NodeId; ids: NodeId[] } {
      const { doc0, teller } = start();
      const a = voegToe(doc0, teller, { type: "verdeelbord" });
      const b = voegToe(a.doc, teller, DIFFERENTIEEL);
      const c = voegToe(b.doc, teller, { type: "verdeelbord" });
      return { doc: c.doc, teller, ids: [a.id, b.id, c.id] };
    }

    test("naar achter: index = lengte na verwijderen", () => {
      const { doc, teller, ids } = drie();
      const [a, b, c] = ids as [NodeId, NodeId, NodeId];
      const r = verplaats(doc, a, teller, 2);
      expect(r.doc.nodes[teller]!.kinderen).toEqual([b, c, a]);
      expect(valideerStructuur(r.doc)).toEqual([]);
    });

    test("naar voor", () => {
      const { doc, teller, ids } = drie();
      const [a, b, c] = ids as [NodeId, NodeId, NodeId];
      const r = verplaats(doc, c, teller, 0);
      expect(r.doc.nodes[teller]!.kinderen).toEqual([c, a, b]);
    });

    test("zonder index komt de node achteraan", () => {
      const { doc, teller, ids } = drie();
      const [a, b, c] = ids as [NodeId, NodeId, NodeId];
      const r = verplaats(doc, a, teller);
      expect(r.doc.nodes[teller]!.kinderen).toEqual([b, c, a]);
    });

    test("index 3 is buiten bereik (na verwijderen is de lengte 2)", () => {
      const { doc, teller, ids } = drie();
      expect(vangFout(() => verplaats(doc, ids[0]!, teller, 3)).code).toBe("ONGELDIGE_INDEX");
    });

    test("naar dezelfde positie is een no-op met geldig resultaat", () => {
      const { doc, teller, ids } = drie();
      const voor = kloon(doc);
      const r = verplaats(doc, ids[1]!, teller, 1);
      expect(r.doc).toEqual(voor);
      expect(r.patches).toEqual([]);
      expect(r.inversePatches).toEqual([]);
      expect(valideerStructuur(r.doc)).toEqual([]);
    });
  });

  test("plaatsingen en afwijkingen blijven behouden bij verplaatsen", () => {
    const { doc, leiding, automaat, bord } = diepDocument();
    const r = verplaats(doc, leiding, bord);
    expect(r.doc.situatie).toEqual(doc.situatie);
    expect(r.doc.afwijkingen).toEqual(doc.afwijkingen);
    expect(r.doc.nodes[automaat]!.kinderen).toEqual([]);
  });
});

describe("wijzigEigenschappen", () => {
  test("past eigenschappen aan en laat het invoerdocument ongewijzigd", () => {
    const { doc0, teller } = start();
    const a = voegToe(doc0, teller, DIFFERENTIEEL);
    const voor = kloon(a.doc);
    const r = wijzigEigenschappen(a.doc, a.id, { nominaal_A: 63, label: "Hoofd" });
    expect(r.doc.nodes[a.id]).toMatchObject({ nominaal_A: 63, label: "Hoofd", klasse: "A" });
    expect(a.doc).toEqual(voor);
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(voor);
  });

  test("een undefined-waarde verwijdert een optionele eigenschap", () => {
    const { doc0, teller } = start();
    const a = voegToe(doc0, teller, { type: "verdeelbord", label: "bord" });
    const r = wijzigEigenschappen(a.doc, a.id, { label: undefined });
    expect(Object.hasOwn(r.doc.nodes[a.id]!, "label")).toBe(false);
  });

  test.each(["id", "type", "parentId", "kinderen"])(
    "wijzigEigenschappen kan %s niet wijzigen",
    (veld) => {
      const { doc0, teller } = start();
      const a = voegToe(doc0, teller, { type: "verdeelbord" });
      const voor = kloon(a.doc);
      const fout = vangFout(() => wijzigEigenschappen(a.doc, a.id, { [veld]: "x" }));
      expect(fout.code).toBe("ONGELDIG_SCHEMA");
      expect(a.doc).toEqual(voor);
    },
  );

  test("wijzigEigenschappen valideert: nominaal_A -1 → ONGELDIG_SCHEMA", () => {
    const { doc0, teller } = start();
    const a = voegToe(doc0, teller, DIFFERENTIEEL);
    const voor = kloon(a.doc);
    const fout = vangFout(() => wijzigEigenschappen(a.doc, a.id, { nominaal_A: -1 }));
    expect(fout.code).toBe("ONGELDIG_SCHEMA");
    expect(a.doc).toEqual(voor);
  });

  test("onbekende eigenschap voor het type → ONGELDIG_SCHEMA", () => {
    const { doc0, teller } = start();
    const a = voegToe(doc0, teller, { type: "verdeelbord" });
    expect(vangFout(() => wijzigEigenschappen(a.doc, a.id, { nominaal_A: 16 })).code).toBe(
      "ONGELDIG_SCHEMA",
    );
  });

  test("onbekende node → ONBEKENDE_NODE", () => {
    const { doc0 } = start();
    expect(vangFout(() => wijzigEigenschappen(doc0, "nee", { label: "x" })).code).toBe(
      "ONBEKENDE_NODE",
    );
  });
});

describe("patches", () => {
  test("inversePatches herstellen het origineel", () => {
    const { doc0, teller } = start();
    const r = voegToe(doc0, teller, { type: "verdeelbord" });
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc0);
  });

  test("patches reproduceren het resultaat uit het origineel", () => {
    const { doc, bord, teller } = diepDocument();
    const r = verwijder(doc, bord);
    expect(pasPatchesToe(doc, r.patches)).toEqual(r.doc);
    expect(r.doc.nodes[teller]!.kinderen).toEqual([]);
  });

  test("patches zijn JSON-serialiseerbaar", () => {
    const { doc0, teller } = start();
    const r = voegToe(doc0, teller, { type: "verdeelbord" });
    expect(pasPatchesToe(doc0, kloon(r.patches))).toEqual(r.doc);
  });
});

const LEIDING = { type: "leiding", kabeltype: "", doorsnede_mm2: 0, aantalGeleiders: 3 } as const;
const CONTACTDOOS = {
  type: "contactdoos",
  aantal: 1,
  randaarde: true,
  kinderbeveiliging: false,
  waterdicht: false,
} as const;
const AUTOMAAT = { type: "automaat", nominaal_A: 16, polen: 2, curve: "B" } as const;

/** teller > bord > automaat > leiding > cd1 > cd2 > cd3. */
function keten(): {
  doc: InstallatieDocument;
  leiding: NodeId;
  cd: [NodeId, NodeId, NodeId];
} {
  const { doc0, teller } = start();
  const bord = voegToe(doc0, teller, { type: "verdeelbord" });
  const automaat = voegToe(bord.doc, bord.id, AUTOMAAT);
  const leiding = voegToe(automaat.doc, automaat.id, LEIDING);
  const cd1 = voegToe(leiding.doc, leiding.id, CONTACTDOOS);
  const cd2 = voegToe(cd1.doc, cd1.id, CONTACTDOOS);
  const cd3 = voegToe(cd2.doc, cd2.id, CONTACTDOOS);
  return { doc: cd3.doc, leiding: leiding.id, cd: [cd1.id, cd2.id, cd3.id] };
}

describe("verwijderEnkel", () => {
  test("een middelste contactdoos in een keten laat de ketting sluiten", () => {
    const { doc, leiding, cd } = keten();
    const r = verwijderEnkel(doc, cd[1]);
    expect(r.doc.nodes[cd[1]]).toBeUndefined();
    expect(r.doc.nodes[leiding]!.kinderen).toEqual([cd[0]]);
    expect(r.doc.nodes[cd[0]]!.kinderen).toEqual([cd[2]]);
    expect(r.doc.nodes[cd[2]]!.parentId).toBe(cd[0]);
    expect(valideerStructuur(r.doc)).toEqual([]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
    expect(pasPatchesToe(doc, r.patches)).toEqual(r.doc);
  });

  test("de kinderen nemen de plek van de node in, in dezelfde volgorde", () => {
    const { doc0, teller } = start();
    const bord = voegToe(doc0, teller, { type: "verdeelbord" });
    const a1 = voegToe(bord.doc, bord.id, AUTOMAAT);
    const middelste = voegToe(a1.doc, bord.id, AUTOMAAT);
    const a3 = voegToe(middelste.doc, bord.id, AUTOMAAT);
    const l1 = voegToe(a3.doc, middelste.id, LEIDING);
    const l2 = voegToe(l1.doc, middelste.id, LEIDING);

    const r = verwijderEnkel(l2.doc, middelste.id);
    expect(r.doc.nodes[bord.id]!.kinderen).toEqual([a1.id, l1.id, l2.id, a3.id]);
    expect(r.doc.nodes[l1.id]!.parentId).toBe(bord.id);
    expect(r.doc.nodes[l2.id]!.parentId).toBe(bord.id);
    expect(valideerStructuur(r.doc)).toEqual([]);
  });

  test("een node zonder kinderen verdwijnt gewoon", () => {
    const { doc, cd } = keten();
    const r = verwijderEnkel(doc, cd[2]);
    expect(r.doc.nodes[cd[1]]!.kinderen).toEqual([]);
    expect(valideerStructuur(r.doc)).toEqual([]);
  });

  test("kinderen die niet onder de ouder mogen geven NIET_TOEGELATEN_KIND en wijzigen niets", () => {
    const { doc0, teller } = start();
    const bord = voegToe(doc0, teller, { type: "verdeelbord" });
    const leiding = voegToe(bord.doc, bord.id, LEIDING);
    const subbord = voegToe(leiding.doc, leiding.id, { type: "verdeelbord" });
    const automaat = voegToe(subbord.doc, subbord.id, AUTOMAAT);
    const voor = kloon(automaat.doc);

    const fout = vangFout(() => verwijderEnkel(automaat.doc, subbord.id));
    expect(fout.code).toBe("NIET_TOEGELATEN_KIND");
    expect(fout.details).toEqual({ kindId: automaat.id, ouderType: "leiding" });
    expect(automaat.doc).toEqual(voor);
  });

  test("een leiding onder een beveiliging mag onder het bord blijven hangen", () => {
    const { doc0, teller } = start();
    const bord = voegToe(doc0, teller, { type: "verdeelbord" });
    const automaat = voegToe(bord.doc, bord.id, AUTOMAAT);
    const leiding = voegToe(automaat.doc, automaat.id, LEIDING);

    const r = verwijderEnkel(leiding.doc, automaat.id);
    expect(r.doc.nodes[bord.id]!.kinderen).toEqual([leiding.id]);
    expect(r.doc.nodes[leiding.id]!.parentId).toBe(bord.id);
    expect(valideerStructuur(r.doc)).toEqual([]);
  });

  test("de root geeft ROOT_NIET_WIJZIGBAAR", () => {
    const { doc0, root } = start();
    expect(vangFout(() => verwijderEnkel(doc0, root)).code).toBe("ROOT_NIET_WIJZIGBAAR");
  });

  test("de teller geeft ROOT_NIET_WIJZIGBAAR met reden teller", () => {
    const { doc0, teller } = start();
    const fout = vangFout(() => verwijderEnkel(doc0, teller));
    expect(fout.code).toBe("ROOT_NIET_WIJZIGBAAR");
    expect(fout.details).toEqual({ nodeId: teller, reden: "teller" });
  });

  test("een onbekende node geeft ONBEKENDE_NODE", () => {
    const { doc0 } = start();
    expect(vangFout(() => verwijderEnkel(doc0, "bestaat-niet")).code).toBe("ONBEKENDE_NODE");
  });

  test("plaatsing en afwijkingen van de node verdwijnen, die van zijn kinderen blijven", () => {
    const { doc: basis, cd } = keten();
    const doc = kloon(basis);
    doc.situatie.paginas.push({
      id: "p1",
      titel: "Gelijkvloers",
      plaatsingen: [
        { nodeId: cd[1], x: 1, y: 2, rotatie: 0 },
        { nodeId: cd[2], x: 3, y: 4, rotatie: 0 },
      ],
    });
    doc.afwijkingen.push(
      { regelId: "r1", nodeId: cd[1], motivatie: "voldoende tekst", door: "d", datum: "2026-10-18" },
      { regelId: "r1", nodeId: cd[2], motivatie: "voldoende tekst", door: "d", datum: "2026-10-18" },
    );

    const r = verwijderEnkel(doc, cd[1]);
    expect(r.doc.situatie.paginas[0]!.plaatsingen.map((p) => p.nodeId)).toEqual([cd[2]]);
    expect(r.doc.afwijkingen.map((a) => a.nodeId)).toEqual([cd[2]]);
    expect(valideerStructuur(r.doc)).toEqual([]);
  });
});
