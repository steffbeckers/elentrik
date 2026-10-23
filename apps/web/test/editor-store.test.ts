import {
  DocumentFout,
  nieuwProjectDocument,
  wijzigEigenschappen,
  type InstallatieDocument,
  type Node,
  type NodeId,
} from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import { MAX_STAPPEN, useEditorStore } from "../app/stores/editor";
import { useSessieStore } from "../app/stores/sessie";

type Store = ReturnType<typeof useEditorStore>;

function startDocument(): InstallatieDocument {
  return nieuwProjectDocument({ klantNaam: "Janssens", stroomtype: "2x230V", datum: "2026-10-18" });
}

function laadNieuw(): Store {
  const store = useEditorStore();
  store.laad({ id: "p1", naam: "Woning Janssens", versie: 1, document: startDocument() });
  return store;
}

function doc(store: Store): InstallatieDocument {
  if (!store.document) throw new Error("geen document");
  return store.document;
}

function node(store: Store, id: NodeId): Node {
  const n = doc(store).nodes[id];
  if (!n) throw new Error(`geen node ${id}`);
  return n;
}

function eersteVan(store: Store, type: Node["type"]): NodeId {
  const n = Object.values(doc(store).nodes).find((k) => k.type === type);
  if (!n) throw new Error(`geen ${type}`);
  return n.id;
}

/** Nieuwe kring op het bord; geeft de id van de leiding (de bovenste nieuwe node). */
function nieuweKring(store: Store): NodeId {
  store.voegToe({ soort: "rail-einde", nodeId: eersteVan(store, "verdeelbord") });
  return store.selectie[0]!;
}

