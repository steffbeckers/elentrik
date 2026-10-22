import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import {
  plaats,
  voegPaginaToe,
  voegToe,
  zetAchtergrond,
  type InstallatieDocument,
  type NodeId,
} from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { tePlaatsen } from "../app/situatie/items";

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
