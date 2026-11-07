import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import { type InstallatieDocument, type NodeId } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";
import { useEditorStore } from "../app/stores/editor";
import { useSituatieStore } from "../app/stores/situatie";

const ACHTERGROND = {
  origineelBestandId: "o1",
  rasterBestandId: "r1",
  breedte_px: 3000,
  hoogte_px: 2000,
};

type Editor = ReturnType<typeof useEditorStore>;

function startDocument(): InstallatieDocument {
  return installatie()
    .verdeelbord((b) => b.als("bord").kring((k) => k.automaat(16).leiding(2.5).contactdozen(3)))
    .bouw().doc;
}

function opzet() {
  const editor = useEditorStore();
  editor.laad({ id: "p1", naam: "Woning", versie: 1, document: startDocument() });
  const situatie = useSituatieStore();
  return { editor, situatie };
}

function doc(editor: Editor): InstallatieDocument {
  if (!editor.document) throw new Error("geen document");
  return editor.document;
}

function punten(editor: Editor): NodeId[] {
  return editor.analyse!.kringen.flatMap((k) => k.puntIds);
}

function plaatsingen(editor: Editor, paginaId: string) {
  return doc(editor).situatie.paginas.find((p) => p.id === paginaId)!.plaatsingen;
}

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("tabblad", () => {
  test("staat standaard op het eendraadschema en wordt bij laad teruggezet", () => {
    const { editor } = opzet();
    expect(editor.tabblad).toBe("eendraadschema");
    editor.tabblad = "situatieschema";
    editor.laad({ id: "p2", naam: "Andere", versie: 1, document: startDocument() });
    expect(editor.tabblad).toBe("eendraadschema");
  });
});

