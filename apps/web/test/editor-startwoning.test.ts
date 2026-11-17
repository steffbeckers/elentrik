// De startwoning en de nieuwe sjablonen in de editorstore: één undo-stap, de gratis limiet,
// alleen-lezen, en de sjablonen die niet via een gewone kringbestemming lopen (aarding, laadpaal).
import {
  DocumentFout,
  nieuwProjectDocument,
  telVoorLimiet,
  type InstallatieDocument,
  type Node,
  type NodeId,
} from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import { useEditorStore } from "../app/stores/editor";

type Store = ReturnType<typeof useEditorStore>;

beforeEach(() => {
  setActivePinia(createPinia());
});

function laadNieuw(stroomtype: "2x230V" | "3N400V" = "2x230V"): Store {
  const store = useEditorStore();
  store.laad({
    id: "p1",
    naam: "Woning Janssens",
    versie: 1,
    document: nieuwProjectDocument({ klantNaam: "Janssens", stroomtype, datum: "2026-11-16" }),
  });
  return store;
}

function doc(store: Store): InstallatieDocument {
  if (!store.document) throw new Error("geen document");
  return store.document;
}

function eersteVan(store: Store, type: Node["type"]): NodeId {
  const n = Object.values(doc(store).nodes).find((k) => k.type === type);
  if (!n) throw new Error(`geen ${type}`);
  return n.id;
}

function vanType<T extends Node["type"]>(store: Store, type: T): Extract<Node, { type: T }>[] {
  return Object.values(doc(store).nodes).filter((n): n is Extract<Node, { type: T }> => n.type === type);
}

describe("voegStartwoningToe", () => {
  test("vult een schema zonder kringen in één undo-stap; ongedaan maken geeft het lege schema terug", () => {
    const store = laadNieuw();
    const leeg = store.document;
    expect(store.zonderKringen).toBe(true);

    expect(store.voegStartwoningToe()).toBe(true);

    expect(telVoorLimiet(doc(store)).kringen).toBe(11);
    expect(vanType(store, "aardingsonderbreker")).toHaveLength(1);
    expect(vanType(store, "aardelektrode")).toHaveLength(1);
    expect(store.zonderKringen).toBe(false);
    expect(store.terug).toHaveLength(1);
    expect(store.limietGeweigerd).toBeNull();
    // De kringcodes liggen vast zoals bij elk ander sjabloon.
    expect(store.analyse!.kringen.map((k) => k.label)).toEqual([..."ABCDEFGHIJK"]);

    const gevuld = store.document;
    store.ongedaanMaken();
    expect(store.document).toEqual(leeg);
    expect(store.zonderKringen).toBe(true);
    store.opnieuw();
    expect(store.document).toEqual(gevuld);
  });

  test("geen fouten in de bevindingen van de startwoning", () => {
    const store = laadNieuw();
    store.wijzigProjectgegevens({ installatieContext: "nieuw" });
    store.voegStartwoningToe();
    expect(store.aantalFouten).toBe(0);
  });

  test("over de gratis limiet: niets gewijzigd en het limietvenster opent", () => {
    const store = laadNieuw();
    store.zetLimiet({ kringen: 5, situatieschemas: 1 });
    const voor = store.document;
    const terug = store.terug;
    const teller = store.gewijzigdSindsOpslaan;

    expect(store.voegStartwoningToe()).toBe(false);

    expect(store.document).toBe(voor);
    expect(store.terug).toBe(terug);
    expect(store.gewijzigdSindsOpslaan).toBe(teller);
    expect(store.limietGeweigerd).toEqual({ kringen: 11, situatieschemas: 0 });
    expect(store.zonderKringen).toBe(true);
  });

  test("binnen een ruimere limiet lukt het", () => {
    const store = laadNieuw();
    store.zetLimiet({ kringen: 11, situatieschemas: 1 });
    expect(store.voegStartwoningToe()).toBe(true);
    expect(store.limietGeweigerd).toBeNull();
  });

  test("in alleen-lezen gebeurt er niets", () => {
    const store = laadNieuw();
    const voor = store.document;
    store.zetAlleenLezen(true);
    expect(store.voegStartwoningToe()).toBe(false);
    expect(store.document).toBe(voor);
    expect(store.terug).toHaveLength(0);
    expect(store.gewijzigdSindsOpslaan).toBe(0);
  });

  test("met een kring in het schema gooit het een DocumentFout en blijft alles staan", () => {
    const store = laadNieuw();
    store.voegSjabloonToe("badkamer", { soort: "nieuw-op-bord", nodeId: eersteVan(store, "verdeelbord") });
    expect(store.zonderKringen).toBe(false);
    const voor = store.document;
    expect(() => store.voegStartwoningToe()).toThrow(DocumentFout);
    expect(store.document).toBe(voor);
    expect(store.terug).toHaveLength(1);
  });

  test("zonder document is er geen leeg schema", () => {
    expect(useEditorStore().zonderKringen).toBe(false);
  });
});

