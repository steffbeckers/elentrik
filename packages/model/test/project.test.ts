import { describe, expect, test } from "vitest";
import {
  nieuwDocument,
  parseDocument,
  pasPatchesToe,
  verwijderAfwijking,
  voegAfwijkingToe,
  wijzigProject,
  type Adres,
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

  describe("dossierTaal", () => {
    test("een document zonder dossierTaal blijft geldig en ongewijzigd na parse", () => {
      const doc = nieuwDocument();
      expect("dossierTaal" in doc.meta).toBe(false);
      expect(parseDocument(kloon(doc))).toEqual(doc);
    });

    test("nieuwDocument zet de gekozen dossiertaal, en parse houdt ze", () => {
      const doc = nieuwDocument({ dossierTaal: "en" });
      expect(doc.meta.dossierTaal).toBe("en");
      expect(parseDocument(kloon(doc)).meta.dossierTaal).toBe("en");
    });

    test("parse weigert een onbekende dossiertaal", () => {
      const doc = kloon(nieuwDocument());
      (doc.meta as Record<string, unknown>).dossierTaal = "de";
      expect(vangFout(() => parseDocument(doc)).code).toBe("ONGELDIG_SCHEMA");
    });

    test("fr zetten verandert alleen meta.dossierTaal, en undo herstelt de afwezigheid", () => {
      const doc = nieuwDocument();
      const r = wijzigProject(doc, { dossierTaal: "fr" });
      expect(r.doc.meta.dossierTaal).toBe("fr");
      expect(r.doc).toEqual({ ...doc, meta: { ...doc.meta, dossierTaal: "fr" } });
      const terug = pasPatchesToe(r.doc, r.inversePatches);
      expect(terug).toEqual(doc);
      expect("dossierTaal" in terug.meta).toBe(false);
    });

    test("een ongeldige taal gooit ONGELDIG_SCHEMA", () => {
      const doc = nieuwDocument();
      const fout = vangFout(() => wijzigProject(doc, { dossierTaal: "de" as never }));
      expect(fout.code).toBe("ONGELDIG_SCHEMA");
    });

    test("een gelijke waarde valt weg", () => {
      const fr = nieuwDocument({ dossierTaal: "fr" });
      const r = wijzigProject(fr, { dossierTaal: "fr" });
      expect(r.doc).toBe(fr);
      expect(r.patches).toEqual([]);
      // Afwezig betekent nl: nl zetten op een document zonder veld verandert niets.
      const kaal = nieuwDocument();
      const nl = wijzigProject(kaal, { dossierTaal: "nl" });
      expect(nl.doc).toBe(kaal);
      expect(nl.patches).toEqual([]);
    });

    test("telt als dezelfde undo-stap als de andere projectgegevens", () => {
      const doc = nieuwDocument();
      const r = wijzigProject(doc, { klantNaam: "X", dossierTaal: "en" });
      expect(r.doc.meta.klant.naam).toBe("X");
      expect(r.doc.meta.dossierTaal).toBe("en");
      expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
    });
  });

  describe("projectgegevens", () => {
    const adres: Adres = {
      straat: "Dorpsstraat",
      nummer: "12",
      bus: "A",
      postcode: "9000",
      gemeente: "Gent",
      land: "BE",
    };

    test("klantAdres zetten en ongedaan maken", () => {
      const doc = nieuwDocument();
      const r = wijzigProject(doc, { klantAdres: adres });
      expect(r.doc.meta.klant.adres).toEqual(adres);
      expect(r.doc).toEqual({
        ...doc,
        meta: { ...doc.meta, klant: { ...doc.meta.klant, adres } },
      });
      expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
    });

    test("klantAdres null wist het adres en is omkeerbaar", () => {
      const met = wijzigProject(nieuwDocument(), { klantAdres: adres }).doc;
      const r = wijzigProject(met, { klantAdres: null });
      expect("adres" in r.doc.meta.klant).toBe(false);
      expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(met);
    });

    test("werfadres zetten en ongedaan maken", () => {
      const doc = nieuwDocument();
      const r = wijzigProject(doc, { werfadres: adres });
      expect(r.doc.meta.werfadres).toEqual(adres);
      expect(r.doc).toEqual({ ...doc, meta: { ...doc.meta, werfadres: adres } });
      expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
    });

    test("ean zetten en ongedaan maken", () => {
      const doc = nieuwDocument();
      const r = wijzigProject(doc, { ean: "541448900000000001" });
      expect(r.doc.meta.ean).toBe("541448900000000001");
      expect(r.doc).toEqual({ ...doc, meta: { ...doc.meta, ean: "541448900000000001" } });
      expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
    });

    test("datum zetten en ongedaan maken", () => {
      const doc = nieuwDocument();
      const r = wijzigProject(doc, { datum: "2026-12-31" });
      expect(r.doc.meta.datum).toBe("2026-12-31");
      expect(r.doc).toEqual({ ...doc, meta: { ...doc.meta, datum: "2026-12-31" } });
      expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
    });

    test("alle velden in een aanroep zijn een omkeerbaar resultaat", () => {
      const doc = nieuwDocument();
      const r = wijzigProject(doc, {
        klantNaam: "Jan",
        stroomtype: "3N400V",
        klantAdres: adres,
        werfadres: adres,
        ean: "541448900000000001",
        datum: "2026-12-31",
      });
      expect(r.doc.meta.klant).toEqual({ naam: "Jan", adres });
      expect(r.doc.meta.werfadres).toEqual(adres);
      expect(r.doc.voeding.stroomtype).toBe("3N400V");
      expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
    });

    test("een ongeldig adres (zonder gemeente) geeft ONGELDIG_SCHEMA", () => {
      const doc = nieuwDocument();
      const voor = kloon(doc);
      const { gemeente: _weg, ...zonderGemeente } = adres;
      expect(
        vangFout(() => wijzigProject(doc, { klantAdres: zonderGemeente as never })).code,
      ).toBe("ONGELDIG_SCHEMA");
      expect(
        vangFout(() => wijzigProject(doc, { werfadres: zonderGemeente as never })).code,
      ).toBe("ONGELDIG_SCHEMA");
      expect(doc).toEqual(voor);
    });

    test("een ean of datum die geen tekst is geeft ONGELDIG_SCHEMA", () => {
      const doc = nieuwDocument();
      expect(vangFout(() => wijzigProject(doc, { ean: 5 as never })).code).toBe("ONGELDIG_SCHEMA");
      expect(vangFout(() => wijzigProject(doc, { datum: 5 as never })).code).toBe(
        "ONGELDIG_SCHEMA",
      );
    });
  });
});