describe("pagina's", () => {
  test("afdekking toevoegen en verwijderen zijn aparte undo-stappen en alleen-lezen doet niets", () => {
    const { editor, situatie } = opzet();
    const id = situatie.voegPlanPaginaToe("Bron", ACHTERGROND);
    const voor = JSON.parse(JSON.stringify(doc(editor)));
    const stappen = editor.terug.length;
    const vlak = situatie.voegAfdekkingToe({ x: 10, y: 20, breedte: 30, hoogte: 40 });
    expect(vlak).toBeTruthy();
    expect(editor.terug).toHaveLength(stappen + 1);
    expect(situatie.actievePagina?.afdekkingen).toHaveLength(1);
    situatie.verwijderAfdekking(vlak!);
    expect(situatie.actievePagina?.afdekkingen ?? []).toEqual([]);
    editor.ongedaanMaken();
    expect(situatie.actievePagina?.afdekkingen).toHaveLength(1);
    editor.ongedaanMaken();
    expect(doc(editor)).toEqual(voor);
    editor.opnieuw();
    editor.zetAlleenLezen(true);
    situatie.verwijderAfdekking(vlak!);
    expect(situatie.voegAfdekkingToe({ x: 1, y: 1, breedte: 2, hoogte: 2 })).toBeNull();
    expect(situatie.actievePagina?.afdekkingen).toHaveLength(1);
    expect(situatie.actievePaginaId).toBe(id);
  });
  test("kwartslag draait de actieve selectie samen met behoud van posities en één undo-stap", () => {
    const { editor, situatie } = opzet();
    const eerste = situatie.voegPlanPaginaToe("Eerste", ACHTERGROND);
    const [a, b, c] = punten(editor) as [NodeId, NodeId, NodeId];
    situatie.plaatsNode(a, 100, 200);
    situatie.plaatsNode(b, 300, 400);
    editor.selectie = [b];
    situatie.draaiSelectie(1);
    situatie.zetLabelOffset(eerste, a, { x: -12, y: 34 });
    const tweede = situatie.voegPlanPaginaToe("Tweede", ACHTERGROND);
    situatie.plaatsNode(c, 500, 600);
    situatie.actievePaginaId = eerste;
    editor.selectie = [a, b, c];
    const voor = JSON.parse(JSON.stringify(doc(editor)));
    const stappen = editor.terug.length;

    situatie.draaiSelectie(1, 90);
    expect(plaatsingen(editor, eerste)).toEqual([
      { nodeId: a, x: 100, y: 200, rotatie: 90, labelOffset: { x: -12, y: 34 } },
      { nodeId: b, x: 300, y: 400, rotatie: 105 },
    ]);
    expect(plaatsingen(editor, tweede)[0]).toMatchObject({ rotatie: 0 });
    expect(editor.terug).toHaveLength(stappen + 1);
    const na = JSON.parse(JSON.stringify(doc(editor)));
    editor.ongedaanMaken();
    expect(doc(editor)).toEqual(voor);
    editor.opnieuw();
    expect(doc(editor)).toEqual(na);
    editor.zetAlleenLezen(true);
    situatie.draaiSelectie(-1, 90);
    expect(doc(editor)).toEqual(na);
    expect(editor.terug).toHaveLength(stappen + 1);
  });

  test("opmaak blijft behouden bij verplaatsen, draaien, undo, redo en opnieuw laden", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [punt] = punten(editor);
    situatie.plaatsNode(punt!, 100, 200);
    editor.selectie = [punt!];
    situatie.zetPaginaOpmaak(paginaId, { symboolSchaal: 2, labelSchaal: 0.5 });
    situatie.zetLabelOffset(paginaId, punt!, { x: -12, y: 34 });
    situatie.schuifSelectie(10, 20);
    situatie.draaiSelectie(1);
    situatie.plaatsNode(punt!, 400, 500);
    expect(plaatsingen(editor, paginaId)[0]).toMatchObject({ x: 400, y: 500, rotatie: 15, labelOffset: { x: -12, y: 34 } });
    editor.ongedaanMaken();
    expect(plaatsingen(editor, paginaId)[0]).toMatchObject({ x: 110, y: 220, labelOffset: { x: -12, y: 34 } });
    editor.opnieuw();
    const document = JSON.parse(JSON.stringify(doc(editor)));
    editor.laad({ id: "p1", naam: "Woning", versie: 2, document });
    expect(situatie.actievePagina).toMatchObject({ symboolSchaal: 2, labelSchaal: 0.5 });
    expect(plaatsingen(editor, paginaId)[0]).toMatchObject({ x: 400, y: 500, labelOffset: { x: -12, y: 34 } });
  });

  test("opmaakwijzigingen zijn geblokkeerd in alleen-lezen", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [punt] = punten(editor);
    situatie.plaatsNode(punt!, 100, 200);
    const document = editor.document;
    const stappen = editor.terug.length;
    editor.zetAlleenLezen(true);
    situatie.zetPaginaOpmaak(paginaId, { symboolSchaal: 2 });
    situatie.zetLabelOffset(paginaId, punt!, { x: 12, y: 34 });
    expect(editor.document).toBe(document);
    expect(editor.terug).toHaveLength(stappen);
  });
  test("voegPlanPaginaToe is één undo-stap en maakt de pagina actief", () => {
    const { editor, situatie } = opzet();
    const id = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    expect(situatie.actievePaginaId).toBe(id);
    expect(situatie.actievePagina?.titel).toBe("Gelijkvloers");
    expect(situatie.actievePagina?.achtergrond).toEqual(ACHTERGROND);
    expect(editor.terug).toHaveLength(1);

    editor.ongedaanMaken();
    expect(doc(editor).situatie.paginas).toHaveLength(0);
    editor.opnieuw();
    expect(doc(editor).situatie.paginas[0]?.achtergrond).toEqual(ACHTERGROND);
  });

  test("actieve pagina valt terug op de eerste na verwijderPagina, en op null zonder pagina's", () => {
    const { situatie } = opzet();
    const eerste = situatie.voegPlanPaginaToe("Eerste", ACHTERGROND);
    const tweede = situatie.voegPlanPaginaToe("Tweede", ACHTERGROND);
    expect(situatie.actievePaginaId).toBe(tweede);
    situatie.verwijderPagina(tweede);
    expect(situatie.actievePaginaId).toBe(eerste);
    situatie.verwijderPagina(eerste);
    expect(situatie.actievePaginaId).toBeNull();
    expect(situatie.actievePagina).toBeUndefined();
  });

  test("actieve pagina valt ook terug als de pagina door undo verdwijnt", () => {
    const { editor, situatie } = opzet();
    const eerste = situatie.voegPlanPaginaToe("Eerste", ACHTERGROND);
    situatie.voegPlanPaginaToe("Tweede", ACHTERGROND);
    editor.ongedaanMaken();
    expect(situatie.actievePaginaId).toBe(eerste);
  });

  test("hernoem, verplaatsPagina, zetSchaal en vervangAchtergrond wijzigen het document", () => {
    const { editor, situatie } = opzet();
    const a = situatie.voegPlanPaginaToe("A", ACHTERGROND);
    const b = situatie.voegPlanPaginaToe("B", ACHTERGROND);
    situatie.hernoem(a, "Kelder");
    situatie.verplaatsPagina(b, 0);
    situatie.zetSchaal(a, 12.5);
    situatie.vervangAchtergrond(b, { ...ACHTERGROND, rasterBestandId: "r2" });
    const paginas = doc(editor).situatie.paginas;
    expect(paginas.map((p) => p.titel)).toEqual(["B", "Kelder"]);
    expect(paginas[1]!.achtergrond?.schaal).toEqual({ mmPerPx: 12.5 });
    expect(paginas[0]!.achtergrond?.rasterBestandId).toBe("r2");
    situatie.zetSchaal(a, undefined);
    expect(doc(editor).situatie.paginas[1]!.achtergrond?.schaal).toBeUndefined();
  });
});

