import { describe, expect, test } from "vitest";
import {
  nieuwDocument,
  pasPatchesToe,
  verwijderAfwijking,
  voegAfwijkingToe,
  wijzigProject,
  type Afwijking,
} from "../src/index";
import { kloon, vangFout } from "./hulp";

function afwijking(extra: Partial<Afwijking> = {}): Afwijking {
  return {
    regelId: "R1",
    nodeId: nieuwDocument().rootId,
    motivatie: "Bestaande installatie",
    door: "steff",
    datum: "2026-10-18",
    ...extra,
  };
}

function metTeller() {
  const doc = nieuwDocument();
  return { doc, teller: doc.nodes[doc.rootId]!.kinderen[0]! };
}

describe("voegAfwijkingToe", () => {
  test("voegt een afwijking toe en is omkeerbaar", () => {
    const { doc, teller } = metTeller();
    const a = afwijking({ nodeId: teller });
    const r = voegAfwijkingToe(doc, a);
    expect(r.doc.afwijkingen).toEqual([a]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
  });

  test("vervangt een afwijking met dezelfde regelId en nodeId op dezelfde plek", () => {
    const { doc, teller } = metTeller();
    const eerste = voegAfwijkingToe(doc, afwijking({ nodeId: teller })).doc;
    const tweede = voegAfwijkingToe(eerste, afwijking({ nodeId: teller, regelId: "R2" })).doc;
    const nieuw = afwijking({ nodeId: teller, motivatie: "Andere motivatie" });
    const r = voegAfwijkingToe(tweede, nieuw);
    expect(r.doc.afwijkingen).toHaveLength(2);
    expect(r.doc.afwijkingen[0]).toEqual(nieuw);
    expect(r.doc.afwijkingen[1]!.regelId).toBe("R2");
  });

  test("dezelfde regelId op een andere node is een aparte afwijking", () => {
    const { doc, teller } = metTeller();
    const eerste = voegAfwijkingToe(doc, afwijking({ nodeId: teller })).doc;
    const r = voegAfwijkingToe(eerste, afwijking({ nodeId: doc.rootId }));
    expect(r.doc.afwijkingen).toHaveLength(2);
  });

  test("een motivatie van 9 tekens geeft ONGELDIG_SCHEMA", () => {
    const { doc, teller } = metTeller();
    const voor = kloon(doc);
    const fout = vangFout(() =>
      voegAfwijkingToe(doc, afwijking({ nodeId: teller, motivatie: "123456789" })),
    );
    expect(fout.code).toBe("ONGELDIG_SCHEMA");
    expect(doc).toEqual(voor);
  });

  test("10 tekens na trim is genoeg, witruimte telt niet mee", () => {
    const { doc, teller } = metTeller();
    expect(
      voegAfwijkingToe(doc, afwijking({ nodeId: teller, motivatie: "  1234567890  " })).doc
        .afwijkingen,
    ).toHaveLength(1);
    expect(
      vangFout(() =>
        voegAfwijkingToe(doc, afwijking({ nodeId: teller, motivatie: "  123456789  " })),
      ).code,
    ).toBe("ONGELDIG_SCHEMA");
  });

  test("een onbekende node geeft ONBEKENDE_NODE", () => {
    const { doc } = metTeller();
    expect(vangFout(() => voegAfwijkingToe(doc, afwijking({ nodeId: "bestaat-niet" }))).code).toBe(
      "ONBEKENDE_NODE",
    );
  });
});

describe("verwijderAfwijking", () => {
  test("verwijdert de afwijking en is omkeerbaar", () => {
    const { doc, teller } = metTeller();
    const met = voegAfwijkingToe(doc, afwijking({ nodeId: teller })).doc;
    const r = verwijderAfwijking(met, "R1", teller);
    expect(r.doc.afwijkingen).toEqual([]);
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(met);
  });

  test("een onbestaande afwijking is een no-op met lege patches", () => {
    const { doc, teller } = metTeller();
    const r = verwijderAfwijking(doc, "R1", teller);
    expect(r.doc).toBe(doc);
    expect(r.patches).toEqual([]);
    expect(r.inversePatches).toEqual([]);
  });

  test("een onbekende node is een no-op, geen fout", () => {
    const { doc } = metTeller();
    const r = verwijderAfwijking(doc, "R1", "bestaat-niet");
    expect(r.doc).toBe(doc);
    expect(r.patches).toEqual([]);
  });
});

describe("wijzigProject", () => {
  test("stroomtype verandert alleen voeding.stroomtype", () => {
    const doc = nieuwDocument();
    const r = wijzigProject(doc, { stroomtype: "3N400V" });
    expect(r.doc.voeding.stroomtype).toBe("3N400V");
    expect(r.doc).toEqual({ ...doc, voeding: { stroomtype: "3N400V" } });
    expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
  });

  test("klantNaam verandert alleen meta.klant.naam", () => {
    const doc = nieuwDocument();
    const r = wijzigProject(doc, { klantNaam: "Jan Peeters" });
    expect(r.doc.meta.klant.naam).toBe("Jan Peeters");
    expect(r.doc).toEqual({
      ...doc,
      meta: { ...doc.meta, klant: { ...doc.meta.klant, naam: "Jan Peeters" } },
    });
  });

  test("beide tegelijk", () => {
    const r = wijzigProject(nieuwDocument(), { klantNaam: "X", stroomtype: "3x230V" });
    expect(r.doc.meta.klant.naam).toBe("X");
    expect(r.doc.voeding.stroomtype).toBe("3x230V");
  });

  test("een ongeldig stroomtype geeft ONGELDIG_SCHEMA", () => {
    const doc = nieuwDocument();
    const fout = vangFout(() => wijzigProject(doc, { stroomtype: "5V" as never }));
    expect(fout.code).toBe("ONGELDIG_SCHEMA");
  });

  test("een lege wijziging is een no-op met lege patches", () => {
    const doc = nieuwDocument();
    const r = wijzigProject(doc, {});
    expect(r.doc).toBe(doc);
    expect(r.patches).toEqual([]);
    expect(r.inversePatches).toEqual([]);
  });
});
