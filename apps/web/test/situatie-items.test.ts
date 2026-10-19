import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import {
  plaats,
  verwijderEnkel,
  voegPaginaToe,
  voegToe,
  zetAchtergrond,
  type InstallatieDocument,
  type NodeId,
} from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { situatieItems, tePlaatsen } from "../app/situatie/items";

const ACHTERGROND = {
  origineelBestandId: "o1",
  rasterBestandId: "r1",
  breedte_px: 3000,
  hoogte_px: 2000,
};

/** Bord "Hoofdbord" met kring A (3 contactdozen) en kring B (1 lichtpunt, 1 schakelaar). */
function bouw() {
  const { doc, ids } = installatie()
    .verdeelbord((b) =>
      b
        .als("bord")
        .kring((k) => k.automaat(16).leiding(2.5).contactdozen(3).als("laatsteA"))
        .kring((k) => k.automaat(10).leiding(1.5).lichtpunten(1).schakelaar()),
    "Hoofdbord")
    .bouw();
  return { doc, ids };
}

function metPagina(doc: InstallatieDocument): { doc: InstallatieDocument; paginaId: string } {
  const p = voegPaginaToe(doc, "Gelijkvloers");
  return { doc: zetAchtergrond(p.doc, p.id, ACHTERGROND).doc, paginaId: p.id };
}

/** Teller, leiding, contactdoos: een punt zonder kringbeveiliging. */
function losPunt(): { doc: InstallatieDocument; cd: NodeId } {
  const start = installatie().bouw().doc;
  const teller = Object.values(start.nodes).find((n) => n.type === "teller")!;
  const leiding = voegToe(start, teller.id, { type: "leiding", kabeltype: "XVB", doorsnede_mm2: 2.5, aantalGeleiders: 3 });
  const cd = voegToe(leiding.doc, leiding.id, {
    type: "contactdoos",
    aantal: 1,
    randaarde: true,
    kinderbeveiliging: true,
    waterdicht: false,
  });
  return { doc: cd.doc, cd: cd.id };
}

function puntIds(doc: InstallatieDocument, type: string): string[] {
  const analyse = analyseer(doc);
  return analyse.kringen.flatMap((k) => k.puntIds).filter((id) => doc.nodes[id]?.type === type);
}

describe("situatieItems", () => {
  test("geeft een item per plaatsing met label, positie en symbool", () => {
    const { doc: start } = bouw();
    const { doc: metP, paginaId } = metPagina(start);
    const [cd1] = puntIds(metP, "contactdoos");
    const doc = plaats(metP, paginaId, cd1!, { x: 100, y: 200, rotatie: 30 }).doc;
    const items = situatieItems(doc, analyseer(doc), paginaId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ nodeId: cd1, x: 100, y: 200, rotatie: 30, label: "A1" });
    expect(items[0]!.symbool.maat.breedte).toBeGreaterThan(0);
  });

  test("een verdeelbord krijgt zijn naam als label, zonder naam een lege tekst", () => {
    const { doc: start, ids } = bouw();
    const { doc: metP, paginaId } = metPagina(start);
    const doc = plaats(metP, paginaId, ids["bord"]!, { x: 5, y: 6, rotatie: 0 }).doc;
    expect(situatieItems(doc, analyseer(doc), paginaId)[0]!.label).toBe("Hoofdbord");

    const zonderNaam = installatie().verdeelbord((b) => b.als("bord").kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))).bouw();
    const m = metPagina(zonderNaam.doc);
    const d2 = plaats(m.doc, m.paginaId, zonderNaam.ids["bord"]!, { x: 5, y: 6, rotatie: 0 }).doc;
    expect(situatieItems(d2, analyseer(d2), m.paginaId)[0]!.label).toBe("");
  });

  test("een punt zonder kring heeft een leeg label", () => {
    const { doc, cd } = losPunt();
    const m = metPagina(doc);
    const d2 = plaats(m.doc, m.paginaId, cd, { x: 1, y: 1, rotatie: 0 }).doc;
    expect(situatieItems(d2, analyseer(d2), m.paginaId)[0]!.label).toBe("");
  });

  test("onbekende pagina geeft een lege lijst", () => {
    const { doc } = bouw();
    expect(situatieItems(doc, analyseer(doc), "bestaat-niet")).toEqual([]);
  });

  test("hernummert live: na het verwijderen van A1 krijgt de geplaatste A3 het label A2", () => {
    const { doc: start } = bouw();
    const { doc: metP, paginaId } = metPagina(start);
    const [a1, , a3] = puntIds(metP, "contactdoos");
    let doc = plaats(metP, paginaId, a3!, { x: 1, y: 2, rotatie: 0 }).doc;
    expect(situatieItems(doc, analyseer(doc), paginaId)[0]!.label).toBe("A3");
    doc = verwijderEnkel(doc, a1!).doc;
    const items = situatieItems(doc, analyseer(doc), paginaId);
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe("A2");
  });
});