describe("plaatsingen", () => {
  test("plaatsNode: ongedaan maken verwijdert de plaatsing, opnieuw zet haar terug", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [cd] = punten(editor);
    expect(situatie.plaatsNode(cd!, 100, 200)).toBeNull();
    expect(plaatsingen(editor, paginaId)).toEqual([{ nodeId: cd, x: 100, y: 200, rotatie: 0 }]);
    editor.ongedaanMaken();
    expect(plaatsingen(editor, paginaId)).toEqual([]);
    editor.opnieuw();
    expect(plaatsingen(editor, paginaId)).toHaveLength(1);
  });

  test("plaatsNode behoudt de rotatie bij opnieuw plaatsen", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [cd] = punten(editor);
    situatie.plaatsNode(cd!, 100, 200);
    editor.selectie = [cd!];
    situatie.draaiSelectie(1);
    expect(situatie.plaatsNode(cd!, 300, 400)).toBeNull();
    expect(plaatsingen(editor, paginaId)).toEqual([{ nodeId: cd, x: 300, y: 400, rotatie: 15 }]);
  });

  test("plaatsNode naar een andere pagina geeft de titel van de oude pagina terug", () => {
    const { editor, situatie } = opzet();
    const eerste = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [cd] = punten(editor);
    situatie.plaatsNode(cd!, 100, 200);
    const tweede = situatie.voegPlanPaginaToe("Verdieping", ACHTERGROND);
    expect(situatie.plaatsNode(cd!, 5, 6)).toBe("Gelijkvloers");
    expect(plaatsingen(editor, eerste)).toEqual([]);
    expect(plaatsingen(editor, tweede)).toEqual([{ nodeId: cd, x: 5, y: 6, rotatie: 0 }]);
  });

  test("plaatsNode zonder actieve pagina gooit een fout", () => {
    const { editor, situatie } = opzet();
    expect(() => situatie.plaatsNode(punten(editor)[0]!, 1, 2)).toThrow();
  });

  test("haalVanPlan verwijdert de plaatsing in één undo-stap", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [cd] = punten(editor);
    situatie.plaatsNode(cd!, 1, 2);
    situatie.haalVanPlan(cd!);
    expect(plaatsingen(editor, paginaId)).toEqual([]);
    editor.ongedaanMaken();
    expect(plaatsingen(editor, paginaId)).toHaveLength(1);
  });

  test("draaiSelectie(1) vier keer geeft 60 graden, elk een eigen undo-stap", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [cd] = punten(editor);
    situatie.plaatsNode(cd!, 100, 200);
    editor.selectie = [cd!];
    const voor = editor.terug.length;
    for (let i = 0; i < 4; i++) situatie.draaiSelectie(1);
    expect(plaatsingen(editor, paginaId)[0]!.rotatie).toBe(60);
    expect(editor.terug.length - voor).toBe(4);
    situatie.draaiSelectie(-1);
    expect(plaatsingen(editor, paginaId)[0]!.rotatie).toBe(45);
  });

  test("schuifSelectie(10, 0) twee keer geeft 2 undo-stappen en schuift 20 pixels", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [cd] = punten(editor);
    situatie.plaatsNode(cd!, 100, 200);
    editor.selectie = [cd!];
    const voor = editor.terug.length;
    situatie.schuifSelectie(10, 0);
    situatie.schuifSelectie(10, 0);
    expect(editor.terug.length - voor).toBe(2);
    expect(plaatsingen(editor, paginaId)[0]).toMatchObject({ x: 120, y: 200 });
  });

  test("schuifSelectie blijft binnen het raster en maakt geen stap als niets verschuift", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [cd] = punten(editor);
    situatie.plaatsNode(cd!, 0, 5);
    editor.selectie = [cd!];
    const voor = editor.terug.length;
    situatie.schuifSelectie(-10, 0);
    expect(editor.terug.length).toBe(voor);
    situatie.schuifSelectie(0, -10);
    expect(plaatsingen(editor, paginaId)[0]).toMatchObject({ x: 0, y: 0 });
  });

  test("meerdere geselecteerde nodes schuiven in één undo-stap; niet-geplaatste nodes doen niet mee", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [a, b, c] = punten(editor);
    situatie.plaatsNode(a!, 10, 10);
    situatie.plaatsNode(b!, 20, 20);
    editor.selectie = [a!, b!, c!];
    const voor = editor.terug.length;
    situatie.schuifSelectie(1, 1);
    expect(editor.terug.length - voor).toBe(1);
    expect(plaatsingen(editor, paginaId).map((p) => [p.x, p.y])).toEqual([[11, 11], [21, 21]]);
    editor.ongedaanMaken();
    expect(plaatsingen(editor, paginaId).map((p) => [p.x, p.y])).toEqual([[10, 10], [20, 20]]);
  });

  test("draaiSelectie en schuifSelectie laten plaatsingen op een andere pagina ongemoeid, zonder undo-stap", () => {
    const { editor, situatie } = opzet();
    const eerste = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [a3] = punten(editor);
    situatie.plaatsNode(a3!, 100, 200);
    const tweede = situatie.voegPlanPaginaToe("Verdieping", ACHTERGROND);
    expect(situatie.actievePaginaId).toBe(tweede);
    editor.selectie = [a3!];
    const voor = editor.terug.length;
    situatie.draaiSelectie(1);
    situatie.schuifSelectie(10, 0);
    expect(editor.terug.length).toBe(voor);
    expect(plaatsingen(editor, eerste)).toEqual([{ nodeId: a3, x: 100, y: 200, rotatie: 0 }]);
  });

  test("haalSelectieVanPlan verwijdert alleen geselecteerde plaatsingen op de actieve pagina, in één undo-stap", () => {
    const { editor, situatie } = opzet();
    const eerste = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [a, b, c] = punten(editor);
    situatie.plaatsNode(c!, 7, 7);
    const tweede = situatie.voegPlanPaginaToe("Verdieping", ACHTERGROND);
    situatie.plaatsNode(a!, 1, 1);
    situatie.plaatsNode(b!, 2, 2);
    editor.selectie = [a!, b!, c!];
    const voor = editor.terug.length;
    situatie.haalSelectieVanPlan();
    expect(editor.terug.length - voor).toBe(1);
    expect(plaatsingen(editor, tweede)).toEqual([]);
    expect(plaatsingen(editor, eerste)).toHaveLength(1);
    editor.ongedaanMaken();
    expect(plaatsingen(editor, tweede)).toHaveLength(2);
  });

  test("haalSelectieVanPlan zonder toepasselijke plaatsing is een no-op zonder undo-stap", () => {
    const { editor, situatie } = opzet();
    situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [a] = punten(editor);
    editor.selectie = [a!];
    const voor = editor.terug.length;
    situatie.haalSelectieVanPlan();
    expect(editor.terug.length).toBe(voor);
  });

  test("plaatsNode op dezelfde plek op dezelfde pagina maakt geen undo-stap en wijzigt niets", () => {
    const { editor, situatie } = opzet();
    situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [a] = punten(editor);
    situatie.plaatsNode(a!, 100, 200);
    const voor = editor.terug.length;
    const teller = editor.gewijzigdSindsOpslaan;
    expect(situatie.plaatsNode(a!, 100, 200)).toBeNull();
    expect(editor.terug.length).toBe(voor);
    expect(editor.gewijzigdSindsOpslaan).toBe(teller);
  });

  test("een geplaatst punt verwijderen in het eendraadschema verwijdert de plaatsing; undo herstelt beide", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [cd] = punten(editor);
    situatie.plaatsNode(cd!, 100, 200);
    editor.selectie = [cd!];
    editor.verwijderSelectie(false);
    expect(doc(editor).nodes[cd!]).toBeUndefined();
    expect(plaatsingen(editor, paginaId)).toEqual([]);

    editor.ongedaanMaken();
    expect(doc(editor).nodes[cd!]).toBeDefined();
    expect(plaatsingen(editor, paginaId)).toEqual([{ nodeId: cd, x: 100, y: 200, rotatie: 0 }]);
    expect(analyseer(doc(editor)).nietGeplaatst).not.toContain(cd);
  });
});

