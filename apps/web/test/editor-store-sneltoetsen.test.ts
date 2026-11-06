import { bepaalKringCodes, nieuwProjectDocument, type InstallatieDocument, type Node, type NodeId } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import { useEditorStore } from "../app/stores/editor";

type Store = ReturnType<typeof useEditorStore>;

function laadNieuw(): Store {
  const store = useEditorStore();
  store.laad({
    id: "p1",
    naam: "Woning",
    versie: 1,
    document: nieuwProjectDocument({ klantNaam: "J", stroomtype: "2x230V", datum: "2026-10-18" }),
  });
  return store;
}
const doc = (store: Store): InstallatieDocument => store.document!;
const eersteVan = (store: Store, type: Node["type"]): NodeId => Object.values(doc(store).nodes).find((n) => n.type === type)!.id;
const vanType = (store: Store, type: Node["type"]) => Object.values(doc(store).nodes).filter((n) => n.type === type);

/** Een nieuwe kring met één contactdoos op het bord; de contactdoos is geselecteerd. */
function kringMetContactdoos(store: Store): NodeId {
  store.onderdeel = "contactdoos";
  store.voegToe({ soort: "rail-einde", nodeId: eersteVan(store, "verdeelbord") });
  return store.selectie[0]!;
}

beforeEach(() => setActivePinia(createPinia()));

describe("snelToevoegen (C, L, D met een kring geselecteerd)", () => {
  test("C en L voegen meteen toe na de selectie, als één undo-stap", () => {
    const store = laadNieuw();
    kringMetContactdoos(store);
    const stappen = store.terug.length;
    expect(store.snelToevoegen("lichtpunt")).toBe(true);
    expect(store.onderdeel).toBe("lichtpunt");
    expect(vanType(store, "lichtpunt")).toHaveLength(1);
    expect(store.selectie).toEqual([vanType(store, "lichtpunt")[0]!.id]);
    expect(store.terug.length).toBe(stappen + 1);
    expect(store.snelToevoegen("contactdoos")).toBe(true);
    expect(vanType(store, "contactdoos")).toHaveLength(2);
  });

  test("D voegt een differentieel in vóór de kring", () => {
    const store = laadNieuw();
    kringMetContactdoos(store);
    const automaat = vanType(store, "automaat")[0]!.id;
    const voor = vanType(store, "differentieel").length;
    expect(store.snelToevoegen("differentieel")).toBe(true);
    expect(vanType(store, "differentieel")).toHaveLength(voor + 1);
    const nieuw = store.selectie[0]!;
    expect(doc(store).nodes[nieuw]!.type).toBe("differentieel");
    expect(doc(store).nodes[automaat]!.parentId).toBe(nieuw);
  });

  test("zonder kring in de selectie wordt het onderdeel alleen gekozen", () => {
    const store = laadNieuw();
    const voor = store.document;
    store.selectie = [];
    expect(store.snelToevoegen("lichtpunt")).toBe(false);
    expect(store.onderdeel).toBe("lichtpunt");
    store.selectie = [eersteVan(store, "verdeelbord")];
    expect(store.snelToevoegen("contactdoos")).toBe(false);
    expect(store.document).toBe(voor);
  });

  test("andere onderdelen voegen niet meteen toe", () => {
    const store = laadNieuw();
    kringMetContactdoos(store);
    const voor = store.document;
    expect(store.snelToevoegen("schakelaar")).toBe(false);
    expect(store.document).toBe(voor);
  });

  test("niets in alleen-lezen", () => {
    const store = laadNieuw();
    kringMetContactdoos(store);
    const voor = store.document;
    store.zetAlleenLezen(true);
    expect(store.snelToevoegen("lichtpunt")).toBe(false);
    expect(store.document).toBe(voor);
  });
});

describe("dupliceerSelectieKring (Ctrl+D)", () => {
  test("dupliceert de kring van de selectie met de eerste vrije letter, als één undo-stap", () => {
    const store = laadNieuw();
    kringMetContactdoos(store);
    const tweede = kringMetContactdoos(store);
    const stappen = store.terug.length;
    store.selectie = [tweede];
    expect(store.dupliceerSelectieKring()).toEqual({ code: "C", bron: "B" });
    expect(vanType(store, "automaat")).toHaveLength(3);
    const codes = bepaalKringCodes(doc(store));
    expect(codes[store.selectie[0]!]).toBe("C");
    expect(store.terug.length).toBe(stappen + 1);
    store.ongedaanMaken();
    expect(vanType(store, "automaat")).toHaveLength(2);
  });

  test("geen kring geselecteerd: null en er verandert niets", () => {
    const store = laadNieuw();
    const voor = store.document;
    store.selectie = [eersteVan(store, "verdeelbord")];
    expect(store.dupliceerSelectieKring()).toBeNull();
    store.selectie = [];
    expect(store.dupliceerSelectieKring()).toBeNull();
    expect(store.document).toBe(voor);
  });
});

describe("laatsteDifferentieel", () => {
  test("een nieuwe kring op een differentieel onthoudt dat differentieel voor zijn bord", () => {
    const store = laadNieuw();
    const bord = eersteVan(store, "verdeelbord");
    store.selectie = [kringMetContactdoos(store)];
    store.snelToevoegen("differentieel");
    const diff = store.selectie[0]!;
    store.onderdeel = "contactdoos";
    store.voegToe({ soort: "rail-einde", nodeId: diff });
    expect(store.laatsteDifferentieel).toEqual({ [bord]: diff });
  });
});

describe("aantalInfo", () => {
  test("telt de actieve infobevindingen, zonder de nog niet geplaatste punten", () => {
    const store = laadNieuw();
    kringMetContactdoos(store);
    const verwacht = store.bevindingen.filter((b) => b.ernst === "info" && !b.afgeweken && b.regelId !== "arei.situatie.niet-geplaatst").length;
    expect(store.aantalInfo).toBe(verwacht);
  });
});
