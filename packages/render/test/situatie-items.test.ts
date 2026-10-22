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
import { nodeLabel, situatieItems } from "../src/index";

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

  test("een naamloos verdeelbord krijgt de meegegeven terugvaltekst als label", () => {
    const zonderNaam = installatie().verdeelbord((b) => b.als("bord").kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))).bouw();
    const m = metPagina(zonderNaam.doc);
    const doc = plaats(m.doc, m.paginaId, zonderNaam.ids["bord"]!, { x: 5, y: 6, rotatie: 0 }).doc;
    const items = situatieItems(doc, analyseer(doc), m.paginaId, (type) => `type:${type}`);
    expect(items[0]!.label).toBe("type:verdeelbord");
  });

  test("de terugvaltekst raakt een bestaand label niet", () => {
    const { doc: start, ids } = bouw();
    const { doc: metP, paginaId } = metPagina(start);
    const [cd1] = puntIds(metP, "contactdoos");
    let doc = plaats(metP, paginaId, ids["bord"]!, { x: 5, y: 6, rotatie: 0 }).doc;
    doc = plaats(doc, paginaId, cd1!, { x: 7, y: 8, rotatie: 0 }).doc;
    const labels = situatieItems(doc, analyseer(doc), paginaId, () => "terugval").map((i) => i.label);
    expect(labels).toEqual(["Hoofdbord", "A1"]);
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

describe("nodeLabel", () => {
  test("geeft het puntlabel uit de analyse", () => {
    const { doc } = bouw();
    const [cd1] = puntIds(doc, "contactdoos");
    expect(nodeLabel(doc, analyseer(doc), cd1!)).toBe("A1");
  });

  test("een verdeelbord krijgt zijn naam, zonder naam een lege tekst", () => {
    const { doc, ids } = bouw();
    expect(nodeLabel(doc, analyseer(doc), ids["bord"]!)).toBe("Hoofdbord");
    const zonderNaam = installatie().verdeelbord((b) => b.als("bord").kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))).bouw();
    expect(nodeLabel(zonderNaam.doc, analyseer(zonderNaam.doc), zonderNaam.ids["bord"]!)).toBe("");
  });

  test("een punt zonder kring of een naamloos bord krijgt de terugvaltekst van zijn type", () => {
    const { doc, cd } = losPunt();
    expect(nodeLabel(doc, analyseer(doc), cd, (type) => `type:${type}`)).toBe("type:contactdoos");
    const zonderNaam = installatie().verdeelbord((b) => b.als("bord").kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))).bouw();
    expect(nodeLabel(zonderNaam.doc, analyseer(zonderNaam.doc), zonderNaam.ids["bord"]!, (type) => `type:${type}`)).toBe(
      "type:verdeelbord",
    );
  });

  test("een onbekende node geeft ook met terugval een lege tekst", () => {
    const { doc } = bouw();
    expect(nodeLabel(doc, analyseer(doc), "bestaat-niet", () => "terugval")).toBe("");
  });

  test("een punt zonder kring of een onbekende node geeft een lege tekst", () => {
    const { doc, cd } = losPunt();
    expect(nodeLabel(doc, analyseer(doc), cd)).toBe("");
    expect(nodeLabel(doc, analyseer(doc), "bestaat-niet")).toBe("");
  });
});