describe("alleen-lezen", () => {
  test("plaatsen en verschuiven doen niets", () => {
    const { editor, situatie } = opzet();
    const paginaId = situatie.voegPlanPaginaToe("Gelijkvloers", ACHTERGROND);
    const [a, b] = punten(editor);
    situatie.plaatsNode(a!, 100, 200);
    editor.selectie = [a!];
    const document = editor.document;
    const stappen = editor.terug;
    const teller = editor.gewijzigdSindsOpslaan;
    editor.zetAlleenLezen(true);

    expect(situatie.plaatsNode(b!, 5, 6)).toBeNull();
    expect(situatie.plaatsNode(a!, 300, 400)).toBeNull();
    situatie.schuifSelectie(10, 0);
    situatie.draaiSelectie(1);

    expect(editor.document).toBe(document);
    expect(editor.terug).toBe(stappen);
    expect(editor.gewijzigdSindsOpslaan).toBe(teller);
    expect(plaatsingen(editor, paginaId)).toEqual([{ nodeId: a, x: 100, y: 200, rotatie: 0 }]);
  });

  test("van het plan halen, een pagina toevoegen, hernoemen, verplaatsen, verwijderen en schalen doen niets", () => {
    const { editor, situatie } = opzet();
    const a = situatie.voegPlanPaginaToe("A", ACHTERGROND);
    const b = situatie.voegPlanPaginaToe("B", ACHTERGROND);
    const [punt] = punten(editor);
    situatie.plaatsNode(punt!, 1, 2);
    editor.selectie = [punt!];
    const document = editor.document;
    const stappen = editor.terug;
    editor.zetAlleenLezen(true);

    expect(situatie.voegPlanPaginaToe("C", ACHTERGROND)).toBe("");
    situatie.haalVanPlan(punt!);
    situatie.haalSelectieVanPlan();
    situatie.hernoem(a, "Kelder");
    situatie.verplaatsPagina(b, 0);
    situatie.verwijderPagina(a);
    situatie.zetSchaal(a, 12.5);
    situatie.vervangAchtergrond(a, { ...ACHTERGROND, rasterBestandId: "r2" });

    expect(editor.document).toBe(document);
    expect(editor.terug).toBe(stappen);
    expect(situatie.actievePaginaId).toBe(b);
  });

  test("een pagina kiezen blijft werken en alles herstelt na zetAlleenLezen(false)", () => {
    const { editor, situatie } = opzet();
    const a = situatie.voegPlanPaginaToe("A", ACHTERGROND);
    situatie.voegPlanPaginaToe("B", ACHTERGROND);
    editor.zetAlleenLezen(true);
    situatie.actievePaginaId = a;
    expect(situatie.actievePaginaId).toBe(a);

    editor.zetAlleenLezen(false);
    const [punt] = punten(editor);
    situatie.plaatsNode(punt!, 5, 6);
    expect(plaatsingen(editor, a)).toEqual([{ nodeId: punt, x: 5, y: 6, rotatie: 0 }]);
  });
  test("de overlap-melding maakt alleen de eigen plaatsing ongedaan, niet een nieuwere", () => {
    const { editor, situatie } = opzet();
    situatie.voegPlanPaginaToe("Eerste", ACHTERGROND);
    const [a, b] = punten(editor) as [NodeId, NodeId];
    situatie.plaatsNode(a, 100, 200);
    const eerste = editor.laatsteStap();
    situatie.plaatsNode(b, 100, 200);
    const tweede = editor.laatsteStap();
    // Doorgaan-modus: het volgende punt staat er al voor de melding van het eerste wordt aangeklikt.
    expect(editor.ongedaanMakenAlsLaatste(eerste)).toBe(false);
    expect(editor.laatsteStap()).toBe(tweede);
    expect(plaatsingen(editor, situatie.actievePaginaId!).map(p => p.nodeId)).toEqual([a, b]);
    // De laatste plaatsing wel.
    expect(editor.ongedaanMakenAlsLaatste(tweede)).toBe(true);
    expect(plaatsingen(editor, situatie.actievePaginaId!).map(p => p.nodeId)).toEqual([a]);
    expect(editor.ongedaanMakenAlsLaatste(undefined)).toBe(false);
  });
});