describe("tePlaatsen", () => {
  test("groepeert de niet-geplaatste punten per kring, in volgorde", () => {
    const { doc } = bouw();
    const groepen = tePlaatsen(doc, analyseer(doc));
    const analyse = analyseer(doc);
    const kringen = analyse.kringen;
    expect(groepen.slice(0, 2).map((g) => g.kringLabel)).toEqual(kringen.map((k) => k.label));
    expect(groepen[0]!.nodeIds).toEqual(kringen[0]!.puntIds);
    expect(groepen[1]!.nodeIds).toEqual(kringen[1]!.puntIds);
  });

  test("laat geplaatste punten weg en laat lege groepen vallen", () => {
    const { doc: start } = bouw();
    const { doc: metP, paginaId } = metPagina(start);
    const analyse0 = analyseer(metP);
    let doc = metP;
    for (const id of analyse0.kringen[1]!.puntIds) {
      doc = plaats(doc, paginaId, id, { x: 1, y: 1, rotatie: 0 }).doc;
    }
    doc = plaats(doc, paginaId, analyse0.kringen[0]!.puntIds[1]!, { x: 1, y: 1, rotatie: 0 }).doc;
    const groepen = tePlaatsen(doc, analyseer(doc));
    const kring = groepen.filter((g) => g.kringLabel === analyse0.kringen[0]!.label);
    expect(kring).toHaveLength(1);
    expect(kring[0]!.nodeIds).toEqual(
      analyse0.kringen[0]!.puntIds.filter((_, i) => i !== 1),
    );
    expect(groepen.some((g) => g.kringLabel === analyse0.kringen[1]!.label)).toBe(false);
  });

  test("punten zonder kring komen in de groep '—', na de kringen", () => {
    const { doc, cd } = losPunt();
    const groepen = tePlaatsen(doc, analyseer(doc));
    expect(groepen.at(-1)).toEqual({ kringLabel: "—", nodeIds: [cd] });
  });

  test("volgorde van de groepen: kringen, dan '—', dan 'Verdeelborden'", () => {
    const { doc: basis, ids } = bouw();
    const teller = Object.values(basis.nodes).find((n) => n.type === "teller")!;
    const leiding = voegToe(basis, teller.id, { type: "leiding", kabeltype: "XVB", doorsnede_mm2: 2.5, aantalGeleiders: 3 });
    const los = voegToe(leiding.doc, leiding.id, {
      type: "lichtpunt",
      aantal: 1,
    });
    const analyse = analyseer(los.doc);
    expect(analyse.zonderKring).toEqual([los.id]);
    const groepen = tePlaatsen(los.doc, analyse);
    expect(groepen).toEqual([
      { kringLabel: analyse.kringen[0]!.label, nodeIds: analyse.kringen[0]!.puntIds },
      { kringLabel: analyse.kringen[1]!.label, nodeIds: analyse.kringen[1]!.puntIds },
      { kringLabel: "—", nodeIds: [los.id] },
      { kringLabel: "Verdeelborden", nodeIds: [ids["bord"]] },
    ]);
  });

  test("neemt een niet-geplaatst verdeelbord op in de groep 'Verdeelborden'", () => {
    const { doc, ids } = bouw();
    const groepen = tePlaatsen(doc, analyseer(doc));
    const borden = groepen.find((g) => g.kringLabel === "Verdeelborden");
    expect(borden?.nodeIds).toEqual([ids["bord"]]);
  });

  test("een geplaatst verdeelbord valt uit de groep", () => {
    const { doc: start, ids } = bouw();
    const { doc: metP, paginaId } = metPagina(start);
    const doc = plaats(metP, paginaId, ids["bord"]!, { x: 1, y: 1, rotatie: 0 }).doc;
    expect(tePlaatsen(doc, analyseer(doc)).some((g) => g.kringLabel === "Verdeelborden")).toBe(false);
  });
});