/** Voegt `n` keer het huidige onderdeel toe bovenop de selectie; geeft de ids van onder naar boven. */
function stapel(store: Store, n: number): NodeId[] {
  const ids: NodeId[] = [];
  for (let i = 0; i < n; i++) {
    store.voegToe({ soort: "kring-einde", nodeId: store.selectie[0]! });
    ids.push(store.selectie[0]!);
  }
  return ids;
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("laad", () => {
  test("zet document, project en lege geschiedenis", () => {
    const store = laadNieuw();
    expect(store.projectId).toBe("p1");
    expect(store.naam).toBe("Woning Janssens");
    expect(store.versie).toBe(1);
    expect(store.terug).toEqual([]);
    expect(store.vooruit).toEqual([]);
    expect(store.selectie).toEqual([]);
    expect(store.gewijzigdSindsOpslaan).toBe(0);
    expect(store.onderdeel).toBe("contactdoos");
    expect(store.toestelsoort).toBe("wasmachine");
  });

  test("elke laad verhoogt de laadgeneratie, ook voor hetzelfde project", () => {
    const store = laadNieuw();
    const eerste = store.laadGeneratie;
    store.laad({ id: "p1", naam: "Woning Janssens", versie: 1, document: startDocument() });
    expect(store.laadGeneratie).toBe(eerste + 1);
  });
});

describe("tabblad", () => {
  test("kan de kringenlijst zijn en wordt bij laad teruggezet", () => {
    const store = laadNieuw();
    expect(store.tabblad).toBe("eendraadschema");
    store.tabblad = "kringenlijst";
    expect(store.tabblad).toBe("kringenlijst");
    store.laad({ id: "p2", naam: "Andere", versie: 1, document: startDocument() });
    expect(store.tabblad).toBe("eendraadschema");
  });

  test("een wissel van tabblad laat de selectie staan", () => {
    const store = laadNieuw();
    const id = eersteVan(store, "verdeelbord");
    store.selectie = [id];
    store.tabblad = "kringenlijst";
    expect(store.selectie).toEqual([id]);
  });
});

describe("undo/redo", () => {
  test("voegToe op het rail-einde is 1 stap; ongedaanMaken en opnieuw", () => {
    const store = laadNieuw();
    const origineel = doc(store);
    const bordId = eersteVan(store, "verdeelbord");

    store.voegToe({ soort: "rail-einde", nodeId: bordId });
    const na = doc(store);

    expect(store.terug).toHaveLength(1);
    expect(Object.keys(na.nodes)).toHaveLength(Object.keys(origineel.nodes).length + 2);
    // De bovenste nieuwe node (de leiding) is geselecteerd.
    expect(node(store, store.selectie[0]!).type).toBe("leiding");

    store.ongedaanMaken();
    expect(store.document).toEqual(origineel);
    expect(store.terug).toHaveLength(0);
    expect(store.vooruit).toHaveLength(1);

    store.opnieuw();
    expect(store.document).toEqual(na);
    expect(store.terug).toHaveLength(1);
    expect(store.vooruit).toHaveLength(0);
    expect(store.gewijzigdSindsOpslaan).toBe(3);
  });

  test("een nieuwe wijziging leegt vooruit", () => {
    const store = laadNieuw();
    nieuweKring(store);
    store.ongedaanMaken();
    expect(store.vooruit).toHaveLength(1);
    nieuweKring(store);
    expect(store.vooruit).toHaveLength(0);
  });

  test("ongedaanMaken en opnieuw op een lege stapel doen niets", () => {
    const store = laadNieuw();
    const origineel = doc(store);
    store.ongedaanMaken();
    store.opnieuw();
    expect(store.document).toBe(origineel);
    expect(store.gewijzigdSindsOpslaan).toBe(0);
  });

  test("wijzigVeld 3× op hetzelfde veld is 1 stap; na sluitGroep begint een nieuwe", () => {
    const store = laadNieuw();
    const leidingId = nieuweKring(store);
    expect(store.terug).toHaveLength(1);

    store.wijzigVeld([leidingId], "doorsnede_mm2", 4);
    store.wijzigVeld([leidingId], "doorsnede_mm2", 6);
    store.wijzigVeld([leidingId], "doorsnede_mm2", 10);
    expect(store.terug).toHaveLength(2);
    expect(node(store, leidingId)).toMatchObject({ doorsnede_mm2: 10 });

    store.sluitGroep();
    store.wijzigVeld([leidingId], "doorsnede_mm2", 16);
    expect(store.terug).toHaveLength(3);

    store.ongedaanMaken();
    expect(node(store, leidingId)).toMatchObject({ doorsnede_mm2: 10 });
    store.ongedaanMaken();
    expect(node(store, leidingId)).toMatchObject({ doorsnede_mm2: 2.5 });
  });

  test("wijzigVeld op meerdere nodes is 1 stap", () => {
    const store = laadNieuw();
    const a = nieuweKring(store);
    const b = nieuweKring(store);
    store.wijzigVeld([a, b], "doorsnede_mm2", 4);
    expect(store.terug).toHaveLength(3);
    expect(node(store, a)).toMatchObject({ doorsnede_mm2: 4 });
    expect(node(store, b)).toMatchObject({ doorsnede_mm2: 4 });

    store.ongedaanMaken();
    expect(node(store, a)).toMatchObject({ doorsnede_mm2: 2.5 });
    expect(node(store, b)).toMatchObject({ doorsnede_mm2: 2.5 });
  });

  test("een ongeldige wijzigVeld laat de store ongewijzigd", () => {
    const store = laadNieuw();
    const a = nieuweKring(store);
    const b = nieuweKring(store);
    const voor = doc(store);
    // De automaat van de tweede kring heeft geen `doorsnede_mm2`.
    const automaat = node(store, b).parentId!;
    expect(() => store.wijzigVeld([a, automaat], "doorsnede_mm2", 4)).toThrow(DocumentFout);
    expect(store.document).toBe(voor);
    expect(store.terug).toHaveLength(2);
  });

  test(`bij ${MAX_STAPPEN + 1} stappen blijft terug.length ${MAX_STAPPEN}; de oudste valt weg`, () => {
    const store = laadNieuw();
    const leidingId = nieuweKring(store); // stap 1
    for (let i = 0; i < MAX_STAPPEN; i++) {
      store.pasToe(wijzigEigenschappen(doc(store), leidingId, { label: `L${i}` }));
    }
    expect(store.terug).toHaveLength(MAX_STAPPEN);
    for (let i = 0; i < MAX_STAPPEN; i++) store.ongedaanMaken();
    // De toevoeging zelf (de oudste stap) is weggevallen: de leiding bestaat nog.
    expect(node(store, leidingId).label).toBeUndefined();
    expect(store.terug).toHaveLength(0);
    store.ongedaanMaken();
    expect(doc(store).nodes[leidingId]).toBeDefined();
  });
});

describe("afgeleide gegevens", () => {
  test("aantalFouten stijgt na een 9e contactdoos in één kring", () => {
    const store = laadNieuw();
    nieuweKring(store);
    stapel(store, 8);
    const voor = store.aantalFouten;

    stapel(store, 1);
    expect(store.aantalFouten).toBeGreaterThan(voor);
    expect(store.bevindingen.some((b) => b.ernst === "fout" && b.regelId.length > 0)).toBe(true);
  });

  test("opmaak en svg volgen het document", () => {
    const store = laadNieuw();
    const leeg = store.svg;
    nieuweKring(store);
    expect(store.svg).not.toBe(leeg);
    expect(store.svg.startsWith("<svg")).toBe(true);
    const leidingId = store.selectie[0]!;
    expect(store.opmaak?.strook.vakken[leidingId]).toBeDefined();
    expect(store.analyse?.kringen).toHaveLength(1);
  });

  test("zonder document zijn de afgeleide gegevens leeg", () => {
    const store = useEditorStore();
    expect(store.analyse).toBeNull();
    expect(store.opmaak).toBeNull();
    expect(store.svg).toBe("");
    expect(store.bevindingen).toEqual([]);
    expect(store.aantalFouten).toBe(0);
    expect(store.aantalWaarschuwingen).toBe(0);
  });
});

describe("verwijderSelectie", () => {
  test("verwijderSelectie(false) op een middelste punt houdt de keten verbonden", () => {
    const store = laadNieuw();
    nieuweKring(store);
    const [a, b, c] = stapel(store, 3) as [NodeId, NodeId, NodeId];
    const stappen = store.terug.length;

    store.selectie = [b];
    store.verwijderSelectie(false);

    expect(doc(store).nodes[b]).toBeUndefined();
    expect(node(store, a).kinderen).toEqual([c]);
    expect(node(store, c).parentId).toBe(a);
    expect(store.terug).toHaveLength(stappen + 1);
    expect(store.selectie).toEqual([]);
  });

  test("verwijderSelectie(true) verwijdert de hele tak van meerdere nodes in één stap", () => {
    const store = laadNieuw();
    const leiding1 = nieuweKring(store);
    const [a] = stapel(store, 2) as [NodeId, NodeId];
    const leiding2 = nieuweKring(store);
    const automaat1 = node(store, leiding1).parentId!;
    const automaat2 = node(store, leiding2).parentId!;
    const stappen = store.terug.length;

    store.selectie = [a, automaat1, automaat2];
    store.verwijderSelectie(true);

    expect(doc(store).nodes[automaat1]).toBeUndefined();
    expect(doc(store).nodes[automaat2]).toBeUndefined();
    expect(doc(store).nodes[a]).toBeUndefined();
    expect(store.terug).toHaveLength(stappen + 1);
  });

  test.each([
    ["teller", true],
    ["teller", false],
    ["aansluiting", true],
    ["aansluiting", false],
  ] as const)("%s (heleTak %s) gooit ROOT_NIET_WIJZIGBAAR en laat het document ongewijzigd", (type, heleTak) => {
    const store = laadNieuw();
    const voor = doc(store);
    store.selectie = [eersteVan(store, type)];

    let fout: unknown;
    try {
      store.verwijderSelectie(heleTak);
    } catch (e) {
      fout = e;
    }
    expect(fout).toBeInstanceOf(DocumentFout);
    expect((fout as DocumentFout).code).toBe("ROOT_NIET_WIJZIGBAAR");
    expect(store.document).toBe(voor);
    expect(store.terug).toHaveLength(0);
  });
});

describe("voegToeBijSelectie", () => {
  test("met een geselecteerde leiding van een kring met 2 contactdozen komt het onderdeel bovenaan die keten", () => {
    const store = laadNieuw();
    const leidingId = nieuweKring(store);
    const [, bovenste] = stapel(store, 2) as [NodeId, NodeId];

    store.onderdeel = "lichtpunt";
    store.selectie = [leidingId];
    store.voegToeBijSelectie();

    const nieuw = node(store, bovenste).kinderen;
    expect(nieuw).toHaveLength(1);
    expect(node(store, nieuw[0]!).type).toBe("lichtpunt");
    expect(store.selectie).toEqual(nieuw);
  });

  test("met een geselecteerd verdeelbord komt er een nieuwe kring op de rail", () => {
    const store = laadNieuw();
    const bordId = eersteVan(store, "verdeelbord");
    store.selectie = [bordId];
    store.voegToeBijSelectie();
    expect(node(store, bordId).kinderen).toHaveLength(1);
    expect(node(store, node(store, bordId).kinderen[0]!).type).toBe("automaat");
  });

  test("zonder selectie of als het onderdeel niet mag, gebeurt er niets", () => {
    const store = laadNieuw();
    const leidingId = nieuweKring(store);
    const voor = doc(store);

    store.selectie = [];
    store.voegToeBijSelectie();
    expect(store.document).toBe(voor);

    store.onderdeel = "differentieel"; // niet op een kring-einde
    store.selectie = [leidingId];
    store.voegToeBijSelectie();
    expect(store.document).toBe(voor);
  });
});

describe("voegSjabloonToe", () => {
  test('"badkamer" zonder selectie komt op het eerste verdeelbord', () => {
    const store = laadNieuw();
    const bordId = eersteVan(store, "verdeelbord");

    store.voegSjabloonToe("badkamer");

    const kinderen = node(store, bordId).kinderen;
    expect(kinderen).toHaveLength(1);
    expect(node(store, kinderen[0]!)).toMatchObject({ type: "differentieel", gevoeligheid_mA: 30 });
    expect(store.terug).toHaveLength(1);
  });

  test("met een geselecteerd differentieel komt het sjabloon op diens rail", () => {
    const store = laadNieuw();
    store.voegSjabloonToe("badkamer");
    const diffId = node(store, eersteVan(store, "verdeelbord")).kinderen[0]!;

    store.selectie = [diffId];
    store.voegSjabloonToe("kring-verlichting");

    expect(node(store, diffId).kinderen).toHaveLength(2);
  });
});

describe("afwijkingen en projectgegevens", () => {
  test("zetAfwijking maakt de bevinding afgeweken, wisAfwijking haalt ze weg", () => {
    useSessieStore().gebruiker = { id: "u1", naam: "An Peeters", email: "an@example.test" };
    const store = laadNieuw();
    nieuweKring(store);
    stapel(store, 9);
    const fout = store.bevindingen.find((b) => b.ernst === "fout" && !b.afgeweken)!;
    const voor = store.aantalFouten;

    store.zetAfwijking(fout.regelId, fout.nodeIds[0]!, "Bewust zo ontworpen door de klant");
    expect(store.aantalFouten).toBe(voor - 1);
    const afwijking = doc(store).afwijkingen[0]!;
    // `door` is de naam van de ingelogde gebruiker.
    expect(afwijking).toMatchObject({ regelId: fout.regelId, door: "An Peeters" });
    expect(afwijking.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    store.wisAfwijking(fout.regelId, fout.nodeIds[0]!);
    expect(store.aantalFouten).toBe(voor);
    expect(doc(store).afwijkingen).toEqual([]);
  });

  test("zetAfwijking na een verlopen sessie: de naam van wie het project opende", () => {
    const sessie = useSessieStore();
    sessie.gebruiker = { id: "u1", naam: "An Peeters", email: "an@example.test" };
    const store = laadNieuw();
    nieuweKring(store);
    stapel(store, 9);
    const fout = store.bevindingen.find((b) => b.ernst === "fout" && !b.afgeweken)!;
    // De sessie verliep: de sessie-store is leeg, de editor werkt lokaal verder.
    sessie.gebruiker = null;
    store.zetAfwijking(fout.regelId, fout.nodeIds[0]!, "Bewust zo ontworpen door de klant");
    expect(doc(store).afwijkingen[0]).toMatchObject({ door: "An Peeters" });
  });

  test("zetAfwijking: een andere gebruiker die intussen inlogde, neemt de naam van het venster niet over", () => {
    const sessie = useSessieStore();
    sessie.gebruiker = { id: "u1", naam: "An Peeters", email: "an@example.test" };
    const store = useEditorStore();
    store.nieuwVenster();
    store.laad({ id: "p1", naam: "Woning Janssens", versie: 1, document: startDocument() });
    nieuweKring(store);
    stapel(store, 9);
    sessie.gebruiker = { id: "u2", naam: "Bart Claes", email: "bart@example.test" };
    // Ook een nieuwe laad in hetzelfde venster (de serverversie) verandert dat niet.
    store.laad({ id: "p1", naam: "Woning Janssens", versie: 2, document: doc(store) });
    const fout = store.bevindingen.find((b) => b.ernst === "fout" && !b.afgeweken)!;
    store.zetAfwijking(fout.regelId, fout.nodeIds[0]!, "Bewust zo ontworpen door de klant");
    expect(doc(store).afwijkingen[0]).toMatchObject({ door: "An Peeters" });

    // Een nieuw venster van Bart: dan wel Bart.
    store.nieuwVenster();
    store.laad({ id: "p1", naam: "Woning Janssens", versie: 3, document: startDocument() });
    nieuweKring(store);
    stapel(store, 9);
    const andere = store.bevindingen.find((b) => b.ernst === "fout" && !b.afgeweken)!;
    store.zetAfwijking(andere.regelId, andere.nodeIds[0]!, "Bewust zo ontworpen door de klant");
    expect(doc(store).afwijkingen[0]).toMatchObject({ door: "Bart Claes" });
  });

  test("een te korte motivatie gooit en laat de store ongewijzigd", () => {
    const store = laadNieuw();
    const leidingId = nieuweKring(store);
    const voor = doc(store);
    expect(() => store.zetAfwijking("max-contactdozen", leidingId, "kort")).toThrow(DocumentFout);
    expect(store.document).toBe(voor);
    expect(store.terug).toHaveLength(1);
  });

  test("wijzigProjectgegevens: de naam valt buiten undo, klant en stroomtype niet", () => {
    const store = laadNieuw();

    store.wijzigProjectgegevens({ naam: "Nieuwe naam" });
    expect(store.naam).toBe("Nieuwe naam");
    expect(store.terug).toHaveLength(0);
    expect(store.gewijzigdSindsOpslaan).toBe(1);

    store.wijzigProjectgegevens({ klantNaam: "Peeters", stroomtype: "3N400V" });
    expect(doc(store).meta.klant.naam).toBe("Peeters");
    expect(doc(store).voeding.stroomtype).toBe("3N400V");
    expect(store.terug).toHaveLength(1);
    expect(store.gewijzigdSindsOpslaan).toBe(2);

    store.ongedaanMaken();
    expect(doc(store).meta.klant.naam).toBe("Janssens");
    expect(store.naam).toBe("Nieuwe naam");
  });

  describe("wijzigProjectgegevens met adressen, EAN en datum", () => {
    const kerkstraat = { straat: "Kerkstraat", nummer: "12", postcode: "2000", gemeente: "Antwerpen", land: "België" };
    const dorpsstraat = { straat: "Dorpsstraat", nummer: "3", bus: "b", postcode: "9000", gemeente: "Gent", land: "België" };

    test("alle documentvelden samen zijn één undo-stap en undo herstelt het oude adres", () => {
      const store = laadNieuw();
      const oudWerfadres = doc(store).meta.werfadres;

      store.wijzigProjectgegevens({
        naam: "Andere naam",
        klantNaam: "Peeters",
        klantAdres: kerkstraat,
        werfadres: dorpsstraat,
        ean: "541448800000000001",
        datum: "2026-11-02",
      });

      expect(doc(store).meta.klant).toEqual({ naam: "Peeters", adres: kerkstraat });
      expect(doc(store).meta.werfadres).toEqual(dorpsstraat);
      expect(doc(store).meta.ean).toBe("541448800000000001");
      expect(doc(store).meta.datum).toBe("2026-11-02");
      expect(store.terug).toHaveLength(1);

      store.ongedaanMaken();
      expect(doc(store).meta.klant).toEqual({ naam: "Janssens" });
      expect(doc(store).meta.werfadres).toEqual(oudWerfadres);
      expect(doc(store).meta.ean).toBeUndefined();
      expect(doc(store).meta.datum).toBe("2026-10-18");
      expect(store.naam).toBe("Andere naam");
    });

    test("klantAdres null wist het adres als er een is, en undo brengt het terug", () => {
      const store = laadNieuw();
      store.wijzigProjectgegevens({ klantAdres: kerkstraat });
      store.wijzigProjectgegevens({ klantAdres: null });
      expect(doc(store).meta.klant.adres).toBeUndefined();
      expect(store.terug).toHaveLength(2);

      store.ongedaanMaken();
      expect(doc(store).meta.klant.adres).toEqual(kerkstraat);
    });

    test("klantAdres null zonder bestaand adres maakt geen undo-stap", () => {
      const store = laadNieuw();
      store.wijzigProjectgegevens({ klantAdres: null });
      expect(store.terug).toHaveLength(0);
      expect(store.gewijzigdSindsOpslaan).toBe(0);
    });

    test("ongewijzigde adressen, EAN en datum maken geen undo-stap", () => {
      const store = laadNieuw();
      store.wijzigProjectgegevens({ klantAdres: kerkstraat, werfadres: dorpsstraat, ean: "123" });
      const stappen = store.terug.length;
      const teller = store.gewijzigdSindsOpslaan;

      store.wijzigProjectgegevens({
        klantNaam: "Janssens",
        klantAdres: { ...kerkstraat },
        werfadres: { ...dorpsstraat },
        ean: "123",
        datum: "2026-10-18",
      });
      expect(store.terug).toHaveLength(stappen);
      expect(store.gewijzigdSindsOpslaan).toBe(teller);
    });

    test("een lege EAN op een document zonder EAN maakt geen undo-stap", () => {
      const store = laadNieuw();
      store.wijzigProjectgegevens({ ean: "" });
      expect(store.terug).toHaveLength(0);
    });

    test("een ongeldig adres gooit en laat naam en document ongewijzigd", () => {
      const store = laadNieuw();
      const voor = doc(store);
      expect(() =>
        store.wijzigProjectgegevens({ naam: "X", werfadres: { straat: 1 } as never }),
      ).toThrow(DocumentFout);
      expect(store.document).toBe(voor);
      expect(store.naam).toBe("Woning Janssens");
      expect(store.terug).toHaveLength(0);
    });
  });

  describe("wijzigProjectgegevens met de dossiertaal", () => {
    test("een andere dossiertaal is één undo-stap, en undo brengt het document terug zonder dossiertaal", () => {
      const store = laadNieuw();
      expect(doc(store).meta.dossierTaal).toBeUndefined();

      store.wijzigProjectgegevens({ dossierTaal: "fr" });
      expect(doc(store).meta.dossierTaal).toBe("fr");
      expect(store.terug).toHaveLength(1);
      expect(store.gewijzigdSindsOpslaan).toBe(1);

      store.ongedaanMaken();
      expect(doc(store).meta.dossierTaal).toBeUndefined();
    });

    test("dezelfde dossiertaal nog eens geeft geen stap", () => {
      const store = laadNieuw();
      store.wijzigProjectgegevens({ dossierTaal: "fr" });
      store.wijzigProjectgegevens({ dossierTaal: "fr" });
      expect(store.terug).toHaveLength(1);
      expect(store.gewijzigdSindsOpslaan).toBe(1);
    });

    test("nl op een document zonder dossiertaal geeft geen stap (afwezig = nl)", () => {
      const store = laadNieuw();
      store.wijzigProjectgegevens({ dossierTaal: "nl" });
      expect(store.terug).toHaveLength(0);
      expect(store.gewijzigdSindsOpslaan).toBe(0);
    });

    test("samen met de klant is het nog altijd één stap", () => {
      const store = laadNieuw();
      store.wijzigProjectgegevens({ klantNaam: "Peeters", dossierTaal: "en" });
      expect(doc(store).meta.dossierTaal).toBe("en");
      expect(doc(store).meta.klant.naam).toBe("Peeters");
      expect(store.terug).toHaveLength(1);
    });
  });
});

describe("markeerGewijzigd", () => {
  test("telt een wijziging zonder het document of de undo-geschiedenis aan te raken", () => {
    const store = laadNieuw();
    const voor = doc(store);

    store.markeerGewijzigd();
    expect(store.gewijzigdSindsOpslaan).toBe(1);
    store.markeerGewijzigd();
    expect(store.gewijzigdSindsOpslaan).toBe(2);
    expect(store.document).toBe(voor);
    expect(store.terug).toHaveLength(0);
  });
});

describe("voegToeBijSelectie op de teller", () => {
  test("in een nieuw project komt er een kring op de rail van het hoofdbord", () => {
    const store = laadNieuw();
    const bordId = eersteVan(store, "verdeelbord");
    store.selectie = [eersteVan(store, "teller")];
    store.voegToeBijSelectie();
    expect(node(store, bordId).kinderen).toHaveLength(1);
    expect(node(store, node(store, bordId).kinderen[0]!).type).toBe("automaat");
    expect(store.terug).toHaveLength(1);
  });
});

describe("navigeer", () => {
  /** Drie kringen, elk met een leiding en één contactdoos erbovenop. */
  function driekringen(store: Store): void {
    for (let i = 0; i < 3; i++) {
      nieuweKring(store);
      stapel(store, 1);
    }
  }

  /** De beveiligingen in de volgorde van `analyse.kringen`. */
  function beveiligingen(store: Store): NodeId[] {
    return store.analyse!.kringen.map((k) => k.beveiligingId);
  }

  test("op volgt het eerste kind, neer de ouder", () => {
    const store = laadNieuw();
    driekringen(store);
    const beveiliging = beveiligingen(store)[0]!;
    const leiding = node(store, beveiliging).kinderen[0]!;
    const punt = node(store, leiding).kinderen[0]!;
    store.selectie = [beveiliging];

    store.navigeer("op");
    expect(store.selectie).toEqual([leiding]);
    store.navigeer("op");
    expect(store.selectie).toEqual([punt]);
    store.navigeer("op"); // geen kind meer
    expect(store.selectie).toEqual([punt]);

    store.navigeer("neer");
    expect(store.selectie).toEqual([leiding]);
    store.navigeer("neer");
    expect(store.selectie).toEqual([beveiliging]);
  });

  test("neer stopt bij de wortel", () => {
    const store = laadNieuw();
    const wortel = doc(store).rootId;
    store.selectie = [wortel];
    store.navigeer("neer");
    expect(store.selectie).toEqual([wortel]);
  });

  test("links en rechts springen naar de beveiliging van de vorige of volgende kring en klemmen aan de uiteinden", () => {
    const store = laadNieuw();
    driekringen(store);
    const [eerste, midden, laatste] = beveiligingen(store) as [NodeId, NodeId, NodeId];
    expect(new Set([eerste, midden, laatste]).size).toBe(3);

    // Start vanaf een punt in de middelste kring.
    store.selectie = [store.analyse!.kringen[1]!.puntIds[0]!];
    store.navigeer("rechts");
    expect(store.selectie).toEqual([laatste]);
    store.navigeer("rechts");
    expect(store.selectie).toEqual([laatste]);
    store.navigeer("links");
    expect(store.selectie).toEqual([midden]);
    store.navigeer("links");
    expect(store.selectie).toEqual([eerste]);
    store.navigeer("links");
    expect(store.selectie).toEqual([eerste]);
  });

  test("zonder selectie of zonder kring gebeurt er niets; navigatie raakt undo niet", () => {
    const store = laadNieuw();
    driekringen(store);
    const stappen = store.terug;
    const voor = doc(store);

    store.selectie = [];
    for (const r of ["op", "neer", "links", "rechts"] as const) store.navigeer(r);
    expect(store.selectie).toEqual([]);

    const teller = eersteVan(store, "teller");
    store.selectie = [teller];
    store.navigeer("links");
    store.navigeer("rechts");
    expect(store.selectie).toEqual([teller]);

    store.navigeer("neer");
    expect(store.terug).toBe(stappen);
    expect(store.vooruit).toHaveLength(0);
    expect(store.document).toBe(voor);
  });
});