test('getekend plan toevoegen en bewerken is undoable; alleen-lezen houdt bron en raster intact', () => {
  const { editor, situatie } = opzet();
  const bron = { formaat: 'openplan3d-v1' as const, project: '{"floors":[]}', kader: { x_cm: 0, y_cm: 0, pxPerCm: 2 } };
  const id = situatie.bewaarTekening('Zelf getekend', ACHTERGROND, bron);
  expect(situatie.actievePaginaId).toBe(id);
  expect(editor.terug).toHaveLength(1);
  editor.ongedaanMaken();
  expect(doc(editor).situatie.paginas).toHaveLength(0);
  editor.opnieuw();
  expect(situatie.actievePagina?.tekening).toEqual(bron);
  const nieuw = { ...bron, kader: { ...bron.kader, x_cm: -100 } };
  situatie.bewaarTekening('Zelf getekend', ACHTERGROND, nieuw, id);
  editor.ongedaanMaken();
  expect(situatie.actievePagina?.tekening).toEqual(bron);
  editor.zetAlleenLezen(true);
  situatie.bewaarTekening('Anders', ACHTERGROND, nieuw, id);
  expect(situatie.bewaarTekening('Nieuw', ACHTERGROND, nieuw)).toBe('');
  expect(situatie.actievePagina?.tekening).toEqual(bron);
  expect(doc(editor).situatie.paginas).toHaveLength(1);
});

 test("meerdere planpaginas zijn samen één undo-stap en behouden bestaande plaatsingen", () => {
  const { editor, situatie } = opzet();
  const oud = situatie.voegPlanPaginaToe("Bestaand", ACHTERGROND);
  const punt = punten(editor)[0]!;
  situatie.plaatsNode(punt, 20, 30);
  const voor = structuredClone(doc(editor));
  const ids = situatie.voegPlanPaginasToe([{ titel: "Gelijkvloers", achtergrond: ACHTERGROND }, { titel: "Verdieping 1", achtergrond: ACHTERGROND }]);
  expect(ids).toHaveLength(2);
  expect(plaatsingen(editor, oud)).toHaveLength(1);
  editor.ongedaanMaken();
  expect(doc(editor)).toEqual(voor);
 });

test("ongeldige tweede pagina en alleen-lezen laten het document volledig ongemoeid", () => {
 const { editor, situatie } = opzet();
 const voor = structuredClone(doc(editor));
 expect(() => situatie.voegPlanPaginasToe([{ titel: "Eerste", achtergrond: ACHTERGROND }, { titel: "Tweede", achtergrond: { ...ACHTERGROND, rasterBestandId: undefined as unknown as string } }])).toThrow();
 expect(doc(editor)).toEqual(voor);
 editor.alleenLezen = true;
 expect(situatie.voegPlanPaginasToe([{ titel: "Geen toevoeging", achtergrond: ACHTERGROND }])).toEqual([]);
 expect(doc(editor)).toEqual(voor);
});