describe("voegSjabloonToe met de nieuwe sjablonen", () => {
  test("de aarding komt rechtstreeks op het bord, zonder differentieel, in één undo-stap", () => {
    const store = laadNieuw();
    const bordId = eersteVan(store, "verdeelbord");

    store.voegSjabloonToe("aarding", { soort: "nieuw-op-bord", nodeId: bordId });

    const opBord = doc(store).nodes[bordId]!.kinderen.map((id) => doc(store).nodes[id]!);
    expect(opBord.map((n) => n.type)).toEqual(["aardingsonderbreker"]);
    expect(vanType(store, "aardelektrode")[0]!.parentId).toBe(opBord[0]!.id);
    expect(store.selectie).toEqual([opBord[0]!.id]);
    expect(store.terug).toHaveLength(1);
    // Geen kring: de teller van de gratis limiet verandert niet.
    expect(telVoorLimiet(doc(store)).kringen).toBe(0);
    expect(store.zonderKringen).toBe(true);
  });

  test("de aarding achter een differentieel kan niet", () => {
    const store = laadNieuw();
    const bordId = eersteVan(store, "verdeelbord");
    store.voegSjabloonToe("badkamer", { soort: "nieuw-op-bord", nodeId: bordId });
    const diffId = doc(store).nodes[bordId]!.kinderen[0]!;
    const voor = store.document;
    expect(() => store.voegSjabloonToe("aarding", { soort: "bestaande-differentieel", nodeId: diffId })).toThrow(DocumentFout);
    expect(store.document).toBe(voor);
  });

  test("de laadpaal krijgt zonder expliciete instellingen zijn eigen differentieel van 30 mA klasse B", () => {
    const store = laadNieuw();
    const bordId = eersteVan(store, "verdeelbord");

    store.voegSjabloonToe("laadpaal", { soort: "nieuw-op-bord", nodeId: bordId });

    const differentieel = doc(store).nodes[doc(store).nodes[bordId]!.kinderen[0]!]!;
    expect(differentieel).toMatchObject({ type: "differentieel", gevoeligheid_mA: 30, klasse: "B", polen: 2 });
    expect(vanType(store, "toestel").map((n) => n.soort)).toEqual(["laadpaal"]);
    expect(store.bevindingen.filter((b) => b.ernst === "fout" || b.ernst === "waarschuwing")).toEqual([]);
  });

  test("instellingen uit de dialoog gaan voor op die van het sjabloon", () => {
    const store = laadNieuw();
    const bordId = eersteVan(store, "verdeelbord");
    store.voegSjabloonToe("laadpaal", { soort: "nieuw-op-bord", nodeId: bordId }, { gevoeligheid_mA: 30, nominaal_A: 63, polen: 2, klasse: "A" });
    expect(vanType(store, "differentieel").find((n) => n.parentId === bordId)).toMatchObject({ nominaal_A: 63, klasse: "A" });
  });

  test("de laadpaal volgt het stroomtype: vierpolig bij 3N400V", () => {
    const store = laadNieuw("3N400V");
    const bordId = eersteVan(store, "verdeelbord");
    store.voegSjabloonToe("laadpaal", { soort: "nieuw-op-bord", nodeId: bordId });
    expect(vanType(store, "differentieel").find((n) => n.parentId === bordId)).toMatchObject({ polen: 4, klasse: "B" });
    expect(vanType(store, "automaat")[0]).toMatchObject({ polen: 4, nominaal_A: 16 });
  });

  test("een sjabloon op een bestaand differentieel onthoudt dat differentieel, ook voor de nieuwe toestellen", () => {
    const store = laadNieuw();
    const bordId = eersteVan(store, "verdeelbord");
    store.voegSjabloonToe("vaatwasser", { soort: "nieuw-op-bord", nodeId: bordId });
    const diffId = doc(store).nodes[bordId]!.kinderen[0]!;
    store.voegSjabloonToe("droogkast", { soort: "bestaande-differentieel", nodeId: diffId });
    expect(doc(store).nodes[diffId]!.kinderen).toHaveLength(2);
    expect(store.laatsteDifferentieel).toEqual({ [bordId]: diffId });
  });
});
